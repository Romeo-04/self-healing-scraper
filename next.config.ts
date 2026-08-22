import type { NextConfig } from 'next'

const config: NextConfig = {
  // A stray package-lock.json in the user's home directory makes Next infer the
  // wrong workspace root, which makes it look for app/ in the wrong place and
  // return 404 for every route. Pin the root to this project.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
}

export default config
