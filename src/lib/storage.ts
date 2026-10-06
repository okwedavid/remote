/**
 * Persistence layer.
 *
 * Rules (see README → Security):
 *   - Non-secret preferences live in `localStorage`.
 *   - Credentials live in memory by default; if the user explicitly opts in they
 *     are kept in `sessionStorage` (cleared when the tab closes).
 *   - A password is NEVER written to `localStorage`, never logged, and never
 *     included in an error message.
 */
import type { Credentials, CredentialPersistence, Settings } from '../types/opencode'
import { defaultServerUrl } from '../config'

const SETTINGS_KEY = 'remote.settings.v1'
const CREDENTIALS_KEY = 'remote.credentials.v1'

export const defaultSettings: Settings = {
  serverUrl: defaultServerUrl,
  username: '',
  autoConnect: true,
  credentialPersistence: 'memory',
  agent: '',
  model: null,
  showReasoning: true,
}

function safeGet(store: 'local' | 'session'): Storage | null {
  try {
    const storage = store === 'local' ? window.localStorage : window.sessionStorage
    // Touch the storage: Safari private mode throws on write, not on access.
    const probe = `${SETTINGS_KEY}.probe`
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function loadSettings(): Settings {
  const storage = safeGet('local')
  if (!storage) return { ...defaultSettings }
  try {
    const raw = storage.getItem(SETTINGS_KEY)
    if (!raw) return { ...defaultSettings }
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return { ...defaultSettings }

    const persistence = parsed.credentialPersistence
    const model = parsed.model
    return {
      serverUrl:
        typeof parsed.serverUrl === 'string' && parsed.serverUrl.trim() !== ''
          ? parsed.serverUrl
          : defaultServerUrl,
      username: typeof parsed.username === 'string' ? parsed.username : '',
      autoConnect:
        typeof parsed.autoConnect === 'boolean' ? parsed.autoConnect : defaultSettings.autoConnect,
      credentialPersistence: persistence === 'session' ? 'session' : 'memory',
      agent: typeof parsed.agent === 'string' ? parsed.agent : '',
      model:
        isRecord(model) && typeof model.providerID === 'string' && typeof model.modelID === 'string'
          ? { providerID: model.providerID, modelID: model.modelID }
          : null,
      showReasoning: parsed.showReasoning !== false,
    }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(settings: Settings): void {
  const storage = safeGet('local')
  if (!storage) return
  try {
    // Deliberately picks fields — never spread an object that may hold secrets.
    const payload = {
      serverUrl: settings.serverUrl,
      username: settings.username,
      autoConnect: settings.autoConnect,
      credentialPersistence: settings.credentialPersistence,
      agent: settings.agent,
      model: settings.model,
      showReasoning: settings.showReasoning,
    }
    storage.setItem(SETTINGS_KEY, JSON.stringify(payload))
  } catch {
    /* storage full or unavailable — settings simply are not persisted */
  }
}

export function clearSettings(): void {
  const storage = safeGet('local')
  if (!storage) return
  try {
    storage.removeItem(SETTINGS_KEY)
  } catch {
    /* ignore */
  }
}

/** Credentials kept for the lifetime of the tab (opt-in). */
export function loadPersistedCredentials(): Credentials | null {
  const storage = safeGet('session')
  if (!storage) return null
  try {
    const raw = storage.getItem(CREDENTIALS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const username = typeof parsed.username === 'string' ? parsed.username : ''
    const password = typeof parsed.password === 'string' ? parsed.password : ''
    if (password === '') return null
    return { username, password }
  } catch {
    return null
  }
}

export function persistCredentials(
  credentials: Credentials | null,
  persistence: CredentialPersistence,
): void {
  const storage = safeGet('session')
  if (!storage) return
  try {
    if (!credentials || credentials.password === '') {
      storage.removeItem(CREDENTIALS_KEY)
      return
    }
    if (persistence === 'session') {
      storage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
    } else {
      storage.removeItem(CREDENTIALS_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function clearPersistedCredentials(): void {
  const storage = safeGet('session')
  if (!storage) return
  try {
    storage.removeItem(CREDENTIALS_KEY)
  } catch {
    /* ignore */
  }
}
