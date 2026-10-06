import { useEffect, useState } from 'react'

/**
 * Small `matchMedia` subscription. Sets up its own listener (and degrades to
 * `false` in environments without `matchMedia`, e.g. tests).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const update = (event: MediaQueryListEvent | MediaQueryList): void => setMatches(event.matches)
    update(list)
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])

  return matches
}

/** True on tablet/mobile widths, where the sidebar becomes a drawer. */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 960px)')
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
