/**
 * Session list + selection. Sessions live in OpenCode, not in Remote — this hook
 * only mirrors `GET /session` and folds the matching lifecycle events.
 *
 * All session state lives in one keyed store: entries written by a previous
 * transport (or after a disconnect) are simply ignored, which removes the need
 * to reset state from an effect.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Event, RemoteErrorInfo, Session, SessionStatus } from '../types/opencode'
import { limits } from '../config'
import { toRemoteError } from '../lib/errors'
import type { OpenCodeTransport } from '../lib/transport'

export interface UseSessionOptions {
  transport: OpenCodeTransport | null
  enabled: boolean
}

export interface UseSessionResult {
  sessions: Session[]
  loading: boolean
  error: RemoteErrorInfo | null
  selectedId: string | null
  selectedSession: Session | null
  statuses: Record<string, SessionStatus>
  selectSession: (id: string | null) => void
  createSession: (title?: string) => Promise<Session | null>
  deleteSession: (id: string) => Promise<boolean>
  renameSession: (id: string, title: string) => Promise<boolean>
  refreshSessions: () => Promise<void>
  refreshStatuses: () => Promise<void>
  statusFor: (id: string | null) => SessionStatus | null
  applyEvent: (event: Event) => void
  clearError: () => void
}

interface SessionStore {
  /** Transport this snapshot belongs to (null = empty). */
  transport: OpenCodeTransport | null
  sessions: Session[]
  statuses: Record<string, SessionStatus>
  selectedId: string | null
  loading: boolean
  error: RemoteErrorInfo | null
}

const EMPTY_STORE: SessionStore = {
  transport: null,
  sessions: [],
  statuses: {},
  selectedId: null,
  loading: false,
  error: null,
}

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => b.time.updated - a.time.updated)
}

/**
 * Insert or replace one session, newest first.
 *
 * Both paths that learn about a session — the `POST /session` response and the
 * `session.created` event — run for the same create, so the list has to be
 * de-duplicated by id or the sidebar briefly shows the session twice.
 */
function upsertSession(sessions: Session[], session: Session): Session[] {
  return sortSessions([session, ...sessions.filter((entry) => entry.id !== session.id)]).slice(
    0,
    limits.sessionListLimit,
  )
}

export function useSession({ transport, enabled }: UseSessionOptions): UseSessionResult {
  const [store, setStore] = useState<SessionStore>(EMPTY_STORE)

  const transportRef = useRef(transport)
  useEffect(() => {
    transportRef.current = transport
  }, [transport])

  const patch = useCallback((update: Partial<SessionStore>) => {
    setStore((previous) => ({
      ...previous,
      ...update,
      transport: transportRef.current,
    }))
  }, [])

  const refreshSessions = useCallback(async () => {
    const current = transportRef.current
    if (!current) return
    setStore((previous) => ({ ...previous, loading: true }))
    try {
      const list = await current.listSessions()
      setStore((previous) => ({
        ...previous,
        transport: current,
        sessions: sortSessions(list).slice(0, limits.sessionListLimit),
        loading: false,
        error: null,
      }))
    } catch (caught) {
      setStore((previous) => ({
        ...previous,
        transport: current,
        loading: false,
        error: toRemoteError(caught, { url: current.baseUrl }).toInfo(),
      }))
    }
  }, [])

  const refreshStatuses = useCallback(async () => {
    const current = transportRef.current
    if (!current) return
    try {
      const statuses = await current.sessionStatuses()
      setStore((previous) => ({ ...previous, transport: current, statuses }))
    } catch {
      /* status is best-effort: the event stream also reports it */
    }
  }, [])

  useEffect(() => {
    if (!transport || !enabled) return
    void refreshSessions()
    void refreshStatuses()
  }, [transport, enabled, refreshSessions, refreshStatuses])

  const active = store.transport === transport ? store : EMPTY_STORE
  const sessions = active.sessions

  /** Selection is derived: an explicit choice wins, otherwise the newest session. */
  const selectedId =
    store.selectedId && sessions.some((session) => session.id === store.selectedId)
      ? store.selectedId
      : (sessions[0]?.id ?? null)

  const selectSession = useCallback(
    (id: string | null) => {
      patch({ selectedId: id })
    },
    [patch],
  )

  const createSession = useCallback(
    async (title?: string) => {
      const current = transportRef.current
      if (!current) return null
      try {
        const session = await current.createSession(title ? { title } : undefined)
        setStore((previous) => ({
          ...previous,
          transport: current,
          sessions: upsertSession(previous.sessions, session),
          selectedId: session.id,
          error: null,
        }))
        return session
      } catch (caught) {
        patch({ error: toRemoteError(caught, { url: current.baseUrl }).toInfo() })
        return null
      }
    },
    [patch],
  )

  const deleteSession = useCallback(
    async (id: string) => {
      const current = transportRef.current
      if (!current) return false
      try {
        await current.deleteSession(id)
        setStore((previous) => {
          const statuses = { ...previous.statuses }
          delete statuses[id]
          return {
            ...previous,
            transport: current,
            sessions: previous.sessions.filter((session) => session.id !== id),
            statuses,
            selectedId: previous.selectedId === id ? null : previous.selectedId,
          }
        })
        return true
      } catch (caught) {
        patch({ error: toRemoteError(caught, { url: current.baseUrl, session: true }).toInfo() })
        return false
      }
    },
    [patch],
  )

  const renameSession = useCallback(
    async (id: string, title: string) => {
      const current = transportRef.current
      if (!current) return false
      try {
        const updated = await current.updateSession(id, { title })
        setStore((previous) => ({
          ...previous,
          transport: current,
          sessions: sortSessions(
            previous.sessions.map((session) => (session.id === id ? updated : session)),
          ),
        }))
        return true
      } catch (caught) {
        patch({ error: toRemoteError(caught, { url: current.baseUrl, session: true }).toInfo() })
        return false
      }
    },
    [patch],
  )

  const applyEvent = useCallback((event: Event) => {
    switch (event.type) {
      case 'session.created':
      case 'session.updated': {
        const info = event.properties.info
        setStore((previous) => ({
          ...previous,
          sessions: upsertSession(previous.sessions, info),
        }))
        break
      }
      case 'session.deleted': {
        const info = event.properties.info
        setStore((previous) => ({
          ...previous,
          sessions: previous.sessions.filter((session) => session.id !== info.id),
          selectedId: previous.selectedId === info.id ? null : previous.selectedId,
        }))
        break
      }
      case 'session.status': {
        const { sessionID, status } = event.properties
        setStore((previous) => ({
          ...previous,
          statuses: { ...previous.statuses, [sessionID]: status },
        }))
        break
      }
      case 'session.idle': {
        const { sessionID } = event.properties
        setStore((previous) => ({
          ...previous,
          statuses: { ...previous.statuses, [sessionID]: { type: 'idle' } },
        }))
        break
      }
      default:
        break
    }
  }, [])

  const statusFor = useCallback(
    (id: string | null): SessionStatus | null => {
      if (!id) return null
      return active.statuses[id] ?? null
    },
    [active.statuses],
  )

  const clearError = useCallback(() => patch({ error: null }), [patch])

  return {
    sessions,
    loading: active.loading,
    error: active.error,
    selectedId,
    selectedSession: sessions.find((session) => session.id === selectedId) ?? null,
    statuses: active.statuses,
    selectSession,
    createSession,
    deleteSession,
    renameSession,
    refreshSessions,
    refreshStatuses,
    statusFor,
    applyEvent,
    clearError,
  }
}
