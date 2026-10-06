/**
 * Fake OpenCode server used by the Playwright end-to-end tests.
 *
 * It mirrors the small slice of the OpenCode HTTP API that Remote talks to —
 * `/global/health`, `/global/event` (SSE), sessions, messages, prompts, abort,
 * permissions, diffs, agents and providers — so the real transport, the real
 * event stream and the real UI can be exercised end to end without an agent.
 *
 * Usage: node e2e/fake-opencode-server.mjs [--port 4096] [--password secret]
 */
import { createServer } from 'node:http'

const args = process.argv.slice(2)
const readFlag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}

const PORT = Number(readFlag('port', process.env.PORT ?? 4096))
const PASSWORD = readFlag('password', process.env.FAKE_PASSWORD ?? 'test-secret')
const USERNAME = readFlag('username', 'opencode')
const VERSION = '1.18.34-test'

/** @type {Set<import('node:http').ServerResponse>} */
const streams = new Set()
/** @type {Map<string, {type: string} & Record<string, unknown>>} */
const statuses = new Map()
/** @type {Array<{id: string, title: string, directory: string, projectID: string, version: string, time: {created: number, updated: number}}>} */
let sessions = []
/** @type {Map<string, Array<{info: unknown, parts: unknown[]}>>} */
const messages = new Map()
/** @type {Map<string, Array<unknown>>} */
const diffs = new Map()
/** @type {Map<string, string>} */
const files = new Map([
  ['/tmp/project/README.md', '# Project\n\nHello from the fake server.\n'],
])
let counter = 0

const nextId = (prefix) => `${prefix}_${(counter += 1).toString().padStart(4, '0')}`
const now = () => Date.now()

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    ...headers,
  })
  res.end(payload)
}

function isAuthorized(req) {
  const header = req.headers.authorization
  // The fake server is only protected once a client sends credentials, which
  // lets one run cover both the anonymous and the authenticated path.
  if (!header) return true
  const expected = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`
  return header === expected
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })
}

const stats = { broadcasts: 0, byType: {}, clients: 0 }

function broadcast(payload) {
  stats.broadcasts += 1
  stats.byType[payload.type] = (stats.byType[payload.type] ?? 0) + 1
  const frame = `event: message\ndata: ${JSON.stringify({ directory: '/tmp/project', payload })}\n\n`
  for (const stream of streams) stream.write(frame)
}

const session = (id = nextId('ses'), title = 'New session') => ({
  id,
  projectID: 'prj_fake',
  directory: '/tmp/project',
  title,
  version: VERSION,
  time: { created: now(), updated: now() },
})

function emitText(sessionID, messageID, partID, text, done, record) {
  const part = {
    id: partID,
    sessionID,
    messageID,
    type: 'text',
    text,
    ...(done ? { time: { start: now() - 20, end: now() } } : {}),
  }
  record?.(part)
  broadcast({ type: 'message.part.updated', properties: { part } })
}

function emitTool(sessionID, messageID, status, record) {
  const base = {
    id: 'prt_tool_1',
    sessionID,
    messageID,
    type: 'tool',
    callID: 'call_1',
    tool: 'bash',
  }
  const part =
    status === 'running'
      ? { ...base, state: { status: 'running', input: { command: 'npm test' }, time: { start: now() } } }
      : {
          ...base,
          state: {
            status: 'completed',
            input: { command: 'npm test' },
            title: 'npm test',
            output: 'tests passed',
            metadata: {},
            time: { start: now() - 500, end: now() },
          },
        }
  record?.(part)
  broadcast({ type: 'message.part.updated', properties: { part } })
}

/** Script the assistant reply for a prompt. */
function runTurn(sessionID, userText) {
  /** Every part this turn streams, so the stored history matches the stream. */
  const streamedParts = []
  const record = (part) => {
    const index = streamedParts.findIndex((entry) => entry.id === part.id)
    if (index === -1) streamedParts.push(part)
    else streamedParts[index] = part
  }
  const persist = (messageID, info) => {
    const conversation = messages.get(sessionID) ?? []
    conversation.push({ info, parts: streamedParts })
    messages.set(sessionID, conversation)
    statuses.set(sessionID, { type: 'idle' })
    broadcast({ type: 'session.idle', properties: { sessionID } })
  }
  const assistantInfo = (messageID, parentID, created) => ({
    id: messageID,
    sessionID,
    role: 'assistant',
    parentID,
    modelID: 'claude-sonnet-4',
    providerID: 'anthropic',
    mode: 'build',
    path: { cwd: '/tmp/project', root: '/tmp/project' },
    cost: 0.0012,
    tokens: { input: 42, output: 128, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created, completed: now() },
  })

  const userMessageID = nextId('msg')
  const assistantMessageID = nextId('msg')

  broadcast({
    type: 'message.updated',
    properties: {
      info: {
        id: userMessageID,
        sessionID,
        role: 'user',
        time: { created: now() },
        agent: 'build',
        model: { providerID: 'anthropic', modelID: 'claude-sonnet-4' },
      },
    },
  })
  messages.get(sessionID)?.push({
    info: {
      id: userMessageID,
      sessionID,
      role: 'user',
      time: { created: now() },
      agent: 'build',
      model: { providerID: 'anthropic', modelID: 'claude-sonnet-4' },
    },
    parts: [
      {
        id: nextId('prt'),
        sessionID,
        messageID: userMessageID,
        type: 'text',
        text: userText,
        time: { start: now(), end: now() },
      },
    ],
  })

  if (userText.includes('SLOW')) {
    // Stays busy until the client aborts; used by the abort test.
    return
  }

  const assistantCreated = now()
  broadcast({
    type: 'message.updated',
    properties: {
      info: { ...assistantInfo(assistantMessageID, userMessageID, assistantCreated), time: { created: assistantCreated } },
    },
  })

  if (userText.includes('TOOLFAIL')) {
    setTimeout(() => {
      const part = {
        id: 'prt_tool_err',
        sessionID,
        messageID: assistantMessageID,
        type: 'tool',
        callID: 'call_err',
        tool: 'bash',
        state: {
          status: 'error',
          input: { command: 'node scripts/missing.mjs' },
          error: 'Cannot find module',
          time: { start: now() - 100, end: now() },
        },
      }
      record(part)
      broadcast({ type: 'message.part.updated', properties: { part } })
      persist(assistantMessageID, assistantInfo(assistantMessageID, userMessageID, assistantCreated))
    }, 120)
    return
  }

  if (userText.includes('DIFF')) {
    setTimeout(() => {
      const diff = [
        { file: 'src/app.ts', before: 'a\n', after: 'b\n', additions: 3, deletions: 1 },
        { file: 'README.md', before: '', after: 'x\n', additions: 1, deletions: 0 },
      ]
      diffs.set(sessionID, diff)
      broadcast({ type: 'session.diff', properties: { sessionID, diff } })
      statuses.set(sessionID, { type: 'idle' })
      broadcast({ type: 'session.idle', properties: { sessionID } })
    }, 120)
    return
  }

  const reply = [
    'Here is the plan:',
    '',
    '- run the test suite',
    '- fix the failing assertions',
    '',
    '| Step | Status |',
    '| --- | --- |',
    '| build | ok |',
    '| test | running |',
    '',
    '```ts',
    'const sessions = await client.session.list()',
    'console.log(sessions.length)',
    '```',
    '',
    'Done.',
  ].join('\n')

  setTimeout(() => emitText(sessionID, assistantMessageID, 'prt_text_1', reply.slice(0, 40), false, record), 60)
  setTimeout(() => emitTool(sessionID, assistantMessageID, 'running', record), 90)
  setTimeout(() => emitTool(sessionID, assistantMessageID, 'completed', record), 120)
  setTimeout(() => emitText(sessionID, assistantMessageID, 'prt_text_1', reply, true, record), 150)
  setTimeout(() => {
    persist(assistantMessageID, assistantInfo(assistantMessageID, userMessageID, assistantCreated))
  }, 900)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname
  if (process.env.FAKE_LOG) console.log(`[req] ${req.method} ${path}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-max-age': '600',
    })
    res.end()
    return
  }

  if (!isAuthorized(req)) {
    send(res, 401, { name: 'Unauthorized', data: { message: 'invalid credentials' } })
    return
  }

  // --- event stream -------------------------------------------------------
  if (path === '/global/event') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
    })
    res.write(`event: message\ndata: ${JSON.stringify({ directory: '/tmp/project', payload: { type: 'server.connected', properties: {} } })}\n\n`)
    streams.add(res)
    req.on('close', () => streams.delete(res))
    return
  }

  if (path === '/__reset' && req.method === 'POST') {
    // Test hook: drop everything and re-seed one empty session.
    sessions = []
    messages.clear()
    diffs.clear()
    statuses.clear()
    counter = 0
    const fresh = session(undefined, 'Seeded session')
    sessions = [fresh]
    messages.set(fresh.id, [])
    statuses.set(fresh.id, { type: 'idle' })
    if (process.env.FAKE_LOG) console.log(`[reset] sessions=${sessions.length} id=${fresh.id}`)
    send(res, 200, { ok: true, sessionID: fresh.id })
    return
  }

  if (path === '/__stats') {
    stats.clients = streams.size
    send(res, 200, stats)
    return
  }

  if (path === '/global/health') {
    send(res, 200, { healthy: true, version: VERSION })
    return
  }

  // --- sessions -----------------------------------------------------------
  if (path === '/session' && req.method === 'GET') {
    if (process.env.FAKE_LOG) console.log(`[list] ${sessions.map((entry) => entry.id).join(',')}`)
    send(res, 200, [...sessions].sort((a, b) => b.time.updated - a.time.updated))
    return
  }

  if (path === '/session' && req.method === 'POST') {
    const body = await readBody(req)
    const created = session(undefined, body.title ?? 'New session')
    sessions = [created, ...sessions]
    if (process.env.FAKE_LOG) console.log(`[create] ${created.id} title=${created.title}`)
    messages.set(created.id, [])
    statuses.set(created.id, { type: 'idle' })
    broadcast({ type: 'session.created', properties: { info: created } })
    send(res, 200, created)
    return
  }

  if (path === '/session/status') {
    send(res, 200, Object.fromEntries(statuses))
    return
  }

  const sessionMatch = path.match(/^\/session\/([^/]+)$/)
  if (sessionMatch) {
    const id = sessionMatch[1]
    const found = sessions.find((entry) => entry.id === id)
    if (!found) {
      send(res, 404, { name: 'NotFound', data: { message: 'Session not found' } })
      return
    }
    if (req.method === 'GET') {
      send(res, 200, found)
      return
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req)
      const updated = { ...found, ...body, time: { ...found.time, updated: now() } }
      sessions = sessions.map((entry) => (entry.id === id ? updated : entry))
      broadcast({ type: 'session.updated', properties: { info: updated } })
      send(res, 200, updated)
      return
    }
    if (req.method === 'DELETE') {
      sessions = sessions.filter((entry) => entry.id !== id)
      messages.delete(id)
      broadcast({ type: 'session.deleted', properties: { info: { id } } })
      send(res, 200, true)
      return
    }
  }

  const sub = path.match(/^\/session\/([^/]+)\/(message|prompt_async|abort|shell|diff|todo|permissions\/([^/]+))$/)
  if (sub) {
    const id = sub[1]
    const action = sub[2]

    if (action === 'message' && req.method === 'GET') {
      send(res, 200, messages.get(id) ?? [])
      return
    }

    if (action === 'prompt_async' && req.method === 'POST') {
      const body = await readBody(req)
      const text = (body.parts ?? []).map((part) => part.text ?? '').join('\n')
      statuses.set(id, { type: 'busy' })
      broadcast({ type: 'session.status', properties: { sessionID: id, status: { type: 'busy' } } })
      runTurn(id, text)
      res.writeHead(204, { 'access-control-allow-origin': '*' })
      res.end()
      return
    }

    if (action === 'abort' && req.method === 'POST') {
      statuses.set(id, { type: 'idle' })
      broadcast({ type: 'session.idle', properties: { sessionID: id } })
      send(res, 200, true)
      return
    }

    if (action === 'shell' && req.method === 'POST') {
      const body = await readBody(req)
      const command = String(body.command ?? '')
      statuses.set(id, { type: 'busy' })
      broadcast({ type: 'session.status', properties: { sessionID: id, status: { type: 'busy' } } })
      const messageID = nextId('msg')
      broadcast({
        type: 'message.updated',
        properties: {
          info: {
            id: messageID,
            sessionID: id,
            role: 'assistant',
            parentID: 'msg_shell',
            modelID: 'claude-sonnet-4',
            providerID: 'anthropic',
            mode: 'build',
            path: { cwd: '/tmp/project', root: '/tmp/project' },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: now() },
          },
        },
      })
      const info = {
        id: messageID,
        sessionID: id,
        role: 'assistant',
        parentID: 'msg_shell',
        modelID: 'claude-sonnet-4',
        providerID: 'anthropic',
        mode: 'build',
        path: { cwd: '/tmp/project', root: '/tmp/project' },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: now() },
      }
      const shellPart = {
        id: 'prt_shell_1',
        sessionID: id,
        messageID,
        type: 'tool',
        callID: 'call_shell',
        tool: 'bash',
        state: {
          status: 'completed',
          input: { command },
          title: command,
          output: `$ ${command}\n(ok)`,
          metadata: {},
          time: { start: now() - 10, end: now() },
        },
      }
      messages.get(id)?.push({ info, parts: [shellPart] })
      setTimeout(() => {
        broadcast({ type: 'message.part.updated', properties: { part: shellPart } })
        statuses.set(id, { type: 'idle' })
        broadcast({ type: 'session.idle', properties: { sessionID: id } })
      }, 80)
      res.writeHead(204, { 'access-control-allow-origin': '*' })
      res.end()
      return
    }

    if (action === 'diff') {
      send(res, 200, diffs.get(id) ?? [])
      return
    }

    if (action === 'todo') {
      send(res, 200, [])
      return
    }

    if (action.startsWith('permissions')) {
      const permissionID = sub[3]
      const body = await readBody(req)
      broadcast({ type: 'permission.replied', properties: { sessionID: id, permissionID, response: body.response } })
      send(res, 200, true)
      return
    }
  }

  if (path === '/agent') {
    send(res, 200, [
      {
        name: 'build',
        description: 'Default agent',
        mode: 'primary',
        builtIn: true,
        permission: { edit: 'allow', bash: 'allow' },
        tools: {},
        options: {},
      },
    ])
    return
  }

  if (path === '/config/providers') {
    send(res, 200, {
      providers: [
        {
          id: 'anthropic',
          name: 'Anthropic',
          models: [{ id: 'claude-sonnet-4', name: 'Claude Sonnet 4', providerID: 'anthropic' }],
        },
      ],
      default: { anthropic: 'claude-sonnet-4' },
    })
    return
  }

  if (path === '/file/content') {
    const target = url.searchParams.get('path') ?? ''
    const content = files.get(target)
    if (content === undefined) {
      send(res, 404, { name: 'NotFound', data: { message: 'no such file' } })
      return
    }
    send(res, 200, { type: 'text', content })
    return
  }

  send(res, 404, { name: 'NotFound', data: { message: `no route for ${req.method} ${path}` } })
})

server.listen(PORT, () => {
  console.log(`fake opencode server listening on http://127.0.0.1:${PORT}`)
})

// Seed one session so the very first render has something to show.
const seeded = session(undefined, 'Seeded session')
sessions = [seeded]
messages.set(seeded.id, [])
statuses.set(seeded.id, { type: 'idle' })

const shutdown = () => {
  for (const stream of streams) stream.end()
  server.close(() => process.exit(0))
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
