import { ConnectionStatus } from '../ConnectionStatus/ConnectionStatus'
import { IconLogo, IconMenu, IconPlugOff, IconRefresh, IconSettings, IconPlug } from '../common/Icons'
import type { ConnectionInfo, EventStreamState } from '../../types/opencode'
import { describeOrigin } from '../../lib/urls'

export interface HeaderProps {
  connection: ConnectionInfo
  eventsState: EventStreamState
  mock: boolean
  compact: boolean
  onToggleSidebar: () => void
  onConnect: () => void
  onDisconnect: () => void
  onReconnect: () => void
  onOpenSettings: () => void
}

export function Header({
  connection,
  eventsState,
  mock,
  compact,
  onToggleSidebar,
  onConnect,
  onDisconnect,
  onReconnect,
  onOpenSettings,
}: HeaderProps) {
  const { state } = connection
  const showOrigin = connection.url !== '' && state !== 'disconnected'

  return (
    <header className="header">
      {compact ? (
        <button
          type="button"
          className="iconbtn"
          onClick={onToggleSidebar}
          aria-label="Open sessions"
        >
          <IconMenu size={17} />
        </button>
      ) : null}

      <div className="header__brand">
        <IconLogo size={22} className="header__logo" />
        <span className="header__title">Remote</span>
        <span className="header__subtitle">OpenCode control panel</span>
      </div>

      {mock ? <span className="badge badge--mock" title="Simulated server — no real agent involved">Mock</span> : null}

      <div className="header__spacer" />

      {showOrigin ? (
        <span className="header__meta" title={connection.url}>
          {describeOrigin(connection.url)}
        </span>
      ) : null}

      <div className="header__actions">
        <ConnectionStatus
          connection={connection}
          eventsState={eventsState}
          onActivate={onOpenSettings}
        />

        {state === 'connected' ? (
          <>
            <button
              type="button"
              className="iconbtn"
              onClick={onReconnect}
              title="Re-check the connection"
              aria-label="Re-check connection"
            >
              <IconRefresh size={16} />
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onDisconnect}
              aria-label="Disconnect from the OpenCode server"
            >
              <IconPlugOff size={15} />
              <span className="header__cta">Disconnect</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={state === 'connecting' ? onReconnect : onConnect}
            disabled={state === 'connecting'}
          >
            {state === 'connecting' ? <span className="spinner" /> : <IconPlug size={15} />}
            <span className="header__cta">{state === 'connecting' ? 'Connecting…' : 'Connect'}</span>
          </button>
        )}

        <button
          type="button"
          className="iconbtn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Open settings"
        >
          <IconSettings size={17} />
        </button>
      </div>
    </header>
  )
}
