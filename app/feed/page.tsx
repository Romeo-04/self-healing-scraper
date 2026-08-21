import { FeedTable } from '../components/FeedTable.tsx'
import { PriceChart } from '../components/PriceChart.tsx'
import { EmptyState } from '../components/EmptyState.tsx'
import { AlertIcon } from '../components/icons.tsx'
import { relativeTime, isStale } from '../format.ts'
import {
  getContinuityMarkers, getFeedRows, getPriceHistory, getTarget, listTargets,
} from '../queries.ts'
import type { FeedSort } from '../queries.ts'

export const dynamic = 'force-dynamic'

const STALE_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes — collector runs take 30s-4min typically

const VALID_SORTS: FeedSort[] = ['title', 'price', 'stock', 'lastSeen']

export default async function FeedPage({ searchParams }: {
  searchParams: Promise<{ target?: string; sort?: string; dir?: string }>
}) {
  const params = await searchParams
  const targets = listTargets()
  const targetId = params.target ?? targets[0]?.id

  if (targetId === undefined) {
    return (
      <>
        <header className="page-header halftone">
          <h1>Feed</h1>
          <p>The data the scrapers collect.</p>
        </header>
        <EmptyState title="No spiders deployed">
          <p>Seed a target before the feed has anything to show.</p>
        </EmptyState>
      </>
    )
  }

  const target = getTarget(targetId)
  const sort: FeedSort = VALID_SORTS.includes(params.sort as FeedSort) ? (params.sort as FeedSort) : 'title'
  const dir = params.dir === 'desc' ? 'desc' : 'asc'

  const { rows, latestRun } = getFeedRows(targetId, sort, dir)
  const series = getPriceHistory(targetId, 6)
  const markers = getContinuityMarkers(targetId)
  const stale = latestRun ? isStale(latestRun.started_at, STALE_THRESHOLD_MS) : false

  return (
    <>
      <header className="page-header halftone">
        <h1>Feed</h1>
        <p>
          {target?.name ?? targetId} — the data the scrapers collect, proof the machine serves a purpose.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState title="No records yet">
          <p>Run <code className="mono">npm run pipeline -- replay</code> to populate a first run.</p>
        </EmptyState>
      ) : (
        <>
          <div className="section">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>Price history</h2>
              {series.length > 0 && (
                <span className="text-faint mono" style={{ fontSize: 'var(--fs-11)' }}>
                  showing {series.length} of {rows.length} tracked titles
                </span>
              )}
            </div>
            <div className="card chart-card">
              <PriceChart series={series} markers={markers} />
            </div>
          </div>

          <div className="section">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>
                Records
                {stale && latestRun && (
                  <span className="pill pill-warn stale-badge">
                    <AlertIcon />
                    stale — last run {relativeTime(latestRun.started_at)}
                  </span>
                )}
              </h2>
              {latestRun && !stale && (
                <span className="text-faint" style={{ fontSize: 'var(--fs-12)' }}>
                  run #{latestRun.id} · {relativeTime(latestRun.started_at)}
                </span>
              )}
            </div>
            <FeedTable rows={rows} targetId={targetId} sort={sort} dir={dir} />
          </div>
        </>
      )}
    </>
  )
}
