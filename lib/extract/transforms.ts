export function trim(value: unknown): string | undefined {
  if (typeof value !== 'string') return typeof value === 'number' ? String(value) : undefined
  const out = value.trim()
  return out === '' ? undefined : out
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined

  const cleaned = value.replace(/[^\d.,-]/g, '')
  if (cleaned === '') return undefined

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  let normalised: string
  if (lastComma >= 0 && lastDot >= 0) {
    // Both separators present: the later one is the decimal point.
    normalised = lastComma > lastDot
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '')
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.'
    const occurrences = cleaned.split(sep).length - 1
    const trailing = cleaned.length - cleaned.lastIndexOf(sep) - 1
    // A lone separator followed by exactly three digits is a thousands
    // grouping, not a decimal point: "1,299" is 1299, not 1.299. Repeated
    // separators are always grouping. Guessing wrong in this direction
    // yields a too-LARGE value, which the contract's priceRange assertion
    // can catch; the opposite error is silent and uncatchable.
    const isGrouping = occurrences > 1 || trailing === 3
    normalised = isGrouping ? cleaned.split(sep).join('') : cleaned.replace(sep, '.')
  } else {
    normalised = cleaned
  }

  const parsed = Number.parseFloat(normalised)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseStock(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  const text = value.toLowerCase()
  if (text.includes('out of stock') || text.includes('unavailable')) return false
  if (text.includes('in stock') || text.includes('available')) return true
  return undefined
}
