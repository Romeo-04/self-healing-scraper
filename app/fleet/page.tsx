import { FleetCard } from '../components/FleetCard.tsx'
import { EmptyState } from '../components/EmptyState.tsx'
import { getFleetData } from '../queries.ts'

export const dynamic = 'force-dynamic'

export default function FleetPage() {
  const cards = getFleetData()

  return (
    <>
      <header className="page-header halftone">
        <h1>Fleet</h1>
        <p>Every spider watching a dimension, at a glance.</p>
      </header>

      {cards.length === 0 ? (
        <EmptyState title="No spiders deployed">
          <p>
            Run <code className="mono">npm run seed</code> to register a target, then{' '}
            <code className="mono">npm run pipeline -- replay</code> to populate a first run.
          </p>
        </EmptyState>
      ) : (
        <div className="fleet-grid">
          {cards.map(card => (
            <FleetCard key={card.target.id} card={card} />
          ))}
        </div>
      )}
    </>
  )
}
