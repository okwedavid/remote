/**
 * Transport contract + factory.
 *
 * A transport is "the OpenCode server as seen by Remote". Two implementations
 * exist:
 *
 *   - `createSdkTransport` (lib/opencode.ts)  — the real thing, built on the
 *     official `@opencode-ai/sdk`.
 *   - `createMockTransport` (lib/mock.ts)     — development-only simulation,
 *     loaded lazily so it never reaches a production bundle fetch.
 */
import type {
  Agent,
  Event,
  FileContent,
  FileDiff,
  Session,
  SessionStatus,
  Todo,
} from '@opencode-ai/sdk/client'
import type {
  Credentials,
  EventStreamState,
  HealthResponse,
  MessageWithParts,
  ModelRef,
  ProvidersResponse,
} from '../types/opencode'
import { RemoteError } from './errors'
import { createSdkTransport } from './opencode'
import { normalizeServerUrl } from './urls'

export type PermissionResponse = 'once' | 'always' | 'reject'

export interface PromptInput {
  text: string
  agent?: string
  model?: ModelRef | null
}

export interface ShellInput {
  command: string
  agent: string
  model?: ModelRef | null
}

export interface EventStreamHandlers {
  onEvent: (event: Event) => void
  /** `open` once the stream is live, `error` when it drops (UI falls back to polling). */
  onStatus: (state: EventStreamState, error?: RemoteError) => void
}

export interface OpenCodeTransport {
  /** Normalised base URL. Never contains credentials. */
  readonly baseUrl: string
  /** True when this is the development mock, not a real OpenCode server. */
  readonly mock: boolean

  health(options?: { signal?: AbortSignal }): Promise<HealthResponse>

  listSessions(): Promise<Session[]>
  createSession(input?: { title?: string }): Promise<Session>
  updateSession(id: string, input: { title?: string }): Promise<Session>
  deleteSession(id: string): Promise<boolean>
  sessionStatuses(): Promise<Record<string, SessionStatus>>
  sessionDiff(id: string): Promise<FileDiff[]>
  sessionTodos(id: string): Promise<Todo[]>

  messages(id: string, options?: { limit?: number }): Promise<MessageWithParts[]>
  promptAsync(id: string, input: PromptInput): Promise<void>
  shell(id: string, input: ShellInput): Promise<void>
  abort(id: string): Promise<boolean>
  replyPermission(sessionID: string, permissionID: string, response: PermissionResponse): Promise<void>

  agents(): Promise<Agent[]>
  providers(): Promise<ProvidersResponse>
  readFile(path: string): Promise<FileContent | undefined>

  /** Returns an unsubscribe function. */
  subscribeEvents(handlers: EventStreamHandlers): () => void
}

export interface TransportOptions {
  baseUrl: string
  credentials?: Credentials | null
  /** Development mock mode (VITE_MOCK_MODE). */
  mock?: boolean
}

export async function createTransport(options: TransportOptions): Promise<OpenCodeTransport> {
  const baseUrl = normalizeServerUrl(options.baseUrl)
  if (baseUrl === '') {
    throw new RemoteError({
      code: 'config',
      title: 'OpenCode server URL is not configured.',
      message: 'Remote needs the URL of your OpenCode server before it can connect.',
      hint: 'Open Settings and enter an address such as http://localhost:4096 or https://opencode.example.com.',
      retryable: false,
    })
  }

  if (options.mock) {
    const { createMockTransport } = await import('./mock')
    return createMockTransport({ baseUrl })
  }

  return createSdkTransport({ baseUrl, credentials: options.credentials ?? null })
}
