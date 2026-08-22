// Small formatting helpers shared across server components. Pure functions
// only — no data access here (that stays in app/db.ts callers).

export function relativeTime(iso: string, now: number = Date.now()): string {
  // SQLite's datetime('now') writes 'YYYY-MM-DD HH:MM:SS' in UTC with no
  // offset marker — append 'Z' so Date parses it as UTC, not local time.
  const t = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).getTime()
  if (Number.isNaN(t)) return iso
  const diffMs = now - t
  const sec = Math.round(diffMs / 1000)
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  return `${day}d ago`
}

export function isStale(iso: string, thresholdMs: number, now: number = Date.now()): boolean {
  const t = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).getTime()
  if (Number.isNaN(t)) return false
  return now - t > thresholdMs
}

export function formatTimestamp(iso: string): string {
  const t = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(t.getTime())) return iso
  return t.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z')
}

export function formatPrice(value: number | null, currency: string | null): string {
  if (value === null) return '—'
  const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''
  return `${symbol}${value.toFixed(2)}`
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

// Very small syntax highlighter for the evidence JSON blocks — string keys,
// string values, and numbers get distinct token classes. Deliberately not a
// dependency: the payloads are small and already trusted (our own DB).
const JSON_TOKEN = /"(?:\\u[0-9a-fA-F]{4}|\\.|[^"\\])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g

export function highlightJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2)
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(JSON_TOKEN, (match, keyColon: string | undefined) => {
    if (keyColon !== undefined) return `<span class="jk">${match}</span>`
    if (match.startsWith('"')) return `<span class="js">${match}</span>`
    return `<span class="jn">${match}</span>`
  })
}
