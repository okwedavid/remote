/**
 * Error normalisation.
 *
 * Everything that can go wrong in the browser (offline, CORS, 401, timeouts,
 * malformed payloads, fetch rejections) is funnelled through `toRemoteError`
 * so the UI can show one friendly, actionable message — never a stack trace and
 * never anything credential-shaped.
 */
import type { RemoteErrorCode, RemoteErrorInfo } from '../types/opencode'
import { describeOrigin, isCrossOrigin } from './urls'

const STATUS_CODES: Record<number, RemoteErrorCode> = {
  400: 'malformed',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  408: 'timeout',
  409: 'malformed',
  422: 'malformed',
  429: 'server_error',
  500: 'server_error',
  502: 'server_error',
  503: 'unreachable',
  504: 'timeout',
}

interface ErrorInit {
  code: RemoteErrorCode
  title: string
  message?: string
  hint?: string
  status?: number
  detail?: string
  retryable?: boolean
}

const NON_RETRYABLE: RemoteErrorCode[] = ['unauthorized', 'forbidden', 'config', 'aborted']

export class RemoteError extends Error {
  readonly code: RemoteErrorCode
  readonly title: string
  readonly hint?: string
  readonly status?: number
  readonly detail?: string
  readonly retryable: boolean

  constructor(init: ErrorInit) {
    super(init.message ?? init.title)
    this.name = 'RemoteError'
    this.code = init.code
    this.title = init.title
    if (init.message) this.message = init.message
    if (init.hint) this.hint = init.hint
    if (typeof init.status === 'number') this.status = init.status
    if (init.detail) this.detail = init.detail
    this.retryable = init.retryable ?? !NON_RETRYABLE.includes(init.code)
  }

  toInfo(): RemoteErrorInfo {
    const info: RemoteErrorInfo = {
      code: this.code,
      title: this.title,
      message: this.message,
      retryable: this.retryable,
    }
    if (this.hint) info.hint = this.hint
    if (typeof this.status === 'number') info.status = this.status
    if (this.detail) info.detail = this.detail
    return info
  }
}

/**
 * Strip anything that could leak a credential or flood the UI.
 * - keeps only the first line (drops stack traces)
 * - removes Authorization/Basic/Bearer values
 * - removes `user:pass@` from URLs
 * - drops long opaque blobs (tokens/keys)
 * - truncates
 */
export function sanitizeDetail(input: unknown, max = 240): string | undefined {
  if (input === null || input === undefined) return undefined
  let text: string
  if (typeof input === 'string') text = input
  else if (input instanceof Error) text = input.message || input.name
  else {
    try {
      text = JSON.stringify(input)
    } catch {
      text = String(input)
    }
  }
  if (!text) return undefined

  let clean = text.split('\n')[0]?.trim() ?? ''
  clean = clean
    .replace(/authorization\s*[:=][^\n]*/gi, 'authorization: [redacted]')
    .replace(/\b(basic|bearer)\s+[a-z0-9\-._~+/=]{8,}/gi, '[redacted]')
    .replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, '//[redacted]@')
    .replace(/\b[a-z0-9_-]{32,}\b/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()

  if (clean.length > max) clean = `${clean.slice(0, max - 1)}…`
  return clean === '' ? undefined : clean
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String((error as { name?: unknown }).name) : ''
  return name === 'AbortError' || name === 'TimeoutError'
}

/**
 * A browser reports both "the server refused the connection" and "the server
 * answered but its CORS policy hid the response" as the same opaque
 * `Failed to fetch`. `networkFailure` picks the most likely story from the URL
 * alone; `classifyNetworkFailure` (below) improves on it with one probe.
 */
export function networkFailure(url: string, detail?: string): RemoteError {
  if (url && isCrossOrigin(url)) {
    return new RemoteError({
      code: 'cors',
      title: 'CORS blocked this request.',
      message: `The browser would not let this page talk to ${describeOrigin(url)}.`,
      hint:
        'Restart OpenCode with this page’s origin allowed, e.g. `opencode serve --cors https://your-remote-url` (see README → CORS configuration).',
      detail,
    })
  }
  return new RemoteError({
    code: 'unreachable',
    title: 'OpenCode server is offline.',
    message: url ? `No response from ${describeOrigin(url)}.` : 'No response from the OpenCode server.',
    hint:
      'Check that the server is running (`opencode serve`) and that the URL in Settings is reachable from this device.',
    detail,
  })
}

/**
 * Disambiguate a failed request with a `no-cors` probe: a server that is up
 * answers it (an opaque response is still an answer), a server that is down
 * refuses it. Only called after a request already failed, so it costs one
 * round trip exactly when the user is looking at an error.
 */
export async function classifyNetworkFailure(error: RemoteError, url: string): Promise<RemoteError> {
  if (error.code !== 'cors' && error.code !== 'unreachable') return error
  if (!url) return error

  const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout
  try {
    await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      ...(typeof timeout === 'function' ? { signal: timeout(5000) } : {}),
    })
  } catch {
    return networkFailure('', error.detail) // unreachable, even though it looked cross-origin
  }
  return networkFailure(url, error.detail)
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const candidate = error as {
    status?: unknown
    cause?: { status?: unknown }
    response?: { status?: unknown }
  }
  const direct = candidate.status ?? candidate.response?.status ?? candidate.cause?.status
  return typeof direct === 'number' ? direct : undefined
}

/** Pull a human message out of OpenCode's NamedError-shaped bodies. */
function readApiMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return typeof body === 'string' && body.trim() !== '' ? sanitizeDetail(body) : undefined
  }
  const record = body as Record<string, unknown>
  const data = record.data as Record<string, unknown> | undefined
  if (data && typeof data.message === 'string') return sanitizeDetail(data.message)
  if (typeof record.message === 'string') return sanitizeDetail(record.message)
  if (typeof record.name === 'string' && record.name !== 'Error') return sanitizeDetail(record.name)
  return undefined
}

export interface ErrorContext {
  /** Server URL the request was aimed at (used for messages, never sent back). */
  url?: string
  /** Short description such as "list sessions". */
  action?: string
  /** Set for session-scoped calls so "session no longer exists" is accurate. */
  session?: boolean
}

/** Map an HTTP status + response body to a friendly error. */
export function describeApiError(
  status: number | undefined,
  body: unknown,
  context: ErrorContext = {},
): RemoteError {
  const detail = readApiMessage(body)
  const code: RemoteErrorCode = status ? (STATUS_CODES[status] ?? 'unknown') : 'unknown'

  if (status === 401) {
    return new RemoteError({
      code: 'unauthorized',
      status,
      title: 'Unable to authenticate with OpenCode.',
      message:
        'The OpenCode server rejected these credentials (HTTP 401). It is protected by HTTP basic auth.',
      hint: 'Check the username and password in Settings. The username defaults to “opencode”.',
      detail,
    })
  }

  if (status === 403) {
    return new RemoteError({
      code: 'forbidden',
      status,
      title: 'OpenCode refused that request.',
      message: 'The server understood the request but would not allow it (HTTP 403).',
      hint: 'Check the permissions configured on the OpenCode server.',
      detail,
    })
  }

  if (status === 404) {
    if (context.session) {
      return new RemoteError({
        code: 'not_found',
        status,
        title: 'Session no longer exists.',
        message: 'That session was deleted on the OpenCode server.',
        hint: 'Pick another session or create a new one.',
        detail,
        retryable: false,
      })
    }
    return new RemoteError({
      code: 'not_found',
      status,
      title: 'OpenCode could not find that resource.',
      hint:
        'This usually means the server is running an OpenCode version without that endpoint, or the item was removed.',
      detail,
    })
  }

  if (status === 400 || status === 409 || status === 422) {
    return new RemoteError({
      code: 'malformed',
      status,
      title: 'OpenCode rejected that request.',
      message: detail ?? 'The request was not accepted by the server.',
      hint: 'Adjust the prompt or the settings and try again.',
      detail,
    })
  }

  if (status === 408 || status === 504) {
    return new RemoteError({
      code: 'timeout',
      status,
      title: 'Connection timed out.',
      message: 'OpenCode did not answer in time.',
      hint: 'Check the network path to your PC, then retry.',
      detail,
    })
  }

  if (status && status >= 500) {
    return new RemoteError({
      code: 'server_error',
      status,
      title: 'OpenCode returned a server error.',
      message: `The server responded with HTTP ${status}.`,
      hint: 'Check the OpenCode logs on your PC.',
      detail,
    })
  }

  return new RemoteError({
    code,
    ...(status ? { status } : {}),
    title: 'OpenCode returned an unexpected response.',
    message: detail ?? 'The request failed.',
    detail,
  })
}

/** Normalise any thrown value into a displayable `RemoteError`. */
export function toRemoteError(error: unknown, context: ErrorContext = {}): RemoteError {
  if (error instanceof RemoteError) return error

  const status = readStatus(error)
  if (status) return describeApiError(status, error, context)

  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
  if (name === 'TimeoutError') {
    return new RemoteError({
      code: 'timeout',
      title: 'Connection timed out.',
      message: 'The OpenCode server did not respond in time.',
      hint: 'Check that your PC is reachable from this device and retry.',
    })
  }
  if (name === 'AbortError') {
    return new RemoteError({
      code: 'aborted',
      title: 'Request aborted.',
      message: 'The operation was cancelled.',
      retryable: false,
    })
  }

  const detail = sanitizeDetail(error)

  if (error instanceof TypeError || /failed to fetch|networkerror|load failed|fetch failed/i.test(detail ?? '')) {
    if (isOffline()) {
      return new RemoteError({
        code: 'offline',
        title: 'You appear to be offline.',
        message: 'The browser reports no network connection.',
        hint: 'Reconnect to the internet and retry.',
        detail,
      })
    }
    return networkFailure(context.url ?? '', detail)
  }

  if (error instanceof SyntaxError) {
    return new RemoteError({
      code: 'malformed',
      title: 'OpenCode returned an unexpected response.',
      message: 'The response could not be parsed.',
      detail,
    })
  }

  return new RemoteError({
    code: 'unknown',
    title: 'Something went wrong talking to OpenCode.',
    message: detail ?? 'Unknown error.',
    hint: 'Retry the operation. If it keeps failing, check the OpenCode logs on your PC.',
    detail,
  })
}

/** Build a fresh, mutable info object (used for state that must re-render). */
export function errorInfo(error: unknown, context: ErrorContext = {}): RemoteErrorInfo {
  return toRemoteError(error, context).toInfo()
}

/**
 * Errors OpenCode attaches to assistant messages / `session.error` events
 * (`{ name, data }` unions from the SDK).
 */
export function describeAssistantError(error: unknown): RemoteError {
  const record = (typeof error === 'object' && error !== null ? error : {}) as {
    name?: unknown
    data?: { message?: unknown; statusCode?: unknown }
  }
  const name = typeof record.name === 'string' ? record.name : 'UnknownError'
  const detail = sanitizeDetail(record.data?.message)

  switch (name) {
    case 'ProviderAuthError':
      return new RemoteError({
        code: 'unauthorized',
        title: 'OpenCode could not authenticate with the model provider.',
        message:
          detail ??
          'The provider rejected the request. This is the model provider, not your Remote login.',
        hint: 'Run `opencode auth login` on your PC and pick the provider again.',
        retryable: false,
      })
    case 'MessageAbortedError':
      return new RemoteError({
        code: 'aborted',
        title: 'Request aborted.',
        message: detail ?? 'The run was cancelled.',
        retryable: false,
      })
    case 'MessageOutputLengthError':
      return new RemoteError({
        code: 'server_error',
        title: 'The model reached its output limit.',
        message: 'The response was cut off because it hit the maximum output length.',
        hint: 'Ask for a smaller step, or raise the limit in your OpenCode model config.',
      })
    case 'APIError': {
      const statusCode =
        typeof record.data?.statusCode === 'number' ? record.data.statusCode : undefined
      return new RemoteError({
        code: 'server_error',
        ...(statusCode ? { status: statusCode } : {}),
        title: 'The model provider returned an error.',
        message: statusCode
          ? `The provider responded with HTTP ${statusCode}.`
          : 'The provider request failed.',
        hint: 'Retry, or switch models if it keeps happening.',
        detail,
      })
    }
    default:
      return new RemoteError({
        code: 'unknown',
        title: 'OpenCode reported an error.',
        message: detail ?? 'The agent stopped with an unknown error.',
        hint: 'Retry the prompt. If it repeats, check the OpenCode logs on your PC.',
        detail,
      })
  }
}
