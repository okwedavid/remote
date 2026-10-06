/**
 * Development-only simulated OpenCode server.
 *
 * Enabled with `VITE_MOCK_MODE=true` (see .env.example). It exists so the UI can
 * be exercised without an agent running, and is always labelled "MOCK" in the
 * interface. It is never the default, and production builds never load it
 * unless the operator explicitly turns it on.
 *
 * The simulation emits the same events as a real server (`message.updated`,
 * `message.part.updated`, `session.status`, `session.idle`, `file.edited`,
 * `permission.updated`) so the streaming code path is identical.
 */
import type {
  Agent,
  AssistantMessage,
  Event,
  FileContent,
  FileDiff,
  Part,
  ReasoningPart,
  Session,
  SessionStatus,
  TextPart,
  Todo,
  ToolPart,
  UserMessage,
} from '@opencode-ai/sdk/client'
import type { HealthResponse, MessageWithParts, ProvidersResponse } from '../types/opencode'
import type {
  EventStreamHandlers,
  OpenCodeTransport,
  PermissionResponse,
  PromptInput,
  ShellInput,
} from './transport'

const PROJECT_ID = 'mock-project'
const DIRECTORY = '/home/dev/project'
const CWD = DIRECTORY
const PROVIDER = 'anthropic'
const MODEL = 'claude-sonnet-4-5'

let counter = 0
function id(prefix: string): string {
  counter += 1
  return `${prefix}_mock${counter.toString().padStart(4, '0')}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface Run {
  cancelled: boolean
  timers: Set<ReturnType<typeof setTimeout>>
}

export function createMockTransport(options: { baseUrl: string }): OpenCodeTransport {
  const sessions = new Map<string, Session>()
  const messages = new Map<string, MessageWithParts[]>()
  const diffs = new Map<string, FileDiff[]>()
  const statuses = new Map<string, SessionStatus>()
  const pendingPermissions = new Map<string, Event>()
  const listeners = new Set<EventStreamHandlers>()
  const runs = new Map<string, Run>()

  const emit = (payload: Event): void => {
    for (const listener of listeners) listener.onEvent(payload)
  }

  const touch = (session: Session): void => {
    session.time = { ...session.time, updated: Date.now() }
    sessions.set(session.id, session)
    emit({ type: 'session.updated', properties: { info: session } })
  }

  function seedSession(title: string, createdOffset: number): Session {
    const created = Date.now() - createdOffset
    const session: Session = {
      id: id('ses'),
      projectID: PROJECT_ID,
      directory: DIRECTORY,
      title,
      version: '0.0.0-mock',
      time: { created, updated: created },
    }
    sessions.set(session.id, session)
    messages.set(session.id, [])
    return session
  }

  function userMessage(sessionID: string, text: string): UserMessage {
    return {
      id: id('msg'),
      sessionID,
      role: 'user',
      time: { created: Date.now() },
      agent: 'build',
      model: { providerID: PROVIDER, modelID: MODEL },
      ...(text.length < 60 ? { summary: { title: text, body: text, diffs: [] } } : {}),
    }
  }

  function assistantMessage(sessionID: string, parentID: string): AssistantMessage {
    return {
      id: id('msg'),
      sessionID,
      role: 'assistant',
      parentID,
      modelID: MODEL,
      providerID: PROVIDER,
      mode: 'build',
      path: { cwd: CWD, root: DIRECTORY },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: Date.now() },
    }
  }

  function textPart(sessionID: string, messageID: string, text: string): Part {
    return { id: id('prt'), sessionID, messageID, type: 'text', text }
  }

  // --- seed data -----------------------------------------------------------

  const welcome = seedSession('Welcome to Remote', 1000 * 60 * 42)
  const bugfix = seedSession('Fix flaky session list', 1000 * 60 * 60 * 5)

  {
    const question = userMessage(welcome.id, 'What can Remote do?')
    const parts: Part[] = [
      textPart(welcome.id, question.id, 'What can Remote do?'),
    ]
    const answer = assistantMessage(welcome.id, question.id)
    answer.time.completed = Date.now() - 1000 * 60 * 41
    answer.tokens = { input: 1840, output: 612, reasoning: 220, cache: { read: 0, write: 140 } }
    answer.cost = 0.0123
    answer.finish = 'stop'
    const reasoning: Part = {
      id: id('prt'),
      sessionID: welcome.id,
      messageID: answer.id,
      type: 'reasoning',
      text: 'The user wants a summary of the Remote control panel. Keep it short and concrete.',
      time: { start: Date.now() - 1000 * 60 * 42, end: Date.now() - 1000 * 60 * 42 },
    }
    const body: Part = {
      id: id('prt'),
      sessionID: welcome.id,
      messageID: answer.id,
      type: 'text',
      text: [
        'Remote is a thin control panel for **your own** OpenCode server.',
        '',
        '- Live streaming of agent output over SSE',
        '- Session management backed by OpenCode itself',
        '- Tool activity rendered as compact, collapsible rows',
        '',
        '```ts',
        "const sessions = await client.session.list()",
        "await client.session.promptAsync({ path: { id: session.id }, body: { parts: [{ type: 'text', text }] } })",
        '```',
        '',
        '| Endpoint | Purpose |',
        '| --- | --- |',
        '| `/session` | list + create sessions |',
        '| `/session/:id/message` | message history |',
        '| `/global/event` | live event stream |',
      ].join('\n'),
    }
    parts.push(reasoning, body)
    messages.set(welcome.id, [{ info: question, parts }, { info: answer, parts: [reasoning, body] }])
  }

  {
    const question = userMessage(bugfix.id, 'Fix the flaky session list test')
    const answer = assistantMessage(bugfix.id, question.id)
    answer.time.completed = Date.now() - 1000 * 60 * 60 * 4
    answer.tokens = { input: 9200, output: 1450, reasoning: 640, cache: { read: 2100, write: 300 } }
    answer.cost = 0.0421
    answer.finish = 'stop'
    const tool: Part = {
      id: id('prt'),
      sessionID: bugfix.id,
      messageID: answer.id,
      type: 'tool',
      callID: id('call'),
      tool: 'bash',
      state: {
        status: 'completed',
        input: { command: 'npm test -- session-list' },
        output: 'PASS src/session-list.test.ts\n  ✓ lists sessions (14 ms)\n\nTests: 1 passed',
        title: 'npm test -- session-list',
        metadata: {},
        time: { start: Date.now() - 1000 * 60 * 60 * 4 - 4000, end: Date.now() - 1000 * 60 * 60 * 4 - 1200 },
      },
    }
    const summary: Part = {
      id: id('prt'),
      sessionID: bugfix.id,
      messageID: answer.id,
      type: 'text',
      text: 'The test was racing the session cache. It now awaits the list before asserting.',
    }
    const questionParts = [textPart(bugfix.id, question.id, 'Fix the flaky session list test')]
    messages.set(bugfix.id, [
      { info: question, parts: questionParts },
      { info: answer, parts: [tool, summary] },
    ])
    diffs.set(bugfix.id, [
      {
        file: 'src/session-list.test.ts',
        before: 'const sessions = client.session.list()\nexpect(sessions).toHaveLength(2)',
        after:
          'const sessions = await client.session.list()\nexpect(sessions).toHaveLength(2)\n// wait for the cache to settle',
        additions: 2,
        deletions: 1,
      },
      {
        file: 'src/lib/cache.ts',
        before: '',
        after: 'export const cache = new Map<string, unknown>()\n',
        additions: 2,
        deletions: 0,
      },
    ])
  }

  const agents: Agent[] = [
    {
      name: 'build',
      description: 'Default agent with full write access',
      mode: 'primary',
      builtIn: true,
      permission: { edit: 'allow', bash: { '*': 'allow' } },
      tools: {},
      options: {},
    },
    {
      name: 'plan',
      description: 'Read-only planning agent',
      mode: 'primary',
      builtIn: true,
      permission: { edit: 'deny', bash: { '*': 'ask' } },
      tools: {},
      options: {},
    },
    {
      name: 'general',
      description: 'Subagent used by tasks',
      mode: 'subagent',
      builtIn: true,
      permission: { edit: 'ask', bash: { '*': 'ask' } },
      tools: {},
      options: {},
    },
  ]

  const providers: ProvidersResponse = {
    providers: [
      {
        id: PROVIDER,
        name: 'Anthropic',
        models: [
          { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
          { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
        ],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        models: [{ id: 'gpt-5-codex', name: 'GPT-5 Codex' }],
      },
    ],
    default: { [PROVIDER]: 'claude-sonnet-4-5' },
  }

  function reply(prompt: string): string {
    const trimmed = prompt.trim()
    if (/bash|test|command|shell/i.test(trimmed)) {
      return [
        'Ran the test suite for the touched package.',
        '',
        '```bash',
        '$ npm test',
        'PASS src/lib/errors.test.ts',
        'PASS src/components/Composer.test.tsx',
        '',
        'Tests: 12 passed, 12 total',
        '```',
        '',
        'Everything is green — no regressions from the change.',
      ].join('\n')
    }
    if (/diff|change|file|edit/i.test(trimmed)) {
      return [
        'Updated two files:',
        '',
        '1. `src/lib/opencode.ts` — normalised the SSE frames',
        '2. `src/hooks/useMessages.ts` — folded streaming parts by id',
        '',
        '> The reducer keeps the server snapshot authoritative, so a dropped frame can never duplicate text.',
      ].join('\n')
    }
    if (trimmed === '') {
      return 'Send a prompt to your local OpenCode agent.'
    }
    return [
      `Working on it. **Mock mode** reply for: “${trimmed.slice(0, 120)}”`,
      '',
      '- Parsed the request',
      '- Checked the workspace state',
      '- Prepared the next step',
      '',
      '```ts',
      'export function nextStep(input: string): string {',
      '  return input.trim().length > 0 ? "continue" : "ask"',
      '}',
      '```',
      '',
      'Switch `VITE_MOCK_MODE` off and point Remote at your server for the real agent.',
    ].join('\n')
  }

  function runSimulation(sessionID: string, prompt: string): void {
    const run: Run = { cancelled: false, timers: new Set() }
    runs.set(sessionID, run)

    const schedule = (fn: () => void, ms: number): void => {
      const timer = setTimeout(() => {
        run.timers.delete(timer)
        if (!run.cancelled) fn()
      }, ms)
      run.timers.add(timer)
    }

    const session = sessions.get(sessionID)
    if (!session) return

    const history = messages.get(sessionID) ?? []
    const user = userMessage(sessionID, prompt)
    const userParts = [textPart(sessionID, user.id, prompt)]
    history.push({ info: user, parts: userParts })
    messages.set(sessionID, history)

    statuses.set(sessionID, { type: 'busy' })
    emit({ type: 'message.updated', properties: { info: user } })
    userParts.forEach((part) => emit({ type: 'message.part.updated', properties: { part } }))
    emit({ type: 'session.status', properties: { sessionID, status: { type: 'busy' } } })

    const answer = assistantMessage(sessionID, user.id)
    const answerParts: Part[] = []
    history.push({ info: answer, parts: answerParts })

    const wantsPermission = /permission|deploy|delete/i.test(prompt)
    const toolPart: ToolPart = {
      id: id('prt'),
      sessionID,
      messageID: answer.id,
      type: 'tool',
      callID: id('call'),
      tool: 'bash',
      state: {
        status: 'running',
        input: { command: 'npm test' },
        title: 'npm test',
        metadata: {},
        time: { start: Date.now() },
      },
    }

    // Thinking
    const reasoningPart: ReasoningPart = {
      id: id('prt'),
      sessionID,
      messageID: answer.id,
      type: 'reasoning',
      text: '',
      time: { start: Date.now() },
    }
    answerParts.push(reasoningPart)
    emit({ type: 'message.updated', properties: { info: answer } })
    emit({ type: 'message.part.updated', properties: { part: reasoningPart } })

    const thinking = 'Inspecting the request, then checking the workspace for related files.'
    thinking.split(' ').forEach((word, index) => {
      schedule(() => {
        reasoningPart.text = `${reasoningPart.text}${index === 0 ? '' : ' '}${word}`
        reasoningPart.time = { start: reasoningPart.time.start, end: Date.now() }
        emit({ type: 'message.part.updated', properties: { part: { ...reasoningPart } } })
      }, 60 * (index + 1))
    })

    const answerText = reply(prompt)
    const bodyPart: TextPart = { id: id('prt'), sessionID, messageID: answer.id, type: 'text', text: '' }
    answerParts.push(bodyPart)

    const startAt = 60 * Math.max(4, thinking.split(' ').length) + 150

    schedule(() => {
      answerParts.push(toolPart)
      emit({ type: 'message.part.updated', properties: { part: toolPart } })
    }, startAt)

    const words = answerText.split(' ')
    let accumulated = ''
    words.forEach((word, index) => {
      schedule(
        () => {
          accumulated = accumulated === '' ? word : `${accumulated} ${word}`
          bodyPart.text = accumulated
          emit({
            type: 'message.part.updated',
            properties: { part: { ...bodyPart }, delta: ` ${word}` },
          })
        },
        startAt + 250 + index * 45,
      )
    })

    const streamEnd = startAt + 250 + words.length * 45

    schedule(() => {
      toolPart.state = {
        status: 'completed',
        input: { command: 'npm test' },
        output: 'Tests: 12 passed, 12 total',
        title: 'npm test',
        metadata: {},
        time: { start: Date.now() - 1200, end: Date.now() },
      }
      emit({ type: 'message.part.updated', properties: { part: { ...toolPart } } })
    }, streamEnd + 200)

    schedule(() => {
      const diff: FileDiff = {
        file: 'src/hooks/useMessages.ts',
        before: 'const parts = message.parts',
        after: 'const parts = upsert(message.parts, incoming)',
        additions: 1,
        deletions: 1,
      }
      const previous = diffs.get(sessionID) ?? []
      diffs.set(sessionID, [...previous.filter((entry) => entry.file !== diff.file), diff])
      emit({ type: 'file.edited', properties: { file: diff.file } })
      emit({ type: 'session.diff', properties: { sessionID, diff: diffs.get(sessionID) ?? [] } })
    }, streamEnd + 320)

    const finish = () => {
      answer.time = { ...answer.time, completed: Date.now() }
      answer.tokens = {
        input: 1200 + prompt.length,
        output: accumulated.split(' ').length * 4,
        reasoning: thinking.length,
        cache: { read: 0, write: 80 },
      }
      answer.cost = 0.0031
      answer.finish = 'stop'
      const stored = messages.get(sessionID)?.find((entry) => entry.info.id === answer.id)
      if (stored) stored.parts = answerParts
      emit({ type: 'message.updated', properties: { info: answer } })
      statuses.set(sessionID, { type: 'idle' })
      emit({ type: 'session.status', properties: { sessionID, status: { type: 'idle' } } })
      emit({ type: 'session.idle', properties: { sessionID } })
      runs.delete(sessionID)
    }

    if (wantsPermission) {
      schedule(() => {
        const session2 = sessions.get(sessionID)
        if (session2) touch(session2)
        const event: Event = {
          type: 'permission.updated',
          properties: {
            id: id('per'),
            type: 'bash',
            pattern: 'npm test',
            sessionID,
            messageID: answer.id,
            callID: toolPart.callID,
            title: 'Run `npm test`',
            metadata: {},
            time: { created: Date.now() },
          },
        }
        pendingPermissions.set(sessionID, event)
        emit(event)
      }, streamEnd + 500)
    }

    schedule(
      () => {
        const session2 = sessions.get(sessionID)
        if (session2) touch(session2)
        finish()
      },
      wantsPermission ? streamEnd + 4000 : streamEnd + 700,
    )
  }

  return {
    baseUrl: options.baseUrl,
    mock: true,

    async health(): Promise<HealthResponse> {
      await delay(220)
      return { healthy: true, version: '0.0.0-mock' }
    },

    async listSessions() {
      await delay(120)
      return [...sessions.values()].sort((a, b) => b.time.updated - a.time.updated)
    },

    async createSession(input) {
      await delay(90)
      const session = seedSession(input?.title ?? 'New session', 0)
      emit({ type: 'session.created', properties: { info: session } })
      return session
    },

    async updateSession(sessionID, input) {
      await delay(80)
      const session = sessions.get(sessionID)
      if (!session) throw new Error('Session not found')
      session.title = input.title ?? session.title
      touch(session)
      return session
    },

    async deleteSession(sessionID) {
      await delay(80)
      const session = sessions.get(sessionID)
      sessions.delete(sessionID)
      messages.delete(sessionID)
      diffs.delete(sessionID)
      statuses.delete(sessionID)
      if (session) emit({ type: 'session.deleted', properties: { info: session } })
      return true
    },

    async sessionStatuses() {
      return Object.fromEntries(statuses.entries())
    },

    async sessionDiff(sessionID) {
      await delay(60)
      return diffs.get(sessionID) ?? []
    },

    async sessionTodos(sessionID): Promise<Todo[]> {
      await delay(40)
      if (!sessions.has(sessionID)) return []
      return [
        { id: '1', content: 'Wire the event stream', status: 'completed', priority: 'high' },
        { id: '2', content: 'Render tool activity', status: 'in_progress', priority: 'medium' },
        { id: '3', content: 'Write the README', status: 'pending', priority: 'low' },
      ]
    },

    async messages(sessionID) {
      await delay(90)
      return [...(messages.get(sessionID) ?? [])]
    },

    async promptAsync(sessionID, input: PromptInput) {
      await delay(60)
      runSimulation(sessionID, input.text)
    },

    async shell(sessionID, input: ShellInput) {
      await delay(120)
      const history = messages.get(sessionID) ?? []
      const user = userMessage(sessionID, `$ ${input.command}`)
      const answer = assistantMessage(sessionID, user.id)
      answer.time.completed = Date.now()
      answer.finish = 'stop'
      const output: Part = {
        id: id('prt'),
        sessionID,
        messageID: answer.id,
        type: 'text',
        text: ['```bash', `$ ${input.command}`, `remote@mock:~$ ok`, '```'].join('\n'),
      }
      answer.tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
      history.push({ info: user, parts: [textPart(sessionID, user.id, `$ ${input.command}`)] })
      history.push({ info: answer, parts: [output] })
      messages.set(sessionID, history)
      emit({ type: 'message.updated', properties: { info: user } })
      emit({ type: 'message.updated', properties: { info: answer } })
      emit({ type: 'message.part.updated', properties: { part: output } })
    },

    async abort(sessionID) {
      const run = runs.get(sessionID)
      if (run) {
        run.cancelled = true
        for (const timer of run.timers) clearTimeout(timer)
        run.timers.clear()
        runs.delete(sessionID)
      }
      const history = messages.get(sessionID) ?? []
      const last = history[history.length - 1]
      if (last && last.info.role === 'assistant' && !last.info.time.completed) {
        const info: AssistantMessage = {
          ...last.info,
          time: { ...last.info.time, completed: Date.now() },
          error: { name: 'MessageAbortedError', data: { message: 'The user aborted the request.' } },
        }
        last.info = info
        emit({ type: 'message.updated', properties: { info } })
      }
      statuses.set(sessionID, { type: 'idle' })
      emit({ type: 'session.status', properties: { sessionID, status: { type: 'idle' } } })
      emit({ type: 'session.idle', properties: { sessionID } })
      return true
    },

    async replyPermission(sessionID, permissionID, response: PermissionResponse) {
      const event = pendingPermissions.get(sessionID)
      if (event) {
        pendingPermissions.delete(sessionID)
        emit({
          type: 'permission.replied',
          properties: { sessionID, permissionID, response },
        })
      }
      await delay(30)
    },

    async agents(): Promise<Agent[]> {
      await delay(60)
      return agents
    },

    async providers() {
      await delay(60)
      return providers
    },

    async readFile(path): Promise<FileContent | undefined> {
      await delay(80)
      if (path.endsWith('.gitignore')) return undefined
      return {
        type: 'text',
        content: `// ${path}\n// Mock file contents — Remote is running with VITE_MOCK_MODE=true.\n`,
      }
    },

    subscribeEvents(handlers: EventStreamHandlers) {
      listeners.add(handlers)
      const timer = setTimeout(() => {
        handlers.onStatus('open')
        handlers.onEvent({ type: 'server.connected', properties: {} } as Event)
      }, 60)
      return () => {
        clearTimeout(timer)
        listeners.delete(handlers)
      }
    },
  }
}
