import { relativeTime } from '../format.ts'

export function StatusStrip({ total, healthy, healing, lastRunAt }: {
  total: number
  healthy: number
  healing: number
  lastRunAt: string | null
}) {
  return (
    <div className={`status-strip${healing > 0 ? ' is-healing' : ''}`}>
      <span className={`pulse-dot${healing > 0 ? ' healing' : ''}`} aria-hidden="true" />
      <span className="status-item">
        spiders <strong>{total}</strong>
      </span>
      <span className="status-item">
        healthy <strong>{healthy}</strong>/{total}
      </span>
      {healing > 0 && (
        <span className="status-item" style={{ color: 'var(--healing)' }}>
          healing <strong style={{ color: 'var(--healing)' }}>{healing}</strong>
        </span>
      )}
      <span className="status-item">
        last run <strong>{lastRunAt ? relativeTime(lastRunAt) : '—'}</strong>
      </span>
    </div>
  )
}
