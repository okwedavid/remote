import { useState } from 'react'
import type { Part } from '../../types/opencode'
import { basename, shortenPath, truncate } from '../../lib/format'
import { ToolActivity } from '../ToolActivity/ToolActivity'
import { IconChevron, IconFile, IconInfo } from '../common/Icons'
import { Markdown } from './Markdown'

export interface PartViewProps {
  part: Part
  showReasoning: boolean
  onOpenFile: (path: string) => void
}

function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false)
  const expanded = open || streaming
  if (text.trim() === '') return null

  return (
    <div className="reasoning">
      <button
        type="button"
        className="reasoning__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={expanded}
      >
        <IconChevron size={12} open={expanded} />
        {streaming ? 'Thinking…' : 'Reasoning'}
      </button>
      {expanded ? <div className="reasoning__text">{text}</div> : null}
    </div>
  )
}

function FileChip({ path, onOpenFile }: { path: string; onOpenFile: (path: string) => void }) {
  return (
    <button
      type="button"
      className="btn btn--small"
      onClick={() => onOpenFile(path)}
      title={path}
      style={{ maxWidth: '100%' }}
    >
      <IconFile size={13} />
      <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {shortenPath(path, 4)}
      </span>
    </button>
  )
}

export function PartView({ part, showReasoning, onOpenFile }: PartViewProps) {
  switch (part.type) {
    case 'text': {
      if (part.text === '') return null
      return <Markdown text={part.text} />
    }

    case 'reasoning': {
      if (!showReasoning) return null
      return <Reasoning text={part.text} streaming={part.time?.end === undefined} />
    }

    case 'tool':
      return <ToolActivity part={part} />

    case 'file': {
      const label = part.filename ?? basename(part.url)
      return (
        <div className="btn btn--small" style={{ cursor: 'default', maxWidth: '100%' }}>
          <IconFile size={13} />
          <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </span>
          {part.mime ? <span className="muted">{part.mime}</span> : null}
        </div>
      )
    }

    case 'patch': {
      const files = part.files ?? []
      if (files.length === 0) return null
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {files.length === 1 ? 'Changed' : `Changed ${files.length} files`}
          </span>
          {files.slice(0, 6).map((file) => (
            <FileChip key={file} path={file} onOpenFile={onOpenFile} />
          ))}
          {files.length > 6 ? <span className="muted">+{files.length - 6} more</span> : null}
        </div>
      )
    }

    case 'agent': {
      return (
        <span className="muted" style={{ fontSize: 12 }}>
          agent <code className="mono">{part.name}</code>
        </span>
      )
    }

    case 'subtask': {
      return (
        <div className="banner" style={{ fontSize: 12.5 }}>
          <span style={{ color: 'var(--text-dim)', display: 'flex' }}>
            <IconInfo size={15} />
          </span>
          <div className="banner__body">
            <span className="banner__title">Subagent: {part.agent}</span>
            <span className="banner__text">{truncate(part.description || part.prompt, 200)}</span>
          </div>
        </div>
      )
    }

    case 'retry': {
      return (
        <div className="banner banner--warn">
          <span style={{ color: 'var(--warn)', display: 'flex' }}>
            <IconInfo size={15} />
          </span>
          <div className="banner__body">
            <span className="banner__title">Retrying (attempt {part.attempt})</span>
            <span className="banner__text">{truncate(part.error.data.message ?? 'provider error', 200)}</span>
          </div>
        </div>
      )
    }

    case 'compaction': {
      return (
        <span className="muted" style={{ fontSize: 12 }}>
          {part.auto ? 'Context compacted automatically' : 'Context compacted'}
        </span>
      )
    }

    case 'step-start':
    case 'step-finish':
    case 'snapshot':
      return null

    default:
      return null
  }
}
