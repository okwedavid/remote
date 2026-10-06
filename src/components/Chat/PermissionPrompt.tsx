import type { PermissionRequest } from '../../types/opencode'
import type { PermissionResponse } from '../../lib/transport'
import { IconWarning } from '../common/Icons'

export interface PermissionPromptProps {
  request: PermissionRequest
  onRespond: (response: PermissionResponse) => void
}

/**
 * OpenCode asks before running sensitive tools. Remote surfaces the request
 * inline and forwards the answer through
 * `POST /session/:id/permissions/:permissionID`.
 */
export function PermissionPrompt({ request, onRespond }: PermissionPromptProps) {
  const pattern = Array.isArray(request.pattern)
    ? request.pattern.join(', ')
    : (request.pattern ?? '')

  return (
    <div className="perm" role="group" aria-label="Permission request">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--warn)', display: 'flex' }}>
          <IconWarning size={16} />
        </span>
        <span className="perm__title">{request.title || `Allow ${request.type}?`}</span>
      </div>
      {pattern ? <div className="perm__meta">{pattern}</div> : null}
      <div className="perm__actions">
        <button type="button" className="btn btn--small" onClick={() => onRespond('once')}>
          Allow once
        </button>
        <button type="button" className="btn btn--small" onClick={() => onRespond('always')}>
          Allow always
        </button>
        <button
          type="button"
          className="btn btn--danger btn--small"
          onClick={() => onRespond('reject')}
        >
          Reject
        </button>
      </div>
    </div>
  )
}
