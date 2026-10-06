import { useEffect, useState } from 'react'

/**
 * A clock that only advances while `active` is true, used for elapsed-time
 * labels ("working… 12s"). Consumers render as soon as the activity starts, so
 * the timestamp captured at mount is the activity's own start time; the interval
 * then refreshes it once a second.
 */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [active, intervalMs])

  return now
}
