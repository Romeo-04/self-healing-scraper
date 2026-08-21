import { pct } from '../format.ts'

function colorFor(ratio: number): string {
  if (ratio >= 0.9) return 'var(--healthy)'
  if (ratio >= 0.5) return 'var(--warn)'
  return 'var(--critical)'
}

export function FillRateBar({ field, ratio }: { field: string; ratio: number }) {
  const clamped = Math.max(0, Math.min(1, ratio))
  return (
    <div className="fill-rate-row">
      <span className="fill-rate-label mono">{field}</span>
      <span
        className="fill-rate-track"
        role="img"
        aria-label={`${field} fill rate ${pct(clamped)}`}
      >
        <span
          className="fill-rate-fill"
          style={{ width: pct(clamped), background: colorFor(clamped) }}
        />
      </span>
      <span className="fill-rate-value">{pct(clamped)}</span>
    </div>
  )
}
