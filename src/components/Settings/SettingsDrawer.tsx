import { useState } from 'react'
import type {
  ConnectionInfo,
  Credentials,
  CredentialPersistence,
  EventStreamState,
  Settings,
} from '../../types/opencode'
import type { ConnectionTestResult } from '../../hooks/useConnection'
import { describeOrigin, parseServerUrl } from '../../lib/urls'
import { Drawer } from '../common/Drawer'
import { ErrorBanner } from '../common/ErrorBanner'
import { IconCheck, IconWarning } from '../common/Icons'

export interface SettingsDrawerProps {
  open: boolean
  onClose: () => void
  settings: Settings
  credentials: Credentials | null
  connection: ConnectionInfo
  eventsState: EventStreamState
  polling: boolean
  mock: boolean
  onSave: (patch: Partial<Settings>, credentials: Credentials | null) => void
  /** Persists the settings and immediately opens a connection with them. */
  onSaveAndConnect: (patch: Partial<Settings>, credentials: Credentials | null) => void
  onTest: (input: {
    url: string
    credentials: Credentials | null
  }) => Promise<ConnectionTestResult>
  onConnect: () => void
  onDisconnect: () => void
  onReset: () => void
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; version?: string; latencyMs?: number }
  | { kind: 'error'; error: NonNullable<ConnectionTestResult['error']> }

export function SettingsDrawer({
  open,
  onClose,
  settings,
  credentials,
  connection,
  eventsState,
  polling,
  mock,
  onSave,
  onSaveAndConnect,
  onTest,
  onConnect,
  onDisconnect,
  onReset,
}: SettingsDrawerProps) {
  const [url, setUrl] = useState(settings.serverUrl)
  const [username, setUsername] = useState(credentials?.username ?? settings.username)
  const [password, setPassword] = useState(credentials?.password ?? '')
  const [autoConnect, setAutoConnect] = useState(settings.autoConnect)
  const [persistence, setPersistence] = useState<CredentialPersistence>(
    settings.credentialPersistence,
  )
  const [showReasoning, setShowReasoning] = useState(settings.showReasoning)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [urlError, setUrlError] = useState<string | null>(null)

  const currentCredentials = (): Credentials | null =>
    password === '' ? null : { username, password }

  const validate = (): boolean => {
    const result = parseServerUrl(url)
    if (!result.ok) {
      setUrlError(result.reason)
      return false
    }
    setUrlError(null)
    return true
  }

  const runTest = async (): Promise<void> => {
    if (!validate()) return
    setTest({ kind: 'testing' })
    const result = await onTest({ url, credentials: currentCredentials() })
    if (result.ok) {
      const ok: TestState = { kind: 'ok' }
      if (result.version) ok.version = result.version
      if (result.latencyMs !== undefined) ok.latencyMs = result.latencyMs
      setTest(ok)
    } else {
      setTest({
        kind: 'error',
        error: result.error ?? {
          code: 'unknown',
          title: 'Unable to connect',
          message: 'The connection test failed.',
          retryable: true,
        },
      })
    }
  }

  const save = (connectAfter: boolean): void => {
    if (!validate()) return
    const patch: Partial<Settings> = {
      serverUrl: url.trim(),
      username,
      autoConnect,
      credentialPersistence: persistence,
      showReasoning,
    }
    const nextCredentials = currentCredentials()
    if (connectAfter) {
      onSaveAndConnect(patch, nextCredentials)
      return
    }
    onSave(patch, nextCredentials)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Connection settings"
      footer={
        <div className="settings__actions" style={{ width: '100%' }}>
          <button type="button" className="btn btn--primary" onClick={() => save(true)}>
            Save &amp; connect
          </button>
          <button type="button" className="btn" onClick={() => save(false)}>
            Save
          </button>
          <button type="button" className="btn btn--ghost" onClick={runTest} disabled={test.kind === 'testing'}>
            {test.kind === 'testing' ? <span className="spinner" /> : null}
            Test connection
          </button>
        </div>
      }
    >
      <div className="settings__section">
        <span className="settings__section-title">OpenCode server</span>

        <div className="settings__field">
          <label className="settings__label" htmlFor="settings-url">
            OpenCode URL
          </label>
          <input
            id="settings-url"
            className="input mono"
            placeholder="http://localhost:4096"
            value={url}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setUrl(event.target.value)}
            aria-invalid={urlError ? 'true' : undefined}
            aria-describedby="settings-url-help"
          />
          {urlError ? (
            <span className="settings__help" style={{ color: 'var(--err)' }}>
              {urlError}
            </span>
          ) : (
            <span className="settings__help" id="settings-url-help">
              The browser talks directly to this address. `localhost` means the device running
              this page — use your PC&apos;s LAN IP or an HTTPS tunnel for remote access.
            </span>
          )}
        </div>

        <div className="settings__field">
          <label className="settings__label" htmlFor="settings-username">
            Username
          </label>
          <input
            id="settings-username"
            className="input"
            placeholder="opencode"
            value={username}
            autoComplete="username"
            spellCheck={false}
            onChange={(event) => setUsername(event.target.value)}
          />
          <span className="settings__help">
            Defaults to <code>opencode</code> when left empty (OPENCODE_SERVER_USERNAME).
          </span>
        </div>

        <div className="settings__field">
          <label className="settings__label" htmlFor="settings-password">
            Password
          </label>
          <input
            id="settings-password"
            className="input"
            type="password"
            placeholder={credentials ? '••••••••' : 'OPENCODE_SERVER_PASSWORD'}
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
          <span className="settings__help">
            Sent only to the server above, as HTTP basic auth. Never stored in the app bundle.
          </span>
        </div>

        <div className="settings__row">
          <button type="button" className="btn" onClick={runTest} disabled={test.kind === 'testing'}>
            {test.kind === 'testing' ? <span className="spinner" /> : null}
            Test connection
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setUsername('')
              setPassword('')
              onSave({ username: '' }, null)
              setTest({ kind: 'idle' })
            }}
          >
            Clear credentials
          </button>
        </div>

        {test.kind === 'ok' ? (
          <div className="settings__status" role="status">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ok)' }}>
              <IconCheck size={15} /> Connected
            </span>
            {test.version ? <span>OpenCode version: {test.version}</span> : null}
            {test.latencyMs !== undefined ? <span>{test.latencyMs}ms round trip</span> : null}
          </div>
        ) : null}

        {test.kind === 'error' ? (
          <div className="settings__status">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--err)' }}>
              <IconWarning size={15} /> Unable to connect
            </span>
            <span className="muted">{test.error.message}</span>
            {test.error.hint ? <span className="settings__help">{test.error.hint}</span> : null}
          </div>
        ) : null}

        <div className="settings__status">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`status__dot`} style={{ background: dotColor(connection.state) }} />
            <strong>Status:</strong> {connection.state}
            {connection.version ? <span className="muted"> · {connection.version}</span> : null}
          </span>
          {connection.url ? (
            <span className="mono muted">{describeOrigin(connection.url)}</span>
          ) : null}
          <span className="muted">
            Event stream: {eventsState}
            {polling ? ' · falling back to polling' : ''}
          </span>
        </div>

        {connection.error ? (
          <ErrorBanner error={connection.error} onRetry={onConnect} retryLabel="Retry" />
        ) : null}

        {mock ? (
          <div className="banner banner--warn">
            <span style={{ color: 'var(--warn)', display: 'flex' }}>
              <IconWarning size={15} />
            </span>
            <div className="banner__body">
              <span className="banner__title">Mock mode is enabled</span>
              <span className="banner__text">
                VITE_MOCK_MODE=true — replies come from a local simulation, not from a real
                OpenCode agent. Set it to false for real use.
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="settings__section">
        <span className="settings__section-title">Behaviour</span>

        <label className="settings__check">
          <input
            type="checkbox"
            checked={autoConnect}
            onChange={(event) => setAutoConnect(event.target.checked)}
          />
          <span>
            Auto-connect on load
            <span className="settings__help" style={{ display: 'block' }}>
              Uses the stored URL and any saved tab credential.
            </span>
          </span>
        </label>

        <label className="settings__check">
          <input
            type="checkbox"
            checked={persistence === 'session'}
            onChange={(event) => setPersistence(event.target.checked ? 'session' : 'memory')}
          />
          <span>
            Keep the password for this browser tab
            <span className="settings__help" style={{ display: 'block' }}>
              Stored in sessionStorage (cleared when the tab closes). Off means the password lives
              in memory only.
            </span>
          </span>
        </label>

        <label className="settings__check">
          <input
            type="checkbox"
            checked={showReasoning}
            onChange={(event) => setShowReasoning(event.target.checked)}
          />
          <span>
            Show model reasoning
            <span className="settings__help" style={{ display: 'block' }}>
              Reasoning is collapsed by default inside the conversation.
            </span>
          </span>
        </label>

        <div className="settings__row">
          {connection.state === 'connected' ? (
            <button type="button" className="btn" onClick={onDisconnect}>
              Disconnect
            </button>
          ) : (
            <button type="button" className="btn" onClick={onConnect}>
              Connect now
            </button>
          )}
          <button type="button" className="btn btn--danger" onClick={onReset}>
            Reset settings
          </button>
        </div>
      </div>

      <div className="settings__section">
        <span className="settings__section-title">Security</span>
        <p className="settings__note">
          Remote is a personal tool: it holds no accounts, no cookies and no analytics, and it
          never sends your credentials anywhere except the URL above. The password is kept in
          memory (or tab storage if you opt in) and is never logged, echoed in error messages, or
          written into the build. Anyone who can open this page can use it to talk to your PC — keep
          the deployment private, use HTTPS, and protect OpenCode with
          <code> OPENCODE_SERVER_PASSWORD</code>.
        </p>
      </div>
    </Drawer>
  )
}

function dotColor(state: ConnectionInfo['state']): string {
  switch (state) {
    case 'connected':
      return 'var(--ok)'
    case 'connecting':
      return 'var(--warn)'
    case 'error':
      return 'var(--err)'
    default:
      return 'var(--text-dim)'
  }
}
