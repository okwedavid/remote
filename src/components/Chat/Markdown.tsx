import { memo } from 'react'
import type { ReactElement, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'

interface CodeElementProps {
  className?: string
  children?: ReactNode
}

/** Fenced blocks are rendered by `pre`; inline code stays inline. */
function extractBlock(children: ReactNode): { code: string; language?: string } | null {
  const child = Array.isArray(children) ? children[0] : children
  if (!child || typeof child !== 'object') return null
  const element = child as ReactElement<CodeElementProps>
  const props = element.props
  if (!props) return null
  const className = typeof props.className === 'string' ? props.className : ''
  const match = /language-([\w+#.-]+)/.exec(className)
  const raw = String(props.children ?? '').replace(/\n$/, '')
  if (raw === '') return null
  return match?.[1] ? { code: raw, language: match[1] } : { code: raw }
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => {
            const block = extractBlock(children)
            if (!block) return <pre>{children}</pre>
            return <CodeBlock code={block.code} language={block.language} />
          },
          a: ({ href, children, ...rest }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" {...rest}>
              {children}
            </a>
          ),
          img: ({ src, alt }) => <img src={src} alt={alt ?? ''} loading="lazy" />,
          table: ({ children }) => (
            <div style={{ overflowX: 'auto' }}>
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
