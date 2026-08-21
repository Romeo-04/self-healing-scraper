import Link from 'next/link'
import { SortIcon } from './icons.tsx'
import { formatPrice, relativeTime } from '../format.ts'
import type { FeedRow, FeedSort } from '../queries.ts'

const COLUMNS: Array<{ key: FeedSort; label: string; align?: 'right' }> = [
  { key: 'title', label: 'Title' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'stock', label: 'In stock' },
  { key: 'lastSeen', label: 'Last seen' },
]

function SortableHeader({ targetId, column, activeSort, activeDir }: {
  targetId: string
  column: { key: FeedSort; label: string; align?: 'right' }
  activeSort: FeedSort
  activeDir: 'asc' | 'desc'
}) {
  const isActive = activeSort === column.key
  const nextDir = isActive && activeDir === 'asc' ? 'desc' : 'asc'
  return (
    <th style={column.align === 'right' ? { textAlign: 'right' } : undefined}>
      <Link href={`/feed?target=${targetId}&sort=${column.key}&dir=${nextDir}`}>
        {column.label}
        <SortIcon direction={isActive ? activeDir : undefined} />
      </Link>
    </th>
  )
}

export function FeedTable({ rows, targetId, sort, dir }: {
  rows: FeedRow[]
  targetId: string
  sort: FeedSort
  dir: 'asc' | 'desc'
}) {
  if (rows.length === 0) {
    return <p className="text-muted">No records collected yet for this spider.</p>
  }
  return (
    <div className="feed-table-wrap">
      <table className="feed-table">
        <thead>
          <tr>
            {COLUMNS.map(col => (
              <SortableHeader key={col.key} targetId={targetId} column={col} activeSort={sort} activeDir={dir} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key}>
              <td>{row.title ?? <span className="text-faint">—</span>}</td>
              <td className="col-price">{formatPrice(row.price, row.currency)}</td>
              <td className="col-stock">
                {row.inStock === null
                  ? <span className="pill pill-muted">unknown</span>
                  : row.inStock
                    ? <span className="pill pill-healthy">In stock</span>
                    : <span className="pill pill-critical">Out of stock</span>}
              </td>
              <td className="col-lastseen">{relativeTime(row.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
