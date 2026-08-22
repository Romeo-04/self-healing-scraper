import type { ContinuityMarker, PriceHistorySeries } from '../queries.ts'

// Clean and unthemed per brief §5.5: no halftone, no aberration, no glow.
// Axes/gridlines in --border, series in accent + neutrals only (never the
// semantic critical/warn/healing colours — those are reserved for status).
const PALETTE = ['var(--accent)', 'var(--text)', 'var(--info)', 'var(--text-muted)', 'var(--accent-hover)', 'var(--text-faint)']

const WIDTH = 720
const HEIGHT = 240
const PAD = { top: 16, right: 16, bottom: 28, left: 48 }

export function PriceChart({ series, markers }: { series: PriceHistorySeries[]; markers: ContinuityMarker[] }) {
  const allPoints = series.flatMap(s => s.points)
  if (allPoints.length === 0) {
    return <p className="text-muted">No priced records yet.</p>
  }

  const times = allPoints.map(p => new Date(`${p.at.replace(' ', 'T')}Z`).getTime())
  const prices = allPoints.map(p => p.price)
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  // A flat time range (one run so far) or flat price range still needs a
  // usable plot area — widen to a stable padding rather than dividing by zero.
  const timeSpan = maxTime > minTime ? maxTime - minTime : 1
  const priceSpan = maxPrice > minPrice ? maxPrice - minPrice : Math.max(1, maxPrice * 0.1)
  const priceFloor = maxPrice > minPrice ? minPrice : minPrice - priceSpan / 2

  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom

  const x = (t: number) => PAD.left + ((t - minTime) / timeSpan) * plotW
  const y = (p: number) => PAD.top + plotH - ((p - priceFloor) / priceSpan) * plotH

  const gridLines = 4
  const gridPrices = Array.from({ length: gridLines + 1 }, (_, i) => priceFloor + (priceSpan * i) / gridLines)

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Price history by title" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {gridPrices.map(p => (
          <g key={p}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(p)} y2={y(p)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(p)} textAnchor="end" dominantBaseline="middle" fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-faint)">
              £{p.toFixed(0)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--border)" strokeWidth={1} />
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={HEIGHT - PAD.bottom} y2={HEIGHT - PAD.bottom} stroke="var(--border)" strokeWidth={1} />

        {markers.map(m => {
          const mx = x(new Date(`${m.at.replace(' ', 'T')}Z`).getTime())
          return (
            <g key={`${m.at}-${m.toVersion}`}>
              <line x1={mx} x2={mx} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--healing)" strokeWidth={1.5} strokeDasharray="3 3" />
              <text x={mx + 4} y={PAD.top + 10} fontSize="10" fontFamily="var(--font-mono)" fill="var(--healing)">
                v{m.fromVersion} → v{m.toVersion}
              </text>
            </g>
          )
        })}

        {series.map((s, i) => {
          const color = PALETTE[i % PALETTE.length]
          const sorted = [...s.points].sort((a, b) => a.runId - b.runId)
          if (sorted.length === 1) {
            const only = sorted[0]!
            return <circle key={s.key} cx={x(new Date(`${only.at.replace(' ', 'T')}Z`).getTime())} cy={y(only.price)} r={3.5} fill={color} />
          }
          const d = sorted.map((p, idx) => {
            const cmd = idx === 0 ? 'M' : 'L'
            return `${cmd}${x(new Date(`${p.at.replace(' ', 'T')}Z`).getTime()).toFixed(1)},${y(p.price).toFixed(1)}`
          }).join(' ')
          return <path key={s.key} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        })}
      </svg>
      <div className="chart-legend">
        {series.map((s, i) => (
          <span className="chart-legend-item" key={s.key}>
            <span className="chart-legend-swatch" style={{ background: PALETTE[i % PALETTE.length] }} />
            {s.title}
          </span>
        ))}
      </div>
    </div>
  )
}
