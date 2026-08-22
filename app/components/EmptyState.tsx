import type { ReactNode } from 'react'
import { SpiderIcon } from './icons.tsx'

// Generic themed empty state — brief §6: "Themed, illustrated, with a clear
// next action" and "a legitimate place for a full halftone treatment."
export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty-state halftone">
      {icon ?? <SpiderIcon className="empty-icon" />}
      <h3>{title}</h3>
      {children}
    </div>
  )
}
