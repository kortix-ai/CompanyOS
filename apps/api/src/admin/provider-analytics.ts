import type { listProviderEventsSince } from './queries';

type ProviderEventRow = Awaited<ReturnType<typeof listProviderEventsSince>>[number];

/** A resume ends at its runtime's first answer; one later than this after the wake is another visit. */
const RESUME_READY_WINDOW_MS = 15 * 60_000;

/** The `GET /api/provider-analytics` body, aggregated from `days` of provider_events rows. */
export function summarizeProviderAnalytics(rows: ProviderEventRow[], days: number) {
  const pct = (xs: number[], p: number): number => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * (s.length - 1)))]);
  };
  const normLabel = (l: string): string =>
    l.startsWith('provider-create') ? 'provider-create'
      : (l === 'image-built' || l === 'image-cached') ? 'image' : l;
  const dayKey = (d: Date): string => new Date(d).toISOString().slice(0, 10);
  const namesOf = (evs: ProviderEventRow[]) => Array.from(new Set(evs.map((r) => r.provider))).sort();

  /** Outcome counts, latency of the ok rows, and the average of each phase mark. */
  const outcomeStats = (evs: ProviderEventRow[], extraMarks: unknown[][] = []) => {
    const ok = evs.filter((r) => r.outcome === 'ok');
    const error = evs.filter((r) => r.outcome === 'error');
    const stopped = evs.filter((r) => r.outcome === 'stopped');
    const okMs = ok.map((r) => r.totalMs ?? 0).filter((n) => n > 0);
    const finished = ok.length + error.length;
    const phaseTotals: Record<string, { sum: number; n: number }> = {};
    for (const marks of [...ok.map((r) => r.marks ?? []), ...extraMarks]) {
      for (const m of marks) {
        if (typeof m !== 'object' || m === null || !('label' in m)) continue;
        const k = normLabel(String(m.label));
        const d = ('deltaMs' in m ? Number(m.deltaMs) : 0) || 0;
        (phaseTotals[k] ||= { sum: 0, n: 0 }).sum += d;
        phaseTotals[k].n += 1;
      }
    }
    const phases = Object.entries(phaseTotals).map(([label, v]) => ({ label, avgMs: Math.round(v.sum / v.n) }));
    return {
      ok: ok.length, error: error.length, stopped: stopped.length,
      successRate: finished ? Math.round((ok.length / finished) * 100) : null,
      p50Ms: pct(okMs, 50), p95Ms: pct(okMs, 95),
      avgMs: okMs.length ? Math.round(okMs.reduce((a, b) => a + b, 0) / okMs.length) : 0,
      phases,
    };
  };

  const provision = rows.filter((r) => r.kind === 'provision');
  const migrate = rows.filter((r) => r.kind === 'migrate');
  const wake = rows.filter((r) => r.kind === 'wake');
  const wakeReady = rows.filter((r) => r.kind === 'wake-ready');
  const provNames = namesOf(provision);

  // Per-provider summary + phase breakdown.
  const providers = provNames.map((p) => {
    const evs = provision.filter((r) => r.provider === p);
    return { provider: p, provisions: evs.length, ...outcomeStats(evs) };
  });

  // Session resume (KRTX-1642): a `wake` row holds the provider phases up to the
  // rows going active; the session's first `wake-ready` row after it holds the
  // last phase, until the runtime answered. Their sum is the resume a user waits.
  const readyBySession = new Map<string | null, ProviderEventRow[]>();
  for (const r of [...wakeReady].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const list = readyBySession.get(r.sessionId);
    if (list) list.push(r);
    else readyBySession.set(r.sessionId, [r]);
  }
  const firstReadyAfter = (w: ProviderEventRow) => {
    const at = w.createdAt.getTime();
    return readyBySession
      .get(w.sessionId)
      ?.find((r) => r.createdAt.getTime() >= at && r.createdAt.getTime() - at <= RESUME_READY_WINDOW_MS);
  };
  const wakes = namesOf(wake).map((p) => {
    const evs = wake.filter((r) => r.provider === p);
    const resumes = evs
      .filter((w) => w.outcome === 'ok')
      .flatMap((w) => {
        const ready = firstReadyAfter(w);
        return ready ? [{ wake: w, ready }] : [];
      });
    const resumeMs = resumes.map((r) => (r.wake.totalMs ?? 0) + (r.ready.totalMs ?? 0));
    return {
      provider: p,
      wakes: evs.length,
      ...outcomeStats(evs, resumes.map((r) => r.ready.marks ?? [])),
      resumes: resumes.length,
      resumeP50Ms: resumeMs.length ? pct(resumeMs, 50) : null,
      resumeP95Ms: resumeMs.length ? pct(resumeMs, 95) : null,
    };
  });

  // Daily time-series: provision count + p50 latency per provider per day.
  const dayBuckets: Record<string, Record<string, number[]>> = {};
  for (const r of provision) {
    const dk = dayKey(r.createdAt);
    ((dayBuckets[dk] ||= {})[r.provider] ||= []);
    if (r.outcome === 'ok' && r.totalMs) dayBuckets[dk][r.provider].push(r.totalMs);
  }
  const allDays: string[] = [];
  for (let i = days - 1; i >= 0; i--) allDays.push(dayKey(new Date(Date.now() - i * 86_400_000)));
  const countByDay: Record<string, Record<string, number>> = {};
  for (const r of provision) {
    const dk = dayKey(r.createdAt);
    (countByDay[dk] ||= {});
    countByDay[dk][r.provider] = (countByDay[dk][r.provider] || 0) + 1;
  }
  const latencyByDay = allDays.map((d) => {
    const row: Record<string, unknown> = { date: d };
    for (const p of provNames) row[p] = dayBuckets[d]?.[p]?.length ? pct(dayBuckets[d][p], 50) : null;
    return row;
  });
  const volumeByDay = allDays.map((d) => {
    const row: Record<string, unknown> = { date: d };
    for (const p of provNames) row[p] = countByDay[d]?.[p] ?? 0;
    return row;
  });

  // Migration flows.
  const flowMap: Record<string, number> = {};
  for (const r of migrate) {
    const key = `${r.fromProvider ?? '?'}→${r.provider}`;
    flowMap[key] = (flowMap[key] || 0) + 1;
  }
  const migrations = Object.entries(flowMap).map(([flow, count]) => ({ flow, count }));

  const okTot = provision.filter((r) => r.outcome === 'ok').length;
  const errTot = provision.filter((r) => r.outcome === 'error').length;
  const recentErrors = rows
    .filter((r) => r.outcome === 'error')
    .slice(0, 10)
    .map((r) => ({ provider: r.provider, errorClass: r.errorClass, error: r.error, createdAt: r.createdAt }));

  return {
    days,
    totals: {
      provisions: provision.length, ok: okTot, error: errTot,
      stopped: provision.filter((r) => r.outcome === 'stopped').length,
      migrations: migrate.length,
      wakes: wake.length,
      successRate: okTot + errTot ? Math.round((okTot / (okTot + errTot)) * 100) : null,
    },
    providers, wakes, latencyByDay, volumeByDay, migrations, recentErrors,
  };
}
