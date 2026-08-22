import { GateVerdict, PreviewRejected } from '../components/GateVerdict.tsx'
import type { GateVerdict as GateVerdictT } from '../types.ts'

export const dynamic = 'force-dynamic'

// Unlinked verification route for the gate verdict component (brief §5.3).
// heal_attempts is empty in the live database right now, so this route
// exercises the component with the exact hardcoded examples from the design
// brief instead — every case the brief calls out by name:
//
//   1. The real "everything passes except RESOLVED" case (brief lines 236-240):
//      three checks pass, RESOLVED fails — the fix looks perfect and changed
//      nothing. This is "the most instructive state in the entire product."
//   2. The inverse "ANCHOR fails, everything else passes" case (lines 273-277):
//      flawless output from entirely the wrong part of the page.
//   3. A clean, fully-passing approval, to prove the "PROPOSAL APPROVED" path
//      renders correctly too.
//   4. A preview-stage rejection (heal-dry mode's shape — no full gate ever
//      ran), to prove PreviewRejected renders as a success, not a crash.
//
// Verified by curling this route with the dev server up and confirming all
// four blocks render with the right pills, colours, and detail text — see
// console-ui-report.md for the transcript.

const RESOLVED_FAILS: GateVerdictT = {
  pass: false,
  checks: [
    { name: 'live', pass: true, detail: '20 records, all assertions met' },
    { name: 'regression', pass: true, detail: '2 fixtures still pass' },
    { name: 'anchor', pass: true, detail: '20/20 known keys retained (100%, need 30%)' },
    { name: 'resolved', pass: false, detail: 'the original fault is still present: FIELD_BLEED' },
  ],
}

const ANCHOR_FAILS: GateVerdictT = {
  pass: false,
  checks: [
    { name: 'live', pass: true, detail: '12 records, all assertions met' },
    { name: 'regression', pass: true, detail: '2 fixtures still pass' },
    { name: 'anchor', pass: false, detail: '0/20 known keys retained (0%, need 30%)' },
    { name: 'resolved', pass: true, detail: 'sensor reports no critical drift on the repaired output' },
  ],
}

const ALL_PASS: GateVerdictT = {
  pass: true,
  checks: [
    { name: 'live', pass: true, detail: '20 records, all assertions met' },
    { name: 'regression', pass: true, detail: '2 fixtures still pass' },
    { name: 'anchor', pass: true, detail: '18/20 known keys retained (90%, need 30%)' },
    { name: 'resolved', pass: true, detail: 'sensor reports no critical drift on the repaired output' },
  ],
}

export default function GateDemoPage() {
  return (
    <>
      <header className="page-header halftone">
        <h1>Gate verdict — demo</h1>
        <p>Hardcoded examples, not connected to the database. Unlinked from the main nav.</p>
      </header>
      <div className="stack" style={{ maxWidth: 640, gap: 'var(--sp-7)' }}>
        <section>
          <h2 className="section-title">1. RESOLVED fails alone — the instructive case</h2>
          <GateVerdict verdict={RESOLVED_FAILS} fromVersion={2} />
        </section>
        <section>
          <h2 className="section-title">2. ANCHOR fails alone — the inverse case</h2>
          <GateVerdict verdict={ANCHOR_FAILS} fromVersion={2} />
        </section>
        <section>
          <h2 className="section-title">3. Everything passes — promoted</h2>
          <GateVerdict verdict={ALL_PASS} fromVersion={2} toVersion={3} />
        </section>
        <section>
          <h2 className="section-title">4. Rejected before the gate — preview stage</h2>
          <PreviewRejected fromVersion={2} failures={['preview still shows field bleed']} />
        </section>
      </div>
    </>
  )
}
