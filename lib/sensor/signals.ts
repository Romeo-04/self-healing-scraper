export function maxInternalRepeat(value: string): number {
  const tokens = value.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length < 4) return 1

  let best = 1
  // n starts at 2: single-word repeats are common in ordinary prose and titles
  const maxN = Math.min(4, Math.floor(tokens.length / 2))
  for (let n = 2; n <= maxN; n++) {
    const counts = new Map<string, number>()
    for (let i = 0; i + n <= tokens.length; i++) {
      const gram = tokens.slice(i, i + n).join(' ')
      counts.set(gram, (counts.get(gram) ?? 0) + 1)
    }
    for (const count of counts.values()) if (count > best) best = count
  }
  return best
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0)
}
