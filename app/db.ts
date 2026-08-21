import { DatabaseSync } from 'node:sqlite'

// The console reads the engine's database directly and never imports from lib/.
// Two reasons: the UI only needs reads, and lib/ uses explicit .ts import
// extensions that Next's bundler does not resolve.
export function readDb<T>(sql: string, params: unknown[] = []): T[] {
  const db = new DatabaseSync('data.db', { readOnly: true })
  try {
    return db.prepare(sql).all(...(params as never[])) as T[]
  } finally {
    db.close()
  }
}
