'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Brief §2: "Live-updating. Data refreshes every 2 seconds." router.refresh()
// re-runs the server components on the current route with a fresh DB read —
// this component performs no data access itself, it only triggers the
// existing read-only server render again. Nothing here mutates anything.
export function AutoRefresh({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])
  return null
}
