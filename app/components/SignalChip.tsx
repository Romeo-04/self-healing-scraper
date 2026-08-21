import type { Signal } from '../types.ts'

// Signal chips: monospace, uppercase, colour-coded by severity (brief §5.2).
export function SignalChip({ signal }: { signal: Signal }) {
  return (
    <span className={`signal-chip ${signal.severity}`} title={signal.detail}>
      {signal.code}
    </span>
  )
}
