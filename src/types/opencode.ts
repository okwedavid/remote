/**
 * Shared types.
 *
 * OpenCode's own types come from the official SDK so we never guess the wire
 * format. Everything else in this file describes Remote's local view of that
 * data (connection state, credentials, settings, derived file activity).
 */
import type {
  Agent,
  AssistantMessage,
  Event,
  FileContent,
  FileDiff,
  Message,
  Part,
  Permission,
  ReasoningPart,
  Session,
  SessionStatus,
  TextPart,
  ToolPart,
  ToolState,
  Todo,
  UserMessage,
} from '@opencode-ai/sdk/client'

export type {
  Agent,
  AssistantMessage,
  Event,
  FileContent,
  FileDiff,
  Message,
  Part,
  Permission,
  ReasoningPart,
  Session,
  SessionStatus,
  TextPart,
  ToolPart,
  ToolState,
  Todo,
  UserMessage,
}

/** `GET /session/:id/message` returns message + parts tuples. */
export interface MessageWithParts {
  info: Message
  parts: Part[]
}

/** `GET /global/health`. */
export interface HealthResponse {
  healthy: boolean
  version?: string
}

/** `GET /config/providers`, trimmed to what the composer needs. */
export interface ProviderSummary {
  id: string
  name: string
  models: { id: string; name: string }[]
}

export interface ProvidersResponse {
  providers: ProviderSummary[]
  default: Record<string, string>
}

export interface ModelRef {
  providerID: string
  modelID: string
}

export interface Credentials {
  username: string
  password: string
}

/** `session` keeps the password for the lifetime of the browser tab only. */
export type CredentialPersistence = 'memory' | 'session'

export interface Settings {
  serverUrl: string
  username: string
  autoConnect: boolean
  credentialPersistence: CredentialPersistence
  /** Optional overrides sent with prompts; empty means "server default". */
  agent: string
  model: ModelRef | null
  showReasoning: boolean
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'
export type EventStreamState = 'idle' | 'connecting' | 'open' | 'error'

export interface ConnectionInfo {
  state: ConnectionState
  /** Server the UI is currently pointed at. */
  url: string
  version?: string
  latencyMs?: number
  error: RemoteErrorInfo | null
}

/** A plain, serialisable snapshot of a `RemoteError`. */
export interface RemoteErrorInfo {
  code: RemoteErrorCode
  title: string
  message: string
  hint?: string
  status?: number
  detail?: string
  retryable: boolean
}

export type RemoteErrorCode =
  | 'offline'
  | 'unreachable'
  | 'cors'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'server_error'
  | 'malformed'
  | 'aborted'
  | 'config'
  | 'unknown'

export type FileChangeStatus = 'modified' | 'created' | 'deleted'

export interface FileChange {
  path: string
  status: FileChangeStatus
  additions: number
  deletions: number
  before?: string
  after?: string
}

/** Locally rendered user message shown before the server echoes it back. */
export interface OptimisticMessage {
  id: string
  sessionID: string
  text: string
  createdAt: number
}

export type ComposerMode = 'prompt' | 'shell'

/** An OpenCode permission request surfaced in the conversation. */
export type PermissionRequest = Permission
