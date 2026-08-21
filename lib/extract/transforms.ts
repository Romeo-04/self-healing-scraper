export function trim(value: unknown): string | undefined {
  if (typeof value !== 'string') return typeof value === 'number' ? String(value) : undefined
  const out = value.trim()
  return out === '' ? undefined : out
}

const SIGN_CHARS = /[\u2212\u2012\u2013\u2014]/g
const SPACE_CHARS = /[\u00A0\u202F\u2009]/g

function validGroups(groups: string[]): boolean {
  if (groups.length === 1) return /^\d+$/.test(groups[0] ?? '')
  return /^[1-9]\d{0,2}$/.test(groups[0] ?? '') && groups.slice(1).every(g => /^\d{3}$/.test(g))
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined

  const text = value.replace(SIGN_CHARS, '-').replace(SPACE_CHARS, ' ').trim()

  // Peel currency decoration off each END only. Decoration may not contain a
  // digit, separator, or sign, so a leading "." survives into the body and a
  // stray second "-" cannot hide in it.
  const lead = /^[^\d.,\-%]*/.exec(text)?.[0] ?? ''
  const afterLead = text.slice(lead.length)
  const tail = /[^\d.,\-%]*$/.exec(afterLead)?.[0] ?? ''
  const core = afterLead.slice(0, afterLead.length - tail.length)

  // The core must be exactly one signed numeric run. Anything else between the
  // digits means the string holds more than one number, and refusing is the
  // only safe answer: salvaging is how "Save $5 Now $23.99" became 523.99.
  if (!/^-?[\d., ]+$/.test(core) || !/\d/.test(core)) return undefined
  const sign = core.startsWith('-') ? -1 : 1
  const body = core.replace(/^-/, '').trim()

  // A space inside the body is only ever a thousands separator.
  // Space-grouped thousands, where the FINAL group may carry the decimal
  // tail: "1 299,50" is the standard French rendering of 1299.50.
  const spaced = body.split(' ')
  if (spaced.length > 1) {
    const head = spaced[0] ?? ''
    const mid = spaced.slice(1, -1)
    const last = spaced[spaced.length - 1] ?? ''
    const ok = /^[1-9]\d{0,2}$/.test(head)
      && mid.every(g => /^\d{3}$/.test(g))
      && /^\d{3}([.,]\d+)?$/.test(last)
    if (!ok) return undefined
  }
  const despaced = spaced.join('')

  const lastComma = despaced.lastIndexOf(',')
  const lastDot = despaced.lastIndexOf('.')
  let normalised: string

  if (lastComma >= 0 && lastDot >= 0) {
    // Both separators: the later one is the decimal point, and the earlier one
    // must form valid 3-digit groups. Fix 2 skipped this check on this branch,
    // which let "1.2.3,4" through as 123.4.
    const dec = lastComma > lastDot ? ',' : '.'
    const grp = dec === ',' ? '.' : ','
    const parts = despaced.split(dec)
    if (parts.length !== 2) return undefined
    if (!validGroups((parts[0] ?? '').split(grp))) return undefined
    if (!/^\d+$/.test(parts[1] ?? '')) return undefined
    normalised = (parts[0] ?? '').split(grp).join('') + '.' + parts[1]
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.'
    const parts = despaced.split(sep)
    if (parts.length === 2 && /^[1-9]\d{0,2}$/.test(parts[0] ?? '') && /^\d{3}$/.test(parts[1] ?? '')) {
      normalised = parts.join('')
    } else if (parts.length > 2) {
      if (!validGroups(parts)) return undefined
      normalised = parts.join('')
    } else {
      normalised = despaced.replace(sep, '.')
    }
  } else {
    normalised = despaced
  }

  // Never let parseFloat salvage a prefix: parseFloat('1.2.3') is 1.2, and that
  // salvage is the silent-corruption mechanism this function exists to prevent.
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(normalised)) return undefined
  const parsed = Number.parseFloat(normalised)
  return Number.isFinite(parsed) ? sign * parsed : undefined
}

export function parseStock(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  const text = value.toLowerCase()
  if (text.includes('out of stock') || text.includes('unavailable')) return false
  if (text.includes('in stock') || text.includes('available')) return true
  return undefined
}
