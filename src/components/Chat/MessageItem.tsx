import { memo, useMemo } from 'react'
import type { MessageWithParts } from '../../types/opencode'
import { formatClock, formatCost, formatCount, formatDuration } from '../../lib/format'
import { describeAssistantError } from '../../lib/errors'
import { ErrorBanner } from '../common/ErrorBanner'
import { PartView } from './PartView'

export interface MessageItemProps {
  entry: MessageWithParts
  showReasoning: boolean
  onOpenFile: (path: string) => void
  onRetry?: () => void
}

function textOf(entry: MessageWithParts): string {
  return entry.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n\n')
    .trim()
}

export const MessageItem = memo(function MessageItem({
  entry,
  showReasoning,
  onOpenFile,
  onRetry,
}: MessageItemProps) {
  const { info, parts } = entry

  const error = useMemo(
    () => (info.role === 'assistant' && info.error ? describeAssistantError(info.error) : null),
    [info],
  )

  if (info.role === 'user') {
    const text = textOf(entry)
    return (
      <article className="msg msg--user" aria-label="Your message">
        <div className="msg__head">
          <span>You</span>
          <span>{formatClock(info.time.created)}</span>
        </div>
        <div className="msg__body">{text}</div>
      </article>
    )
  }

  const completed = info.time.completed
  const duration = completed ? completed - info.time.created : null
  const tokens = info.tokens.input + info.tokens.output + info.tokens.reasoning

  return (
    <article className="msg msg--assistant" aria-label="OpenCode response">
      <div className="msg__head msg__head--assistant">
        <span>OpenCode</span>
        <span className="mono muted">
          {info.providerID}/{info.modelID}
        </span>
        {info.mode ? <span className="muted">· {info.mode}</span> : null}
      </div>

      <div className="msg__body">
        {parts.map((part) => (
          <PartView
            key={part.id}
            part={part}
            showReasoning={showReasoning}
            onOpenFile={onOpenFile}
          />
        ))}

        {error ? (
          error.code === 'aborted' ? (
            <p className="msg__pending">
              <span aria-hidden="true">■</span> {error.message}
            </p>
          ) : (
            <ErrorBanner error={error.toInfo()} onRetry={onRetry} retryLabel="Retry" />
          )
        ) : null}

        {!completed && !error ? (
          <p className="msg__pending">
            <span className="spinner" aria-hidden="true" /> working…
          </p>
        ) : null}
      </div>

      {completed ? (
        <div className="msg__meta">
          {duration !== null ? <span>{formatDuration(duration)}</span> : null}
          {tokens > 0 ? <span>{formatCount(tokens)} tokens</span> : null}
          {info.cost > 0 ? <span>{formatCost(info.cost)}</span> : null}
          {info.tokens.cache.read > 0 ? (
            <span>{formatCount(info.tokens.cache.read)} cached</span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
})
