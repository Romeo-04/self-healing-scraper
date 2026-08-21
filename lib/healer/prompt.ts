import type { PayloadContract } from '../contracts/types.ts'
import type { DriftVerdict } from '../sensor/index.ts'

const SAMPLE_LIMIT = 3

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
  const samples = sample.slice(0, SAMPLE_LIMIT)
    .map(item => JSON.stringify(item))
    .join('\n')

  const retry = priorRejection === undefined ? '' :
    `\nA previous attempt was rejected by validation for this reason:\n${priorRejection}\n` +
    `Produce a different fix that addresses it. Do not repeat the rejected approach.\n`

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
    `Each field must be read from that item's own element only. Do not concatenate`,
    `text from sibling or ancestor elements. Item count and the other fields are`,
    `currently correct, so preserve them.`,
  ].join('\n')
}
