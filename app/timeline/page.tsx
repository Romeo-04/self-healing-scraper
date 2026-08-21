import Link from 'next/link'
import { TimelineEventItem } from '../components/TimelineEventItem.tsx'
import { EmptyState } from '../components/EmptyState.tsx'
import { CheckIcon } from '../components/icons.tsx'
import { getAllDriftEventsForTarget, getTarget, getTimelineEvents, listTargets } from '../queries.ts'

export const dynamic = 'force-dynamic'

export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ target?: string }> }) {
  const params = await searchParams
  const targetFilter = params.target
  const target = targetFilter ? getTarget(targetFilter) : undefined
  const events = getTimelineEvents(targetFilter)
  const targets = listTargets()

  const neverDrifted = target !== undefined && getAllDriftEventsForTarget(target.id).length === 0

  return (
    <>
      <header className="page-header halftone">
        <h1>Timeline</h1>
        <p>
          {target ? `${target.name} — the story of every run, anomaly, and repair.` : 'Every spider, newest first.'}
        </p>
      </header>

      {targets.length > 1 && (
        <div className="row" style={{ marginBottom: 'var(--sp-5)', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
          <Link href="/timeline" className={`pill ${!target ? 'pill-muted' : 'pill-muted'}`} style={{ opacity: target ? 0.6 : 1 }}>
            All spiders
          </Link>
          {targets.map(t => (
            <Link
              key={t.id}
              href={`/timeline?target=${t.id}`}
              className="pill pill-muted"
              style={{ opacity: target?.id === t.id ? 1 : 0.6 }}
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}

      {events.length === 0 ? (
        neverDrifted ? (
          <div className="empty-state" style={{ borderStyle: 'solid', borderColor: 'rgba(52, 211, 153, 0.35)' }}>
            <CheckIcon className="empty-icon" style={{ color: 'var(--healthy)' }} size={40} />
            <h3 style={{ color: 'var(--healthy)' }}>No drift ever detected</h3>
            <p>{target?.name} has run clean every time it has been checked. Nothing to show here — that is the good news.</p>
          </div>
        ) : (
          <EmptyState title="No events yet">
            <p>Run <code className="mono">npm run pipeline -- replay</code> to record a first run.</p>
          </EmptyState>
        )
      ) : (
        <div className="timeline">
          {events.map((event, i) => (
            <TimelineEventItem key={event.sortKey} event={event} isLast={i === events.length - 1} />
          ))}
        </div>
      )}
    </>
  )
}
