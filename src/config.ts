/**
 * Runtime configuration for Remote.
 *
 * Everything here is build-time and therefore PUBLIC. The only accepted
 * variables are:
 *
 *   VITE_OPENCODE_URL  — default OpenCode server URL (optional)
 *   VITE_MOCK_MODE     — "true" enables the development-only simulated server
 *
 * Credentials are never read from the environment: the user types them into the
 * Settings panel at runtime and they stay in memory / sessionStorage.
 */

const raw = import.meta.env as unknown as Record<string, unknown>

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export const isDev = raw.DEV === true
export const isProd = raw.PROD === true

/** Development-only simulated OpenCode server (never on by default). */
export const mockModeRequested = readString(raw.VITE_MOCK_MODE)?.toLowerCase() === 'true'

/** URL compiled into the bundle from VITE_OPENCODE_URL, if any. */
export const configuredServerUrl = readString(raw.VITE_OPENCODE_URL)

/** Development falls back to the local default port; production does not. */
export const defaultServerUrl = configuredServerUrl ?? (isDev ? 'http://localhost:4096' : '')

export const appConfig = {
  name: 'Remote',
  tagline: 'OpenCode control panel',
  /** Where the OpenCode server binds by default, used in docs/hints. */
  defaultPort: 4096,
} as const

export const timeouts = {
  /** Health probe used by "Test connection". */
  health: 8_000,
  /** Normal REST calls. */
  request: 20_000,
  /** Aborting a run should be snappy. */
  abort: 8_000,
} as const

export const limits = {
  /** Composer grows up to this height before scrolling. */
  composerMaxHeight: 200,
  /** Reasoning blocks longer than this are collapsed by default. */
  reasoningPreviewChars: 400,
  /** Tool output lines rendered before "show more". */
  toolOutputLines: 60,
  /** Code blocks taller than this are collapsed. */
  codePreviewLines: 24,
  /** Characters of a file diff rendered before truncation. */
  diffMaxLines: 600,
  /** Messages rendered at once (older ones are hidden behind a button). */
  visibleMessages: 200,
  /** Sessions kept in the sidebar. */
  sessionListLimit: 100,
} as const
