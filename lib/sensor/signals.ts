const MAX_TOKENS = 200

export function maxInternalRepeat(value: string): number {
  const all = value.toLowerCase().split(/\s+/).filter(Boolean)
  if (all.length < 4) return 1
  // Bound the work: a legitimate price, availability, or title is nowhere near
  // 200 tokens, and the scan is quadratic in token count.
  const tokens = all.slice(0, MAX_TOKENS)

  let best = 1
  // n starts at 2 and the run must be CONSECUTIVE. Sibling-node concatenation
  // produces back-to-back repeats ("in stock in stock in stock"); ordinary prose
  // repeats a phrase with other words in between ("the best of the best"), which
  // is why counting occurrences anywhere gave false positives on real titles.
  const maxN = Math.min(4, Math.floor(tokens.length / 2))
  for (let n = 2; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const slice = tokens.slice(i, i + n)
      // A repeated SINGLE word is emphasis, a chant, or laughter -- "ha ha ha
      // ha ha ha" is not a scraper defect. Concatenated sibling nodes repeat a
      // multi-word phrase. Requiring two distinct tokens removes the parity
      // artifact where an even-count word run chained through the n=2 window.
      if (new Set(slice).size < 2) continue
      const gram = slice.join(' ')
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
