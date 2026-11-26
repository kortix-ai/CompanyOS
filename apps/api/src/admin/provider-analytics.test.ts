import { describe, expect, test } from 'bun:test';
import { summarizeProviderAnalytics } from './provider-analytics';

type Row = Parameters<typeof summarizeProviderAnalytics>[0][number];

const t0 = Date.parse('2026-11-26T10:00:00.000Z');
let seq = 0;
function event(input: Partial<Row> & Pick<Row, 'kind' | 'outcome'>, atMs: number): Row {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    provider: 'platinum',
    totalMs: null,
    marks: [],
    attempts: 1,
    errorClass: null,
    error: null,
    fromProvider: null,
    sessionId: null,
    accountId: null,
    workspaceId: null,
    createdAt: new Date(t0 + atMs),
    ...input,
  };
}
const marks = (...phases: [string, number][]) => {
  let at = 0;
  return phases.map(([label, deltaMs]) => ({ label, atMs: (at += deltaMs), deltaMs }));
};

/** The boot a wake started, as both of its rows carry it. */
const boot = (atMs: number) => ({ bootEpochMs: t0 + atMs });

describe('provider analytics: session resume (KRTX-1642)', () => {
  const rows: Row[] = [
    // Resume A: a cold-storage restore, runtime answered 5 s after the box ran.
    event({ kind: 'wake', outcome: 'ok', sessionId: 'a', totalMs: 40_000, marks: [...marks(['archive-restore', 38_000], ['provider-running', 1_500], ['rows-active', 500]), boot(39_500)] }, 40_000),
    event({ kind: 'wake-ready', outcome: 'ok', sessionId: 'a', totalMs: 5_000, marks: [...marks(['runtime-ready', 5_000]), boot(39_500)] }, 44_500),
    // Resume B: its runtime answered while the wake still ran its billing
    // awaits, so the ready row was inserted first; the boot still pairs them.
    event({ kind: 'wake-ready', outcome: 'ok', sessionId: 'b', totalMs: 3_000, marks: [...marks(['runtime-ready', 3_000]), boot(61_800)] }, 64_800),
    event({ kind: 'wake', outcome: 'ok', sessionId: 'b', totalMs: 2_000, marks: [...marks(['provider-start', 1_200], ['provider-running', 600], ['rows-active', 200]), boot(61_800)] }, 70_000),
    // Session C woke twice: the first wake's runtime never answered, the second
    // one's did. The one ready row belongs to the second wake only.
    event({ kind: 'wake', outcome: 'ok', sessionId: 'c', totalMs: 3_000, marks: [...marks(['provider-start', 1_800], ['provider-running', 900], ['rows-active', 300]), boot(2_700)] }, 3_000),
    event({ kind: 'wake', outcome: 'ok', sessionId: 'c', totalMs: 3_000, marks: [...marks(['provider-start', 1_800], ['provider-running', 900], ['rows-active', 300]), boot(122_700)] }, 123_000),
    event({ kind: 'wake-ready', outcome: 'ok', sessionId: 'c', totalMs: 4_000, marks: [...marks(['runtime-ready', 4_000]), boot(122_700)] }, 126_700),
    // A failed wake, and a runtime answer of a boot no recorded wake started.
    event({ kind: 'wake', outcome: 'error', sessionId: 'd', totalMs: 1_000, error: 'start_failed', marks: marks(['provider-start', 1_000]) }, 0),
    event({ kind: 'wake-ready', outcome: 'ok', sessionId: 'e', totalMs: 7_000, marks: [...marks(['runtime-ready', 7_000]), boot(500)] }, 7_500),
    event({ kind: 'wake', outcome: 'ok', sessionId: 'e', totalMs: 1_000, provider: 'daytona', marks: [...marks(['provider-start', 1_000]), boot(90_000)] }, 90_000),
  ];
  const summary = summarizeProviderAnalytics(rows, 7);

  test('each provider reports its wakes, their phases and the end-to-end resume time', () => {
    expect(summary.totals.wakes).toBe(6);
    expect(summary.wakes).toEqual([
      {
        provider: 'daytona',
        wakes: 1, ok: 1, error: 0, stopped: 0, successRate: 100,
        p50Ms: 1_000, p95Ms: 1_000, avgMs: 1_000,
        phases: [{ label: 'provider-start', avgMs: 1_000 }],
        resumes: 0, resumeP50Ms: null, resumeP95Ms: null,
      },
      {
        provider: 'platinum',
        wakes: 5, ok: 4, error: 1, stopped: 0, successRate: 80,
        p50Ms: 3_000, p95Ms: 3_000, avgMs: 12_000,
        phases: [
          { label: 'archive-restore', avgMs: 38_000 },
          { label: 'provider-running', avgMs: 975 },
          { label: 'rows-active', avgMs: 325 },
          { label: 'provider-start', avgMs: 1_600 },
          { label: 'runtime-ready', avgMs: 4_000 },
        ],
        // A: 40 s + 5 s; B: 2 s + 3 s; C's second wake: 3 s + 4 s.
        resumes: 3, resumeP50Ms: 7_000, resumeP95Ms: 7_000,
      },
    ]);
  });

  const resumesOf = (session: string) => {
    const [platinum] = summarizeProviderAnalytics(rows.filter((r) => r.sessionId === session), 7).wakes;
    return { resumes: platinum!.resumes, resumeP50Ms: platinum!.resumeP50Ms };
  };

  test('a ready row inserted before its wake row still pairs with that wake', () => {
    expect(resumesOf('b')).toEqual({ resumes: 1, resumeP50Ms: 5_000 });
  });

  test('a session that woke twice pairs its one ready row with the wake that booted it', () => {
    expect(resumesOf('c')).toEqual({ resumes: 1, resumeP50Ms: 7_000 });
  });

  test('wake rows stay out of the provisioning numbers', () => {
    expect(summary.totals.provisions).toBe(0);
    expect(summary.providers).toEqual([]);
  });
});

describe('provider analytics: provisioning', () => {
  test('summarizes provisions per provider with their phase averages', () => {
    const summary = summarizeProviderAnalytics(
      [
        event({ kind: 'provision', outcome: 'ok', totalMs: 10_000, marks: marks(['row+tokens', 1_000], ['provider-create:1', 9_000]) }, 0),
        event({ kind: 'provision', outcome: 'ok', totalMs: 20_000, marks: marks(['row+tokens', 3_000], ['image-built', 17_000]) }, 0),
        event({ kind: 'provision', outcome: 'error', totalMs: 5_000 }, 0),
        event({ kind: 'migrate', outcome: 'ok', fromProvider: 'daytona' }, 0),
      ],
      1,
    );
    expect(summary.totals).toEqual({ provisions: 3, ok: 2, error: 1, stopped: 0, migrations: 1, wakes: 0, successRate: 67 });
    expect(summary.providers).toEqual([
      {
        provider: 'platinum',
        provisions: 3, ok: 2, error: 1, stopped: 0, successRate: 67,
        p50Ms: 10_000, p95Ms: 10_000, avgMs: 15_000,
        phases: [
          { label: 'row+tokens', avgMs: 2_000 },
          { label: 'provider-create', avgMs: 9_000 },
          { label: 'image', avgMs: 17_000 },
        ],
      },
    ]);
    expect(summary.migrations).toEqual([{ flow: 'daytona→platinum', count: 1 }]);
  });
});
