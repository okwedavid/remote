import type { ReactNode } from 'react'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  text?: string
  children?: ReactNode
  /** Compact variant used inside the sidebar. */
  inline?: boolean
}

export function EmptyState({ icon, title, text, children, inline = false }: EmptyStateProps) {
  return (
    <div className={`empty ${inline ? 'empty--inline' : ''}`}>
      {icon ? <span className="empty__icon">{icon}</span> : null}
      <p className="empty__title">{title}</p>
      {text ? <p className="empty__text">{text}</p> : null}
      {children ? <div className="empty__actions">{children}</div> : null}
    </div>
  )
}
