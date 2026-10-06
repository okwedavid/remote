import type {
  Agent,
  Event,
  TextPart,
  FileContent,
  FileDiff,
  Message,
  Session,
  SessionStatus,
  Todo,
} from '../types/opencode'
import type {
  EventStreamHandlers,
  OpenCodeTransport,
  PermissionResponse,
  PromptInput,
  ShellInput,
} from '../lib/transport'
import type { MessageWithParts, ProvidersResponse } from '../types/opencode'

const NOW = 1_700_000_000_000

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'ses_1',
    projectID: 'prj_1',
    directory: '/tmp/project',
    title: 'Test session',
    version: '1.0.0',
    time: { created: NOW, updated: NOW },
    ...overrides,
  }
}

export function makeUserMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg_user',
    sessionID: 'ses_1',
    role: 'user',
    time: { created: NOW },
    agent: 'build',
    model: { providerID: 'anthropic', modelID: 'claude' },
    ...overrides,
  } as Message
}

export function makeAssistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg_assistant',
    sessionID: 'ses_1',
    role: 'assistant',
    parentID: 'msg_user',
    modelID: 'claude',
    providerID: 'anthropic',
    mode: 'build',
    path: { cwd: '/tmp/project', root: '/tmp/project' },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: NOW },
    ...overrides,
  } as Message
}

export function makeTextPart(id: string, text: string, messageID = 'msg_assistant'): TextPart {
  return { id, sessionID: 'ses_1', messageID, type: 'text', text }
}

export interface FakeTransport extends OpenCodeTransport {
  /** Emit an event to every active subscriber. */
  emit: (event: Event) => void
  /** Collects everything the UI sent. */
  calls: {
    prompts: { sessionID: string; input: PromptInput }[]
    shells: { sessionID: string; input: ShellInput }[]
    aborts: string[]
    permissions: { sessionID: string; permissionID: string; response: PermissionResponse }[]
    creates: (string | undefined)[]
    updates: { sessionID: string; patch: { title?: string } }[]
    deletes: string[]
  }
  /** Reset recorded calls. */
  resetCalls: () => void
}

export interface FakeTransportOptions {
  health?: () => Promise<{ healthy: boolean; version?: string }>
  sessions?: Session[]
  messages?: MessageWithParts[]
  diffs?: FileDiff[]
  agents?: Agent[]
  providers?: ProvidersResponse
  statuses?: Record<string, SessionStatus>
  files?: Record<string, FileContent>
  onPrompt?: (sessionID: string, input: PromptInput) => void
  /** Force promptAsync to fail (used to test error handling). */
  promptError?: Error
}

/** In-memory OpenCodeTransport used by hook/component tests. */
export function createFakeTransport(options: FakeTransportOptions = {}): FakeTransport {
  const listeners = new Set<EventStreamHandlers>()
  const calls: FakeTransport['calls'] = {
    prompts: [],
    shells: [],
    aborts: [],
    permissions: [],
    creates: [],
    updates: [],
    deletes: [],
  }

  let sessions = options.sessions ?? [makeSession()]
  const messages = options.messages ?? []

  const transport: FakeTransport = {
    baseUrl: 'http://localhost:4096',
    mock: false,
    calls,

    async health() {
      if (options.health) return options.health()
      return { healthy: true, version: '1.0.0-test' }
    },

    async listSessions() {
      return sessions
    },

    async createSession(input) {
      calls.creates.push(input?.title)
      const session = makeSession({ id: `ses_${sessions.length + 1}`, title: input?.title ?? 'New' })
      sessions = [session, ...sessions]
      return session
    },

    async updateSession(id, input) {
      calls.updates.push({ sessionID: id, patch: { title: input.title } })
      const session = sessions.find((entry) => entry.id === id)
      if (!session) throw new Error('missing')
      const updated = { ...session, title: input.title ?? session.title }
      sessions = sessions.map((entry) => (entry.id === id ? updated : entry))
      return updated
    },

    async deleteSession(id) {
      calls.deletes.push(id)
      sessions = sessions.filter((session) => session.id !== id)
      return true
    },

    async sessionStatuses() {
      return options.statuses ?? {}
    },

    async sessionDiff() {
      return options.diffs ?? []
    },

    async sessionTodos(): Promise<Todo[]> {
      return []
    },

    async messages() {
      return messages
    },

    async promptAsync(sessionID, input) {
      calls.prompts.push({ sessionID, input })
      if (options.promptError) throw options.promptError
      options.onPrompt?.(sessionID, input)
    },

    async shell(sessionID, input) {
      calls.shells.push({ sessionID, input })
    },

    async abort(sessionID) {
      calls.aborts.push(sessionID)
      return true
    },

    async replyPermission(sessionID, permissionID, response) {
      calls.permissions.push({ sessionID, permissionID, response })
    },

    async agents() {
      return options.agents ?? []
    },

    async providers() {
      return options.providers ?? { providers: [], default: {} }
    },

    async readFile(path) {
      return options.files?.[path]
    },

    subscribeEvents(handlers) {
      listeners.add(handlers)
      handlers.onStatus('open')
      return () => {
        listeners.delete(handlers)
      }
    },

    emit(event) {
      for (const listener of listeners) listener.onEvent(event)
    },

    resetCalls() {
      calls.prompts = []
      calls.shells = []
      calls.aborts = []
      calls.permissions = []
      calls.creates = []
      calls.updates = []
      calls.deletes = []
    },
  }

  return transport
}
