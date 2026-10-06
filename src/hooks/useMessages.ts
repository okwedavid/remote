/**
 * The conversation for the selected session: history, live updates, sending,
 * aborting and permission requests.
 *
 * Events are folded into a keyed store: every write is stamped with the
 * (transport, session) it belongs to, and anything that does not match the
 * current selection is ignored. That makes async results (a fetch that lands
 * after the user switched sessions) harmless and keeps the state resets out of
 * effects.
 *
 * SSE events drive the live view; `refresh` re-reads the history from OpenCode
 * whenever a run settles or when the event stream is unavailable, so nothing is
 * lost (or duplicated) if a frame goes missing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Event,
  ModelRef,
  OptimisticMessage,
  PermissionRequest,
  RemoteErrorInfo,
  SessionStatus,
  Todo,
} from '../types/opencode'
import {
  emptyConversation,
  isSessionStreaming,
  reconcileOptimistic,
  removeMessage,
  removePart,
  replaceConversation,
  toMessageList,
  upsertMessage,
  upsertPart,
  type ConversationState,
} from '../lib/conversation'
import { describeAssistantError, toRemoteError } from '../lib/errors'
import type { OpenCodeTransport, PermissionResponse } from '../lib/transport'

export interface SendInput {
  text: string
  mode: 'prompt' | 'shell'
  agent: string
  model: ModelRef | null
}

export interface SendResult {
  ok: boolean
  error?: RemoteErrorInfo
}

export interface UseMessagesOptions {
  transport: OpenCodeTransport | null
  sessionId: string | null
  enabled: boolean
  onIdle?: () => void
}

export interface UseMessagesResult {
  messages: ReturnType<typeof toMessageList>
  optimistic: OptimisticMessage[]
  permissions: PermissionRequest[]
  todos: Todo[]
  error: RemoteErrorInfo | null
  busy: boolean
  streaming: boolean
  loading: boolean
  status: SessionStatus | null
  busySince: number | null
  send: (input: SendInput) => Promise<SendResult>
  abort: () => Promise<void>
  refresh: () => Promise<void>
  refreshTodos: () => Promise<void>
  replyPermission: (permissionID: string, response: PermissionResponse) => Promise<void>
  applyEvent: (event: Event) => void
  clearError: () => void
}

interface MessagesStore {
  sessionId: string | null
  transport: OpenCodeTransport | null
  conversation: ConversationState
  optimistic: OptimisticMessage[]
  permissions: PermissionRequest[]
  todos: Todo[]
  error: RemoteErrorInfo | null
  status: SessionStatus | null
  localBusy: boolean
  busySince: number | null
  loading: boolean
}

const EMPTY_STORE: MessagesStore = {
  sessionId: null,
  transport: null,
  conversation: emptyConversation,
  optimistic: [],
  permissions: [],
  todos: [],
  error: null,
  status: null,
  localBusy: false,
  busySince: null,
  loading: false,
}

let optimisticSequence = 0

export function useMessages({
  transport,
  sessionId,
  enabled,
  onIdle,
}: UseMessagesOptions): UseMessagesResult {
  const [store, setStore] = useState<MessagesStore>(EMPTY_STORE)

  const transportRef = useRef(transport)
  const sessionRef = useRef(sessionId)
  const idleRef = useRef(onIdle)

  useEffect(() => {
    transportRef.current = transport
  }, [transport])
  useEffect(() => {
    sessionRef.current = sessionId
  }, [sessionId])
  useEffect(() => {
    idleRef.current = onIdle
  }, [onIdle])

  /** Writes are ignored once the selection has moved on. */
  const isCurrent = useCallback((id: string | null, current: OpenCodeTransport | null) => {
    return id !== null && sessionRef.current === id && transportRef.current === current
  }, [])

  const apply = useCallback(
    (id: string | null, current: OpenCodeTransport | null, update: Partial<MessagesStore>) => {
      if (!isCurrent(id, current)) return
      setStore((previous) => ({ ...previous, ...update, sessionId: id, transport: current }))
    },
    [isCurrent],
  )

  const refresh = useCallback(async () => {
    const current = transportRef.current
    const id = sessionRef.current
    if (!current || !id) return

    apply(id, current, { loading: true })
    try {
      const [list, statuses] = await Promise.all([
        current.messages(id),
        current.sessionStatuses().catch(() => null),
      ])
      const status = statuses ? (statuses[id] ?? null) : null
      setStore((previous) => {
        // Re-check inside the updater: the user may have switched sessions
        // while the request was in flight.
        if (!isCurrent(id, current)) return previous
        return {
          ...previous,
          sessionId: id,
          transport: current,
          conversation: replaceConversation(list),
          optimistic: reconcileOptimistic(previous.optimistic, list),
          status,
          loading: false,
          error: null,
        }
      })
    } catch (caught) {
      const info = toRemoteError(caught, { url: current.baseUrl, session: true }).toInfo()
      apply(id, current, {
        loading: false,
        error: info,
        ...(info.code === 'not_found' ? { conversation: emptyConversation, optimistic: [] } : {}),
      })
      if (info.code === 'not_found') idleRef.current?.()
    }
  }, [apply, isCurrent])

  const refreshTodos = useCallback(async () => {
    const current = transportRef.current
    const id = sessionRef.current
    if (!current || !id) return
    try {
      const todos = await current.sessionTodos(id)
      apply(id, current, { todos })
    } catch {
      /* todos are optional */
    }
  }, [apply])

  // Load history whenever the selection changes (or the server changes).
  useEffect(() => {
    if (!transport || !enabled || !sessionId) return
    void refresh()
    void refreshTodos()
  }, [transport, enabled, sessionId, refresh, refreshTodos])

  const beginBusy = useCallback(
    (id: string | null, current: OpenCodeTransport | null) => {
      apply(id, current, { localBusy: true, busySince: Date.now() })
    },
    [apply],
  )

  const endBusy = useCallback(
    (id: string | null, current: OpenCodeTransport | null) => {
      apply(id, current, { localBusy: false, busySince: null })
    },
    [apply],
  )

  const send = useCallback(
    async (input: SendInput): Promise<SendResult> => {
      const current = transportRef.current
      const id = sessionRef.current
      if (!current || !id) {
        return {
          ok: false,
          error: {
            code: 'config',
            title: 'No session selected.',
            message: 'Create or pick a session before sending a prompt.',
            retryable: false,
          },
        }
      }

      apply(id, current, { error: null })

      if (input.mode === 'shell') {
        beginBusy(id, current)
        try {
          await current.shell(id, {
            command: input.text,
            agent: input.agent || 'build',
            model: input.model,
          })
          await refresh()
          return { ok: true }
        } catch (caught) {
          const info = toRemoteError(caught, { url: current.baseUrl, session: true }).toInfo()
          apply(id, current, { error: info })
          return { ok: false, error: info }
        } finally {
          endBusy(id, current)
        }
      }

      optimisticSequence += 1
      const echo: OptimisticMessage = {
        id: `local_${Date.now().toString(36)}_${optimisticSequence}`,
        sessionID: id,
        text: input.text,
        createdAt: Date.now(),
      }
      setStore((previous) =>
        isCurrent(id, current)
          ? { ...previous, optimistic: [...previous.optimistic, echo], localBusy: true, busySince: Date.now() }
          : previous,
      )

      try {
        await current.promptAsync(id, {
          text: input.text,
          ...(input.agent ? { agent: input.agent } : {}),
          ...(input.model ? { model: input.model } : {}),
        })
        return { ok: true }
      } catch (caught) {
        const info = toRemoteError(caught, { url: current.baseUrl, session: true }).toInfo()
        setStore((previous) =>
          isCurrent(id, current)
            ? {
                ...previous,
                optimistic: previous.optimistic.filter((entry) => entry.id !== echo.id),
                localBusy: false,
                busySince: null,
                error: info,
              }
            : previous,
        )
        return { ok: false, error: info }
      }
    },
    [apply, beginBusy, endBusy, isCurrent, refresh],
  )

  const abort = useCallback(async () => {
    const current = transportRef.current
    const id = sessionRef.current
    if (!current || !id) return
    try {
      await current.abort(id)
    } catch (caught) {
      apply(id, current, {
        error: toRemoteError(caught, { url: current.baseUrl, session: true }).toInfo(),
      })
    } finally {
      endBusy(id, current)
    }
  }, [apply, endBusy])

  const replyPermission = useCallback(
    async (permissionID: string, response: PermissionResponse) => {
      const current = transportRef.current
      const id = sessionRef.current
      if (!current || !id) return
      setStore((previous) =>
        isCurrent(id, current)
          ? { ...previous, permissions: previous.permissions.filter((entry) => entry.id !== permissionID) }
          : previous,
      )
      try {
        await current.replyPermission(id, permissionID, response)
      } catch (caught) {
        apply(id, current, {
          error: toRemoteError(caught, { url: current.baseUrl, session: true }).toInfo(),
        })
      }
    },
    [apply, isCurrent],
  )

  const applyEvent = useCallback(
    (event: Event) => {
      const current = transportRef.current
      const activeId = sessionRef.current
      if (!activeId) return

      switch (event.type) {
        case 'message.updated': {
          const info = event.properties.info
          if (info.sessionID !== activeId) return
          setStore((previous) => {
            const next: MessagesStore = { ...previous, conversation: upsertMessage(previous.conversation, info) }
            if (info.role === 'user') {
              // The server already accepted the prompt: drop the local echo.
              next.optimistic = previous.optimistic.filter(
                (entry) => entry.createdAt > info.time.created,
              )
            }
            if (info.role === 'assistant' && info.error && info.error.name !== 'MessageAbortedError') {
              next.error = describeAssistantError(info.error).toInfo()
              next.localBusy = false
              next.busySince = null
            }
            return next
          })
          break
        }
        case 'message.part.updated': {
          const part = event.properties.part
          if (part.sessionID !== activeId) return
          setStore((previous) => ({
            ...previous,
            conversation: upsertPart(previous.conversation, part),
          }))
          break
        }
        case 'message.part.removed': {
          const { sessionID, messageID, partID } = event.properties
          if (sessionID !== activeId) return
          setStore((previous) => ({
            ...previous,
            conversation: removePart(previous.conversation, messageID, partID),
          }))
          break
        }
        case 'message.removed': {
          const { sessionID, messageID } = event.properties
          if (sessionID !== activeId) return
          setStore((previous) => ({
            ...previous,
            conversation: removeMessage(previous.conversation, messageID),
          }))
          break
        }
        case 'session.status': {
          const { sessionID, status } = event.properties
          if (sessionID !== activeId) return
          const busy = status.type === 'busy'
          setStore((previous) => ({
            ...previous,
            status,
            localBusy: busy ? true : false,
            busySince: busy ? (previous.busySince ?? Date.now()) : null,
          }))
          break
        }
        case 'session.idle': {
          if (event.properties.sessionID !== activeId) return
          setStore((previous) => ({ ...previous, status: { type: 'idle' }, localBusy: false, busySince: null }))
          void refresh()
          void refreshTodos()
          idleRef.current?.()
          break
        }
        case 'session.compacted': {
          if (event.properties.sessionID !== activeId) return
          void refresh()
          break
        }
        case 'session.error': {
          const { sessionID, error } = event.properties
          if (sessionID && sessionID !== activeId) return
          if (!error) return
          setStore((previous) => ({
            ...previous,
            error: describeAssistantError(error).toInfo(),
            localBusy: false,
            busySince: null,
          }))
          break
        }
        case 'permission.updated': {
          const request = event.properties
          if (request.sessionID !== activeId) return
          setStore((previous) => ({
            ...previous,
            permissions: previous.permissions.some((entry) => entry.id === request.id)
              ? previous.permissions
              : [...previous.permissions, request],
          }))
          break
        }
        case 'permission.replied': {
          const { permissionID } = event.properties
          setStore((previous) => ({
            ...previous,
            permissions: previous.permissions.filter((entry) => entry.id !== permissionID),
          }))
          break
        }
        case 'todo.updated': {
          if (event.properties.sessionID !== activeId) return
          setStore((previous) => ({ ...previous, todos: event.properties.todos }))
          break
        }
        default:
          break
      }

      void current
    },
    [refresh, refreshTodos],
  )

  const matches = sessionId !== null && store.sessionId === sessionId && store.transport === transport
  const view = matches ? store : EMPTY_STORE

  const messages = useMemo(() => (matches ? toMessageList(view.conversation) : []), [matches, view.conversation])
  const streaming = useMemo(
    () => (matches ? isSessionStreaming(view.conversation) : false),
    [matches, view.conversation],
  )

  const clearError = useCallback(() => {
    const id = sessionRef.current
    const current = transportRef.current
    apply(id, current, { error: null })
  }, [apply])

  return {
    messages,
    optimistic: view.optimistic,
    permissions: view.permissions,
    todos: view.todos,
    error: view.error,
    busy: view.localBusy || view.status?.type === 'busy' || streaming,
    streaming,
    loading: view.loading,
    status: view.status,
    busySince: view.busySince,
    send,
    abort,
    refresh,
    refreshTodos,
    replyPermission,
    applyEvent,
    clearError,
  }
}
