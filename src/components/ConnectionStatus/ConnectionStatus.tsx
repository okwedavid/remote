import type { ConnectionInfo, EventStreamState } from '../../types/opencode'

export interface ConnectionStatusProps {
  connection: ConnectionInfo
  eventsState: EventStreamState
  /** Rendered as a button (opens Settings) when provided. */
  onActivate?: () => void
}

function label(connection: ConnectionInfo): string {
  switch (connection.state) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting…'
    case 'error':
      return 'Connection error'
    default:
      return 'Disconnected'
  }
}

function tooltip(connection: ConnectionInfo, eventsState: EventStreamState): string {
  const parts = [connection.url || 'No server configured']
  if (connection.version) parts.push(`OpenCode ${connection.version}`)
  if (connection.state === 'connected') {
    parts.push(
      eventsState === 'open'
        ? 'live events'
        : eventsState === 'connecting'
          ? 'event stream connecting'
          : 'event stream unavailable (polling)',
    )
    if (typeof connection.latencyMs === 'number') parts.push(`${connection.latencyMs}ms`)
  }
  if (connection.error) parts.push(connection.error.title)
  return parts.join(' · ')
}

export function ConnectionStatus({ connection, eventsState, onActivate }: ConnectionStatusProps) {
  const text = label(connection)
  const className = `status status--${connection.state} ${onActivate ? 'status--button' : ''}`
  const title = tooltip(connection, eventsState)

  const content = (
    <>
      <span className="status__dot" />
      <span className="status__text">{text}</span>
    </>
  )

  if (onActivate) {
    return (
      <button
        type="button"
        className={className}
        onClick={onActivate}
        title={title}
        aria-label={`${text}. ${title}. Open connection settings.`}
      >
        {content}
      </button>
    )
  }

  return (
    <span className={className} title={title} role="status" aria-live="polite">
      {content}
    </span>
  )
}
