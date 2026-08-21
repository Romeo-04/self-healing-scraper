import { evaluateAssertions, fillRate } from './assertions.ts'
import { maxInternalRepeat, median } from './signals.ts'
import type { ExtractedRecord, FieldName, Issue, PayloadContract } from '../contracts/types.ts'

export type SignalCode =
  | 'HARD_SCHEMA_FAIL' | 'FILL_RATE_DROP' | 'ITEM_COUNT_COLLAPSE'
  | 'TYPE_VIOLATION' | 'FIELD_BLEED'

export type Signal = { code: SignalCode; severity: 'warn' | 'critical'; detail: string }

export type HistoryEntry = { recordCount: number; fillRates: Partial<Record<FieldName, number>> }

export type SensorInput = {
  records: ExtractedRecord[]
  issues: Issue[]
  contract: PayloadContract
  history: HistoryEntry[]
}

export type DriftVerdict = {
  severity: 'none' | 'warn' | 'critical'
  signals: Signal[]
  evidence: Record<string, unknown>
}

const BLEED_THRESHOLD = 3
const MISSING_SHARE = 0.2
const FILL_DROP_POINTS = 0.4

export function runSensor(input: SensorInput): DriftVerdict {
  const { records, issues, contract, history } = input
  const signals: Signal[] = []
  const total = Math.max(records.length, 1)

  // 1 HARD_SCHEMA_FAIL
  for (const spec of contract.fields.filter(f => f.required)) {
    const missing = issues.filter(i => i.field === spec.name && i.kind === 'missing').length
    if (missing / total > MISSING_SHARE) {
      signals.push({ code: 'HARD_SCHEMA_FAIL', severity: 'critical',
        detail: `${spec.name} missing in ${missing}/${total} records` })
    }
  }

  // 4 TYPE_VIOLATION
  const typeIssues = issues.filter(i => i.kind === 'type')
  if (typeIssues.length / total > MISSING_SHARE) {
    signals.push({ code: 'TYPE_VIOLATION', severity: 'critical',
      detail: `${typeIssues.length} type failures, e.g. ${typeIssues[0]?.detail ?? ''}` })
  }

  // 3 ITEM_COUNT_COLLAPSE
  const historicalMedian = median(history.map(h => h.recordCount))
  if (records.length < contract.assertions.minItems) {
    signals.push({ code: 'ITEM_COUNT_COLLAPSE', severity: 'critical',
      detail: `${records.length} records, minItems ${contract.assertions.minItems}` })
  } else if (historicalMedian > 0 && records.length < historicalMedian * 0.5) {
    signals.push({ code: 'ITEM_COUNT_COLLAPSE', severity: 'critical',
      detail: `${records.length} records vs rolling median ${historicalMedian}` })
  }

  // 2 FILL_RATE_DROP
  for (const spec of contract.fields) {
    const current = fillRate(records, spec.name)
    const past = median(
      history.map(h => h.fillRates[spec.name]).filter((v): v is number => v !== undefined)
    )
    const floor = contract.assertions.fieldFillRate[spec.name]
    if (floor !== undefined && current < floor) {
      signals.push({ code: 'FILL_RATE_DROP', severity: 'critical',
        detail: `${spec.name} fill ${current.toFixed(2)} below floor ${floor}` })
    } else if (past > 0 && past - current > FILL_DROP_POINTS) {
      signals.push({ code: 'FILL_RATE_DROP', severity: 'critical',
        detail: `${spec.name} fill fell ${past.toFixed(2)} -> ${current.toFixed(2)}` })
    }
  }

  // 5 FIELD_BLEED — intra-value self-repetition
  const bleeding: Record<string, number> = {}
  for (const record of records) {
    for (const [field, value] of Object.entries(record.raw)) {
      if (typeof value !== 'string') continue
      const repeat = maxInternalRepeat(value)
      if (repeat >= BLEED_THRESHOLD) bleeding[field] = Math.max(bleeding[field] ?? 0, repeat)
    }
  }
  for (const [field, repeat] of Object.entries(bleeding)) {
    signals.push({ code: 'FIELD_BLEED', severity: 'critical',
      detail: `${field} repeats an internal phrase ${repeat}x within a single value` })
  }

  // contract assertions (carries expectVaried)
  const assertionResult = evaluateAssertions(records, contract.assertions)
  for (const failure of assertionResult.failures) {
    if (failure.startsWith('expectVaried')) {
      signals.push({ code: 'FIELD_BLEED', severity: 'critical', detail: failure })
    }
  }

  const severity: DriftVerdict['severity'] =
    signals.some(s => s.severity === 'critical') ? 'critical'
    : signals.length > 0 ? 'warn'
    : 'none'

  return {
    severity,
    signals,
    evidence: {
      recordCount: records.length,
      issueCount: issues.length,
      assertionFailures: assertionResult.failures,
      sampleRecords: records.slice(0, 3).map(r => r.raw),
    },
  }
}
