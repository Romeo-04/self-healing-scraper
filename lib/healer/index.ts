import { extractJson } from '../brightdata/cli.ts'
import { applyContract } from '../extract/index.ts'
import { evaluateAssertions } from '../sensor/assertions.ts'
import { maxInternalRepeat } from '../sensor/signals.ts'
import { buildHealPrompt } from './prompt.ts'
import { evaluateGate } from './gate.ts'
import type { GateVerdict } from './gate.ts'
import type { Assertions, ExtractedRecord, PayloadContract } from '../contracts/types.ts'
import { runSensor } from '../sensor/index.ts'
import type { DriftVerdict, HistoryEntry } from '../sensor/index.ts'

const STUDIO_ATTEMPTS = 3

export type HealDeps = {
  heal: (collectorId: string, prompt: string, url: string) => Promise<{ stdout: string }>
  approve: (collectorId: string, url: string) => Promise<void>
  reject: (collectorId: string, url: string) => Promise<void>
  runCollector: (collectorId: string, url: string) => Promise<unknown[]>
  fallbackPropose: (args: {
    contract: PayloadContract; verdict: DriftVerdict; sample: unknown[]
  }) => Promise<PayloadContract>
}

export type HealInput = {
  collectorId: string
  url: string
  contract: PayloadContract
  verdict: DriftVerdict
  sample: unknown[]
  lastGoodKeys: string[]
  fixtures: Array<{ label: string; url: string; assertions: Assertions }>
  history: HistoryEntry[]
}

// verdict is null when a proposal was refused at the preview stage, before it
// ever touched the full gate. previewFailures is empty whenever the preview
// passed or was unavailable — it only carries content on a preview rejection.
export type HealAttempt = {
  source: 'studio' | 'fallback'
  verdict: GateVerdict | null
  previewFailures: string[]
  cliAction: 'approve' | 'reject' | 'none'
}

export type HealOutcome = {
  status: 'promoted' | 'rejected' | 'failed'
  source: 'studio' | 'fallback' | 'none'
  attempts: HealAttempt[]
  contract: PayloadContract
}

// A pending proposal is invisible to `bdata scraper run` — run returns the OLD
// output until the proposal is approved. The only thing observable before
// approval is the heal command's own self-reported preview_result. Parse it so
// a proposal that is obviously bad (missing fields, still bleeding) can be
// refused while it is still reversible via `approve --reject`.
export function extractPreviewRecords(
  stdout: string,
  contract: PayloadContract,
): ExtractedRecord[] | null {
  let envelope: unknown
  try {
    envelope = extractJson(stdout)
  } catch {
    return null
  }
  if (envelope === null || typeof envelope !== 'object') return null
  const preview = (envelope as Record<string, unknown>).preview_result
  if (!Array.isArray(preview) || preview.length === 0) return null
  return applyContract(preview, contract).records
}

async function gateFor(
  deps: HealDeps, input: HealInput, contract: PayloadContract,
): Promise<GateVerdict> {
  const livePayload = await deps.runCollector(input.collectorId, input.url)
  const live = applyContract(livePayload, contract)

  const regression = []
  for (const fixture of input.fixtures) {
    const payload = fixture.url === input.url
      ? livePayload
      : await deps.runCollector(input.collectorId, fixture.url)
    regression.push({
      label: fixture.label,
      records: applyContract(payload, contract).records,
      assertions: fixture.assertions,
    })
  }

  const verdict = runSensor({ records: live.records, issues: live.issues, contract, history: input.history })

  return evaluateGate({
    live: { records: live.records, assertions: contract.assertions },
    regression,
    lastGoodKeys: input.lastGoodKeys,
    repaired: { severity: verdict.severity, signals: verdict.signals.map(s => s.code) },
  })
}

export async function healTarget(deps: HealDeps, input: HealInput): Promise<HealOutcome> {
  const attempts: HealAttempt[] = []
  let priorRejection: string | undefined

  for (let attempt = 0; attempt < STUDIO_ATTEMPTS; attempt++) {
    const prompt = buildHealPrompt({
      verdict: input.verdict, contract: input.contract, sample: input.sample, priorRejection,
    })
    // Tracks whether `approve` has actually been called for this attempt, so
    // that a failure after approval never gets misreported as 'none' in the
    // audit trail -- the approval itself is irreversible and must be recorded
    // even if everything after it throws.
    let approved = false
    try {
      const healed = await deps.heal(input.collectorId, prompt, input.url)

      // Stage 1 — pre-approval, from the heal output's own preview. A sample
      // cannot satisfy minItems or the anchor check, so assert only what a
      // sample supports: fields present and typed, and no bleeding.
      const previewRecords = extractPreviewRecords(healed.stdout, input.contract)
      if (previewRecords === null) {
        // No preview means the only bleed-aware check before an irreversible
        // action could not run. Fail closed: reject while still pending
        // rather than proceeding to approval on blind faith.
        await deps.reject(input.collectorId, input.url)
        const failures = ['no preview_result in heal output — cannot verify before approving']
        attempts.push({
          source: 'studio', verdict: null, previewFailures: failures, cliAction: 'reject',
        })
        priorRejection = `preview rejected: ${failures.join('; ')}`
        continue
      }
      const sampleAssertions: Assertions = {
        minItems: 1,
        fieldFillRate: input.contract.assertions.fieldFillRate,
      }
      const previewCheck = evaluateAssertions(previewRecords, sampleAssertions)
      const bleeding = previewRecords.some(record =>
        Object.values(record.raw).some(
          value => typeof value === 'string' && maxInternalRepeat(value) >= 3,
        ),
      )
      if (!previewCheck.pass || bleeding) {
        // Reject while the proposal is still PENDING. This is the only point
        // at which a bad proposal can be refused without consequence.
        await deps.reject(input.collectorId, input.url)
        const failures = bleeding
          ? [...previewCheck.failures, 'preview still shows field bleed']
          : previewCheck.failures
        attempts.push({
          source: 'studio', verdict: null, previewFailures: failures, cliAction: 'reject',
        })
        priorRejection = `preview rejected: ${failures.join('; ')}`
        continue
      }

      // Stage 2 — post-approval, the full gate. There is no revert once
      // approved, so a gate failure here is recorded, never rejected.
      await deps.approve(input.collectorId, input.url)
      approved = true
      const verdict = await gateFor(deps, input, input.contract)

      if (verdict.pass) {
        attempts.push({ source: 'studio', verdict, previewFailures: [], cliAction: 'approve' })
        return {
          status: 'promoted',
          source: 'studio',
          attempts,
          contract: { ...input.contract, version: input.contract.version + 1 },
        }
      }

      attempts.push({ source: 'studio', verdict, previewFailures: [], cliAction: 'approve' })
      priorRejection = verdict.checks.filter(c => !c.pass).map(c => `${c.name}: ${c.detail}`).join('; ')
    } catch (error) {
      // An approval may already have happened (e.g. runCollector timing out
      // during the post-approval gate). The database must never be able to
      // deny that an irreversible approval occurred, so the attempt is
      // recorded here too, before returning failed.
      const message = error instanceof Error ? error.message : String(error)
      attempts.push({
        source: 'studio',
        verdict: null,
        previewFailures: [message],
        cliAction: approved ? 'approve' : 'none',
      })
      return { status: 'failed', source: 'none', attempts, contract: input.contract }
    }
  }

  // Studio exhausted. Try our own repair; it faces the identical gate. This
  // path never touches the CLI's approve/reject at all — it is a locally
  // generated contract, evaluated the same way, promoted only on its own merit.
  try {
    const candidate = await deps.fallbackPropose({
      contract: input.contract, verdict: input.verdict, sample: input.sample,
    })
    const verdict = await gateFor(deps, input, candidate)
    attempts.push({ source: 'fallback', verdict, previewFailures: [], cliAction: 'none' })
    if (verdict.pass) {
      return { status: 'promoted', source: 'fallback', attempts, contract: candidate }
    }
  } catch {
    // fall through to failed: the old contract stays live
  }

  return { status: 'failed', source: 'none', attempts, contract: input.contract }
}
