// @vitest-environment node
/**
 * Integration tests for the real (SDK-backed) transport against a throwaway
 * HTTP server: this is what proves the OpenCode contract Remote depends on.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSdkTransport } from './opencode'
import { parseSseChunk } from './opencode'
import type { Event, RemoteErrorInfo } from '../types/opencode'

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void

let server: Server
let baseUrl: string
let handler: Handler
const requests: { method: string; url: string; headers: IncomingMessage['headers']; body: string }[] =
  []

function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': String(body.length) })
  res.end(body)
}

function session(id = 'ses_1') {
  return {
    id,
    projectID: 'prj_1',
    directory: '/tmp/project',
    title: 'Session',
    version: '1.0.0',
    time: { created: 1, updated: 2 },
  }
}

beforeEach(async () => {
  requests.length = 0
  handler = (_req, res) => json(res, 404, { name: 'NotFoundError', data: { message: 'not set' } })
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      requests.push({ method: req.method ?? 'GET', url: req.url ?? '/', headers: req.headers, body })
      handler(req, res, body)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://127.0.0.1:${port}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('health', () => {
  it('returns the version', async () => {
    handler = (_req, res) => json(res, 200, { healthy: true, version: '1.18.34' })
    const transport = createSdkTransport({ baseUrl })
    await expect(transport.health()).resolves.toEqual({ healthy: true, version: '1.18.34' })
    expect(requests[0]?.url).toBe('/global/health')
  })

  it('maps 401 to an authentication error', async () => {
    handler = (_req, res) => json(res, 401, { name: 'Unauthorized', data: { message: 'nope' } })
    const transport = createSdkTransport({ baseUrl })
    await expect(transport.health()).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('reports a malformed body instead of crashing', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"unexpected":true}')
    }
    const transport = createSdkTransport({ baseUrl })
    await expect(transport.health()).rejects.toMatchObject({ code: 'malformed' })
  })

  it('reports a server error for 500', async () => {
    handler = (_req, res) => json(res, 500, { name: 'UnknownError', data: { message: 'boom' } })
    const transport = createSdkTransport({ baseUrl })
    await expect(transport.health()).rejects.toMatchObject({ code: 'server_error' })
  })
})

describe('authentication', () => {
  it('sends HTTP basic auth only when a password is supplied', async () => {
    handler = (_req, res) => json(res, 200, [session()])

    await createSdkTransport({ baseUrl }).listSessions()
    expect(requests[0]?.headers.authorization).toBeUndefined()

    requests.length = 0
    await createSdkTransport({
      baseUrl,
      credentials: { username: 'opencode', password: 's3cret' },
    }).listSessions()
    const expected = `Basic ${Buffer.from('opencode:s3cret').toString('base64')}`
    expect(requests[0]?.headers.authorization).toBe(expected)
  })

  it('defaults the username to "opencode"', async () => {
    handler = (_req, res) => json(res, 200, [session()])
    await createSdkTransport({ baseUrl, credentials: { username: '', password: 'pw' } }).listSessions()
    expect(requests[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from('opencode:pw').toString('base64')}`,
    )
  })
})

describe('sessions', () => {
  it('lists sessions', async () => {
    handler = (_req, res) => json(res, 200, [session()])
    const transport = createSdkTransport({ baseUrl })
    await expect(transport.listSessions()).resolves.toHaveLength(1)
  })

  it('rejects a response that is not a list', async () => {
    handler = (_req, res) => json(res, 200, { sessions: [] })
    const transport = createSdkTransport({ baseUrl })
    await expect(transport.listSessions()).rejects.toMatchObject({ code: 'malformed' })
  })

  it('creates a session with a title', async () => {
    handler = (_req, res) => json(res, 200, session())
    const transport = createSdkTransport({ baseUrl })
    await transport.createSession({ title: 'Remote session' })
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe('/session')
    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({ title: 'Remote session' })
  })

  it('renames a session', async () => {
    handler = (_req, res) => json(res, 200, session())
    const transport = createSdkTransport({ baseUrl })
    await transport.updateSession('ses_1', { title: 'Renamed' })
    expect(requests[0]?.method).toBe('PATCH')
    expect(requests[0]?.url).toBe('/session/ses_1')
    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({ title: 'Renamed' })
  })

  it('deletes a session', async () => {
    handler = (_req, res) => json(res, 200, true)
    const transport = createSdkTransport({ baseUrl })
    await expect(transport.deleteSession('ses_1')).resolves.toBe(true)
    expect(requests[0]?.method).toBe('DELETE')
  })

  it('explains a missing session', async () => {
    handler = (_req, res) => json(res, 404, { name: 'NotFoundError', data: { message: 'gone' } })
    const transport = createSdkTransport({ baseUrl })
    await expect(transport.messages('ses_9')).rejects.toMatchObject({
      code: 'not_found',
      title: 'Session no longer exists.',
    })
  })

  it('reads session status and diffs', async () => {
    handler = (req, res) => {
      if (req.url === '/session/status') return json(res, 200, { ses_1: { type: 'busy' } })
      return json(res, 200, [{ file: 'a.ts', before: 'a', after: 'b', additions: 1, deletions: 1 }])
    }
    const transport = createSdkTransport({ baseUrl })
    await expect(transport.sessionStatuses()).resolves.toEqual({ ses_1: { type: 'busy' } })
    await expect(transport.sessionDiff('ses_1')).resolves.toHaveLength(1)
  })
})

describe('messages and prompts', () => {
  it('loads message history', async () => {
    handler = (_req, res) =>
      json(res, 200, [
        {
          info: {
            id: 'msg_1',
            sessionID: 'ses_1',
            role: 'user',
            time: { created: 1 },
            agent: 'build',
            model: { providerID: 'p', modelID: 'm' },
          },
          parts: [{ id: 'prt_1', sessionID: 'ses_1', messageID: 'msg_1', type: 'text', text: 'hi' }],
        },
      ])
    const transport = createSdkTransport({ baseUrl })
    const messages = await transport.messages('ses_1')
    expect(messages).toHaveLength(1)
    expect(messages[0]?.parts).toHaveLength(1)
  })

  it('sends a prompt without waiting and returns nothing', async () => {
    handler = (_req, res) => {
      res.writeHead(204)
      res.end()
    }
    const transport = createSdkTransport({ baseUrl })
    await expect(
      transport.promptAsync('ses_1', {
        text: 'fix the tests',
        agent: 'build',
        model: { providerID: 'anthropic', modelID: 'claude' },
      }),
    ).resolves.toBeUndefined()

    expect(requests[0]?.url).toBe('/session/ses_1/prompt_async')
    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({
      parts: [{ type: 'text', text: 'fix the tests' }],
      agent: 'build',
      model: { providerID: 'anthropic', modelID: 'claude' },
    })
  })

  it('omits agent and model when the user kept the server defaults', async () => {
    handler = (_req, res) => {
      res.writeHead(204)
      res.end()
    }
    const transport = createSdkTransport({ baseUrl })
    await transport.promptAsync('ses_1', { text: 'hello' })
    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({
      parts: [{ type: 'text', text: 'hello' }],
    })
  })

  it('aborts a session', async () => {
    handler = (_req, res) => json(res, 200, true)
    const transport = createSdkTransport({ baseUrl })
    await expect(transport.abort('ses_1')).resolves.toBe(true)
    expect(requests[0]?.url).toBe('/session/ses_1/abort')
  })

  it('runs a shell command through the agent', async () => {
    handler = (_req, res) => json(res, 200, { id: 'msg_1' })
    const transport = createSdkTransport({ baseUrl })
    await transport.shell('ses_1', { command: 'npm test', agent: 'build' })
    expect(requests[0]?.url).toBe('/session/ses_1/shell')
    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({ agent: 'build', command: 'npm test' })
  })

  it('answers permission requests', async () => {
    handler = (_req, res) => json(res, 200, true)
    const transport = createSdkTransport({ baseUrl })
    await transport.replyPermission('ses_1', 'per_1', 'always')
    expect(requests[0]?.url).toBe('/session/ses_1/permissions/per_1')
    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({ response: 'always' })
  })
})

describe('agents, providers and files', () => {
  it('summarises providers and their models', async () => {
    handler = (_req, res) =>
      json(res, 200, {
        providers: [
          {
            id: 'anthropic',
            name: 'Anthropic',
            models: { 'claude-sonnet': { id: 'claude-sonnet', name: 'Claude Sonnet' } },
          },
        ],
        default: { anthropic: 'claude-sonnet' },
      })
    const transport = createSdkTransport({ baseUrl })
    const providers = await transport.providers()
    expect(providers.providers[0]?.models[0]).toEqual({
      id: 'claude-sonnet',
      name: 'Claude Sonnet',
    })
    expect(providers.default).toEqual({ anthropic: 'claude-sonnet' })
  })

  it('returns undefined for a missing file instead of throwing', async () => {
    handler = (_req, res) => json(res, 404, { name: 'NotFoundError', data: { message: 'no file' } })
    const transport = createSdkTransport({ baseUrl })
    await expect(transport.readFile('/tmp/project/missing.ts')).resolves.toBeUndefined()
  })
})

describe('event stream', () => {
  it('unwraps GlobalEvent payloads and reports the stream as open', async () => {
    handler = (req, res) => {
      if (!req.url?.startsWith('/global/event')) return json(res, 404, {})
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      res.write(
        `data: ${JSON.stringify({
          directory: '/tmp/project',
          payload: { type: 'session.idle', properties: { sessionID: 'ses_1' } },
        })}\n\n`,
      )
      res.end()
    }

    const transport = createSdkTransport({ baseUrl })
    const events: Event[] = []
    const states: string[] = []

    await new Promise<void>((resolve) => {
      const unsubscribe = transport.subscribeEvents({
        onEvent: (event) => {
          events.push(event)
          unsubscribe()
          resolve()
        },
        onStatus: (state) => states.push(state),
      })
      setTimeout(() => {
        unsubscribe()
        resolve()
      }, 3000)
    })

    expect(states).toContain('open')
    expect(events[0]).toEqual({ type: 'session.idle', properties: { sessionID: 'ses_1' } })
  })

  it('reports an authentication failure on the stream', async () => {
    handler = (_req, res) => json(res, 401, { name: 'Unauthorized', data: { message: 'nope' } })
    const transport = createSdkTransport({ baseUrl })

    const error = await new Promise<RemoteErrorInfo | undefined>((resolve) => {
      const unsubscribe = transport.subscribeEvents({
        onEvent: () => {},
        onStatus: (state, streamError) => {
          if (state === 'error') {
            unsubscribe()
            resolve(streamError)
          }
        },
      })
      setTimeout(() => {
        unsubscribe()
        resolve(undefined)
      }, 3000)
    })

    expect(error?.code).toBe('unauthorized')
    expect(error?.title ?? '').toMatch(/authenticate/i)
  })
})

describe('parseSseChunk', () => {
  it('parses a bare event object', () => {
    const event = parseSseChunk('event: message\ndata: {"type":"session.idle","properties":{"sessionID":"s"}}')
    expect(event).toEqual({ type: 'session.idle', properties: { sessionID: 's' } })
  })

  it('parses a GlobalEvent wrapper', () => {
    const event = parseSseChunk(
      'data: {"directory":"/w","payload":{"type":"server.connected","properties":{}}}',
    )
    expect(event?.type).toBe('server.connected')
  })

  it('ignores comments, keep-alives and junk', () => {
    expect(parseSseChunk(': ping')).toBeNull()
    expect(parseSseChunk('data: not json')).toBeNull()
    expect(parseSseChunk('data: {"nope":1}')).toBeNull()
  })
})
