import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useMessages } from './useMessages'
import {
  createFakeTransport,
  makeAssistantMessage,
  makeSession,
  makeTextPart,
  makeUserMessage,
  type FakeTransport,
} from '../test/fakeTransport'
import type { Event } from '../types/opencode'

const SESSION = 'ses_1'

function setup(transport: FakeTransport, sessionId: string | null = SESSION, onIdle = vi.fn()) {
  const view = renderHook(
    ({ id }: { id: string | null }) =>
      useMessages({ transport, sessionId: id, enabled: true, onIdle }),
    { initialProps: { id: sessionId } },
  )

  // In the app the event stream is subscribed by `useEvents` and dispatched to
  // `applyEvent`; here we wire the fake stream straight into the hook.
  transport.subscribeEvents({
    onEvent: (event) => view.result.current.applyEvent(event),
    onStatus: () => {},
  })

  return { ...view, onIdle }
}

function event(partial: Event): Event {
  return partial
}

describe('useMessages', () => {
  it('loads the history for the selected session', async () => {
    const transport = createFakeTransport({
      messages: [
        { info: makeUserMessage(), parts: [makeTextPart('prt_u', 'hello', 'msg_user')] },
        { info: makeAssistantMessage(), parts: [makeTextPart('prt_a', 'hi there')] },
      ],
    })

    const { result } = setup(transport)

    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.messages[0]?.info.role).toBe('user')
    expect(result.current.messages[1]?.parts[0]).toMatchObject({ type: 'text', text: 'hi there' })
  })

  it('shows a local echo of the prompt and clears it once the server accepts it', async () => {
    const transport = createFakeTransport()
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      const outcome = await result.current.send({
        text: 'run the tests',
        mode: 'prompt',
        agent: '',
        model: null,
      })
      expect(outcome.ok).toBe(true)
    })

    expect(transport.calls.prompts).toEqual([
      { sessionID: SESSION, input: { text: 'run the tests' } },
    ])
    expect(result.current.optimistic).toHaveLength(1)
    expect(result.current.busy).toBe(true)

    const created = Date.now() + 10
    act(() => {
      transport.emit(
        event({
          type: 'message.updated',
          properties: { info: makeUserMessage({ time: { created } }) },
        }),
      )
    })

    expect(result.current.optimistic).toHaveLength(0)
    expect(result.current.messages).toHaveLength(1)
  })

  it('streams assistant parts and finishes on session.idle', async () => {
    const transport = createFakeTransport()
    const onIdle = vi.fn()
    const { result } = setup(transport, SESSION, onIdle)
    await waitFor(() => expect(result.current.loading).toBe(false))

    const assistant = makeAssistantMessage()
    act(() => {
      transport.emit(event({ type: 'message.updated', properties: { info: assistant } }))
      transport.emit(
        event({
          type: 'message.part.updated',
          properties: { part: makeTextPart('prt_1', 'Hel') },
        }),
      )
    })

    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    expect(result.current.streaming).toBe(true)
    expect(result.current.busy).toBe(true)

    act(() => {
      transport.emit(
        event({
          type: 'message.part.updated',
          properties: { part: makeTextPart('prt_1', 'Hello world') },
        }),
      )
    })

    await waitFor(() => {
      const part = result.current.messages[0]?.parts[0]
      expect(part?.type === 'text' && part.text).toBe('Hello world')
    })

    act(() => {
      transport.emit(
        event({
          type: 'message.part.updated',
          properties: {
            part: { ...makeTextPart('prt_1', 'Hello world'), time: { start: 1, end: 2 } } as never,
          },
        }),
      )
      transport.emit(event({ type: 'session.idle', properties: { sessionID: SESSION } }))
    })

    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(result.current.streaming).toBe(false)
    expect(onIdle).toHaveBeenCalled()
  })

  it('ignores events that belong to another session', async () => {
    const transport = createFakeTransport()
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      transport.emit(
        event({
          type: 'message.updated',
          properties: { info: makeUserMessage({ id: 'msg_other', sessionID: 'ses_other' }) },
        }),
      )
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('restores the composer text by reporting the failure', async () => {
    const transport = createFakeTransport({ promptError: new Error('boom') })
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.loading).toBe(false))

    let outcome: { ok: boolean } = { ok: true }
    await act(async () => {
      outcome = await result.current.send({
        text: 'will fail',
        mode: 'prompt',
        agent: '',
        model: null,
      })
    })

    expect(outcome.ok).toBe(false)
    expect(result.current.optimistic).toHaveLength(0)
    expect(result.current.error?.title).toBeTruthy()
    expect(result.current.busy).toBe(false)
  })

  it('aborts through the transport and clears the busy state', async () => {
    const transport = createFakeTransport()
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.send({ text: 'long job', mode: 'prompt', agent: '', model: null })
    })
    expect(result.current.busy).toBe(true)

    await act(async () => {
      await result.current.abort()
    })

    expect(transport.calls.aborts).toEqual([SESSION])
    expect(result.current.busy).toBe(false)
  })

  it('runs shell commands through the session shell endpoint', async () => {
    const transport = createFakeTransport()
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.send({ text: 'git status', mode: 'shell', agent: 'build', model: null })
    })

    expect(transport.calls.shells).toEqual([
      { sessionID: SESSION, input: { command: 'git status', agent: 'build', model: null } },
    ])
    expect(transport.calls.prompts).toHaveLength(0)
  })

  it('surfaces permission requests and answers them', async () => {
    const transport = createFakeTransport()
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      transport.emit(
        event({
          type: 'permission.updated',
          properties: {
            id: 'per_1',
            type: 'bash',
            sessionID: SESSION,
            messageID: 'msg_1',
            title: 'Run npm test',
            metadata: {},
            time: { created: 1 },
          },
        }),
      )
    })

    await waitFor(() => expect(result.current.permissions).toHaveLength(1))

    await act(async () => {
      await result.current.replyPermission('per_1', 'once')
    })

    expect(transport.calls.permissions).toEqual([
      { sessionID: SESSION, permissionID: 'per_1', response: 'once' },
    ])
    expect(result.current.permissions).toHaveLength(0)
  })

  it('reports session errors in a friendly way', async () => {
    const transport = createFakeTransport()
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      transport.emit(
        event({
          type: 'session.error',
          properties: {
            sessionID: SESSION,
            error: {
              name: 'ProviderAuthError',
              data: { providerID: 'anthropic', message: 'invalid key' },
            },
          },
        }),
      )
    })

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error?.code).toBe('unauthorized')
    expect(result.current.busy).toBe(false)
  })

  it('drops state that belongs to the previous session', async () => {
    const transport = createFakeTransport({
      messages: [{ info: makeUserMessage(), parts: [makeTextPart('prt_u', 'first', 'msg_user')] }],
    })
    const { result, rerender } = setup(transport)
    await waitFor(() => expect(result.current.messages).toHaveLength(1))

    act(() => {
      transport.emit(event({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'busy' } } }))
    })
    expect(result.current.busy).toBe(true)

    rerender({ id: null })
    expect(result.current.messages).toHaveLength(0)
    expect(result.current.busy).toBe(false)
  })

  it('reports a missing session as such', async () => {
    const transport = createFakeTransport({ sessions: [] })
    transport.messages = async () => {
      const error = Object.assign(new Error('gone'), { status: 404 })
      throw error
    }
    const { result } = setup(transport, 'ses_missing')

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error?.title).toBe('Session no longer exists.')
  })

  it('refuses to send without a session', async () => {
    const transport = createFakeTransport({ sessions: [makeSession()] })
    const { result } = setup(transport, null)

    await act(async () => {
      const outcome = await result.current.send({ text: 'hi', mode: 'prompt', agent: '', model: null })
      expect(outcome.ok).toBe(false)
      expect(outcome.error?.title).toBe('No session selected.')
    })
    expect(transport.calls.prompts).toHaveLength(0)
  })
})
