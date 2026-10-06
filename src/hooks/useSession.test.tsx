import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSession } from './useSession'
import { createFakeTransport, makeSession, type FakeTransport } from '../test/fakeTransport'
import type { Event, Session } from '../types/opencode'

function setup(transport: FakeTransport | null) {
  const view = renderHook(({ t }: { t: FakeTransport | null }) => useSession({ transport: t, enabled: true }), {
    initialProps: { t: transport },
  })
  transport?.subscribeEvents({ onEvent: (event) => view.result.current.applyEvent(event), onStatus: () => {} })
  return view
}

function session(id: string, updated: number) {
  return makeSession({ id, title: id, time: { created: updated, updated } })
}

describe('useSession', () => {
  it('lists sessions newest first and selects the newest one', async () => {
    const transport = createFakeTransport({
      sessions: [session('ses_old', 1_000), session('ses_new', 5_000)],
    })
    const { result } = setup(transport)

    await waitFor(() => expect(result.current.sessions).toHaveLength(2))
    expect(result.current.sessions.map((s) => s.id)).toEqual(['ses_new', 'ses_old'])
    expect(result.current.selectedId).toBe('ses_new')
    expect(result.current.loading).toBe(false)
  })

  it('keeps the explicit selection and falls back when it disappears', async () => {
    const transport = createFakeTransport({
      sessions: [session('ses_a', 1_000), session('ses_b', 2_000)],
    })
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.sessions).toHaveLength(2))

    act(() => result.current.selectSession('ses_a'))
    expect(result.current.selectedId).toBe('ses_a')
    expect(result.current.selectedSession?.id).toBe('ses_a')

    act(() => {
      transport.emit({ type: 'session.deleted', properties: { info: { id: 'ses_a' } } } as Event)
    })

    await waitFor(() => expect(result.current.selectedId).toBe('ses_b'))
  })

  it('reflects created, renamed and deleted sessions from the stream', async () => {
    const transport = createFakeTransport({ sessions: [session('ses_a', 1_000)] })
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))

    act(() => {
      transport.emit({ type: 'session.created', properties: { info: session('ses_b', 3_000) } } as Event)
    })
    await waitFor(() => expect(result.current.sessions.map((s) => s.id)).toEqual(['ses_b', 'ses_a']))

    act(() => {
      transport.emit({
        type: 'session.updated',
        properties: { info: { ...session('ses_b', 4_000), title: 'Renamed' } },
      } as Event)
    })
    await waitFor(() =>
      expect(result.current.sessions.find((s) => s.id === 'ses_b')?.title).toBe('Renamed'),
    )

    act(() => {
      transport.emit({ type: 'session.deleted', properties: { info: { id: 'ses_b' } } } as Event)
    })
    await waitFor(() => expect(result.current.sessions.map((s) => s.id)).toEqual(['ses_a']))
  })

  it('folds session status into statusFor()', async () => {
    const transport = createFakeTransport({ sessions: [session('ses_a', 1_000)] })
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.selectedId).toBe('ses_a'))

    act(() => {
      transport.emit({
        type: 'session.status',
        properties: { sessionID: 'ses_a', status: { type: 'busy' } },
      } as Event)
    })
    await waitFor(() => expect(result.current.statusFor('ses_a')).toEqual({ type: 'busy' }))

    act(() => {
      transport.emit({ type: 'session.idle', properties: { sessionID: 'ses_a' } } as Event)
    })
    await waitFor(() => expect(result.current.statusFor('ses_a')).toEqual({ type: 'idle' }))
  })

  it('creates, renames and deletes through the transport', async () => {
    const transport = createFakeTransport({ sessions: [session('ses_a', 1_000)] })
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))

    const created: Session | null = await act(async () =>
      result.current.createSession('Fresh work'),
    )
    expect(created?.title).toBe('Fresh work')
    expect(transport.calls.creates).toEqual(['Fresh work'])
    await waitFor(() => expect(result.current.selectedId).toBe(created?.id))

    await act(async () => {
      await result.current.renameSession('ses_a', 'Better name')
    })
    expect(transport.calls.updates).toEqual([
      { sessionID: 'ses_a', patch: { title: 'Better name' } },
    ])
    await waitFor(() =>
      expect(result.current.sessions.find((s) => s.id === 'ses_a')?.title).toBe('Better name'),
    )

    await act(async () => {
      await result.current.deleteSession('ses_a')
    })
    expect(transport.calls.deletes).toEqual(['ses_a'])
    await waitFor(() => expect(result.current.sessions.map((s) => s.id)).not.toContain('ses_a'))
  })

  it('reports a failed refresh without dropping the list', async () => {
    const transport = createFakeTransport({ sessions: [session('ses_a', 1_000)] })
    const { result } = setup(transport)
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))

    transport.listSessions = async () => {
      throw new Error('offline')
    }
    await act(async () => {
      await result.current.refreshSessions()
    })

    expect(result.current.error?.title).toBeTruthy()
    expect(result.current.sessions).toHaveLength(1)

    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })

  it('drops everything when the transport goes away', async () => {
    const transport = createFakeTransport({ sessions: [session('ses_a', 1_000)] })
    const { result, rerender } = setup(transport)
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))

    rerender({ t: null })
    expect(result.current.sessions).toHaveLength(0)
    expect(result.current.selectedId).toBeNull()
  })
})
