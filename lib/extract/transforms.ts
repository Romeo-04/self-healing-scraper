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
    const parts = cleaned.split(sep)
    // A thousands separator always has digits on BOTH sides: one to three
    // before the first, and exactly three after every one. Validating the
    // shape of every group is what stops ".299" being read as 299 and stops
    // a malformed "1,23,456" being joined into 123456.
    const isGrouping =
      /^-?\d{1,3}$/.test(parts[0] ?? '') &&
      parts.length > 1 &&
      parts.slice(1).every(part => /^\d{3}$/.test(part))
    normalised = isGrouping ? parts.join('') : cleaned.replace(sep, '.')
  } else {
    normalised = cleaned
  }

  // Reject anything that is not a clean numeric literal. parseFloat salvages a
  // prefix -- parseFloat('1.2.3') is 1.2 -- and that salvage is precisely the
  // silent-corruption mechanism this function exists to prevent. Refusing to
  // parse surfaces as TYPE_VIOLATION and triggers repair; guessing does not.
  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(normalised)) return undefined

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
