import { useEffect, useMemo, useState } from 'react'
import { limits } from '../../config'
import { copyText } from '../../lib/clipboard'
import { escapeHtml, highlightCode, languageLabel } from '../../lib/highlight'
import { IconCheck, IconCopy } from '../common/Icons'

export interface CodeBlockProps {
  code: string
  language?: string
}

/**
 * Fenced code with on-demand syntax highlighting, a copy button and a
 * "show all" affordance for long blocks (keeps chat scannable).
 */
export function CodeBlock({ code, language }: CodeBlockProps) {
  const [html, setHtml] = useState<string>(() => escapeHtml(code))
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const lineCount = useMemo(() => code.split('\n').length, [code])
  const clipped = lineCount > limits.codePreviewLines && !expanded

  useEffect(() => {
    let cancelled = false
    void highlightCode(code, language).then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [code, language])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div className={`code ${clipped ? 'code--clipped' : ''}`}>
      <div className="code__header">
        <span className="code__lang">{languageLabel(language)}</span>
        <span className="sr-only" role="status">
          {copied ? 'Copied to clipboard' : ''}
        </span>
        <button
          type="button"
          className="iconbtn"
          style={{ width: 24, height: 24 }}
          onClick={() => {
            void copyText(code).then((ok) => setCopied(ok))
          }}
          aria-label={copied ? 'Copied' : 'Copy code'}
          title={copied ? 'Copied' : 'Copy'}
        >
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </button>
      </div>
      <div className="code__body">
        <pre className="code__pre">
          <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
      {lineCount > limits.codePreviewLines ? (
        <div className="code__footer">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Collapse' : `Show all ${lineCount} lines`}
          </button>
        </div>
      ) : null}
    </div>
  )
}
