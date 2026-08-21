export function trim(value: unknown): string | undefined {
  if (typeof value !== 'string') return typeof value === 'number' ? String(value) : undefined
  const out = value.trim()
  return out === '' ? undefined : out
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  // tolerate both 1,299.00 and 1.299,00 by keeping the last separator as decimal
  const cleaned = value.replace(/[^\d.,-]/g, '')
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalised = cleaned
  if (lastComma > lastDot) normalised = cleaned.replace(/\./g, '').replace(',', '.')
  else normalised = cleaned.replace(/,/g, '')
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
