/**
 * Composition root: wires settings → connection → sessions → conversation → files
 * and makes sure every event reaches every store exactly once.
 *
 * Remote keeps no server-side state of its own — everything below is a view of
 * what the OpenCode HTTP server reports.
 */
import { useCallback, useEffect } from 'react'
import type { Event } from '../types/opencode'
import { useConnection } from './useConnection'
import { useEvents } from './useEvents'
import { useFiles } from './useFiles'
import { useMessages } from './useMessages'
import { useSession } from './useSession'
import { useSettings } from './useSettings'

const POLL_INTERVAL = 2500
const SESSION_POLL_INTERVAL = 20_000

export function useOpenCode() {
  const settingsState = useSettings()

  const connectionState = useConnection({
    settings: settingsState.settings,
    credentials: settingsState.credentials,
  })

  const connected = connectionState.connection.state === 'connected'
  const transport = connectionState.transport

  const session = useSession({ transport, enabled: connected })
  const files = useFiles({ transport, sessionId: session.selectedId, enabled: connected })

  const { refreshStatuses, refreshSessions, applyEvent: applySessionEvent } = session
  const { refresh: refreshFiles, applyEvent: applyFileEvent } = files

  const handleIdle = useCallback(() => {
    void refreshStatuses()
    void refreshSessions()
    void refreshFiles()
  }, [refreshStatuses, refreshSessions, refreshFiles])

  const messages = useMessages({
    transport,
    sessionId: session.selectedId,
    enabled: connected,
    onIdle: handleIdle,
  })

  const { applyEvent: applyMessageEvent, refresh: refreshMessages, busy } = messages

  const handleEvent = useCallback(
    (event: Event) => {
      applySessionEvent(event)
      applyMessageEvent(event)
      applyFileEvent(event)
    },
    [applySessionEvent, applyMessageEvent, applyFileEvent],
  )

  const events = useEvents({ transport, enabled: connected, onEvent: handleEvent })

  /**
   * When the live stream is unavailable (blocked by a proxy, dropped, or
   * rejected) fall back to polling instead of leaving the user with a frozen
   * conversation. `refreshMessages` is a no-op unless a run is in flight while
   * idle, so polling stays cheap.
   */
  const polling = connected && events.state !== 'open'

  useEffect(() => {
    if (!polling) return
    const fast = setInterval(() => {
      if (busy) void refreshMessages()
      void refreshStatuses()
    }, POLL_INTERVAL)
    const slow = setInterval(() => {
      void refreshSessions()
    }, SESSION_POLL_INTERVAL)
    return () => {
      clearInterval(fast)
      clearInterval(slow)
    }
  }, [polling, busy, refreshMessages, refreshStatuses, refreshSessions])

  const currentStatus = messages.status ?? session.statusFor(session.selectedId)

  return {
    // configuration
    settings: settingsState.settings,
    credentials: settingsState.credentials,
    updateSettings: settingsState.updateSettings,
    setCredentials: settingsState.setCredentials,
    clearCredentials: settingsState.clearCredentials,
    resetSettings: settingsState.resetSettings,

    // connection
    connection: connectionState.connection,
    transport,
    mock: connectionState.mock,
    connect: connectionState.connect,
    disconnect: connectionState.disconnect,
    recheck: connectionState.recheck,
    testConnection: connectionState.testConnection,
    clearConnectionError: connectionState.clearError,

    // live events
    events,
    polling,

    // sessions
    sessions: session.sessions,
    sessionsLoading: session.loading,
    sessionsError: session.error,
    selectedId: session.selectedId,
    selectedSession: session.selectedSession,
    selectSession: session.selectSession,
    createSession: session.createSession,
    deleteSession: session.deleteSession,
    renameSession: session.renameSession,
    refreshSessions: session.refreshSessions,
    refreshStatuses: session.refreshStatuses,
    statuses: session.statuses,
    currentStatus,

    // conversation
    messages: messages.messages,
    optimistic: messages.optimistic,
    permissions: messages.permissions,
    todos: messages.todos,
    messagesError: messages.error,
    busy: messages.busy,
    streaming: messages.streaming,
    messagesLoading: messages.loading,
    busySince: messages.busySince,
    send: messages.send,
    abort: messages.abort,
    refreshMessages: messages.refresh,
    replyPermission: messages.replyPermission,
    clearMessagesError: messages.clearError,

    // files
    fileChanges: files.changes,
    filesLoading: files.loading,
    filesError: files.error,
    refreshFiles: files.refresh,
    openFile: files.openFile,
  }
}

export type UseOpenCodeResult = ReturnType<typeof useOpenCode>
