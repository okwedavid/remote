import { useCallback, useEffect, useState } from 'react'
import { useOpenCode } from './hooks/useOpenCode'
import { useCatalog } from './hooks/useCatalog'
import { useIsCompact } from './hooks/useMediaQuery'
import type { Credentials, Settings } from './types/opencode'
import { Header } from './components/Header/Header'
import { SessionList } from './components/SessionList/SessionList'
import { SessionBar } from './components/Chat/SessionBar'
import { Chat } from './components/Chat/Chat'
import { Composer } from './components/Composer/Composer'
import { FileActivity } from './components/FileActivity/FileActivity'
import { SettingsDrawer } from './components/Settings/SettingsDrawer'
import { ErrorBanner } from './components/common/ErrorBanner'
import { IconInfo } from './components/common/Icons'

export default function App() {
  const remote = useOpenCode()
  const compact = useIsCompact()
  const catalog = useCatalog(remote.transport, remote.connection.state === 'connected')

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [activityFocus, setActivityFocus] = useState<string | null>(null)

  const closeOverlays = useCallback(() => {
    setSettingsOpen(false)
    setSidebarOpen(false)
    if (compact) setActivityOpen(false)
  }, [compact])

  // Keyboard: Ctrl/Cmd+B sidebar, Ctrl/Cmd+, settings, Escape closes or aborts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setSidebarOpen((value) => !value)
        return
      }
      if (meta && event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }
      if (event.key !== 'Escape') return
      if (settingsOpen || sidebarOpen || (compact && activityOpen)) {
        closeOverlays()
        return
      }
      if (remote.busy) void remote.abort()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activityOpen, closeOverlays, compact, remote, settingsOpen, sidebarOpen])

  const handleCreateSession = useCallback(async () => {
    await remote.createSession()
    setSidebarOpen(false)
  }, [remote])

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await remote.deleteSession(id)
    },
    [remote],
  )

  const handleRenameSession = useCallback(
    async (id: string, title: string) => {
      await remote.renameSession(id, title)
    },
    [remote],
  )

  const handleOpenFile = useCallback((path: string) => {
    setActivityFocus(path)
    setActivityOpen(true)
  }, [])

  const handleSaveSettings = useCallback(
    (patch: Partial<Settings>, credentials: Credentials | null) => {
      remote.updateSettings(patch)
      remote.setCredentials(credentials)
    },
    [remote],
  )

  const handleSaveAndConnect = useCallback(
    (patch: Partial<Settings>, credentials: Credentials | null) => {
      handleSaveSettings(patch, credentials)
      void remote.connect({
        url: patch.serverUrl ?? remote.settings.serverUrl,
        credentials,
      })
    },
    [handleSaveSettings, remote],
  )

  const sessionList = (
    <SessionList
      key={compact ? 'drawer' : 'docked'}
      embedded={!compact}
      open={sidebarOpen}
      onClose={() => setSidebarOpen(false)}
      sessions={remote.sessions}
      statuses={remote.statuses}
      selectedId={remote.selectedId}
      loading={remote.sessionsLoading}
      error={remote.sessionsError}
      connected={remote.connection.state === 'connected'}
      onCreate={() => void handleCreateSession()}
      onSelect={remote.selectSession}
      onDelete={(id) => void handleDeleteSession(id)}
      onRename={(id, title) => void handleRenameSession(id, title)}
      onDismissError={remote.clearConnectionError}
    />
  )

  const activity = (
    <FileActivity
      key={activityFocus ?? 'activity'}
      embedded={!compact}
      open={activityOpen}
      onClose={() => setActivityOpen(false)}
      changes={remote.fileChanges}
      todos={remote.todos}
      loading={remote.filesLoading}
      error={remote.filesError}
      focusPath={activityFocus}
      onOpenFile={remote.openFile}
      onRefresh={() => void remote.refreshFiles()}
    />
  )

  return (
    <div className="app">
      <Header
        connection={remote.connection}
        eventsState={remote.events.state}
        mock={remote.mock}
        compact={compact}
        onToggleSidebar={() => setSidebarOpen(true)}
        onConnect={() => void remote.connect()}
        onDisconnect={remote.disconnect}
        onReconnect={() => void remote.recheck()}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="app__body">
        {sessionList}

        <main className="app__main">
          <SessionBar
            key={`bar:${remote.selectedId ?? 'no-session'}`}
            session={remote.selectedSession}
            status={remote.currentStatus}
            connected={remote.connection.state === 'connected'}
            activityOpen={activityOpen}
            fileCount={remote.fileChanges.length}
            onToggleActivity={() => setActivityOpen((value) => !value)}
            onRename={(title) => {
              if (remote.selectedId) void handleRenameSession(remote.selectedId, title)
            }}
            onDelete={() => {
              if (remote.selectedId) void handleDeleteSession(remote.selectedId)
            }}
            onNewSession={() => void handleCreateSession()}
          />

          {remote.connection.state === 'error' && remote.connection.error ? (
            <div style={{ padding: '8px 12px 0' }}>
              <ErrorBanner
                error={remote.connection.error}
                onRetry={() => void remote.connect()}
                retryLabel="Reconnect"
                onDismiss={remote.clearConnectionError}
              />
            </div>
          ) : null}

          {remote.polling ? (
            <div style={{ padding: '8px 12px 0' }}>
              <div className="banner banner--warn" role="status">
                <span style={{ color: 'var(--warn)', display: 'flex' }}>
                  <IconInfo size={15} />
                </span>
                <div className="banner__body">
                  <span className="banner__title">Live updates unavailable</span>
                  <span className="banner__text">
                    The event stream ({`GET /global/event`}) could not be opened — Remote is polling
                    the message history instead. Everything keeps working, updates just arrive a
                    couple of seconds later.
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <Chat
            key={`chat:${remote.selectedId ?? 'no-session'}`}
            messages={remote.messages}
            optimistic={remote.optimistic}
            permissions={remote.permissions}
            loading={remote.messagesLoading}
            error={remote.messagesError}
            connected={remote.connection.state === 'connected'}
            hasSession={remote.selectedId !== null}
            sessionId={remote.selectedId}
            showReasoning={remote.settings.showReasoning}
            busy={remote.busy}
            busySince={remote.busySince}
            onConnect={() => void remote.connect()}
            onCreateSession={() => void handleCreateSession()}
            onOpenSettings={() => setSettingsOpen(true)}
            onRetry={() => void remote.refreshMessages()}
            onDismissError={remote.clearMessagesError}
            onReplyPermission={(permissionID, response) =>
              void remote.replyPermission(permissionID, response)
            }
            onOpenFile={handleOpenFile}
          />

          <Composer
            connected={remote.connection.state === 'connected'}
            hasSession={remote.selectedId !== null}
            busy={remote.busy}
            agents={catalog.agents}
            providers={catalog.providers}
            agent={remote.settings.agent}
            model={remote.settings.model}
            onAgentChange={(agent) => remote.updateSettings({ agent })}
            onModelChange={(model) => remote.updateSettings({ model })}
            onSend={remote.send}
            onAbort={() => void remote.abort()}
            onRequestModels={catalog.load}
          />
        </main>

        {compact ? activity : activityOpen ? activity : null}
      </div>

      {settingsOpen ? (
      <SettingsDrawer
        open
        onClose={() => setSettingsOpen(false)}
        settings={remote.settings}
        credentials={remote.credentials}
        connection={remote.connection}
        eventsState={remote.events.state}
        polling={remote.polling}
        mock={remote.mock}
        onSave={handleSaveSettings}
        onSaveAndConnect={handleSaveAndConnect}
        onTest={remote.testConnection}
        onConnect={() => void remote.connect()}
        onDisconnect={remote.disconnect}
        onReset={() => {
          remote.resetSettings()
          remote.disconnect()
        }}
      />
      ) : null}
    </div>
  )
}
