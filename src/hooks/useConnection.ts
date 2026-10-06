/**
 * Connection lifecycle: build a transport for the configured OpenCode server,
 * prove it with `GET /global/health`, and keep an eye on it afterwards.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { mockModeRequested, timeouts } from '../config'
import type {
  ConnectionInfo,
  Credentials,
  HealthResponse,
  RemoteErrorInfo,
  Settings,
} from '../types/opencode'
import { classifyNetworkFailure, toRemoteError } from '../lib/errors'
import { createTransport, type OpenCodeTransport } from '../lib/transport'

export interface ConnectionTestResult {
  ok: boolean
  version?: string
  latencyMs?: number
  error?: RemoteErrorInfo
}

export interface UseConnectionOptions {
  settings: Settings
  credentials: Credentials | null
}

export interface UseConnectionResult {
  connection: ConnectionInfo
  transport: OpenCodeTransport | null
  /** True when the development mock transport is in use. */
  mock: boolean
  connect: (overrides?: { url?: string; credentials?: Credentials | null }) => Promise<boolean>
  disconnect: () => void
  recheck: () => Promise<boolean>
  testConnection: (input: {
    url: string
    credentials: Credentials | null
  }) => Promise<ConnectionTestResult>
  clearError: () => void
}

const HEALTH_INTERVAL = 30_000

export function useConnection({ settings, credentials }: UseConnectionOptions): UseConnectionResult {
  const [connection, setConnection] = useState<ConnectionInfo>(() => ({
    state: 'disconnected',
    url: settings.serverUrl,
    error: null,
  }))
  const [transport, setTransport] = useState<OpenCodeTransport | null>(null)

  const latest = useRef({ settings, credentials })
  useEffect(() => {
    latest.current = { settings, credentials }
  }, [settings, credentials])

  const attemptRef = useRef(0)
  const autoConnectRef = useRef(false)
  const activeUrlRef = useRef(settings.serverUrl)

  const disconnect = useCallback(() => {
    attemptRef.current += 1
    setTransport(null)
    setConnection((current) => ({ state: 'disconnected', url: current.url, error: null }))
  }, [])

  const connect = useCallback(
    async (overrides?: { url?: string; credentials?: Credentials | null }): Promise<boolean> => {
    const attempt = attemptRef.current + 1
    attemptRef.current = attempt
    const { settings: currentSettings, credentials: storedCredentials } = latest.current
    const url = overrides?.url ?? currentSettings.serverUrl
    const currentCredentials =
      overrides && 'credentials' in overrides ? overrides.credentials ?? null : storedCredentials
    activeUrlRef.current = url

    setConnection({ state: 'connecting', url, error: null })

    try {
      const nextTransport = await createTransport({
        baseUrl: url,
        credentials: currentCredentials,
        mock: mockModeRequested,
      })
      const started = performance.now()
      const health: HealthResponse = await nextTransport.health()
      const latencyMs = Math.round(performance.now() - started)

      if (attemptRef.current !== attempt) return false

      if (!health.healthy) {
        setTransport(null)
        setConnection({
          state: 'error',
          url: nextTransport.baseUrl,
          error: {
            code: 'unreachable',
            title: 'OpenCode is not healthy.',
            message: 'The server answered the health check but reported itself as unhealthy.',
            hint: 'Check the OpenCode logs on your PC.',
            retryable: true,
          },
        })
        return false
      }

      setTransport(nextTransport)
      setConnection({
        state: 'connected',
        url: nextTransport.baseUrl,
        version: health.version,
        latencyMs,
        error: null,
      })
      return true
    } catch (error) {
      if (attemptRef.current !== attempt) return false
      setTransport(null)
      setConnection({
        state: 'error',
        url,
        error: (await classifyNetworkFailure(toRemoteError(error, { url }), url)).toInfo(),
      })
      return false
    }
    },
    [],
  )

  /** Re-run the health probe without tearing the transport down. */
  const recheck = useCallback(async (): Promise<boolean> => {
    const current = transport
    if (!current) return connect()
    try {
      const started = performance.now()
      const health = await current.health()
      setConnection((previous) => ({
        state: 'connected',
        url: current.baseUrl,
        version: health.version ?? previous.version,
        latencyMs: Math.round(performance.now() - started),
        error: null,
      }))
      return true
    } catch (error) {
      const info = (
        await classifyNetworkFailure(toRemoteError(error, { url: current.baseUrl }), current.baseUrl)
      ).toInfo()
      setConnection((previous) => ({ ...previous, state: 'error', error: info }))
      return false
    }
  }, [transport, connect])

  const testConnection = useCallback(
    async (input: { url: string; credentials: Credentials | null }): Promise<ConnectionTestResult> => {
      try {
        const candidate = await createTransport({
          baseUrl: input.url,
          credentials: input.credentials,
          mock: mockModeRequested,
        })
        const started = performance.now()
        const health = await candidate.health()
        const latencyMs = Math.round(performance.now() - started)
        if (!health.healthy) {
          return {
            ok: false,
            error: {
              code: 'unreachable',
              title: 'Server responded but is unhealthy.',
              message: 'OpenCode answered the health check and reported `healthy: false`.',
              retryable: true,
            },
          }
        }
        const result: ConnectionTestResult = { ok: true, latencyMs }
        if (health.version) result.version = health.version
        return result
      } catch (error) {
        return {
          ok: false,
          error: (await classifyNetworkFailure(toRemoteError(error, { url: input.url }), input.url)).toInfo(),
        }
      }
    },
    [],
  )

  const clearError = useCallback(() => {
    setConnection((current) => ({
      ...current,
      state: transport ? 'connected' : 'disconnected',
      error: null,
    }))
  }, [transport])

  // Auto-connect once, when the user has asked for it.
  useEffect(() => {
    if (autoConnectRef.current) return
    if (!settings.autoConnect) return
    if (settings.serverUrl.trim() === '') return
    autoConnectRef.current = true
    void connect()
  }, [settings.autoConnect, settings.serverUrl, connect])

  // Pointing Remote at a different server invalidates the current transport —
  // unless a connect attempt for that very URL is already running.
  const previousUrl = useRef(settings.serverUrl)
  useEffect(() => {
    if (previousUrl.current === settings.serverUrl) return
    previousUrl.current = settings.serverUrl
    if (activeUrlRef.current === settings.serverUrl) return
    disconnect()
  }, [settings.serverUrl, disconnect])

  // Periodic liveness probe so "connected" is not a lie.
  useEffect(() => {
    if (!transport) return
    const timer = setInterval(() => {
      void (async () => {
        const started = performance.now()
        try {
          const health = await transport.health({
            signal: AbortSignal.timeout?.(timeouts.health) ?? new AbortController().signal,
          })
          setConnection((previous) =>
            previous.state === 'connected' && previous.version === health.version
              ? { ...previous, latencyMs: Math.round(performance.now() - started) }
              : {
                  state: 'connected',
                  url: transport.baseUrl,
                  version: health.version ?? previous.version,
                  latencyMs: Math.round(performance.now() - started),
                  error: null,
                },
          )
        } catch (error) {
          const info = (
            await classifyNetworkFailure(
              toRemoteError(error, { url: transport.baseUrl }),
              transport.baseUrl,
            )
          ).toInfo()
          setConnection((previous) => ({ ...previous, state: 'error', error: info }))
        }
      })()
    }, HEALTH_INTERVAL)
    return () => clearInterval(timer)
  }, [transport])

  return {
    connection,
    transport,
    mock: mockModeRequested,
    connect,
    disconnect,
    recheck,
    testConnection,
    clearError,
  }
}
