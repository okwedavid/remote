import { useEffect, useRef, useState } from 'react'
import type { Session, SessionStatus } from '../../types/opencode'
import { relativeTime } from '../../lib/format'
import { IconEdit, IconFolder, IconPlus, IconTrash } from '../common/Icons'

export interface SessionBarProps {
  session: Session | null
  status: SessionStatus | null
  connected: boolean
  activityOpen: boolean
  fileCount: number
  onToggleActivity: () => void
  onRename: (title: string) => void
  onDelete: () => void
  onNewSession: () => void
}

export function SessionBar({
  session,
  status,
  connected,
  activityOpen,
  fileCount,
  onToggleActivity,
  onRename,
  onDelete,
  onNewSession,
}: SessionBarProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session?.title ?? '')
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  if (!session) {
    return (
      <div className="sessionbar">
        <div className="sessionbar__info">
          <span className="sessionbar__title muted">No session selected</span>
        </div>
        <div className="sessionbar__actions">
          <button
            type="button"
            className="btn btn--small"
            onClick={onNewSession}
            disabled={!connected}
          >
            <IconPlus size={14} />
            New session
          </button>
        </div>
      </div>
    )
  }

  const commit = (): void => {
    setEditing(false)
    const next = draft.trim()
    if (next !== '' && next !== session.title) onRename(next)
  }

  return (
    <div className="sessionbar">
      <div className="sessionbar__info">
        {editing ? (
          <input
            ref={inputRef}
            className="input"
            style={{ fontSize: 13.5, padding: '3px 7px' }}
            value={draft}
            aria-label="Session title"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setEditing(false)
                setDraft(session.title)
              }
            }}
            onBlur={commit}
          />
        ) : (
          <span className="sessionbar__title" title={session.title}>
            {session.title || 'Untitled session'}
          </span>
        )}
        <span className="sessionbar__meta">
          {status?.type === 'busy' ? (
            <span className="badge badge--busy">
              <span className="spinner" style={{ width: 9, height: 9 }} />
              working
            </span>
          ) : null}
          <span title="Last activity on the OpenCode server">
            {relativeTime(session.time.updated)}
          </span>
          <span className="mono" title={session.directory}>
            {session.directory}
          </span>
        </span>
      </div>

      <div className="sessionbar__actions">
        {confirming ? (
          <>
            <span className="muted" style={{ fontSize: 12 }}>
              Delete session?
            </span>
            <button type="button" className="btn btn--danger btn--small" onClick={onDelete}>
              Delete
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="iconbtn"
              onClick={onNewSession}
              disabled={!connected}
              title="New session"
              aria-label="New session"
            >
              <IconPlus size={16} />
            </button>
            <button
              type="button"
              className="iconbtn"
              onClick={() => {
                setDraft(session.title)
                setEditing(true)
              }}
              title="Rename session"
              aria-label="Rename session"
            >
              <IconEdit size={15} />
            </button>
            <button
              type="button"
              className={`iconbtn ${activityOpen ? 'iconbtn--active' : ''}`}
              onClick={onToggleActivity}
              title="File activity"
              aria-label="Toggle file activity"
              aria-pressed={activityOpen}
            >
              <IconFolder size={16} />
              {fileCount > 0 ? (
                <span style={{ fontSize: 10.5, marginLeft: 2 }}>{fileCount}</span>
              ) : null}
            </button>
            <button
              type="button"
              className="iconbtn"
              onClick={() => setConfirming(true)}
              title="Delete session"
              aria-label="Delete session"
            >
              <IconTrash size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
