import type { RunStatus } from '../types.ts'

const COLOR: Record<RunStatus, string> = {
  ok: 'var(--healthy)',
  healed: 'var(--healthy)',
  drift: 'var(--critical)',
  failed: 'var(--text-faint)',
  pending: 'var(--healing)',
}

const LABEL: Record<RunStatus, string> = {
  ok: 'ok',
  healed: 'healed',
  drift: 'drift',
  failed: 'failed',
  pending: 'in progress',
}

// One mark per run, most recent last, coloured by status. Brief §5.1: "last
// ~20 runs, one mark per run, coloured by status."
export function Sparkline({ runs }: { runs: Array<{ id: number; status: RunStatus }> }) {
  if (runs.length === 0) {
    return <p className="text-faint" style={{ fontSize: 'var(--fs-11)' }}>no run history yet</p>
  }
  return (
    <div className="sparkline" role="img" aria-label={`last ${runs.length} runs: ${runs.map(r => LABEL[r.status]).join(', ')}`}>
      {runs.map(run => (
        <span
          key={run.id}
          className="sparkline-bar"
          style={{ background: COLOR[run.status], height: run.status === 'failed' ? '40%' : '100%' }}
          title={`run ${run.id}: ${LABEL[run.status]}`}
        />
      ))}
    </div>
  )
}
