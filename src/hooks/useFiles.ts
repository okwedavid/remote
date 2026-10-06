/**
 * File activity for the selected session.
 *
 * Sources, in order of authority:
 *   1. `GET /session/:id/diff` — what OpenCode actually changed (with before/after)
 *   2. `session.diff` events — pushed while the agent works
 *   3. `file.edited` events — a file was touched; the diff is re-read shortly after
 *
 * Like the conversation store, everything is keyed by the session it belongs to,
 * so a stale response can never leak into another session's view.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Event, FileChange, FileContent, RemoteErrorInfo } from '../types/opencode'
import { fileChangeFromDiff } from '../lib/format'
import { toRemoteError } from '../lib/errors'
import type { OpenCodeTransport } from '../lib/transport'

export interface UseFilesOptions {
  transport: OpenCodeTransport | null
  sessionId: string | null
  enabled: boolean
}

export interface UseFilesResult {
  changes: FileChange[]
  loading: boolean
  error: RemoteErrorInfo | null
  refresh: () => Promise<void>
  openFile: (path: string) => Promise<FileContent | undefined>
  applyEvent: (event: Event) => void
}

interface FilesStore {
  sessionId: string | null
  transport: OpenCodeTransport | null
  changes: FileChange[]
  touched: string[]
  loading: boolean
  error: RemoteErrorInfo | null
}

const EMPTY_STORE: FilesStore = {
  sessionId: null,
  transport: null,
  changes: [],
  touched: [],
  loading: false,
  error: null,
}

const REFRESH_DEBOUNCE = 1200

export function useFiles({ transport, sessionId, enabled }: UseFilesOptions): UseFilesResult {
  const [store, setStore] = useState<FilesStore>(EMPTY_STORE)

  const transportRef = useRef(transport)
  const sessionRef = useRef(sessionId)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    transportRef.current = transport
  }, [transport])
  useEffect(() => {
    sessionRef.current = sessionId
  }, [sessionId])

  const isCurrent = useCallback((id: string | null, current: OpenCodeTransport | null) => {
    return id !== null && sessionRef.current === id && transportRef.current === current
  }, [])

  const refresh = useCallback(async () => {
    const current = transportRef.current
    const id = sessionRef.current
    if (!current || !id) return
    setStore((previous) => ({ ...previous, loading: true }))
    try {
      const diffs = await current.sessionDiff(id)
      setStore((previous) =>
        isCurrent(id, current)
          ? {
              ...previous,
              sessionId: id,
              transport: current,
              changes: diffs.map(fileChangeFromDiff),
              loading: false,
              error: null,
            }
          : previous,
      )
    } catch (caught) {
      setStore((previous) =>
        isCurrent(id, current)
          ? {
              ...previous,
              sessionId: id,
              transport: current,
              loading: false,
              error: toRemoteError(caught, { url: current.baseUrl, session: true }).toInfo(),
            }
          : previous,
      )
    }
  }, [isCurrent])

  useEffect(() => {
    if (!transport || !enabled || !sessionId) return
    void refresh()
  }, [transport, enabled, sessionId, refresh])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const applyEvent = useCallback(
    (event: Event) => {
      const activeId = sessionRef.current
      if (!activeId) return

      if (event.type === 'file.edited') {
        const file = event.properties.file
        setStore((previous) =>
          isCurrent(activeId, transportRef.current)
            ? {
                ...previous,
                sessionId: activeId,
                transport: transportRef.current,
                touched: previous.touched.includes(file) ? previous.touched : [...previous.touched, file],
              }
            : previous,
        )
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          void refresh()
        }, REFRESH_DEBOUNCE)
        return
      }

      if (event.type === 'session.diff') {
        const { sessionID, diff } = event.properties
        if (sessionID !== activeId) return
        setStore((previous) =>
          isCurrent(activeId, transportRef.current)
            ? {
                ...previous,
                sessionId: activeId,
                transport: transportRef.current,
                changes: diff.map(fileChangeFromDiff),
              }
            : previous,
        )
      }
    },
    [isCurrent, refresh],
  )

  const openFile = useCallback(async (path: string) => {
    const current = transportRef.current
    if (!current) return undefined
    try {
      return await current.readFile(path)
    } catch (caught) {
      setStore((previous) => ({
        ...previous,
        error: toRemoteError(caught, { url: current.baseUrl }).toInfo(),
      }))
      return undefined
    }
  }, [])

  const matches = sessionId !== null && store.sessionId === sessionId && store.transport === transport
  const view = matches ? store : EMPTY_STORE

  // Files touched by events but absent from the diff still deserve a row.
  const changes: FileChange[] = [...view.changes]
  for (const path of view.touched) {
    if (!changes.some((change) => change.path === path)) {
      changes.push({ path, status: 'modified', additions: 0, deletions: 0 })
    }
  }

  return { changes, loading: view.loading, error: view.error, refresh, openFile, applyEvent }
}
