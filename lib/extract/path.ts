export function readPath(source: unknown, path: string): unknown {
  let cursor: unknown = source
  for (const segment of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

export function readWithFallbacks(source: unknown, path: string, fallbacks: string[] = []): unknown {
  for (const candidate of [path, ...fallbacks]) {
    const value = readPath(source, candidate)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}
