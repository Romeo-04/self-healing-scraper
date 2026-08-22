import type { PayloadContract } from '../contracts/types.ts'
import type { DriftVerdict } from '../sensor/index.ts'

// The CLI's `bdata scraper heal <prompt>` documents a 1000 character maximum.
// Keep the instructional scaffolding intact and shrink only the sample section
// -- the part whose size scales with the data -- until the whole prompt fits.
const SAMPLE_LIMIT = 2
const SAMPLE_TRUNCATE_CHARS = 200
const PROMPT_MAX_CHARS = 1000

export function buildHealPrompt(input: {
  verdict: DriftVerdict
  contract: PayloadContract
  sample: unknown[]
  priorRejection?: string
}): string {
  const { verdict, contract, sample, priorRejection } = input

  const symptoms = verdict.signals.map(s => `- ${s.code}: ${s.detail}`).join('\n')
  const expected = contract.fields
    .map(f => `- ${f.name}: one ${f.type} per item, read from ${f.path}${f.required ? ' (required)' : ''}`)
    .join('\n')

  const retry = priorRejection === undefined ? '' :
    `\nA previous attempt was rejected by validation for this reason:\n${priorRejection}\n` +
    `Produce a different fix that addresses it. Do not repeat the rejected approach.\n`

  const instructions = `Each field must be read from that item's own element only. Do not concatenate\n` +
    `text from sibling or ancestor elements. Item count and the other fields are\n` +
    `currently correct, so preserve them.`

  function assemble(samples: string): string {
    return [
      `The scraper's output is malformed. Fix the extraction logic.`,
      ``,
      `Detected problems:`,
      symptoms,
      ``,
      `Each record should contain:`,
      expected,
      ``,
      `Actual malformed output:`,
      samples,
      retry,
      instructions,
    ].join('\n')
  }

  // Which raw fields do the signals actually name? Showing those fields' FULL
  // values beats a truncated dump of the whole record.
  //
  // This mattered: truncating the serialised record meant a long title consumed
  // the character budget before the malformed value appeared, so the evidence was
  // cut mid-string. A real heal was sent a prompt claiming a phrase repeated 6x
  // alongside an example showing it twice, in invalid JSON -- and the repair it
  // produced did not work.
  const named = contract.fields
    .map(f => f.name)
    .filter(name => verdict.signals.some(sig => sig.detail.includes(name)))

  function offendingValues(item: unknown): string[] {
    if (item === null || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    return named
      .filter(name => typeof record[name] === 'string')
      .map(name => `  ${name} = ${JSON.stringify(record[name])}`)
  }

  function truncateSample(item: unknown): string {
    // Prefer the offending field's complete value; it is the evidence.
    const offending = offendingValues(item)
    if (offending.length > 0) return offending.join('\n')

    const serialised = JSON.stringify(item)
    return serialised.length > SAMPLE_TRUNCATE_CHARS
      ? `${serialised.slice(0, SAMPLE_TRUNCATE_CHARS)}…`
      : serialised
  }

  let samples = sample.slice(0, SAMPLE_LIMIT).map(truncateSample).join('\n')
  let prompt = assemble(samples)

  // Still over budget (e.g. a single 200-char sample plus a long prior
  // rejection) -- keep shrinking the sample section, never the instructions.
  let sampleBudget = SAMPLE_TRUNCATE_CHARS
  while (prompt.length > PROMPT_MAX_CHARS && sampleBudget > 0) {
    sampleBudget = Math.max(0, sampleBudget - 50)
    samples = sample.slice(0, SAMPLE_LIMIT)
      .map(item => {
        const serialised = JSON.stringify(item)
        return serialised.length > sampleBudget ? `${serialised.slice(0, sampleBudget)}…` : serialised
      })
      .join('\n')
    prompt = assemble(samples)
  }

  return prompt
}
