import { AlertIcon, CheckIcon, GlitchIcon, PauseIcon } from './icons.tsx'
import type { HealthState } from '../types.ts'

const LABEL: Record<HealthState, string> = {
  healthy: 'Healthy',
  anomaly: 'Anomaly',
  healing: 'Healing',
  failed: 'Failed',
}

// Colour AND icon AND word, per brief §2 — status must never rely on colour alone.
export function HealthBadge({ state, glitch = false }: { state: HealthState; glitch?: boolean }) {
  const pillClass = {
    healthy: 'pill-healthy',
    anomaly: 'pill-critical',
    healing: 'pill-healing',
    failed: 'pill-muted',
  }[state]

  const icon = {
    healthy: <CheckIcon />,
    anomaly: <AlertIcon />,
    healing: <GlitchIcon />,
    failed: <PauseIcon />,
  }[state]

  return (
    <span className={`pill ${pillClass}${glitch && state === 'anomaly' ? ' fleet-card-glitch' : ''}`}>
      {icon}
      {LABEL[state]}
    </span>
  )
}
