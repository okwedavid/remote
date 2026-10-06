/**
 * Small formatting helpers. No dependencies — everything here is pure and
 * unit-tested.
 */
import type { FileChange, FileDiff, FileChangeStatus } from '../types/opencode'

export function basename(path: string): string {
  const clean = path.replace(/[\\/]+$/, '')
  const parts = clean.split(/[\\/]/)
  return parts[parts.length - 1] || clean
}

export function dirname(path: string): string {
  const clean = path.replace(/[\\/]+$/, '')
  const index = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return index <= 0 ? '' : clean.slice(0, index)
}

/** `src/components/chat/MessageItem.tsx` → `…/chat/MessageItem.tsx` */
export function shortenPath(path: string, maxSegments = 3): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  if (segments.length <= maxSegments) return segments.join('/')
  return `…/${segments.slice(-maxSegments).join('/')}`
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  const diff = now - timestamp
  if (diff < 0) return 'just now'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest.toString().padStart(2, '0')}s`
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

export function formatCost(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0'
  if (value < 0.01) return `$${value.toFixed(5)}`
  return `$${value.toFixed(3)}`
}

export function formatClock(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural
}

/** `git diff` style `+12 −3`. */
export function formatDiffStat(additions: number, deletions: number): string {
  return `+${additions} −${deletions}`
}

/**
 * OpenCode reports `before`/`after` file contents; derive what actually
 * happened for the file activity panel.
 */
export function fileChangeFromDiff(diff: FileDiff): FileChange {
  const status: FileChangeStatus =
    diff.before === '' && diff.after !== ''
      ? 'created'
      : diff.after === '' && diff.before !== ''
        ? 'deleted'
        : 'modified'
  const change: FileChange = {
    path: diff.file,
    status,
    additions: diff.additions ?? 0,
    deletions: diff.deletions ?? 0,
  }
  if (diff.before !== undefined) change.before = diff.before
  if (diff.after !== undefined) change.after = diff.after
  return change
}

export function statusLabel(status: FileChangeStatus): string {
  switch (status) {
    case 'created':
      return 'Created'
    case 'deleted':
      return 'Deleted'
    default:
      return 'Modified'
  }
}

export interface ToolDisplay {
  verb: string
  target: string
  /** Single-line summary such as `Running npm test`. */
  label: string
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

function readInput(input: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!input) return undefined
  return firstString(...keys.map((key) => input[key]))
}

/**
 * Turn a raw OpenCode tool call into something compact and readable:
 * `Reading src/app.ts`, `Running npm test`, `Editing README.md`.
 */
export function describeTool(tool: string, input?: Record<string, unknown>): ToolDisplay {
  const name = (tool || '').toLowerCase()
  const path = readInput(input, 'filePath', 'file', 'path', 'filename')
  const shortPath = path ? shortenPath(path) : ''
  const command = readInput(input, 'command', 'cmd')
  const pattern = readInput(input, 'pattern', 'query')
  const url = readInput(input, 'url')

  switch (name) {
    case 'read':
    case 'read_file':
      return build('Reading', shortPath || 'file')
    case 'write':
    case 'write_file':
      return build('Writing', shortPath || 'file')
    case 'edit':
    case 'patch':
    case 'multiedit':
    case 'str_replace':
      return build('Editing', shortPath || 'file')
    case 'bash':
    case 'shell':
      return build('Running', command ? truncate(command, 80) : 'command')
    case 'grep':
    case 'search':
      return build('Searching for', pattern ? `“${truncate(pattern, 48)}”` : 'text')
    case 'glob':
    case 'list':
    case 'ls':
      return build('Listing', pattern ? truncate(pattern, 48) : shortPath || 'files')
    case 'webfetch':
    case 'fetch':
      return build('Fetching', url ? truncate(url, 60) : 'URL')
    case 'task':
      return build('Delegating to', readInput(input, 'description', 'agent') ?? 'subagent')
    case 'todowrite':
    case 'todoread':
      return build('Updating', 'task list')
    default:
      return build(name ? `Using ${name}` : 'Using tool', shortPath)
  }

  function build(verb: string, target: string): ToolDisplay {
    return {
      verb,
      target: target || '',
      label: target ? `${verb} ${target}` : verb,
    }
  }
}
