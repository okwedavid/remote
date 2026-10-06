/**
 * Subscription to OpenCode's global event stream (`GET /global/event`).
 *
 * The subscription is owned here; the events themselves are dispatched to the
 * conversation/session/file stores by the caller. `lastEventAt` is a ref so
 * frequent events do not trigger extra renders, and the exposed state is derived
 * rather than reset in an effect.
 */
import { useEffect, useRef, useState } from 'react'
import type { Event, EventStreamState, RemoteErrorInfo } from '../types/opencode'
import type { OpenCodeTransport } from '../lib/transport'

export interface UseEventsOptions {
  transport: OpenCodeTransport | null
  enabled: boolean
  onEvent: (event: Event) => void
}

export interface UseEventsResult {
  state: EventStreamState
  error: RemoteErrorInfo | null
  /** Timestamp of the last event received (0 when none yet). */
  lastEventAt: React.RefObject<number>
}

export function useEvents({ transport, enabled, onEvent }: UseEventsOptions): UseEventsResult {
  const [stream, setStream] = useState<{ state: EventStreamState; error: RemoteErrorInfo | null }>({
    state: 'idle',
    error: null,
  })
  const lastEventAt = useRef<number>(0)

  const handlerRef = useRef(onEvent)
  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  const active = transport !== null && enabled

  useEffect(() => {
    if (!transport || !enabled) return

    const unsubscribe = transport.subscribeEvents({
      onEvent: (event) => {
        lastEventAt.current = Date.now()
        handlerRef.current(event)
      },
      onStatus: (state, error) => {
        setStream({ state, error: error ? error.toInfo() : null })
      },
    })

    return () => {
      unsubscribe()
    }
  }, [transport, enabled])

  return {
    state: active ? stream.state : 'idle',
    error: active ? stream.error : null,
    lastEventAt,
  }
}
