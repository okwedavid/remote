import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Composer, type ComposerProps } from './Composer'

function setup(overrides: Partial<ComposerProps> = {}) {
  const onSend = vi.fn().mockResolvedValue({ ok: true })
  const onAbort = vi.fn()
  const props: ComposerProps = {
    connected: true,
    hasSession: true,
    busy: false,
    agents: [{ name: 'build', mode: 'primary', builtIn: true, permission: { edit: 'allow', bash: {} }, tools: {}, options: {} }],
    providers: [
      { id: 'anthropic', name: 'Anthropic', models: [{ id: 'claude', name: 'Claude' }] },
    ],
    agent: '',
    model: null,
    onAgentChange: vi.fn(),
    onModelChange: vi.fn(),
    onSend,
    onAbort,
    onRequestModels: vi.fn(),
    ...overrides,
  }
  render(<Composer {...props} />)
  return { props, onSend, onAbort }
}

describe('Composer', () => {
  it('sends on Enter and keeps the modifiers free for newlines', async () => {
    const { onSend } = setup()
    const box = screen.getByLabelText('Prompt')

    fireEvent.change(box, { target: { value: 'refactor the parser' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(onSend).toHaveBeenCalledWith({
      text: 'refactor the parser',
      mode: 'prompt',
      agent: '',
      model: null,
    })
    expect(box).toHaveValue('')
  })

  it('does not send on Shift+Enter', () => {
    const { onSend } = setup()
    const box = screen.getByLabelText('Prompt')

    fireEvent.change(box, { target: { value: 'line one' } })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
    expect(box).toHaveValue('line one')
  })

  it('ignores Enter when the prompt is empty', () => {
    const { onSend } = setup()
    const box = screen.getByLabelText('Prompt')
    fireEvent.change(box, { target: { value: '   ' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('is unusable until a server and session are available', () => {
    setup({ connected: false, hasSession: false })
    expect(screen.getByLabelText('Prompt')).toBeDisabled()
    expect(screen.getByLabelText('Send prompt')).toBeDisabled()
    expect(screen.getByLabelText('Prompt')).toHaveAttribute(
      'placeholder',
      'Connect to your OpenCode server to begin.',
    )
  })

  it('asks for a session when the server is connected but empty', () => {
    setup({ hasSession: false })
    expect(screen.getByLabelText('Prompt')).toHaveAttribute(
      'placeholder',
      'Create or select a session to send a prompt.',
    )
  })

  it('shows Stop while running and aborts on click or Escape', () => {
    const { onAbort } = setup({ busy: true })

    expect(screen.queryByLabelText('Send prompt')).toBeNull()
    const stop = screen.getByRole('button', { name: 'Stop' })
    fireEvent.click(stop)
    expect(onAbort).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(screen.getByLabelText('Prompt'), { key: 'Escape' })
    expect(onAbort).toHaveBeenCalledTimes(2)
  })

  it('sends the prompt back to the user when the request fails', async () => {
    const onSend = vi.fn().mockResolvedValue({ ok: false, error: { code: 'offline', title: 'x', message: 'y', retryable: true } })
    setup({ onSend })

    const box = screen.getByLabelText('Prompt')
    fireEvent.change(box, { target: { value: 'important prompt' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(box).toHaveValue('important prompt'))
  })

  it('can run a command through the session shell', async () => {
    const { onSend } = setup()
    const toggle = screen.getByLabelText('Toggle shell command mode')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    const box = screen.getByLabelText('Prompt')
    fireEvent.change(box, { target: { value: 'npm run build' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({
        text: 'npm run build',
        mode: 'shell',
        agent: '',
        model: null,
      }),
    )
  })

  it('loads agents and models once connected', () => {
    const { props } = setup()
    expect(props.onRequestModels).toHaveBeenCalled()
    expect(screen.getByLabelText('Agent')).toBeInTheDocument()
    expect(screen.getByLabelText('Model')).toBeInTheDocument()
  })

  it('reports agent and model choices', () => {
    const onAgentChange = vi.fn()
    const onModelChange = vi.fn()
    setup({ onAgentChange, onModelChange })

    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'build' } })
    expect(onAgentChange).toHaveBeenCalledWith('build')

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'anthropic/claude' } })
    expect(onModelChange).toHaveBeenCalledWith({ providerID: 'anthropic', modelID: 'claude' })

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: '' } })
    expect(onModelChange).toHaveBeenLastCalledWith(null)
  })
})
