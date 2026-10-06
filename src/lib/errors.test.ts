import { describe, expect, it, vi } from 'vitest'
import {
  RemoteError,
  describeApiError,
  describeAssistantError,
  isAbortError,
  sanitizeDetail,
  toRemoteError,
} from './errors'

describe('sanitizeDetail', () => {
  it('drops stack traces and keeps the first line', () => {
    const detail = sanitizeDetail('boom\n    at foo (bar.ts:1:1)\n    at baz')
    expect(detail).toBe('boom')
  })

  it('redacts authorization headers and basic credentials', () => {
    expect(sanitizeDetail('authorization: Basic YWJjOmRlZg==')).toBe(
      'authorization: [redacted]',
    )
    expect(sanitizeDetail('Bearer abcdefghijklmnop')).toBe('[redacted]')
  })

  it('redacts credentials embedded in URLs', () => {
    const detail = sanitizeDetail('failed to fetch http://user:s3cret@localhost:4096/session')
    expect(detail).not.toContain('s3cret')
    expect(detail).toContain('[redacted]@')
  })

  it('redacts long opaque tokens', () => {
    const token = 'a'.repeat(48)
    expect(sanitizeDetail(`token ${token}`)).toBe('token [redacted]')
  })

  it('truncates long messages', () => {
    const detail = sanitizeDetail('x'.repeat(500))
    expect(detail?.length).toBeLessThanOrEqual(240)
  })

  it('returns undefined for empty input', () => {
    expect(sanitizeDetail(undefined)).toBeUndefined()
    expect(sanitizeDetail('')).toBeUndefined()
  })
})

describe('describeApiError', () => {
  it('maps 401 to an authentication message', () => {
    const error = describeApiError(401, { name: 'Unauthorized' })
    expect(error.code).toBe('unauthorized')
    expect(error.title).toMatch(/authenticate/i)
    expect(error.retryable).toBe(false)
  })

  it('maps 404 on a session to "Session no longer exists."', () => {
    const error = describeApiError(404, undefined, { session: true })
    expect(error.title).toBe('Session no longer exists.')
    expect(error.retryable).toBe(false)
  })

  it('maps 5xx to a server error', () => {
    expect(describeApiError(500, undefined).code).toBe('server_error')
  })

  it('maps 400 to a rejected request', () => {
    const error = describeApiError(400, { data: { message: 'Invalid body' } })
    expect(error.code).toBe('malformed')
    expect(error.message).toBe('Invalid body')
  })

  it('maps 403 to forbidden', () => {
    expect(describeApiError(403, undefined).code).toBe('forbidden')
  })

  it('never leaks the parsed body verbatim when it is huge', () => {
    const error = describeApiError(400, { data: { message: 'y'.repeat(500) } })
    expect((error.message ?? '').length).toBeLessThanOrEqual(240)
  })
})

describe('toRemoteError', () => {
  it('passes RemoteError through unchanged', () => {
    const original = new RemoteError({ code: 'offline', title: 'x' })
    expect(toRemoteError(original)).toBe(original)
  })

  it('treats a failed fetch to a cross-origin server as CORS', () => {
    const error = toRemoteError(new TypeError('Failed to fetch'), {
      url: 'http://192.168.1.5:4096',
    })
    expect(error.code).toBe('cors')
    expect(error.hint).toMatch(/--cors/)
  })

  it('treats a failed fetch to a same-origin address as offline', () => {
    // jsdom serves from http://localhost:3000; port 4096 is cross-origin, so
    // use the page's own origin to exercise the same-origin branch.
    const error = toRemoteError(new TypeError('Load failed'), { url: window.location.origin })
    expect(error.code).toBe('unreachable')
  })

  it('maps AbortError and TimeoutError', () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
    expect(toRemoteError(abortError).code).toBe('aborted')
    expect(isAbortError(abortError)).toBe(true)

    const timeoutError = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    expect(toRemoteError(timeoutError).code).toBe('timeout')
  })

  it('maps a SyntaxError to a malformed response', () => {
    expect(toRemoteError(new SyntaxError('Unexpected token <')).code).toBe('malformed')
  })

  it('uses the status carried on the error when present', () => {
    const error = Object.assign(new Error('nope'), { status: 401 })
    expect(toRemoteError(error).code).toBe('unauthorized')
  })

  it('falls back to a generic message for unknown values', () => {
    const error = toRemoteError({ unexpected: true })
    expect(error.code).toBe('unknown')
    expect(error.title).toMatch(/Something went wrong/)
  })

  it('reports offline when the browser says so', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const error = toRemoteError(new TypeError('Failed to fetch'))
    expect(error.code).toBe('offline')
    spy.mockRestore()
  })
})

describe('describeAssistantError', () => {
  it('explains provider auth failures without blaming Remote', () => {
    const error = describeAssistantError({
      name: 'ProviderAuthError',
      data: { providerID: 'anthropic', message: 'not logged in' },
    })
    expect(error.title).toMatch(/provider/i)
    expect(error.hint).toMatch(/opencode auth login/)
  })

  it('treats an aborted run as information, not a failure', () => {
    const error = describeAssistantError({
      name: 'MessageAbortedError',
      data: { message: 'aborted' },
    })
    expect(error.code).toBe('aborted')
    expect(error.retryable).toBe(false)
  })

  it('includes the provider status code for API errors', () => {
    const error = describeAssistantError({
      name: 'APIError',
      data: { message: 'rate limited', statusCode: 429, isRetryable: true },
    })
    expect(error.status).toBe(429)
    expect(error.title).toMatch(/provider/i)
  })

  it('handles unknown shapes', () => {
    expect(describeAssistantError({ name: 'UnknownError', data: { message: 'huh' } }).message).toBe(
      'huh',
    )
    expect(describeAssistantError(null).code).toBe('unknown')
  })
})
