/**
 * The real OpenCode transport, built on the official `@opencode-ai/sdk`.
 *
 * Covered by the SDK: sessions, messages, prompts, abort, shell, diffs, todos,
 * agents, providers, permissions, file contents.
 *
 * Done directly here (thin `fetch` calls against documented endpoints, because
 * the SDK does not expose them in a way Remote can use):
 *   - `GET /global/health` — a probe with a hard timeout, used by
 *     "Test connection" and by the connect flow.
 *   - `GET /global/event`  — the SSE stream. Reading it directly lets Remote
 *     report *why* a stream failed (401, CORS, offline) and reconnect on its
 *     own terms; the SDK's SSE helper swallows stream errors.
 *
 * Nothing in this file logs, stores or returns credentials: the basic-auth
 * header is derived per request and lives only in the request headers.
 */
import { createOpencodeClient } from '@opencode-ai/sdk/client'
import type {
  Agent,
  Event,
  FileContent,
  FileDiff,
  Provider,
  Session,
  SessionStatus,
  Todo,
} from '@opencode-ai/sdk/client'
import { timeouts } from '../config'
import type {
  Credentials,
  HealthResponse,
  MessageWithParts,
  ModelRef,
  ProvidersResponse,
  ProviderSummary,
} from '../types/opencode'
import type {
  EventStreamHandlers,
  OpenCodeTransport,
  PermissionResponse,
  PromptInput,
  ShellInput,
} from './transport'
import { RemoteError, describeApiError, toRemoteError } from './errors'

interface ResultLike {
  data?: unknown
  error?: unknown
  response?: { status?: number }
}

/**
 * Basic auth header for the OpenCode server.
 * OpenCode expects `OPENCODE_SERVER_USERNAME` (default `opencode`) plus
 * `OPENCODE_SERVER_PASSWORD`. Never returned to the UI, never logged.
 */
function buildAuthHeader(credentials: Credentials | null): string | null {
  if (!credentials || credentials.password === '') return null
  const username =
    credentials.username.trim() === '' ? 'opencode' : credentials.username.trim()
  const bytes = new TextEncoder().encode(`${username}:${credentials.password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  const factory = (AbortSignal as unknown as { timeout?: (value: number) => AbortSignal }).timeout
  return typeof factory === 'function' ? factory(ms) : undefined
}

interface RequestContext {
  url: string
  action: string
  session?: boolean
}

/** Unwrap a hey-api result tuple, turning every failure mode into a RemoteError. */
async function request<T>(promise: Promise<unknown>, context: RequestContext): Promise<T> {
  let raw: unknown
  try {
    raw = await promise
  } catch (error) {
    throw toRemoteError(error, context)
  }

  const result = (raw ?? {}) as ResultLike
  if (result.error !== undefined && result.error !== null) {
    throw describeApiError(result.response?.status, result.error, context)
  }
  if (result.data === undefined) {
    throw new RemoteError({
      code: 'malformed',
      title: 'OpenCode returned an unexpected response.',
      message: `No data returned while trying to ${context.action}.`,
      detail: result.response?.status ? `HTTP ${result.response.status}` : undefined,
    })
  }
  return result.data as T
}

function expectArray<T>(value: unknown, context: RequestContext): T[] {
  if (!Array.isArray(value)) {
    throw new RemoteError({
      code: 'malformed',
      title: 'OpenCode returned an unexpected response.',
      message: `Expected a list while trying to ${context.action}.`,
      hint: 'The server may be running an incompatible OpenCode version.',
    })
  }
  return value as T[]
}

function summarizeProviders(providers: Provider[]): ProviderSummary[] {
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name || provider.id,
    models: Object.values(provider.models ?? {})
      .map((model) => ({
        id: typeof model?.id === 'string' ? model.id : '',
        name: typeof model?.name === 'string' ? model.name : '',
      }))
      .filter((model) => model.id !== '')
      .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)),
  }))
}

export function createSdkTransport(options: {
  baseUrl: string
  credentials?: Credentials | null
}): OpenCodeTransport {
  const baseUrl = options.baseUrl
  const authHeader = buildAuthHeader(options.credentials ?? null)
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (authHeader) headers.Authorization = authHeader

  const client = createOpencodeClient({ baseUrl, headers })

  const ctx = (action: string, session = false): RequestContext => ({ url: baseUrl, action, session })

  const transport: OpenCodeTransport = {
    baseUrl,
    mock: false,

    async health(healthOptions) {
      const signal = healthOptions?.signal ?? timeoutSignal(timeouts.health)
      let response: Response
      try {
        response = await fetch(`${baseUrl}/global/health`, {
          method: 'GET',
          headers,
          cache: 'no-store',
          ...(signal ? { signal } : {}),
        })
      } catch (error) {
        throw toRemoteError(error, ctx('check the server health'))
      }

      if (!response.ok) throw describeApiError(response.status, undefined, ctx('check the server health'))

      let payload: unknown
      try {
        payload = await response.json()
      } catch (error) {
        throw toRemoteError(error, ctx('check the server health'))
      }
      if (typeof payload !== 'object' || payload === null || typeof (payload as HealthResponse).healthy !== 'boolean') {
        throw new RemoteError({
          code: 'malformed',
          title: 'OpenCode returned an unexpected response.',
          message: 'The health endpoint did not return the documented shape.',
          hint: 'Make sure the URL points at an OpenCode server (`opencode serve`).',
        })
      }
      const health: HealthResponse = { healthy: (payload as HealthResponse).healthy }
      const version = (payload as { version?: unknown }).version
      if (typeof version === 'string') health.version = version
      return health
    },

    async listSessions() {
      const data = await request<unknown>(
        client.session.list({ signal: timeoutSignal(timeouts.request) }),
        ctx('list sessions'),
      )
      return expectArray<Session>(data, ctx('list sessions'))
    },

    async createSession(input) {
      return request<Session>(
        client.session.create({
          body: { title: input?.title ?? 'Remote session' },
          signal: timeoutSignal(timeouts.request),
        }),
        ctx('create a session'),
      )
    },

    async updateSession(id, input) {
      return request<Session>(
        client.session.update({
          path: { id },
          body: { title: input.title ?? '' },
          signal: timeoutSignal(timeouts.request),
        }),
        ctx('rename the session', true),
      )
    },

    async deleteSession(id) {
      const data = await request<unknown>(
        client.session.delete({ path: { id }, signal: timeoutSignal(timeouts.request) }),
        ctx('delete the session', true),
      )
      return data === true
    },

    async sessionStatuses() {
      const data = await request<unknown>(
        client.session.status({ signal: timeoutSignal(timeouts.request) }),
        ctx('read session status'),
      )
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new RemoteError({
          code: 'malformed',
          title: 'OpenCode returned an unexpected response.',
          message: 'Session status was not an object.',
        })
      }
      return data as Record<string, SessionStatus>
    },

    async sessionDiff(id) {
      const data = await request<unknown>(
        client.session.diff({ path: { id }, signal: timeoutSignal(timeouts.request) }),
        ctx('read the session diff', true),
      )
      return expectArray<FileDiff>(data, ctx('read the session diff', true))
    },

    async sessionTodos(id) {
      const data = await request<unknown>(
        client.session.todo({ path: { id }, signal: timeoutSignal(timeouts.request) }),
        ctx('read the session todo list', true),
      )
      return expectArray<Todo>(data, ctx('read the session todo list', true))
    },

    async messages(id, messageOptions) {
      const data = await request<unknown>(
        client.session.messages({
          path: { id },
          query: messageOptions?.limit ? { limit: messageOptions.limit } : {},
          signal: timeoutSignal(timeouts.request),
        }),
        ctx('load messages', true),
      )
      const list = expectArray<MessageWithParts>(data, ctx('load messages', true))
      return list.filter(
        (entry) =>
          entry !== null &&
          typeof entry === 'object' &&
          typeof entry.info === 'object' &&
          entry.info !== null &&
          Array.isArray(entry.parts),
      )
    },

    async promptAsync(id, input: PromptInput) {
      const body: {
        parts: { type: 'text'; text: string }[]
        agent?: string
        model?: ModelRef
      } = { parts: [{ type: 'text', text: input.text }] }
      if (input.agent) body.agent = input.agent
      if (input.model) body.model = input.model

      await request<unknown>(
        client.session.promptAsync({ path: { id }, body }),
        ctx('send the prompt', true),
      )
    },

    async shell(id, input: ShellInput) {
      const body: { agent: string; command: string; model?: ModelRef } = {
        agent: input.agent,
        command: input.command,
      }
      if (input.model) body.model = input.model
      await request<unknown>(client.session.shell({ path: { id }, body }), ctx('run the command', true))
    },

    async abort(id) {
      const data = await request<unknown>(
        client.session.abort({ path: { id }, signal: timeoutSignal(timeouts.abort) }),
        ctx('abort the run', true),
      )
      return data === true
    },

    async replyPermission(sessionID, permissionID, response: PermissionResponse) {
      await request<unknown>(
        client.postSessionIdPermissionsPermissionId({
          path: { id: sessionID, permissionID },
          body: { response },
        }),
        ctx('answer the permission request', true),
      )
    },

    async agents() {
      const data = await request<unknown>(
        client.app.agents({ signal: timeoutSignal(timeouts.request) }),
        ctx('list agents'),
      )
      return expectArray<Agent>(data, ctx('list agents'))
    },

    async providers() {
      const data = await request<unknown>(
        client.config.providers({ signal: timeoutSignal(timeouts.request) }),
        ctx('list providers'),
      )
      if (typeof data !== 'object' || data === null) {
        throw new RemoteError({
          code: 'malformed',
          title: 'OpenCode returned an unexpected response.',
          message: 'The provider list was empty.',
        })
      }
      const record = data as { providers?: unknown; default?: unknown }
      const providers = expectArray<Provider>(record.providers ?? [], ctx('list providers'))
      const defaults =
        typeof record.default === 'object' && record.default !== null
          ? (record.default as Record<string, string>)
          : {}
      const response: ProvidersResponse = {
        providers: summarizeProviders(providers),
        default: defaults,
      }
      return response
    },

    async readFile(path) {
      try {
        return await request<FileContent>(
          client.file.read({ query: { path }, signal: timeoutSignal(timeouts.request) }),
          ctx('read the file'),
        )
      } catch (error) {
        if (error instanceof RemoteError && error.code === 'not_found') return undefined
        throw error
      }
    },

    subscribeEvents(handlers: EventStreamHandlers) {
      const controller = new AbortController()
      let stopped = false
      let attempt = 0

      const run = async () => {
        while (!stopped) {
          handlers.onStatus('connecting')
          try {
            const response = await fetch(`${baseUrl}/global/event`, {
              method: 'GET',
              headers: { ...headers, Accept: 'text/event-stream' },
              cache: 'no-store',
              signal: controller.signal,
            })

            if (!response.ok) throw describeApiError(response.status, undefined, ctx('open the event stream'))
            if (!response.body) {
              throw new RemoteError({
                code: 'malformed',
                title: 'OpenCode returned an unexpected response.',
                message: 'The event stream had no body.',
                hint: 'The SSE endpoint may be blocked by a proxy in front of OpenCode.',
              })
            }

            attempt = 0
            handlers.onStatus('open')
            await readEventStream(response.body, handlers, controller.signal)
            if (stopped) return
            handlers.onStatus(
              'error',
              new RemoteError({
                code: 'unreachable',
                title: 'Event stream closed.',
                message: 'OpenCode closed the live event stream.',
                hint: 'Remote keeps working — it falls back to polling message history.',
              }),
            )
          } catch (error) {
            if (stopped) return
            const normalised = toRemoteError(error, ctx('open the event stream'))
            if (normalised.code === 'aborted') return
            // A missing stream is not fatal: the chat falls back to polling.
            handlers.onStatus('error', normalised)
          }

          if (stopped) return
          attempt += 1
          const backoff = Math.min(1000 * 2 ** (attempt - 1), 15_000)
          await new Promise((resolve) => setTimeout(resolve, backoff))
        }
      }

      void run()

      return () => {
        stopped = true
        controller.abort()
      }
    },
  }

  return transport
}

function findSeparator(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf('\n\n')
  const crlf = buffer.indexOf('\r\n\r\n')
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 }
  if (lf !== -1) return { index: lf, length: 2 }
  return null
}

/**
 * `GET /global/event` frames are standard SSE. Each `data:` payload is a
 * `GlobalEvent` (`{ directory, payload }`) whose `payload` is the actual event;
 * older builds send the event object directly, so accept both.
 */
export function parseSseChunk(chunk: string): Event | null {
  const dataLines: string[] = []
  for (const line of chunk.split(/\r?\n/)) {
    if (line.startsWith(':')) continue
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
  }
  if (dataLines.length === 0) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(dataLines.join('\n'))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const direct = parsed as { type?: unknown }
  if (typeof direct.type === 'string') return parsed as Event

  const wrapped = parsed as { payload?: { type?: unknown } }
  if (wrapped.payload && typeof wrapped.payload.type === 'string') {
    return wrapped.payload as Event
  }
  return null
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  handlers: EventStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let separator = findSeparator(buffer)
      while (separator) {
        const chunk = buffer.slice(0, separator.index)
        buffer = buffer.slice(separator.index + separator.length)
        const event = parseSseChunk(chunk)
        if (event) handlers.onEvent(event)
        separator = findSeparator(buffer)
      }
    }
  } catch (error) {
    if (!signal.aborted) throw error
  } finally {
    try {
      await reader.cancel()
    } catch {
      /* already closed */
    }
  }
}
