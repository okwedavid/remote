import { useEffect, useRef, useState } from 'react'
import type { Session, SessionStatus } from '../../types/opencode'
import { relativeTime } from '../../lib/format'
import { IconCheck, IconEdit, IconTrash } from '../common/Icons'

export interface SessionItemProps {
  session: Session
  active: boolean
  status: SessionStatus | null
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

export function SessionItem({
  session,
  active,
  status,
  onSelect,
  onRename,
  onDelete,
}: SessionItemProps) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(session.title)
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  const busy = status?.type === 'busy'

  const commitRename = (): void => {
    setRenaming(false)
    const next = draft.trim()
    if (next !== '' && next !== session.title) onRename(next)
  }

  if (renaming) {
    return (
      <div className={`session ${active ? 'session--active' : ''}`}>
        <div className="session__row">
          <input
            ref={inputRef}
            className="input session__rename"
            value={draft}
            aria-label="Session title"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRename()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setRenaming(false)
                setDraft(session.title)
              }
            }}
            onBlur={commitRename}
          />
          <button
            type="button"
            className="iconbtn"
            onMouseDown={(event) => event.preventDefault()}
            onClick={commitRename}
            aria-label="Save session title"
          >
            <IconCheck size={14} />
          </button>
        </div>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className={`session ${active ? 'session--active' : ''}`}>
        <div className="session__row">
          <span className="session__title">Delete session?</span>
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
        </div>
        <span className="session__meta">
          <span>Deleted on the OpenCode server, including its history.</span>
        </span>
      </div>
    )
  }

  return (
    <div className={`session ${active ? 'session--active' : ''}`}>
      <div className="session__row">
        <button
          type="button"
          className="session__title session__select"
          onClick={onSelect}
          aria-current={active ? 'true' : undefined}
          title={session.title}
          style={{
            background: 'none',
            border: 0,
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
            font: 'inherit',
            color: 'inherit',
          }}
        >
          {session.title || 'Untitled session'}
        </button>
        <div className="session__actions">
          <button
            type="button"
            className="iconbtn"
            onClick={() => {
              setDraft(session.title)
              setRenaming(true)
            }}
            aria-label={`Rename ${session.title}`}
            title="Rename"
          >
            <IconEdit size={13} />
          </button>
          <button
            type="button"
            className="iconbtn"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${session.title}`}
            title="Delete"
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>
      <div className="session__meta">
        {busy ? (
          <>
            <span className="session__dot" aria-hidden="true" />
            <span>working…</span>
          </>
        ) : null}
        <span>{relativeTime(session.time.updated)}</span>
        {session.summary && session.summary.files > 0 ? (
          <span title="Files changed in this session">
            {session.summary.files} file{session.summary.files === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
    </div>
  )
}
