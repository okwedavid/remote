import { useCallback, useEffect, useRef, useState } from 'react'
import type { Agent, ModelRef } from '../../types/opencode'
import { limits } from '../../config'
import type { SendResult } from '../../hooks/useMessages'
import { IconSend, IconStop, IconTerminal } from '../common/Icons'

export interface ComposerProps {
  connected: boolean
  hasSession: boolean
  busy: boolean
  agents: Agent[]
  providers: { id: string; name: string; models: { id: string; name: string }[] }[]
  agent: string
  model: ModelRef | null
  onAgentChange: (agent: string) => void
  onModelChange: (model: ModelRef | null) => void
  onSend: (input: {
    text: string
    mode: 'prompt' | 'shell'
    agent: string
    model: ModelRef | null
  }) => Promise<SendResult>
  onAbort: () => void
  onRequestModels: () => void
}

export function Composer({
  connected,
  hasSession,
  busy,
  agents,
  providers,
  agent,
  model,
  onAgentChange,
  onModelChange,
  onSend,
  onAbort,
  onRequestModels,
}: ComposerProps) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'prompt' | 'shell'>('prompt')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const disabled = !connected || !hasSession
  const canSend = !disabled && !busy && text.trim() !== ''

  // Grow with the content, up to the configured ceiling.
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, limits.composerMaxHeight)}px`
  }, [text])

  // Load agent/model options once the user can actually send something.
  useEffect(() => {
    if (connected) onRequestModels()
  }, [connected, onRequestModels])

  const submit = useCallback(async () => {
    const value = text.trim()
    if (value === '' || disabled || busy) return
    setText('')
    const result = await onSend({ text: value, mode, agent, model })
    if (!result.ok) {
      // Give the prompt back so nothing is lost.
      setText((current) => (current === '' ? value : current))
      textareaRef.current?.focus()
    } else if (mode === 'shell') {
      setMode('prompt')
    }
  }, [agent, busy, disabled, mode, model, onSend, text])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
      return
    }
    if (event.key === 'Escape' && busy) {
      event.preventDefault()
      onAbort()
    }
  }

  const placeholder = !connected
    ? 'Connect to your OpenCode server to begin.'
    : !hasSession
      ? 'Create or select a session to send a prompt.'
      : mode === 'shell'
        ? 'Run a shell command on your PC through OpenCode…'
        : 'Ask OpenCode about your project…'

  return (
    <div className="composer">
      <form
        className="composer__inner"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className={`composer__box ${mode === 'shell' ? 'composer__box--shell' : ''}`}>
          <label className="sr-only" htmlFor="composer-input">
            Prompt
          </label>
          <textarea
            id="composer-input"
            ref={textareaRef}
            className="composer__input"
            rows={1}
            value={text}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-describedby="composer-hint"
          />

          <div className="composer__actions">
            <button
              type="button"
              className={`iconbtn ${mode === 'shell' ? 'iconbtn--active' : ''}`}
              onClick={() => setMode((current) => (current === 'shell' ? 'prompt' : 'shell'))}
              aria-pressed={mode === 'shell'}
              title="Run as shell command (OpenCode /session/:id/shell)"
              aria-label="Toggle shell command mode"
              disabled={disabled}
            >
              <IconTerminal size={16} />
            </button>

            {busy ? (
              <button
                type="button"
                className="btn btn--danger"
                onClick={onAbort}
                title="Abort the running request (Esc)"
              >
                <IconStop size={14} />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn--primary"
                disabled={!canSend}
                title="Send (Enter)"
                aria-label="Send prompt"
              >
                <IconSend size={15} />
                Send
              </button>
            )}
          </div>
        </div>

        <div className="composer__tools" id="composer-hint">
          <div className="composer__hint">
            <span>
              <kbd>Enter</kbd> send
            </span>
            <span>
              <kbd>Shift</kbd>+<kbd>Enter</kbd> newline
            </span>
            <span>
              <kbd>Esc</kbd> stop
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {agents.length > 0 ? (
            <>
              <label className="sr-only" htmlFor="composer-agent">
                Agent
              </label>
              <select
                id="composer-agent"
                className="composer__select"
                value={agent}
                onChange={(event) => onAgentChange(event.target.value)}
                disabled={disabled}
                title="Agent sent with prompts"
              >
                <option value="">Server default agent</option>
                {agents
                  .filter((entry) => entry.mode !== 'subagent')
                  .map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
              </select>
            </>
          ) : null}

          {providers.length > 0 ? (
            <>
              <label className="sr-only" htmlFor="composer-model">
                Model
              </label>
              <select
                id="composer-model"
                className="composer__select"
                value={model ? `${model.providerID}/${model.modelID}` : ''}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === '') {
                    onModelChange(null)
                    return
                  }
                  const [providerID, modelID] = value.split('/')
                  if (providerID && modelID) onModelChange({ providerID, modelID })
                }}
                disabled={disabled}
                title="Model sent with prompts"
              >
                <option value="">Server default model</option>
                {providers.map((provider) => (
                  <optgroup key={provider.id} label={provider.name}>
                    {provider.models.map((entry) => (
                      <option key={entry.id} value={`${provider.id}/${entry.id}`}>
                        {entry.name || entry.id}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </>
          ) : null}
        </div>
      </form>
    </div>
  )
}
