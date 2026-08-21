import type { Assertions, ExtractedRecord, FieldName } from '../contracts/types.ts'

const FIELD_READERS: Record<FieldName, (r: ExtractedRecord) => unknown> = {
  title: r => r.title,
  price: r => r.price,
  currency: r => r.currency,
  availability: r => r.inStock,
  url: r => r.url,
}

export function fillRate(records: ExtractedRecord[], field: FieldName): number {
  if (records.length === 0) return 0
  const read = FIELD_READERS[field]
  const filled = records.filter(r => read(r) !== undefined && read(r) !== null).length
  return filled / records.length
}

export function distinctRatio(records: ExtractedRecord[], field: FieldName): number {
  if (records.length === 0) return 0
  const read = FIELD_READERS[field]
  return new Set(records.map(r => JSON.stringify(read(r)))).size / records.length
}

export function evaluateAssertions(
  records: ExtractedRecord[],
  assertions: Assertions,
): { pass: boolean; failures: string[] } {
  const failures: string[] = []

  if (records.length < assertions.minItems) {
    failures.push(`minItems: got ${records.length}, need ${assertions.minItems}`)
  }
  for (const [field, floor] of Object.entries(assertions.fieldFillRate)) {
    const rate = fillRate(records, field as FieldName)
    if (rate < (floor as number)) {
      failures.push(`fillRate.${field}: got ${rate.toFixed(2)}, need ${floor}`)
    }
  }
  if (assertions.priceRange) {
    const [lo, hi] = assertions.priceRange
    const outside = records.filter(r => r.price !== undefined && (r.price < lo || r.price > hi))
    if (outside.length > 0) failures.push(`priceRange: ${outside.length} record(s) outside [${lo},${hi}]`)
  }
  for (const field of assertions.expectVaried ?? []) {
    if (records.length > 1 && distinctRatio(records, field) < 0.5) {
      failures.push(`expectVaried.${field}: only ${distinctRatio(records, field).toFixed(2)} distinct`)
    }
  }

  return { pass: failures.length === 0, failures }
}
