import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  MessageWithParts,
  OptimisticMessage,
  PermissionRequest,
  RemoteErrorInfo,
} from '../../types/opencode'
import type { PermissionResponse } from '../../lib/transport'
import { limits } from '../../config'
import { describeTool, formatClock, formatDuration, truncate } from '../../lib/format'
import { useTicker } from '../../hooks/useTicker'
import { EmptyState } from '../common/EmptyState'
import { ErrorBanner } from '../common/ErrorBanner'
import { IconArrowDown, IconChat, IconPlug, IconPlus } from '../common/Icons'
import { MessageItem } from './MessageItem'
import { PermissionPrompt } from './PermissionPrompt'

export interface ChatProps {
  messages: MessageWithParts[]
  optimistic: OptimisticMessage[]
  permissions: PermissionRequest[]
  loading: boolean
  error: RemoteErrorInfo | null
  connected: boolean
  hasSession: boolean
  showReasoning: boolean
  busy: boolean
  busySince: number | null
  onConnect: () => void
  onCreateSession: () => void
  onOpenSettings: () => void
  onRetry: () => void
  onDismissError: () => void
  onReplyPermission: (permissionID: string, response: PermissionResponse) => void
  onOpenFile: (path: string) => void
  sessionId: string | null
}

function currentActivity(messages: MessageWithParts[]): string | null {
  const last = messages[messages.length - 1]
  if (!last || last.info.role !== 'assistant') return null
  for (let index = last.parts.length - 1; index >= 0; index -= 1) {
    const part = last.parts[index]
    if (!part) continue
    if (part.type === 'tool' && (part.state.status === 'running' || part.state.status === 'pending')) {
      const display = describeTool(part.tool, part.state.input as Record<string, unknown>)
      return display.label
    }
    if (part.type === 'text' && part.time?.end === undefined && part.text !== '') {
      return 'Writing response…'
    }
    if (part.type === 'reasoning' && part.time?.end === undefined) return 'Thinking…'
  }
  return null
}

function WorkingIndicator({ since, activity }: { since: number | null; activity: string | null }) {
  const now = useTicker(true)
  const elapsed = since ? formatDuration(now - since) : null
  return (
    <p className="msg__pending" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {activity ? truncate(activity, 64) : 'Working…'}
      {elapsed ? <span className="muted">· {elapsed}</span> : null}
    </p>
  )
}

export function Chat({
  messages,
  optimistic,
  permissions,
  loading,
  error,
  connected,
  hasSession,
  showReasoning,
  busy,
  busySince,
  onConnect,
  onCreateSession,
  onOpenSettings,
  onRetry,
  onDismissError,
  onReplyPermission,
  onOpenFile,
  sessionId,
}: ChatProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
    stickRef.current = true
    setAtBottom(true)
  }, [])

  const handleScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    const near = distance < 90
    stickRef.current = near
    setAtBottom(near)
  }, [])

  // Follow the stream while the user is parked at the bottom.
  useEffect(() => {
    if (stickRef.current) {
      const element = scrollRef.current
      if (element) element.scrollTop = element.scrollHeight
    }
  }, [messages, optimistic, permissions, busy])

  // Land at the newest message on mount (the component is keyed by session,
  // so switching sessions mounts a fresh conversation view).
  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [sessionId])

  const activity = useMemo(() => currentActivity(messages), [messages])
  const hidden = messages.length - limits.visibleMessages
  const visible = !showAll && hidden > 0 ? messages.slice(hidden) : messages

  const hasConversation = messages.length > 0 || optimistic.length > 0 || permissions.length > 0

  let empty: React.ReactNode = null
  if (!connected) {
    empty = (
      <EmptyState
        icon={<IconPlug size={22} />}
        title="Connect to your OpenCode server to begin."
        text="Remote talks straight from this browser to your PC. Configure the server URL, then connect."
      >
        <button type="button" className="btn btn--primary" onClick={onConnect}>
          Connect
        </button>
        <button type="button" className="btn" onClick={onOpenSettings}>
          Connection settings
        </button>
      </EmptyState>
    )
  } else if (!hasSession) {
    empty = (
      <EmptyState
        icon={<IconChat size={22} />}
        title="Start a new OpenCode session."
        text="Sessions are created on your OpenCode server — Remote never keeps its own database."
      >
        <button type="button" className="btn btn--primary" onClick={onCreateSession}>
          <IconPlus size={15} />
          New session
        </button>
      </EmptyState>
    )
  } else if (!hasConversation && !loading) {
    empty = (
      <EmptyState
        icon={<IconChat size={22} />}
        title="Send a prompt to your local OpenCode agent."
        text="Ask a question, request a change, or run a command against your project."
      />
    )
  }

  return (
    <section className="chat" aria-label="Conversation">
      <div className="chat__scroll" ref={scrollRef} onScroll={handleScroll}>
        <div className="chat__list" role="log" aria-live="polite" aria-relevant="additions text">
          {empty}

          {loading && !hasConversation ? <p className="chat__loading">Loading history…</p> : null}

          {error && connected ? (
            <ErrorBanner error={error} onRetry={onRetry} onDismiss={onDismissError} />
          ) : null}

          {hidden > 0 && !showAll ? (
            <button
              type="button"
              className="btn btn--ghost btn--small chat__older"
              onClick={() => setShowAll(true)}
            >
              Show {hidden} older {hidden === 1 ? 'message' : 'messages'}
            </button>
          ) : null}

          {visible.map((entry) => (
            <MessageItem
              key={entry.info.id}
              entry={entry}
              showReasoning={showReasoning}
              onOpenFile={onOpenFile}
              onRetry={onRetry}
            />
          ))}

          {optimistic.map((entry) => (
            <article className="msg msg--user" key={entry.id} aria-label="Your message (sending)">
              <div className="msg__head">
                <span>You</span>
                <span>{formatClock(entry.createdAt)}</span>
                <span className="muted">sending…</span>
              </div>
              <div className="msg__body">{entry.text}</div>
            </article>
          ))}

          {permissions.map((request) => (
            <PermissionPrompt
              key={request.id}
              request={request}
              onRespond={(response) => onReplyPermission(request.id, response)}
            />
          ))}

          {busy && hasSession ? <WorkingIndicator since={busySince} activity={activity} /> : null}
        </div>
      </div>

      {!atBottom && hasConversation ? (
        <button type="button" className="chat__jump" onClick={scrollToBottom}>
          <IconArrowDown size={13} /> Jump to latest
        </button>
      ) : null}
    </section>
  )
}
