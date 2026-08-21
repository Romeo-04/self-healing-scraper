import { readWithFallbacks } from './path.ts'
import { deriveKey } from './key.ts'
import { trim, toNumber, parseStock } from './transforms.ts'
import type { ExtractedRecord, FieldSpec, Issue, PayloadContract } from '../contracts/types.ts'

function applyTransform(spec: FieldSpec, value: unknown): unknown {
  switch (spec.transform) {
    case 'trim': return trim(value)
    case 'toNumber': return toNumber(value)
    case 'parseStock': return parseStock(value)
    default: return value
  }
}

function typeOk(spec: FieldSpec, value: unknown): boolean {
  switch (spec.type) {
    case 'number': return typeof value === 'number'
    case 'boolean': return typeof value === 'boolean'
    case 'url': return typeof value === 'string' && /^https?:\/\//.test(value)
    default: return typeof value === 'string'
  }
}

export function applyContract(
  payload: unknown[],
  contract: PayloadContract,
): { records: ExtractedRecord[]; issues: Issue[] } {
  const records: ExtractedRecord[] = []
  const issues: Issue[] = []

  payload.forEach((item, index) => {
    const values = new Map<string, unknown>()

    for (const spec of contract.fields) {
      const rawValue = readWithFallbacks(item, spec.path, spec.fallbackPaths)
      const value = applyTransform(spec, rawValue)

      if (value === undefined) {
        if (rawValue !== undefined) {
          // Present but untransformable is a TYPE failure, not an absence.
          // The sensor routes these to different signals (TYPE_VIOLATION vs
          // HARD_SCHEMA_FAIL) which produce different repair prompts, so
          // conflating them would make the system repair the wrong thing.
          issues.push({ index, field: spec.name, kind: 'type', detail: `could not transform ${JSON.stringify(rawValue)}` })
        } else if (spec.required) {
          issues.push({ index, field: spec.name, kind: 'missing', detail: `no value at ${spec.path}` })
        }
        continue
      }
      if (!typeOk(spec, value)) {
        issues.push({ index, field: spec.name, kind: 'type', detail: `expected ${spec.type}, got ${typeof value}` })
        continue
      }
      values.set(spec.name, value)
    }

    const url = values.get('url') as string | undefined
    const title = values.get('title') as string | undefined
    if (url === undefined && title === undefined) return

    records.push({
      key: deriveKey(url, title),
      title,
      price: values.get('price') as number | undefined,
      currency: values.get('currency') as string | undefined,
      inStock: values.get('availability') as boolean | undefined,
      url,
      raw: (item ?? {}) as Record<string, unknown>,
    })
  })

  return { records, issues }
}
