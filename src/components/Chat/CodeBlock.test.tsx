import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeBlock } from './CodeBlock'
import { limits } from '../../config'

const CODE = "const answer = await client.session.list()\nconsole.log(answer.length)"

function mockClipboard(implementation: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(implementation) },
  })
  return navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>
}

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
})

describe('CodeBlock', () => {
  it('renders the code and the language label', () => {
    render(<CodeBlock code={CODE} language="ts" />)
    expect(screen.getByText('typescript')).toBeInTheDocument()
    expect(screen.getByText(/const answer/)).toBeInTheDocument()
  })

  it('copies the code to the clipboard', async () => {
    const writeText = mockClipboard(async () => {})
    render(<CodeBlock code={CODE} language="ts" />)

    fireEvent.click(screen.getByLabelText('Copy code'))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CODE))
    await waitFor(() => expect(screen.getByLabelText('Copied')).toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard')
  })

  it('falls back when the clipboard API is unavailable (plain HTTP)', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

    render(<CodeBlock code={CODE} />)
    fireEvent.click(screen.getByLabelText('Copy code'))

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'))
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('highlights known languages on demand', async () => {
    const { container } = render(<CodeBlock code={CODE} language="typescript" />)
    await waitFor(() => expect(container.querySelector('.hljs-keyword')).toBeTruthy())
  })

  it('escapes unknown languages instead of injecting markup', async () => {
    const { container } = render(<CodeBlock code={'<script>alert(1)</script>'} language="nope" />)
    expect(container.querySelector('.hljs')).toBeTruthy()
    await waitFor(() => {
      const code = container.querySelector('code')
      expect(code?.innerHTML).toContain('&lt;script&gt;')
    })
    expect(container.querySelector('script')).toBeNull()
  })

  it('collapses long blocks behind a "show all" control', () => {
    const long = Array.from({ length: limits.codePreviewLines + 12 }, (_, i) => `line ${i}`).join('\n')
    render(<CodeBlock code={long} language="bash" />)

    const toggle = screen.getByRole('button', { name: /Show all \d+ lines/ })
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument()
  })
})
