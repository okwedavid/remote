/**
 * Minimal line diff for the file activity panel.
 *
 * The panel only needs a compact, readable unified view of what OpenCode
 * changed — not a full diff library. Common prefix/suffix are trimmed first,
 * then an LCS table is built for the remainder (bounded so the UI stays fast;
 * oversized inputs degrade to a simple replace block).
 */
import { limits } from '../config'

export interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  text: string
  oldNo?: number
  newNo?: number
}

export interface DiffResult {
  lines: DiffLine[]
  additions: number
  deletions: number
  truncated: boolean
}

const MAX_SIDE = 800

function splitLines(text: string): string[] {
  if (text === '') return []
  return text.replace(/\r\n/g, '\n').split('\n')
}

export function diffLines(before: string, after: string): DiffResult {
  const a = splitLines(before)
  const b = splitLines(after)

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1

  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }

  const middleA = a.slice(start, endA)
  const middleB = b.slice(start, endB)

  let additions = 0
  let deletions = 0
  let truncated = false
  const middle: DiffLine[] = []

  if (middleA.length > MAX_SIDE || middleB.length > MAX_SIDE) {
    truncated = true
    const delCount = Math.min(middleA.length, MAX_SIDE)
    for (let k = 0; k < delCount; k += 1) {
      middle.push({ type: 'del', text: middleA[k] ?? '', oldNo: start + k + 1 })
      deletions += 1
    }
    const addCount = Math.min(middleB.length, MAX_SIDE)
    for (let k = 0; k < addCount; k += 1) {
      middle.push({ type: 'add', text: middleB[k] ?? '', newNo: start + k + 1 })
      additions += 1
    }
  } else {
    // Classic LCS table.
    const rows = middleA.length
    const cols = middleB.length
    const table: Uint32Array = new Uint32Array((rows + 1) * (cols + 1))
    for (let i = rows - 1; i >= 0; i -= 1) {
      for (let j = cols - 1; j >= 0; j -= 1) {
        const index = i * (cols + 1) + j
        table[index] =
          middleA[i] === middleB[j]
            ? (table[(i + 1) * (cols + 1) + j + 1] ?? 0) + 1
            : Math.max(table[(i + 1) * (cols + 1) + j] ?? 0, table[i * (cols + 1) + j + 1] ?? 0)
      }
    }

    let i = 0
    let j = 0
    while (i < rows && j < cols) {
      if (middleA[i] === middleB[j]) {
        middle.push({ type: 'ctx', text: middleA[i] ?? '' })
        i += 1
        j += 1
      } else if ((table[(i + 1) * (cols + 1) + j] ?? 0) >= (table[i * (cols + 1) + j + 1] ?? 0)) {
        middle.push({ type: 'del', text: middleA[i] ?? '' })
        deletions += 1
        i += 1
      } else {
        middle.push({ type: 'add', text: middleB[j] ?? '' })
        additions += 1
        j += 1
      }
    }
    while (i < rows) {
      middle.push({ type: 'del', text: middleA[i] ?? '' })
      deletions += 1
      i += 1
    }
    while (j < cols) {
      middle.push({ type: 'add', text: middleB[j] ?? '' })
      additions += 1
      j += 1
    }
  }

  const lines: DiffLine[] = []
  let oldNo = 1
  let newNo = 1

  const leading = Math.min(3, start)
  for (let k = start - leading; k < start; k += 1) {
    lines.push({ type: 'ctx', text: a[k] ?? '', oldNo: k + 1, newNo: k + 1 })
    oldNo = k + 2
    newNo = k + 2
  }

  for (const line of middle) {
    if (line.type === 'del') {
      lines.push({ ...line, oldNo })
      oldNo += 1
    } else if (line.type === 'add') {
      lines.push({ ...line, newNo })
      newNo += 1
    } else {
      lines.push({ ...line, oldNo, newNo })
      oldNo += 1
      newNo += 1
    }
  }

  const trailing = Math.min(3, a.length - endA)
  for (let k = endA; k < endA + trailing; k += 1) {
    lines.push({ type: 'ctx', text: a[k] ?? '', oldNo, newNo })
    oldNo += 1
    newNo += 1
  }

  const overflow = lines.length > limits.diffMaxLines
  return {
    lines: overflow ? lines.slice(0, limits.diffMaxLines) : lines,
    additions,
    deletions,
    truncated: truncated || overflow,
  }
}
