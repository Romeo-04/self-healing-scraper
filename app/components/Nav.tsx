'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentType } from 'react'
import { ContractsIcon, FeedIcon, FleetIcon, MissionControlIcon, TimelineIcon } from './icons.tsx'

// Client-only for active-link highlighting — no data access happens here,
// so this does not violate "server components only for data access."
type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string; size?: number }>; disabled?: boolean }

const ITEMS: NavItem[] = [
  { href: '/fleet', label: 'Fleet', icon: FleetIcon },
  { href: '/timeline', label: 'Timeline', icon: TimelineIcon },
  { href: '/feed', label: 'Feed', icon: FeedIcon },
  { href: '/contracts', label: 'Contracts', icon: ContractsIcon, disabled: true },
  { href: '/mission-control', label: 'Mission Control', icon: MissionControlIcon, disabled: true },
]

export function Nav() {
  const pathname = usePathname()
  return (
    <nav className="nav" aria-label="Primary">
      {ITEMS.map(item => {
        const Icon = item.icon
        const active = pathname?.startsWith(item.href) ?? false
        if (item.disabled) {
          return (
            <span
              key={item.href}
              className="nav-link"
              aria-disabled="true"
              title={`${item.label} — not built in this console (read-only scope)`}
              style={{ opacity: 0.4, cursor: 'not-allowed' }}
            >
              <Icon />
              <span className="nav-label">{item.label}</span>
            </span>
          )
        }
        return (
          <Link key={item.href} href={item.href} className={`nav-link${active ? ' active' : ''}`}>
            <Icon />
            <span className="nav-label">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
