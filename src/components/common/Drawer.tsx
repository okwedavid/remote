import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { IconClose } from './Icons'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  side?: 'left' | 'right'
  children: ReactNode
  footer?: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible overlay panel: Esc closes, focus moves in on open and returns to
 * the trigger on close, background scroll is locked, Tab stays inside.
 */
export function Drawer({ open, onClose, title, side = 'right', children, footer }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const titleId = `drawer-${side}-${title.replace(/\s+/g, '-').toLowerCase()}`

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      )
      if (focusable.length === 0) return
      const first = focusable[0] as HTMLElement
      const last = focusable[focusable.length - 1] as HTMLElement

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null

    const panel = panelRef.current
    const target = panel?.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()

    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      restoreRef.current?.focus?.()
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div className={`drawer ${side === 'left' ? 'drawer--left' : ''}`}>
      <button
        type="button"
        className="drawer__backdrop"
        aria-label="Close panel"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`drawer__panel ${side === 'left' ? 'drawer__panel--left' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="drawer__header">
          <h2 className="drawer__title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer ? <div className="drawer__header">{footer}</div> : null}
      </div>
    </div>
  )
}
