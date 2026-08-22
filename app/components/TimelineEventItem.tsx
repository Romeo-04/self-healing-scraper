import type { ReactNode } from 'react'
import { AlertIcon, ChevronRightIcon } from './icons.tsx'
import { SignalChip } from './SignalChip.tsx'
import { GateVerdict, PreviewRejected } from './GateVerdict.tsx'
import { formatTimestamp, highlightJson } from '../format.ts'
import type { TimelineEvent } from '../queries.ts'

function Marker({ children }: { children: ReactNode }) {
  return <span className="timeline-marker">{children}</span>
}

function Connector() {
  return <span className="timeline-connector" />
}

function Row({ marker, summary, timestamp, body, isLast }: {
  marker: ReactNode
  summary: ReactNode
  timestamp: string
  body?: ReactNode
  isLast: boolean
}) {
  return (
    <div className="timeline-event">
      <div className="timeline-gutter">
        <Marker>{marker}</Marker>
        {!isLast && <Connector />}
      </div>
      {body ? (
        <details className="panel">
          <summary className="panel-summary">
            <span className="panel-summary-text">{summary}</span>
            <span className="row" style={{ gap: 'var(--sp-2)' }}>
              <span className="panel-timestamp">{timestamp}</span>
              <ChevronRightIcon className="panel-chevron" />
            </span>
          </summary>
          <div className="panel-body">{body}</div>
        </details>
      ) : (
        <div className="panel">
          <div className="panel-summary" style={{ cursor: 'default' }}>
            <span className="panel-summary-text">{summary}</span>
            <span className="panel-timestamp">{timestamp}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function TimelineEventItem({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const timestamp = formatTimestamp(event.at)

  switch (event.kind) {
    case 'run-ok':
      return (
        <Row
          isLast={isLast} timestamp={timestamp}
          marker={<span className="marker-dot" />}
          summary={(
            <>
              <span className="panel-title">{event.targetName}</span>
              <span className="panel-detail">
                {event.recordCount} records · contract v{event.contractVersion}
                {event.durationSec !== null ? ` · ${event.durationSec}s` : ''}
              </span>
            </>
          )}
        />
      )

    case 'run-failed':
      return (
        <Row
          isLast={isLast} timestamp={timestamp}
          marker={<span className="marker-dot grey" />}
          summary={(
            <>
              <span className="panel-title">{event.targetName}</span>
              <span className="panel-detail">collector unreachable</span>
            </>
          )}
          body={<pre className="evidence-json">{event.error ?? 'no error detail recorded'}</pre>}
        />
      )

    case 'anomaly':
      return (
        <>
          <Row
            isLast={isLast && event.hasHealAttempt} timestamp={timestamp}
            marker={<span className="marker-diamond glitch-in" />}
            summary={(
              <span className="stack" style={{ gap: 'var(--sp-1)' }}>
                <span className="row" style={{ flexWrap: 'wrap' }}>
                  <span className="panel-title">{event.targetName} · anomaly detected</span>
                </span>
                <span className="signal-chips" style={{ margin: 0 }}>
                  {event.signals.map(s => <SignalChip key={s.code} signal={s} />)}
                </span>
              </span>
            )}
            body={(
              <>
                <p className="panel-detail" style={{ margin: '12px 0 0' }}>
                  {event.signals.map(s => s.detail).join(' · ') || 'no signal detail recorded'}
                </p>
                <pre
                  className="evidence-json"
                  style={{ marginTop: 'var(--sp-3)' }}
                  dangerouslySetInnerHTML={{ __html: highlightJson(event.evidence) }}
                />
              </>
            )}
          />
          {!event.hasHealAttempt && (
            <div className="timeline-event">
              <div className="timeline-gutter">
                <Marker><span className="marker-dot grey" /></Marker>
                {!isLast && <Connector />}
              </div>
              <div className="empty-state" style={{ padding: 'var(--sp-4)', textAlign: 'left' }}>
                <p style={{ margin: 0, maxWidth: 'none' }}>
                  No repair requested yet for this anomaly — the current contract is still live
                  and no heal attempt has run.
                </p>
              </div>
            </div>
          )}
        </>
      )

    case 'repair-requested':
      return (
        <Row
          isLast={isLast} timestamp={timestamp}
          marker={<span className="marker-node" />}
          summary={(
            <>
              <span className="panel-title">{event.targetName} · repair requested</span>
              <span className="panel-detail">via {event.source}</span>
            </>
          )}
          body={(
            <pre className="evidence-json">
              {event.prompt ?? 'prompt not recorded for this attempt'}
            </pre>
          )}
        />
      )

    case 'gate-verdict': {
      const pass = event.verdict?.pass ?? false
      return (
        <Row
          isLast={isLast} timestamp={timestamp}
          marker={<span className={`marker-node ${pass ? 'healthy-node' : 'amber'}`} />}
          summary={(
            <>
              <span className="panel-title">{event.targetName} · gate verdict</span>
              <span className={`pill ${pass ? 'pill-healthy' : 'pill-warn'}`}>
                {pass ? 'PASS' : 'FAIL'}
              </span>
            </>
          )}
          body={event.verdict
            ? <GateVerdict verdict={event.verdict} fromVersion={event.fromVersion} toVersion={event.toVersion} />
            : <PreviewRejected fromVersion={event.fromVersion} failures={event.previewFailures} />}
        />
      )
    }

    case 'approved':
      return (
        <Row
          isLast={isLast} timestamp={timestamp}
          marker={<span className="marker-node healthy-node" />}
          summary={(
            <>
              <span className="pill pill-healthy" style={{ fontFamily: 'var(--font-display)' }}>CANON</span>
              <span className="panel-title">{event.targetName}</span>
              <span className="panel-detail">contract v{event.fromVersion} → v{event.toVersion} promoted</span>
            </>
          )}
        />
      )

    case 'rejected':
      return (
        <Row
          isLast={isLast} timestamp={timestamp}
          marker={<span className="marker-node amber" />}
          summary={(
            <>
              <span className="panel-title">{event.targetName}</span>
              <span className="panel-detail">proposal rejected, v{event.fromVersion} stays live</span>
            </>
          )}
        />
      )

    case 'needs-human':
      return (
        <Row
          isLast={isLast} timestamp={timestamp}
          marker={<span className="marker-node" style={{ background: 'var(--critical)', boxShadow: '0 0 0 1px var(--critical)', borderRadius: 3 }} />}
          summary={(
            <>
              <span className="pill pill-critical"><AlertIcon />NEEDS HUMAN</span>
              <span className="panel-title">{event.targetName}</span>
            </>
          )}
          body={(
            <p className="panel-detail" style={{ margin: '12px 0 0' }}>
              A proposal was approved on the collector before validation could complete for
              attempt #{event.attemptId}. The tracked contract still shows v{event.fromVersion} —
              confirm the live collector matches before trusting further runs.
            </p>
          )}
        />
      )

    default:
      return null
  }
}
