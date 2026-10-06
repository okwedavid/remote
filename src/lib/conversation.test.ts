import { describe, expect, it } from 'vitest'
import type { Part, ToolPart } from '../types/opencode'
import {
  emptyConversation,
  isPartStreaming,
  isSessionStreaming,
  reconcileOptimistic,
  removeMessage,
  removePart,
  replaceConversation,
  toMessageList,
  upsertMessage,
  upsertPart,
} from './conversation'
import { makeAssistantMessage, makeTextPart, makeUserMessage } from '../test/fakeTransport'

function toolPart(overrides: Partial<ToolPart> = {}): ToolPart {
  return {
    id: 'prt_tool',
    sessionID: 'ses_1',
    messageID: 'msg_assistant',
    type: 'tool',
    callID: 'call_1',
    tool: 'bash',
    state: {
      status: 'running',
      input: { command: 'npm test' },
      time: { start: 1 },
    },
    ...overrides,
  } as ToolPart
}

describe('conversation folding', () => {
  it('orders messages by creation time, user before assistant', () => {
    let state = emptyConversation
    state = upsertMessage(state, makeAssistantMessage({ time: { created: 200 } }))
    state = upsertMessage(state, makeUserMessage({ time: { created: 100 } }))

    const list = toMessageList(state)
    expect(list.map((entry) => entry.info.role)).toEqual(['user', 'assistant'])
  })

  it('updates a message in place without duplicating it', () => {
    let state = upsertMessage(emptyConversation, makeAssistantMessage())
    state = upsertMessage(state, makeAssistantMessage({ finish: 'stop' }))
    expect(toMessageList(state)).toHaveLength(1)
    const info = toMessageList(state)[0]?.info
    expect(info?.role === 'assistant' && info.finish).toBe('stop')
  })

  it('keeps a part that arrives before its message', () => {
    const state = upsertPart(emptyConversation, makeTextPart('prt_1', 'hello'))
    expect(state.parts.msg_assistant).toHaveLength(1)

    const withMessage = upsertMessage(state, makeAssistantMessage())
    expect(toMessageList(withMessage)[0]?.parts).toHaveLength(1)
  })

  it('replaces a part snapshot in place (idempotent streaming)', () => {
    let state = upsertPart(emptyConversation, makeTextPart('prt_1', 'Hello'))
    state = upsertPart(state, makeTextPart('prt_1', 'Hello world'))
    state = upsertPart(state, makeTextPart('prt_1', 'Hello world'))
    const parts = state.parts.msg_assistant ?? []
    expect(parts).toHaveLength(1)
    expect(parts[0]?.type === 'text' && parts[0].text).toBe('Hello world')
  })

  it('never lets a shorter in-flight snapshot clobber streamed text', () => {
    let state = upsertPart(emptyConversation, makeTextPart('prt_1', 'Hello world'))
    // A replayed frame carrying less text while the part is still open.
    state = upsertPart(state, makeTextPart('prt_1', 'Hello'))
    const part = state.parts.msg_assistant?.[0]
    expect(part?.type === 'text' && part.text).toBe('Hello world')
  })

  it('accepts a shorter snapshot once the part is closed', () => {
    const closed: Part = { ...makeTextPart('prt_1', 'final'), time: { start: 1, end: 2 } }
    let state = upsertPart(emptyConversation, makeTextPart('prt_1', 'a much longer draft'))
    state = upsertPart(state, closed)
    const part = state.parts.msg_assistant?.[0]
    expect(part?.type === 'text' && part.text).toBe('final')
  })

  it('removes parts and messages', () => {
    let state = upsertMessage(emptyConversation, makeAssistantMessage())
    state = upsertPart(state, makeTextPart('prt_1', 'hi'))
    state = removePart(state, 'msg_assistant', 'prt_1')
    expect(state.parts.msg_assistant).toHaveLength(0)

    state = removeMessage(state, 'msg_assistant')
    expect(toMessageList(state)).toHaveLength(0)
    expect(state.parts.msg_assistant).toBeUndefined()
  })

  it('rebuilds the store from a fetched history', () => {
    const state = replaceConversation([
      { info: makeUserMessage(), parts: [makeTextPart('prt_u', 'hi', 'msg_user')] },
      { info: makeAssistantMessage(), parts: [makeTextPart('prt_a', 'hello')] },
    ])
    expect(toMessageList(state)).toHaveLength(2)
    expect(state.parts.msg_user).toHaveLength(1)
  })

  it('skips malformed entries from the server', () => {
    const state = replaceConversation([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      null as any,
      { info: makeUserMessage(), parts: [] },
    ])
    expect(toMessageList(state)).toHaveLength(1)
  })
})

describe('streaming detection', () => {
  it('treats an open text part as streaming', () => {
    expect(isPartStreaming(makeTextPart('prt_1', 'partial'))).toBe(true)
    expect(
      isPartStreaming({ ...makeTextPart('prt_1', 'done'), time: { start: 1, end: 2 } } as Part),
    ).toBe(false)
  })

  it('treats a running tool as streaming', () => {
    expect(isPartStreaming(toolPart())).toBe(true)
    expect(
      isPartStreaming(
        toolPart({
          state: {
            status: 'completed',
            input: {},
            output: 'ok',
            title: 'done',
            metadata: {},
            time: { start: 1, end: 2 },
          },
        }),
      ),
    ).toBe(false)
  })

  it('reports the session as streaming while the last assistant message is open', () => {
    let state = upsertMessage(emptyConversation, makeAssistantMessage())
    state = upsertPart(state, makeTextPart('prt_1', 'typing'))
    expect(isSessionStreaming(state)).toBe(true)

    state = upsertPart(state, {
      ...makeTextPart('prt_1', 'typed'),
      time: { start: 1, end: 2 },
    } as Part)
    expect(isSessionStreaming(state)).toBe(false)
  })

  it('does not treat a pending user message as a streaming turn', () => {
    // OpenCode does not always stamp `time.end` on the user's own message.
    const state = upsertMessage(emptyConversation, makeUserMessage())
    expect(isSessionStreaming(state)).toBe(false)

    const withPart = upsertPart(state, makeTextPart('prt_u', 'hello', 'msg_user'))
    expect(isSessionStreaming(withPart)).toBe(false)
  })
})

describe('optimistic reconciliation', () => {
  it('drops an echo once the server returns the same text', () => {
    const optimistic = [
      { id: 'local_1', sessionID: 'ses_1', text: 'hello there', createdAt: 1 },
      { id: 'local_2', sessionID: 'ses_1', text: 'not yet', createdAt: 2 },
    ]
    const remaining = reconcileOptimistic(optimistic, [
      {
        info: makeUserMessage(),
        parts: [makeTextPart('prt_u', 'hello there', 'msg_user')],
      },
    ])
    expect(remaining.map((entry) => entry.id)).toEqual(['local_2'])
  })

  it('keeps everything while the server has nothing to match', () => {
    const optimistic = [{ id: 'local_1', sessionID: 'ses_1', text: 'hello', createdAt: 1 }]
    expect(reconcileOptimistic(optimistic, [])).toHaveLength(1)
  })
})
