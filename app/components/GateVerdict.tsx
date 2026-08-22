import { CheckIcon, XIcon } from './icons.tsx'
import type { GateCheck, GateVerdict as GateVerdictT } from '../types.ts'

const CHECK_ORDER = ['live', 'regression', 'anchor', 'resolved'] as const

const SUPPORTING = new Set(['live', 'regression'])

function VerdictPill({ pass }: { pass: boolean }) {
  return (
    <span className={`pill verdict-pill ${pass ? 'pill-healthy' : 'pill-critical'}`}>
      {pass ? <CheckIcon /> : <XIcon />}
      {pass ? 'PASS' : 'FAIL'}
    </span>
  )
}

// Brief §5.3: the product's whole argument lives here. All four checks always
// render, in this fixed order, even when an earlier one fails — never
// short-circuit. LIVE/REGRESSION are the quiet supporting cast; ANCHOR and
// RESOLVED are the two checks worth designing around, so a failing check
// among passes gets emphasis rather than reading as a uniform list row.
export function GateVerdict({ verdict, fromVersion, toVersion }: {
  verdict: GateVerdictT
  fromVersion: number
  toVersion?: number | null
}) {
  const byName = new Map(verdict.checks.map(c => [c.name, c] as const))
  const ordered = CHECK_ORDER.map(name => byName.get(name)).filter((c): c is GateCheck => c !== undefined)

  return (
    <div className="gate-verdict">
      <div className={`gate-banner ${verdict.pass ? 'approved' : 'rejected'}`}>
        <span className="gate-banner-title">
          {verdict.pass ? 'PROPOSAL APPROVED' : 'PROPOSAL REJECTED'}
        </span>
        <span className="gate-banner-sub">
          {verdict.pass
            ? (toVersion != null
              ? `contract v${fromVersion} → v${toVersion} promoted`
              : `contract v${fromVersion} promoted`)
            : `The gate did its job — contract v${fromVersion} remains live.`}
        </span>
      </div>
      <div className="gate-checks">
        {ordered.map(check => {
          const isEmphasis = !SUPPORTING.has(check.name)
          return (
            <div
              key={check.name}
              className={`gate-check${isEmphasis ? ` emphasis ${check.pass ? 'pass' : 'fail'}` : ''}`}
            >
              <span className="gate-check-name mono">{check.name}</span>
              <VerdictPill pass={check.pass} />
              <span className="gate-check-detail mono">{check.detail}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Rendered when a proposal never reached the four-check gate at all — refused
// at the cheaper preview stage (heal-dry mode, or a studio preview that
// obviously still bleeds). Still framed as a success, per brief §1: "A
// rejection is a success, not an error."
export function PreviewRejected({ fromVersion, failures }: { fromVersion: number; failures: string[] }) {
  return (
    <div className="gate-verdict">
      <div className="gate-banner rejected">
        <span className="gate-banner-title">PROPOSAL REJECTED</span>
        <span className="gate-banner-sub">
          The proposal did not clear the preview check — contract v{fromVersion} remains live.
        </span>
      </div>
      <div className="gate-checks">
        <div className="gate-check emphasis fail">
          <span className="gate-check-name mono">preview</span>
          <span className="pill verdict-pill pill-critical"><XIcon />FAIL</span>
          <span className="gate-check-detail mono">
            {failures.length > 0 ? failures.join('; ') : 'proposal discarded before the full validation gate'}
          </span>
        </div>
      </div>
    </div>
  )
}
