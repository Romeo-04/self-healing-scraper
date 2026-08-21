import { evaluateAssertions } from '../sensor/assertions.ts'
import type { Assertions, ExtractedRecord } from '../contracts/types.ts'

const ANCHOR_MIN_OVERLAP = 0.3

export type GateCheck = { name: 'live' | 'regression' | 'anchor' | 'resolved'; pass: boolean; detail: string }
export type GateVerdict = { pass: boolean; checks: GateCheck[] }

export type GateInput = {
  live: { records: ExtractedRecord[]; assertions: Assertions }
  regression: Array<{ label: string; records: ExtractedRecord[]; assertions: Assertions }>
  lastGoodKeys: string[]
  // The post-repair sensor verdict. Without it the gate cannot tell whether the
  // fault that triggered the heal is actually gone -- a repair changing nothing
  // satisfies every assertion and every anchor. Absent means FAIL, not skip.
  repaired?: { severity: 'none' | 'warn' | 'critical'; signals: string[] }
}

export function evaluateGate(input: GateInput): GateVerdict {
  const checks: GateCheck[] = []

  const live = evaluateAssertions(input.live.records, input.live.assertions)
  checks.push({
    name: 'live',
    pass: live.pass,
    detail: live.pass ? `${input.live.records.length} records, all assertions met` : live.failures.join('; '),
  })

  const regressionFailures: string[] = []
  for (const fixture of input.regression) {
    const result = evaluateAssertions(fixture.records, fixture.assertions)
    if (!result.pass) regressionFailures.push(`${fixture.label}: ${result.failures.join('; ')}`)
  }
  checks.push({
    name: 'regression',
    pass: regressionFailures.length === 0,
    detail: regressionFailures.length === 0
      ? `${input.regression.length} fixture(s) still pass`
      : regressionFailures.join(' | '),
  })

  if (input.lastGoodKeys.length === 0) {
    checks.push({ name: 'anchor', pass: true, detail: 'skipped: no prior good run to anchor against' })
  } else {
    const liveKeys = new Set(input.live.records.map(r => r.key))
    const kept = input.lastGoodKeys.filter(k => liveKeys.has(k)).length
    const ratio = kept / input.lastGoodKeys.length
    checks.push({
      name: 'anchor',
      pass: ratio >= ANCHOR_MIN_OVERLAP,
      detail: `${kept}/${input.lastGoodKeys.length} known keys retained (${(ratio * 100).toFixed(0)}%, need ${ANCHOR_MIN_OVERLAP * 100}%)`,
    })
  }

  if (input.repaired === undefined) {
    checks.push({
      name: 'resolved',
      pass: false,
      detail: 'no post-repair sensor verdict supplied — cannot confirm the fault is gone',
    })
  } else {
    const stillBroken = input.repaired.severity === 'critical'
    checks.push({
      name: 'resolved',
      pass: !stillBroken,
      detail: stillBroken
        ? `the original fault is still present: ${input.repaired.signals.join(', ')}`
        : 'sensor reports no critical drift on the repaired output',
    })
  }

  return { pass: checks.every(c => c.pass), checks }
}
