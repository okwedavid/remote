import { useEffect, useMemo, useRef, useState } from 'react'
import type { FileChange, FileChangeStatus, FileContent, RemoteErrorInfo, Todo } from '../../types/opencode'
import { limits } from '../../config'
import { diffLines } from '../../lib/diff'
import { shortenPath, statusLabel } from '../../lib/format'
import { Drawer } from '../common/Drawer'
import { EmptyState } from '../common/EmptyState'
import { ErrorBanner } from '../common/ErrorBanner'
import { IconChevron, IconFile, IconList } from '../common/Icons'

export interface FileActivityProps {
  changes: FileChange[]
  todos: Todo[]
  loading: boolean
  error: RemoteErrorInfo | null
  embedded: boolean
  open: boolean
  onClose: () => void
  /** File to expand on mount — a file requested from the conversation. */
  focusPath: string | null
  onOpenFile: (path: string) => Promise<FileContent | undefined>
  onRefresh: () => void
}

const GROUPS: FileChangeStatus[] = ['modified', 'created', 'deleted']

function DiffView({ change }: { change: FileChange }) {
  const result = useMemo(
    () => diffLines(change.before ?? '', change.after ?? ''),
    [change.before, change.after],
  )

  if (result.lines.length === 0) {
    return <div className="diff__line diff--ctx">No textual diff available.</div>
  }

  return (
    <div className="activity__diff">
      {result.lines.map((line, index) => (
        <div key={`${index}-${line.type}`} className={`diff__line diff--${line.type}`}>
          <span className="diff__no">{line.oldNo ?? ''}</span>
          <span className="diff__no">{line.newNo ?? ''}</span>
          <span>
            {line.type === 'add' ? '+ ' : line.type === 'del' ? '- ' : '  '}
            {line.text}
          </span>
        </div>
      ))}
      {result.truncated ? (
        <div className="diff__line diff--ctx">… diff truncated for readability</div>
      ) : null}
    </div>
  )
}

function FileRow({
  change,
  expanded,
  onToggle,
  onOpenFile,
}: {
  change: FileChange
  expanded: boolean
  onToggle: () => void
  onOpenFile: (path: string) => Promise<FileContent | undefined>
}) {
  const [content, setContent] = useState<FileContent | null>(null)
  const [failed, setFailed] = useState(false)
  const requested = useRef(false)

  const hasDiff = change.before !== undefined && change.after !== undefined

  useEffect(() => {
    if (!expanded || hasDiff || requested.current) return
    requested.current = true
    void onOpenFile(change.path).then((result) => {
      if (result) setContent(result)
      else setFailed(true)
    })
  }, [expanded, hasDiff, onOpenFile, change.path])

  return (
    <div className="activity__item">
      <button
        type="button"
        className="activity__file"
        onClick={onToggle}
        aria-expanded={expanded}
        title={change.path}
      >
        <IconChevron size={12} open={expanded} />
        <span className="activity__path">{shortenPath(change.path, 4)}</span>
        {change.additions > 0 || change.deletions > 0 ? (
          <span className="activity__stat">
            <span className="activity__stat--add">+{change.additions}</span>{' '}
            <span className="activity__stat--del">−{change.deletions}</span>
          </span>
        ) : null}
      </button>

      {expanded ? (
        hasDiff ? (
          <DiffView change={change} />
        ) : failed ? (
          <div className="activity__diff">
            <div className="diff__line diff--ctx">No diff for this file.</div>
          </div>
        ) : content ? (
          <div className="activity__diff">
            {(content.content ?? '')
              .split('\n')
              .slice(0, limits.diffMaxLines)
              .map((line, index) => (
                <div className="diff__line diff--ctx" key={index}>
                  <span className="diff__no">{index + 1}</span>
                  <span>{line}</span>
                </div>
              ))}
          </div>
        ) : (
          <div className="activity__diff">
            <div className="diff__line diff--ctx">Loading…</div>
          </div>
        )
      ) : null}
    </div>
  )
}

function TodoList({ todos }: { todos: Todo[] }) {
  const marks: Record<string, string> = {
    completed: '✓',
    in_progress: '▸',
    cancelled: '×',
    pending: '○',
  }
  return (
    <ul className="todos" style={{ listStyle: 'none', margin: 0, padding: 2 }}>
      {todos.map((todo) => (
        <li key={todo.id} className={`todo todo--${todo.status}`}>
          <span className="todo__mark" aria-hidden="true">
            {marks[todo.status] ?? '○'}
          </span>
          <span>{todo.content}</span>
        </li>
      ))}
    </ul>
  )
}

function Panel(props: FileActivityProps) {
  const [tab, setTab] = useState<'files' | 'todos'>('files')
  // A file opened from the conversation arrives as the initial expansion;
  // App remounts this panel (via `key`) whenever a new file is requested.
  const [expanded, setExpanded] = useState<string | null>(props.focusPath)

  const grouped = GROUPS.map((status) => ({
    status,
    items: props.changes.filter((change) => change.status === status),
  })).filter((group) => group.items.length > 0)

  return (
    <>
      <div className="activity__tabs" role="tablist" aria-label="Session activity">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'files'}
          className={`activity__tab ${tab === 'files' ? 'activity__tab--active' : ''}`}
          onClick={() => setTab('files')}
        >
          Files {props.changes.length > 0 ? `(${props.changes.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'todos'}
          className={`activity__tab ${tab === 'todos' ? 'activity__tab--active' : ''}`}
          onClick={() => setTab('todos')}
        >
          Todos {props.todos.length > 0 ? `(${props.todos.length})` : ''}
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="iconbtn"
          onClick={props.onRefresh}
          title="Refresh"
          aria-label="Refresh activity"
        >
          {props.loading ? <span className="spinner" /> : <IconList size={15} />}
        </button>
      </div>

      <div className="activity__body">
        {props.error ? <ErrorBanner error={props.error} onRetry={props.onRefresh} /> : null}

        {tab === 'files' ? (
          props.changes.length === 0 ? (
            <EmptyState
              inline
              icon={<IconFile size={20} />}
              title="No file changes yet"
              text="Files OpenCode edits during this session show up here."
            />
          ) : (
            grouped.map((group) => (
              <div className="activity__group" key={group.status}>
                <div className="activity__group-title">{statusLabel(group.status)}</div>
                {group.items.map((change) => (
                  <FileRow
                    key={change.path}
                    change={change}
                    expanded={expanded === change.path}
                    onToggle={() =>
                      setExpanded((current) => (current === change.path ? null : change.path))
                    }
                    onOpenFile={props.onOpenFile}
                  />
                ))}
              </div>
            ))
          )
        ) : props.todos.length === 0 ? (
          <EmptyState
            inline
            title="No todos"
            text="OpenCode publishes its task list for this session here."
          />
        ) : (
          <TodoList todos={props.todos} />
        )}
      </div>
    </>
  )
}

export function FileActivity(props: FileActivityProps) {
  if (props.embedded) {
    return (
      <aside className="activity" aria-label="File activity">
        <Panel {...props} />
      </aside>
    )
  }

  return (
    <Drawer open={props.open} onClose={props.onClose} title="Activity">
      <Panel {...props} />
    </Drawer>
  )
}
