// Local type mirrors for the console. Deliberately not imported from lib/ —
// app/db.ts keeps the UI's data access independent of the engine's module
// graph (see the comment in app/db.ts). These shapes track lib/contracts/types.ts
// and lib/healer/gate.ts by hand.

export type FieldName = 'title' | 'price' | 'currency' | 'availability' | 'url'

export type RunStatus = 'pending' | 'ok' | 'drift' | 'healed' | 'failed'

export type ContractProvenance = 'seed' | 'studio' | 'fallback'

export type HealStatus = 'proposed' | 'validated' | 'promoted' | 'rejected' | 'failed'

export type GateCheckName = 'live' | 'regression' | 'anchor' | 'resolved'

export type GateCheck = {
  name: GateCheckName
  pass: boolean
  detail: string
}

export type GateVerdict = {
  pass: boolean
  checks: GateCheck[]
}

export type Signal = {
  code: string
  severity: 'warn' | 'critical'
  detail: string
}

export type HealthState = 'healthy' | 'anomaly' | 'healing' | 'failed'

export type TargetRow = {
  id: string
  name: string
  url: string
  collector_id: string
  active_contract_version: number
}

export type ContractRow = {
  id: number
  target_id: string
  version: number
  spec_json: string
  created_by: ContractProvenance
  parent_version: number | null
  note: string | null
  created_at: string
}

export type RunRow = {
  id: number
  target_id: string
  contract_version: number
  snapshot_id: string | null
  status: RunStatus
  record_count: number
  raw_payload: string | null
  error: string | null
  started_at: string
  finished_at: string | null
}

export type RecordRow = {
  id: number
  run_id: number
  key: string
  title: string | null
  price: number | null
  currency: string | null
  in_stock: number | null
  url: string | null
}

export type DriftEventRow = {
  id: number
  run_id: number
  severity: 'warn' | 'critical'
  signals_json: string
  evidence_json: string
  created_at: string
}

export type HealAttemptRow = {
  id: number
  drift_event_id: number
  from_version: number
  to_version: number | null
  status: HealStatus
  source: 'studio' | 'fallback'
  heal_prompt: string | null
  proposal_json: string | null
  validation_report_json: string | null
  cli_action: 'approve' | 'reject' | 'none' | null
  created_at: string
}
