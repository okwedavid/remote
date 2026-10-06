import { describe, expect, it } from 'vitest'
import {
  basename,
  describeTool,
  fileChangeFromDiff,
  formatCost,
  formatCount,
  formatDiffStat,
  formatDuration,
  relativeTime,
  shortenPath,
  statusLabel,
  truncate,
} from './format'

describe('path helpers', () => {
  it('extracts basenames', () => {
    expect(basename('/home/dev/project/src/app.ts')).toBe('app.ts')
    expect(basename('src\\components\\Chat.tsx')).toBe('Chat.tsx')
  })

  it('shortens long paths from the left', () => {
    expect(shortenPath('src/components/chat/MessageItem.tsx', 2)).toBe('…/chat/MessageItem.tsx')
    expect(shortenPath('src/app.ts', 3)).toBe('src/app.ts')
  })
})

describe('time helpers', () => {
  const now = 1_700_000_000_000

  it('describes recent activity', () => {
    expect(relativeTime(now - 5_000, now)).toBe('just now')
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe('yesterday')
  })

  it('formats durations', () => {
    expect(formatDuration(420)).toBe('420ms')
    expect(formatDuration(2_400)).toBe('2.4s')
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(125_000)).toBe('2m 05s')
  })

  it('formats counts and costs', () => {
    expect(formatCount(950)).toBe('950')
    expect(formatCount(15_400)).toBe('15k')
    expect(formatCount(9_400)).toBe('9.4k')
    expect(formatCost(0)).toBe('$0')
    expect(formatCost(0.0042)).toBe('$0.00420')
    expect(formatCost(1.5)).toBe('$1.500')
  })
})

describe('describeTool', () => {
  it('reads a file', () => {
    const display = describeTool('read', { filePath: '/home/dev/project/src/app.ts' })
    expect(display.label).toBe('Reading …/project/src/app.ts')
  })

  it('runs a command', () => {
    const display = describeTool('bash', { command: 'npm test -- --watch=false' })
    expect(display.label).toBe('Running npm test -- --watch=false')
  })

  it('edits a file', () => {
    expect(describeTool('edit', { filePath: 'README.md' }).label).toBe('Editing README.md')
  })

  it('searches for text', () => {
    expect(describeTool('grep', { pattern: 'promptAsync' }).label).toBe(
      'Searching for “promptAsync”',
    )
  })

  it('truncates very long commands', () => {
    const display = describeTool('bash', { command: 'x'.repeat(200) })
    expect(display.target.length).toBeLessThanOrEqual(80)
    expect(display.target.endsWith('…')).toBe(true)
  })

  it('falls back for unknown tools', () => {
    expect(describeTool('webfetch', { url: 'https://example.com' }).label).toBe(
      'Fetching https://example.com',
    )
    expect(describeTool('mystery', {}).label).toBe('Using mystery')
  })
})

describe('file change helpers', () => {
  it('detects created, deleted and modified files', () => {
    expect(fileChangeFromDiff({ file: 'a.ts', before: '', after: 'x', additions: 1, deletions: 0 }).status).toBe('created')
    expect(fileChangeFromDiff({ file: 'a.ts', before: 'x', after: '', additions: 0, deletions: 1 }).status).toBe('deleted')
    expect(fileChangeFromDiff({ file: 'a.ts', before: 'x', after: 'y', additions: 1, deletions: 1 }).status).toBe('modified')
  })

  it('labels statuses and diff stats', () => {
    expect(statusLabel('created')).toBe('Created')
    expect(statusLabel('modified')).toBe('Modified')
    expect(formatDiffStat(12, 3)).toBe('+12 −3')
  })
})

describe('truncate', () => {
  it('adds an ellipsis only when needed', () => {
    expect(truncate('short', 10)).toBe('short')
    expect(truncate('abcdefghijklmno', 6)).toBe('abcde…')
  })
})
