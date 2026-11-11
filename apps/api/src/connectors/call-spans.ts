/**
 * OpenTelemetry spans for one connector call: a `connector.call` span with one
 * child span per measured step (`connector.policy`, `connector.credential`,
 * `connector.upstream`). They go to the OTLP endpoint `lib/otel.ts` reads.
 *
 * The attributes name the call, never its content: no arguments, no result,
 * no upstream body, no credential.
 */
import { emitOtelSpan, isOtelTraceExporterConfigured, newOtelSpanId } from '../lib/otel';

export type CallSpanStep = 'connector.policy' | 'connector.credential' | 'connector.upstream';

/** One measured step, in `performance.now()` milliseconds. */
export interface CallSpanWindow {
  name: CallSpanStep;
  startedAt: number;
  endedAt: number;
}

export interface CallSpanFacts {
  connectorSlug: string;
  /** `<slug>.<action>`. */
  actionPath: string;
  risk: string | null;
  status: string;
  refusalReason: string | null;
  surface: string | null;
  agentSlug: string | null;
  phase: string | null;
  kortixMs: number | null;
  upstreamMs: number | null;
}

/** The attribute set of a `connector.call` span. Exactly these keys, no others. */
export function connectorCallSpanAttributes(facts: CallSpanFacts): Record<string, string | number | null> {
  return {
    'kortix.connector.slug': facts.connectorSlug,
    'kortix.connector.action_path': facts.actionPath,
    'kortix.connector.risk': facts.risk,
    'kortix.connector.status': facts.status,
    'kortix.connector.refusal_reason': facts.refusalReason,
    'kortix.connector.surface': facts.surface,
    'kortix.connector.agent': facts.agentSlug,
    'kortix.connector.phase': facts.phase,
    'kortix.connector.kortix_ms': facts.kortixMs,
    'kortix.connector.upstream_ms': facts.upstreamMs,
  };
}

const toEpochMs = (perfMs: number) => performance.timeOrigin + perfMs;

/**
 * Emit the call span and its step spans. A no-op when no OTLP endpoint is
 * configured. Never throws and never waits: export runs in the background.
 */
export function emitConnectorCallSpans(
  call: { startedAt: number; endedAt: number; windows: readonly CallSpanWindow[] },
  facts: CallSpanFacts,
  emit: typeof emitOtelSpan = emitOtelSpan,
): void {
  if (emit === emitOtelSpan && !isOtelTraceExporterConfigured()) return;
  const callSpanId = newOtelSpanId();
  const failed = facts.status === 'error';
  const attributes = connectorCallSpanAttributes(facts);
  void emit({
    name: 'connector.call',
    kind: 'INTERNAL',
    spanId: callSpanId,
    startTimeMs: toEpochMs(call.startedAt),
    endTimeMs: toEpochMs(call.endedAt),
    attributes,
    error: failed,
  }).catch(() => false);
  for (const window of call.windows) {
    void emit({
      name: window.name,
      kind: window.name === 'connector.upstream' ? 'CLIENT' : 'INTERNAL',
      parentSpanId: callSpanId,
      startTimeMs: toEpochMs(window.startedAt),
      endTimeMs: toEpochMs(window.endedAt),
      attributes: {
        'kortix.connector.slug': facts.connectorSlug,
        'kortix.connector.action_path': facts.actionPath,
      },
      error: window.name === 'connector.upstream' && failed && facts.phase === 'upstream',
    }).catch(() => false);
  }
}
