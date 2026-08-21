// Inline SVG icon set. No icon library dependency and no emoji, per brief §2.
// Every icon is a plain function component so it can take className/size like
// any other element.

import type { CSSProperties } from 'react'

type IconProps = { className?: string; size?: number; style?: CSSProperties }

const base = (size: number, style?: CSSProperties) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  style,
})

export function FleetIcon({ className, size = 18, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function TimelineIcon({ className, size = 18, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <line x1="12" y1="2" x2="12" y2="22" />
      <circle cx="12" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function FeedIcon({ className, size = 18, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  )
}

export function ContractsIcon({ className, size = 18, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  )
}

export function MissionControlIcon({ className, size = 18, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  )
}

export function CheckIcon({ className, size = 12, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function XIcon({ className, size = 12, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function GlitchIcon({ className, size = 12, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PauseIcon({ className, size = 12, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function AlertIcon({ className, size = 12, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <path d="M12 3 2 20h20L12 3Z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export function ChevronRightIcon({ className, size = 14, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

export function SpiderIcon({ className, size = 40, style }: IconProps) {
  // Used only in themed empty states — chrome, never data (brief §3 table).
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 8.8V4M12 15.2V20M8.8 12H4M15.2 12H20" />
      <path d="M9.4 9.4 6 6M14.6 9.4 18 6M9.4 14.6 6 18M14.6 14.6 18 18" />
    </svg>
  )
}

export function SortIcon({ className, size = 12, style, direction }: IconProps & { direction?: 'asc' | 'desc' }) {
  if (direction === 'asc') {
    return (
      <svg {...base(size, style)} className={className} aria-hidden="true">
        <polyline points="6 15 12 9 18 15" />
      </svg>
    )
  }
  if (direction === 'desc') {
    return (
      <svg {...base(size, style)} className={className} aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    )
  }
  return (
    <svg {...base(size, style)} className={className} aria-hidden="true" strokeWidth={1.5} opacity={0.5}>
      <polyline points="6 9 12 4 18 9" />
      <polyline points="6 15 12 20 18 15" />
    </svg>
  )
}
