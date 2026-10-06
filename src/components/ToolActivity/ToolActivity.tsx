import { useMemo, useState } from 'react'
import type { ToolPart } from '../../types/opencode'
import { limits } from '../../config'
import { describeTool, formatDuration, truncate } from '../../lib/format'
import { useTicker } from '../../hooks/useTicker'
import { IconChevron, IconFile, IconSearch, IconTerminal, IconWrench } from '../common/Icons'

export interface ToolActivityProps {
  part: ToolPart
}

function toolIcon(tool: string) {
  const name = tool.toLowerCase()
  if (name === 'bash' || name === 'shell') return <IconTerminal size={14} />
  if (name === 'read' || name === 'write' || name === 'edit' || name === 'multiedit' || name === 'patch') {
    return <IconFile size={14} />
  }
  if (name === 'grep' || name === 'glob' || name === 'list') return <IconSearch size={14} />
  return <IconWrench size={14} />
}

function renderArgs(input: Record<string, unknown> | undefined): { key: string; value: string }[] {
  if (!input) return []
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 8)
    .map(([key, value]) => ({
      key,
      value:
        typeof value === 'string'
          ? truncate(value, 320)
          : truncate(JSON.stringify(value, null, 1) ?? String(value), 320),
    }))
}

/**
 * One tool call, collapsed to a single readable line:
 * `Reading src/app.ts` · `Running npm test`.
 */
export function ToolActivity({ part }: ToolActivityProps) {
  const { state } = part
  const running = state.status === 'running'
  const pending = state.status === 'pending'
  const now = useTicker(running)
  const [open, setOpen] = useState(state.status === 'error')
  const [showAllOutput, setShowAllOutput] = useState(false)

  const display = useMemo(
    () => describeTool(part.tool, state.input as Record<string, unknown> | undefined),
    [part.tool, state.input],
  )

  const title = 'title' in state && state.title ? state.title : null

  const startedAt = state.status === 'pending' ? 0 : state.time.start
  const finishedAt =
    state.status === 'completed' || state.status === 'error' ? state.time.end : undefined
  const elapsed = running && startedAt > 0 ? now - startedAt : 0
  const duration = finishedAt !== undefined ? formatDuration(finishedAt - startedAt) : null

  const outputLines =
    state.status === 'completed' ? state.output.split('\n') : []
  const output = showAllOutput ? outputLines.join('\n') : outputLines.slice(0, limits.toolOutputLines).join('\n')
  const outputClipped = outputLines.length > limits.toolOutputLines

  const args = renderArgs(state.input as Record<string, unknown> | undefined)
  const hasDetails = args.length > 0 || (state.status === 'completed' && output !== '') || state.status === 'error'

  return (
    <div className="tool">
      <button
        type="button"
        className="tool__row"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!hasDetails}
      >
        <span className="tool__icon">{toolIcon(part.tool)}</span>
        <span className="tool__label">
          <span className="tool__verb">{display.verb} </span>
          {display.target ? <span className="tool__target">{display.target}</span> : null}
        </span>
        <span
          className={`tool__status ${state.status === 'error' ? 'tool__status--error' : ''} ${
            running ? 'tool__status--running' : ''
          }`}
        >
          {pending ? (
            'queued'
          ) : running ? (
            <>
              <span className="spinner" style={{ width: 10, height: 10 }} />
              {elapsed > 1500 ? formatDuration(elapsed) : 'running'}
            </>
          ) : state.status === 'error' ? (
            'failed'
          ) : (
            duration ?? 'done'
          )}
        </span>
        {hasDetails ? <IconChevron size={13} open={open} className="tool__chevron" /> : null}
      </button>

      {open && hasDetails ? (
        <div className="tool__body">
          {title && state.status === 'completed' ? (
            <div className="tool__section">
              <div className="tool__section-title">Result</div>
              <div>{title}</div>
            </div>
          ) : null}

          {args.length > 0 ? (
            <div className="tool__section">
              <div className="tool__section-title">Input</div>
              <dl className="tool__args">
                {args.map((arg) => (
                  <div key={arg.key} style={{ display: 'contents' }}>
                    <dt>{arg.key}</dt>
                    <dd>{arg.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {state.status === 'completed' && output !== '' ? (
            <div className="tool__section">
              <div className="tool__section-title">Output</div>
              <pre className="tool__pre">{output}</pre>
              {outputClipped ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => setShowAllOutput((value) => !value)}
                >
                  {showAllOutput ? 'Show less' : `Show ${outputLines.length - limits.toolOutputLines} more lines`}
                </button>
              ) : null}
            </div>
          ) : null}

          {state.status === 'error' ? (
            <div className="tool__section">
              <div className="tool__section-title">Error</div>
              <pre className="tool__pre tool__pre--error">{truncate(state.error, 2000)}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
