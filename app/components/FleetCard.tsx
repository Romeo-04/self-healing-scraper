import Link from 'next/link'
import { FillRateBar } from './FillRateBar.tsx'
import { HealthBadge } from './HealthBadge.tsx'
import { Sparkline } from './Sparkline.tsx'
import { relativeTime } from '../format.ts'
import type { FleetCard as FleetCardData } from '../queries.ts'

export function FleetCard({ card }: { card: FleetCardData }) {
  const { target, latestRun, recentRuns, fillRates, state, minItems } = card
  return (
    <Link href={`/timeline?target=${target.id}`} className={`fleet-card state-${state}`}>
      <div className="fleet-card-head">
        <div>
          <h3 className="fleet-card-name">{target.name}</h3>
          <span className="fleet-card-dimension">{target.url.replace(/^https?:\/\//, '')}</span>
        </div>
        <HealthBadge state={state} glitch />
      </div>

      <div className="fleet-card-meta">
        <span>
          contract
          <span className="meta-value">v{target.active_contract_version}</span>
        </span>
        <span>
          last run
          <span className="meta-value">{latestRun ? relativeTime(latestRun.started_at) : 'never'}</span>
        </span>
        <span>
          records
          <span className="meta-value">
            {latestRun ? latestRun.record_count : '—'}
            {minItems !== null && <span className="text-faint" style={{ fontWeight: 400 }}> / min {minItems}</span>}
          </span>
        </span>
      </div>

      <div className="fill-rates">
        {fillRates.map(f => (
          <FillRateBar key={f.field} field={f.field} ratio={f.ratio} />
        ))}
      </div>

      <Sparkline runs={recentRuns.slice().reverse().map(r => ({ id: r.id, status: r.status }))} />
    </Link>
  )
}
