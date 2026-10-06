import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPersistedCredentials,
  clearSettings,
  defaultSettings,
  loadPersistedCredentials,
  loadSettings,
  persistCredentials,
  saveSettings,
} from './storage'

describe('settings storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(defaultSettings)
  })

  it('round-trips settings', () => {
    saveSettings({
      ...defaultSettings,
      serverUrl: 'https://opencode.example.com',
      autoConnect: true,
      showReasoning: false,
      agent: 'plan',
      model: { providerID: 'anthropic', modelID: 'claude' },
    })

    const loaded = loadSettings()
    expect(loaded.serverUrl).toBe('https://opencode.example.com')
    expect(loaded.autoConnect).toBe(true)
    expect(loaded.showReasoning).toBe(false)
    expect(loaded.agent).toBe('plan')
    expect(loaded.model).toEqual({ providerID: 'anthropic', modelID: 'claude' })
  })

  it('ignores malformed stored JSON', () => {
    window.localStorage.setItem('remote.settings.v1', '{not json')
    expect(loadSettings()).toEqual(defaultSettings)
  })

  it('coerces unexpected field types back to defaults', () => {
    window.localStorage.setItem(
      'remote.settings.v1',
      JSON.stringify({ serverUrl: 42, autoConnect: 'yes', model: { providerID: 'x' } }),
    )
    const loaded = loadSettings()
    expect(typeof loaded.serverUrl).toBe('string')
    expect(loaded.autoConnect).toBe(true)
    expect(loaded.model).toBeNull()
  })

  it('keeps an explicit auto-connect preference', () => {
    saveSettings({ ...defaultSettings, autoConnect: false })
    expect(loadSettings().autoConnect).toBe(false)

    saveSettings({ ...defaultSettings, autoConnect: true })
    expect(loadSettings().autoConnect).toBe(true)
  })

  it('clears stored settings back to the defaults', () => {
    saveSettings({ ...defaultSettings, autoConnect: false })
    clearSettings()
    expect(loadSettings()).toEqual(defaultSettings)
  })

  it('never writes a password into localStorage', () => {
    saveSettings({ ...defaultSettings, serverUrl: 'http://localhost:4096' })
    const dump = JSON.stringify(window.localStorage)
    expect(dump).not.toMatch(/password/i)
    expect(dump).not.toContain('s3cret')
  })
})

describe('credential storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('keeps nothing when persistence is "memory"', () => {
    persistCredentials({ username: 'opencode', password: 's3cret' }, 'memory')
    expect(loadPersistedCredentials()).toBeNull()
    expect(window.sessionStorage.getItem('remote.credentials.v1')).toBeNull()
    expect(window.localStorage.getItem('remote.credentials.v1')).toBeNull()
  })

  it('keeps credentials for the tab when persistence is "session"', () => {
    persistCredentials({ username: 'opencode', password: 's3cret' }, 'session')
    expect(loadPersistedCredentials()).toEqual({ username: 'opencode', password: 's3cret' })
    // sessionStorage only — never localStorage.
    expect(window.localStorage.getItem('remote.credentials.v1')).toBeNull()
  })

  it('clears persisted credentials', () => {
    persistCredentials({ username: 'opencode', password: 's3cret' }, 'session')
    clearPersistedCredentials()
    expect(loadPersistedCredentials()).toBeNull()
  })

  it('treats an empty password as "no credentials"', () => {
    persistCredentials({ username: 'opencode', password: '' }, 'session')
    expect(loadPersistedCredentials()).toBeNull()
  })
})
