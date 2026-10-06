/**
 * URL handling for the OpenCode server address.
 *
 * Users paste all sorts of things (`localhost:4096`, `https://host/`, or even a
 * URL containing credentials). We normalise what we can and reject the rest
 * with a message they can act on.
 */

export type UrlParseResult = { ok: true; url: string } | { ok: false; reason: string }

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

export function parseServerUrl(input: string): UrlParseResult {
  const trimmed = (input ?? '').trim()
  if (trimmed === '') return { ok: false, reason: 'Enter the URL of your OpenCode server.' }

  // Tolerate `localhost:4096` and `192.168.1.20:4096`.
  const withScheme = SCHEME.test(trimmed) ? trimmed : `http://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, reason: 'That does not look like a valid URL.' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'Only http:// and https:// URLs are supported.',
    }
  }

  if (url.username || url.password) {
    return {
      ok: false,
      reason:
        'Remove the credentials from the URL — use the username and password fields instead.',
    }
  }

  if (!url.hostname) return { ok: false, reason: 'That URL has no host.' }

  // Drop query/hash, keep an optional path prefix (some tunnels mount a subpath).
  url.search = ''
  url.hash = ''
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path

  return { ok: true, url: url.toString().replace(/\/+$/, '') }
}

/** Best-effort normalisation; returns '' when the input is unusable. */
export function normalizeServerUrl(input: string): string {
  const result = parseServerUrl(input)
  return result.ok ? result.url : ''
}

/** `https://host:port` — safe to show in the UI (never contains credentials). */
export function describeOrigin(url: string): string {
  const result = parseServerUrl(url)
  if (!result.ok) return url
  try {
    const parsed = new URL(result.url)
    return parsed.origin
  } catch {
    return url
  }
}

export function isLoopbackUrl(url: string): boolean {
  const result = parseServerUrl(url)
  if (!result.ok) return false
  try {
    const { hostname } = new URL(result.url)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

/**
 * True when the given server URL is a different origin than the page that is
 * running the UI — the browser will then require the OpenCode server to send
 * CORS headers (see `opencode serve --cors`).
 */
export function isCrossOrigin(url: string): boolean {
  if (typeof window === 'undefined') return false
  const result = parseServerUrl(url)
  if (!result.ok) return false
  try {
    const target = new URL(result.url)
    const self = new URL(window.location.href)
    // Ports 80/443 are normalised by URL, so origin comparison is enough.
    if (target.origin !== self.origin) return true
    // Serving the UI over https and calling an http server is also blocked
    // (mixed content) even for the same host.
    return self.protocol === 'https:' && target.protocol === 'http:'
  } catch {
    return false
  }
}
