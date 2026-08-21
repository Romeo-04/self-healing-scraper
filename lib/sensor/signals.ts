export function maxInternalRepeat(value: string): number {
  const tokens = value.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length < 4) return 1

  let best = 1
  // n starts at 2 and the run must be CONSECUTIVE. Sibling-node concatenation
  // produces back-to-back repeats ("in stock in stock in stock"); ordinary prose
  // repeats a phrase with other words in between ("the best of the best"), which
  // is why counting occurrences anywhere gave false positives on real titles.
  const maxN = Math.min(4, Math.floor(tokens.length / 2))
  for (let n = 2; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const gram = tokens.slice(i, i + n).join(' ')
      let run = 1
      let j = i + n
      while (j + n <= tokens.length && tokens.slice(j, j + n).join(' ') === gram) {
        run++
        j += n
      }
      if (run > best) best = run
    }
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
