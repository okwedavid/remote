import { useMemo, useState } from 'react'
import type { RemoteErrorInfo, Session, SessionStatus } from '../../types/opencode'
import { Drawer } from '../common/Drawer'
import { EmptyState } from '../common/EmptyState'
import { ErrorBanner } from '../common/ErrorBanner'
import { IconChat, IconPlus, IconSearch } from '../common/Icons'
import { SessionItem } from './SessionItem'

export interface SessionListProps {
  sessions: Session[]
  statuses: Record<string, SessionStatus>
  selectedId: string | null
  loading: boolean
  error: RemoteErrorInfo | null
  connected: boolean
  onCreate: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onDismissError: () => void
  /** Desktop keeps the list docked; compact layouts open it as a drawer. */
  embedded: boolean
  open: boolean
  onClose: () => void
}

function Panel(props: SessionListProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return props.sessions
    return props.sessions.filter((session) => (session.title ?? '').toLowerCase().includes(needle))
  }, [props.sessions, query])

  return (
    <>
      <div className="sidebar__header">
        <span className="sidebar__title">Sessions</span>
        <button
          type="button"
          className="iconbtn"
          onClick={props.onCreate}
          disabled={!props.connected}
          aria-label="New session"
          title="New session"
        >
          <IconPlus size={16} />
        </button>
      </div>

      {props.sessions.length > 8 ? (
        <div className="sidebar__search">
          <label className="sr-only" htmlFor="session-filter">
            Filter sessions
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span
              style={{
                position: 'absolute',
                left: 8,
                color: 'var(--text-dim)',
                display: 'flex',
                pointerEvents: 'none',
              }}
            >
              <IconSearch size={13} />
            </span>
            <input
              id="session-filter"
              className="input"
              style={{ paddingLeft: 27 }}
              placeholder="Filter sessions"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="sidebar__list">
        {props.error ? (
          <div style={{ padding: 4 }}>
            <ErrorBanner error={props.error} onDismiss={props.onDismissError} />
          </div>
        ) : null}

        {!props.connected ? (
          <EmptyState
            inline
            icon={<IconChat size={20} />}
            title="Connect to your OpenCode server to begin."
            text="Sessions live on your PC — Remote only shows what the server reports."
          />
        ) : props.sessions.length === 0 ? (
          <EmptyState
            inline
            icon={<IconChat size={20} />}
            title="No sessions yet"
            text="Start a new OpenCode session to talk to your agent."
          >
            <button type="button" className="btn btn--small" onClick={props.onCreate}>
              <IconPlus size={14} />
              New session
            </button>
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState inline title="No matches" text={`Nothing matches “${query}”.`} />
        ) : (
          filtered.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              active={session.id === props.selectedId}
              status={props.statuses[session.id] ?? null}
              onSelect={() => {
                props.onSelect(session.id)
                props.onClose()
              }}
              onRename={(title) => props.onRename(session.id, title)}
              onDelete={() => props.onDelete(session.id)}
            />
          ))
        )}
      </div>

      <div className="sidebar__footer">
        {props.loading
          ? 'Loading sessions…'
          : props.connected
            ? `${props.sessions.length} session${props.sessions.length === 1 ? '' : 's'} on the server`
            : 'Not connected'}
      </div>
    </>
  )
}

export function SessionList(props: SessionListProps) {
  if (props.embedded) {
    return (
      <aside className="sidebar" aria-label="Sessions">
        <Panel {...props} />
      </aside>
    )
  }

  return (
    <Drawer open={props.open} onClose={props.onClose} title="Sessions" side="left">
      <Panel {...props} />
    </Drawer>
  )
}
