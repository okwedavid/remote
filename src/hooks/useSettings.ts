/**
 * User preferences + runtime credentials.
 *
 * `settings` (URL, username, auto-connect, preferences) is persisted in
 * localStorage. The password is only ever held in React state, and optionally
 * mirrored into sessionStorage when the user asks for it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Credentials, Settings } from '../types/opencode'
import {
  clearPersistedCredentials,
  clearSettings,
  defaultSettings,
  loadPersistedCredentials,
  loadSettings,
  persistCredentials,
  saveSettings,
} from '../lib/storage'
import { normalizeServerUrl } from '../lib/urls'

export interface UseSettingsResult {
  settings: Settings
  credentials: Credentials | null
  updateSettings: (patch: Partial<Settings>) => void
  setCredentials: (credentials: Credentials | null, persist?: boolean) => void
  clearCredentials: () => void
  resetSettings: () => void
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [credentials, setCredentialsState] = useState<Credentials | null>(() =>
    loadSettings().credentialPersistence === 'session' ? loadPersistedCredentials() : null,
  )

  // Mirror of the latest settings so callbacks never read a stale closure
  // (and so writes do not need to happen inside a state updater).
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const merged: Settings = { ...settingsRef.current, ...patch }
    if (patch.serverUrl !== undefined) {
      // Keep the URL canonical: `https://host/` and `https://host` are the same.
      merged.serverUrl = normalizeServerUrl(merged.serverUrl) || merged.serverUrl
    }
    settingsRef.current = merged
    saveSettings(merged)
    setSettings(merged)
  }, [])

  const setCredentials = useCallback((next: Credentials | null, persist = true) => {
    setCredentialsState(next)
    if (persist) {
      persistCredentials(next, settingsRef.current.credentialPersistence)
    }
  }, [])

  const clearCredentials = useCallback(() => {
    setCredentialsState(null)
    clearPersistedCredentials()
  }, [])

  const resetSettings = useCallback(() => {
    clearSettings()
    clearPersistedCredentials()
    settingsRef.current = { ...defaultSettings }
    setCredentialsState(null)
    setSettings({ ...defaultSettings })
  }, [])

  return {
    settings,
    credentials,
    updateSettings,
    setCredentials,
    clearCredentials,
    resetSettings,
  }
}
