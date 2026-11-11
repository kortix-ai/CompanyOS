/** The call log columns of a `connector_calls` row written before they existed. Test fixtures spread it. */
export const EMPTY_CALL_LOG = {
  credentialId: null,
  principalKind: null,
  agentSlug: null,
  surface: null,
  approvalDelivery: null,
  refusalReason: null,
  phase: null,
  requestId: null,
  traceId: null,
  kortixMs: null,
  upstreamMs: null,
} as const;
