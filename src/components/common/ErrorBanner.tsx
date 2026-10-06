import type { RemoteErrorInfo } from '../../types/opencode'
import { IconWarning } from './Icons'

export interface ErrorBannerProps {
  error: RemoteErrorInfo
  onRetry?: () => void
  retryLabel?: string
  onDismiss?: () => void
  /** `warn` renders the same information with a softer tone. */
  tone?: 'error' | 'warn'
}

/**
 * One place where every failure is rendered. The message is already sanitised
 * (lib/errors.ts) — no stack traces, no credentials, no raw URLs with auth.
 */
export function ErrorBanner({
  error,
  onRetry,
  retryLabel = 'Retry',
  onDismiss,
  tone = 'error',
}: ErrorBannerProps) {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span style={{ color: tone === 'error' ? 'var(--err)' : 'var(--warn)', display: 'flex' }}>
        <IconWarning size={16} />
      </span>
      <div className="banner__body">
        <span className="banner__title">{error.title}</span>
        {error.message ? <span className="banner__text">{error.message}</span> : null}
        {error.hint ? <span className="banner__hint">{error.hint}</span> : null}
        {error.detail ? <code className="banner__detail">{error.detail}</code> : null}
      </div>
      <div className="banner__actions">
        {onRetry && error.retryable ? (
          <button type="button" className="btn btn--small" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
        {onDismiss ? (
          <button type="button" className="btn btn--ghost btn--small" onClick={onDismiss}>
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  )
}
