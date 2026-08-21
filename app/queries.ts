import { readDb } from './db.ts'
import type {
  ContractRow, DriftEventRow, FieldName, GateVerdict, HealAttemptRow, HealthState,
  RecordRow, RunRow, RunStatus, Signal, TargetRow,
} from './types.ts'

export function listTargets(): TargetRow[] {
  return readDb<TargetRow>('SELECT * FROM targets ORDER BY name ASC')
}

export function getTarget(targetId: string): TargetRow | undefined {
  return readDb<TargetRow>('SELECT * FROM targets WHERE id = ?', [targetId])[0]
}

export function getRecentRuns(targetId: string, limit = 20): RunRow[] {
  return readDb<RunRow>(
    'SELECT * FROM runs WHERE target_id = ? ORDER BY id DESC LIMIT ?',
    [targetId, limit],
  )
}

export function getRecordsForRun(runId: number): RecordRow[] {
  return readDb<RecordRow>('SELECT * FROM records WHERE run_id = ? ORDER BY id ASC', [runId])
}

export function getDriftEventsForRun(runId: number): DriftEventRow[] {
  return readDb<DriftEventRow>('SELECT * FROM drift_events WHERE run_id = ? ORDER BY id ASC', [runId])
}

export function getAllDriftEventsForTarget(targetId: string): DriftEventRow[] {
  return readDb<DriftEventRow>(
    `SELECT de.* FROM drift_events de JOIN runs r ON r.id = de.run_id
     WHERE r.target_id = ? ORDER BY de.id DESC`,
    [targetId],
  )
}

export function getHealAttemptsForDrift(driftEventId: number): HealAttemptRow[] {
  return readDb<HealAttemptRow>(
    'SELECT * FROM heal_attempts WHERE drift_event_id = ? ORDER BY id ASC',
    [driftEventId],
  )
}

export function getContracts(targetId: string): ContractRow[] {
  return readDb<ContractRow>(
    'SELECT * FROM contracts WHERE target_id = ? ORDER BY version DESC',
    [targetId],
  )
}

const FIELDS: FieldName[] = ['title', 'price', 'currency', 'availability', 'url']

export function fillRates(records: RecordRow[]): Array<{ field: FieldName; ratio: number }> {
  const total = records.length
  if (total === 0) return FIELDS.map(field => ({ field, ratio: 0 }))
  return FIELDS.map(field => {
    const present = records.filter(r => {
      if (field === 'title') return r.title !== null && r.title !== ''
      if (field === 'price') return r.price !== null
      if (field === 'currency') return r.currency !== null && r.currency !== ''
      if (field === 'availability') return r.in_stock !== null
      return r.url !== null && r.url !== ''
    }).length
    return { field, ratio: present / total }
  })
}

// In-progress heal_attempts statuses — a repair whose gate hasn't resolved yet.
const IN_FLIGHT: ReadonlyArray<HealAttemptRow['status']> = ['proposed', 'validated']

export function healthStateFor(latestRun: RunRow | undefined, activeHealAttempts: HealAttemptRow[]): HealthState {
  if (latestRun === undefined) return 'healthy' // no runs yet reads as calm, not broken
  if (latestRun.status === 'failed') return 'failed'
  if (latestRun.status === 'pending') return 'healing'
  if (latestRun.status === 'drift') {
    return activeHealAttempts.some(a => IN_FLIGHT.includes(a.status)) ? 'healing' : 'anomaly'
  }
  return 'healthy' // 'ok' | 'healed'
}

export type FleetCard = {
  target: TargetRow
  latestRun: RunRow | undefined
  recentRuns: RunRow[]
  fillRates: Array<{ field: FieldName; ratio: number }>
  state: HealthState
  minItems: number | null
}

export function getFleetData(): FleetCard[] {
  const targets = listTargets()
  return targets.map(target => {
    const recentRuns = getRecentRuns(target.id, 20)
    const latestRun = recentRuns[0]
    const records = latestRun ? getRecordsForRun(latestRun.id) : []
    const driftEvents = latestRun ? getDriftEventsForRun(latestRun.id) : []
    const healAttempts = driftEvents.flatMap(d => getHealAttemptsForDrift(d.id))
    const state = healthStateFor(latestRun, healAttempts)
    const contracts = getContracts(target.id)
    const activeContract = contracts.find(c => c.version === target.active_contract_version)
    let minItems: number | null = null
    if (activeContract) {
      try {
        const spec = JSON.parse(activeContract.spec_json) as { assertions?: { minItems?: number } }
        minItems = spec.assertions?.minItems ?? null
      } catch {
        minItems = null
      }
    }
    return { target, latestRun, recentRuns, fillRates: fillRates(records), state, minItems }
  })
}

// ---------------- Timeline ----------------

export type TimelineEvent =
  | { kind: 'run-ok'; sortKey: string; at: string; targetId: string; targetName: string; runId: number; recordCount: number; contractVersion: number; durationSec: number | null }
  | { kind: 'run-failed'; sortKey: string; at: string; targetId: string; targetName: string; runId: number; error: string | null }
  | { kind: 'anomaly'; sortKey: string; at: string; targetId: string; targetName: string; runId: number; driftEventId: number; severity: 'warn' | 'critical'; signals: Signal[]; evidence: unknown; hasHealAttempt: boolean }
  | { kind: 'repair-requested'; sortKey: string; at: string; targetId: string; targetName: string; attemptId: number; source: 'studio' | 'fallback'; prompt: string | null; fromVersion: number }
  | { kind: 'gate-verdict'; sortKey: string; at: string; targetId: string; targetName: string; attemptId: number; fromVersion: number; toVersion: number | null; verdict: GateVerdict | null; previewFailures: string[] }
  | { kind: 'approved'; sortKey: string; at: string; targetId: string; targetName: string; attemptId: number; fromVersion: number; toVersion: number }
  | { kind: 'rejected'; sortKey: string; at: string; targetId: string; targetName: string; attemptId: number; fromVersion: number }
  | { kind: 'needs-human'; sortKey: string; at: string; targetId: string; targetName: string; attemptId: number; fromVersion: number }

function parseSignals(json: string): Signal[] {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed as Signal[]
  } catch {
    return []
  }
}

type ValidationReportShape =
  | { checks: GateVerdict['checks']; pass: boolean }
  | { previewFailures: string[] }
  | Record<string, never>

function parseValidationReport(json: string | null): ValidationReportShape {
  if (json === null) return {}
  try {
    return JSON.parse(json) as ValidationReportShape
  } catch {
    return {}
  }
}

export function getTimelineEvents(targetFilter?: string): TimelineEvent[] {
  const targets = targetFilter ? [getTarget(targetFilter)].filter((t): t is TargetRow => t !== undefined) : listTargets()
  const events: TimelineEvent[] = []

  for (const target of targets) {
    const runs = getRecentRuns(target.id, 200)
    for (const run of runs) {
      if (run.status === 'failed') {
        events.push({
          kind: 'run-failed', sortKey: `${run.started_at}-${run.id}-0`, at: run.started_at,
          targetId: target.id, targetName: target.name, runId: run.id, error: run.error,
        })
        continue
      }
      if (run.status === 'ok') {
        const durationSec = run.finished_at
          ? Math.max(0, Math.round((new Date(`${run.finished_at.replace(' ', 'T')}Z`).getTime()
            - new Date(`${run.started_at.replace(' ', 'T')}Z`).getTime()) / 1000))
          : null
        events.push({
          kind: 'run-ok', sortKey: `${run.started_at}-${run.id}-0`, at: run.started_at,
          targetId: target.id, targetName: target.name, runId: run.id,
          recordCount: run.record_count, contractVersion: run.contract_version, durationSec,
        })
        continue
      }
      // 'drift' and 'healed' runs are represented by their drift/heal events below,
      // not by a standalone run-ok/run-failed marker.
      const driftEvents = getDriftEventsForRun(run.id)
      for (const drift of driftEvents) {
        const attempts = getHealAttemptsForDrift(drift.id)
        events.push({
          kind: 'anomaly', sortKey: `${drift.created_at}-${drift.id}-0`, at: drift.created_at,
          targetId: target.id, targetName: target.name, runId: run.id, driftEventId: drift.id,
          severity: drift.severity, signals: parseSignals(drift.signals_json),
          evidence: (() => { try { return JSON.parse(drift.evidence_json) as unknown } catch { return null } })(),
          hasHealAttempt: attempts.length > 0,
        })

        for (const attempt of attempts) {
          const base = { targetId: target.id, targetName: target.name, attemptId: attempt.id, fromVersion: attempt.from_version }
          events.push({
            kind: 'repair-requested', sortKey: `${attempt.created_at}-${attempt.id}-1`, at: attempt.created_at,
            source: attempt.source, prompt: attempt.heal_prompt, ...base,
          })

          const report = parseValidationReport(attempt.validation_report_json)
          const verdict = 'checks' in report ? { pass: report.pass, checks: report.checks } : null
          const previewFailures = 'previewFailures' in report ? report.previewFailures : []
          events.push({
            kind: 'gate-verdict', sortKey: `${attempt.created_at}-${attempt.id}-2`, at: attempt.created_at,
            toVersion: attempt.to_version, verdict, previewFailures, ...base,
          })

          if (attempt.status === 'promoted' && attempt.to_version !== null) {
            events.push({
              kind: 'approved', sortKey: `${attempt.created_at}-${attempt.id}-3`, at: attempt.created_at,
              toVersion: attempt.to_version, ...base,
            })
          } else if (attempt.status === 'rejected') {
            events.push({
              kind: 'rejected', sortKey: `${attempt.created_at}-${attempt.id}-3`, at: attempt.created_at, ...base,
            })
          } else if (attempt.status === 'failed') {
            events.push({
              kind: 'needs-human', sortKey: `${attempt.created_at}-${attempt.id}-3`, at: attempt.created_at, ...base,
            })
          }
        }
      }
    }
  }

  return events.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
}

// ---------------- Feed ----------------

export type FeedRow = {
  key: string
  title: string | null
  price: number | null
  currency: string | null
  inStock: number | null
  lastSeen: string
  runId: number
}

export type FeedSort = 'title' | 'price' | 'stock' | 'lastSeen'

export function getFeedRows(targetId: string, sort: FeedSort, dir: 'asc' | 'desc'): { rows: FeedRow[]; latestRun: RunRow | undefined } {
  const runs = getRecentRuns(targetId, 200)
  const latestRun = runs[0]
  if (!latestRun) return { rows: [], latestRun: undefined }
  const records = getRecordsForRun(latestRun.id)
  const rows: FeedRow[] = records.map(r => ({
    key: r.key, title: r.title, price: r.price, currency: r.currency,
    inStock: r.in_stock, lastSeen: latestRun.started_at, runId: latestRun.id,
  }))

  const mul = dir === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    switch (sort) {
      case 'price': return ((a.price ?? -Infinity) - (b.price ?? -Infinity)) * mul
      case 'stock': return ((a.inStock ?? -1) - (b.inStock ?? -1)) * mul
      case 'lastSeen': return (a.lastSeen < b.lastSeen ? -1 : a.lastSeen > b.lastSeen ? 1 : 0) * mul
      default: return (a.title ?? '').localeCompare(b.title ?? '') * mul
    }
  })

  return { rows, latestRun }
}

export type PriceHistoryPoint = { at: string; price: number; runId: number }
export type PriceHistorySeries = { key: string; title: string; points: PriceHistoryPoint[] }

// Joins records across every run for a target by key, so a book's price
// across runs forms a series. With only one run recorded so far this yields
// single-point series — the chart still renders correctly (a dot, not a
// crash) and will grow real lines as more runs accumulate.
export function getPriceHistory(targetId: string, maxSeries = 6): PriceHistorySeries[] {
  const runs = getRecentRuns(targetId, 200).slice().reverse() // oldest first
  const byKey = new Map<string, PriceHistorySeries>()
  for (const run of runs) {
    const records = getRecordsForRun(run.id)
    for (const record of records) {
      if (record.price === null) continue
      let series = byKey.get(record.key)
      if (!series) {
        series = { key: record.key, title: record.title ?? record.key, points: [] }
        byKey.set(record.key, series)
      }
      series.points.push({ at: run.started_at, price: record.price, runId: run.id })
    }
  }
  return [...byKey.values()].slice(0, maxSeries)
}

export type ContinuityMarker = { at: string; fromVersion: number; toVersion: number }

export function getContinuityMarkers(targetId: string): ContinuityMarker[] {
  const driftEvents = getAllDriftEventsForTarget(targetId)
  const markers: ContinuityMarker[] = []
  for (const drift of driftEvents) {
    for (const attempt of getHealAttemptsForDrift(drift.id)) {
      if (attempt.status === 'promoted' && attempt.to_version !== null) {
        markers.push({ at: attempt.created_at, fromVersion: attempt.from_version, toVersion: attempt.to_version })
      }
    }
  }
  return markers.sort((a, b) => (a.at < b.at ? -1 : 1))
}

export function statusLabel(status: RunStatus): string {
  return status
}

export type GlobalStatus = { total: number; healthy: number; healing: number; lastRunAt: string | null }

export function getGlobalStatus(): GlobalStatus {
  const cards = getFleetData()
  const lastRunAt = cards
    .map(c => c.latestRun?.started_at)
    .filter((v): v is string => v !== undefined)
    .sort()
    .at(-1) ?? null
  return {
    total: cards.length,
    healthy: cards.filter(c => c.state === 'healthy').length,
    healing: cards.filter(c => c.state === 'healing').length,
    lastRunAt,
  }
}
