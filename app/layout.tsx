import type { ReactNode } from 'react'
import { Nav } from './components/Nav.tsx'
import { StatusStrip } from './components/StatusStrip.tsx'
import { AutoRefresh } from './components/AutoRefresh.tsx'
import { getGlobalStatus } from './queries.ts'
import './globals.css'

export const metadata = { title: 'Canon Event' }
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: ReactNode }) {
  const status = getGlobalStatus()
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="wordmark" data-short="ITSV">
              <span>CANON EVENT</span>
            </div>
            <Nav />
          </aside>
          <div className="main">
            <StatusStrip
              total={status.total}
              healthy={status.healthy}
              healing={status.healing}
              lastRunAt={status.lastRunAt}
            />
            <div className="content">{children}</div>
          </div>
        </div>
        <AutoRefresh />
      </body>
    </html>
  )
}
