import { describe, expect, it } from 'vitest'
import { diffLines } from './diff'

describe('diffLines', () => {
  it('returns nothing for identical input', () => {
    const result = diffLines('a\nb\nc', 'a\nb\nc')
    expect(result.lines.every((line) => line.type === 'ctx')).toBe(true)
    expect(result.additions).toBe(0)
    expect(result.deletions).toBe(0)
  })

  it('detects an added line', () => {
    const result = diffLines('one\ntwo', 'one\ntwo\nthree')
    expect(result.additions).toBe(1)
    expect(result.deletions).toBe(0)
    const added = result.lines.filter((line) => line.type === 'add')
    expect(added.map((line) => line.text)).toEqual(['three'])
    expect(added[0]?.newNo).toBe(3)
  })

  it('detects a removed line', () => {
    const result = diffLines('one\ntwo\nthree', 'one\nthree')
    expect(result.deletions).toBe(1)
    expect(result.lines.some((line) => line.type === 'del' && line.text === 'two')).toBe(true)
  })

  it('detects a changed line as one removal plus one addition', () => {
    const result = diffLines('const a = 1', 'const a = 2')
    expect(result.additions).toBe(1)
    expect(result.deletions).toBe(1)
  })

  it('reports a brand new file', () => {
    const result = diffLines('', 'line one\nline two')
    expect(result.additions).toBe(2)
    expect(result.deletions).toBe(0)
  })

  it('reports a deleted file', () => {
    const result = diffLines('line one\nline two', '')
    expect(result.deletions).toBe(2)
    expect(result.additions).toBe(0)
  })

  it('keeps a little context around the change', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].join('\n')
    const after = ['a', 'b', 'c', 'X', 'e', 'f', 'g'].join('\n')
    const result = diffLines(before, after)
    expect(result.lines.filter((line) => line.type === 'ctx').length).toBeGreaterThanOrEqual(6)
  })

  it('numbers both sides consistently for edits in the middle', () => {
    const result = diffLines('a\nb\nc', 'a\nX\nc')
    const added = result.lines.find((line) => line.type === 'add')
    const removed = result.lines.find((line) => line.type === 'del')
    expect(removed?.oldNo).toBe(2)
    expect(added?.newNo).toBe(2)
  })

  it('truncates very large diffs', () => {
    const before = Array.from({ length: 1200 }, (_, index) => `old ${index}`).join('\n')
    const after = Array.from({ length: 1200 }, (_, index) => `new ${index}`).join('\n')
    const result = diffLines(before, after)
    expect(result.truncated).toBe(true)
    expect(result.lines.length).toBeLessThanOrEqual(600)
  })

  it('handles CRLF input', () => {
    const result = diffLines('a\r\nb', 'a\r\nb\r\nc')
    expect(result.additions).toBe(1)
  })
})
