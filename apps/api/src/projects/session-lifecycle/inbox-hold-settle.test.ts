import { describe, expect, mock, test } from 'bun:test';
import { WIRE_ID_TIME_SCALE, wireIdTime } from '../wire-message-id';
import type { PlacementTipMessage } from './forwarded-placement';
import { type HoldSettleDeps, TIP_LIMIT, settleInboxHoldAfterStop } from './inbox-hold-settle';

const id = (ms: number, tail: string) =>
  `msg_${((BigInt(ms) * WIRE_ID_TIME_SCALE + BigInt(1)) & BigInt(0xffffffffffff)).toString(16).padStart(12, '0')}${tail}`;

/** The millisecond an id's clock encodes — what the box would have stamped as
 *  `time.created` if it had minted that id itself. */
const at = (messageId: string): number => Number(wireIdTime(messageId)! / WIRE_ID_TIME_SCALE);

/**
 * Fill in `time.created` for every fixture message that does not set one.
 *
 * These fixtures were written before the functions under test read
 * `time.created` at all, so each one describes ORDER through the id clock
 * only — which means an id-ordered implementation and a `time.created`-ordered
 * one pass them identically and neither can be caught regressing. Stamping
 * each message with the millisecond its own id already encodes keeps every
 * existing assertion exactly as it was (the two orders agree by construction)
 * while making the fixtures able to express a DISAGREEMENT. The tests that
 * need one pass `created` explicitly; it wins over the fill.
 */
const tipOf = (messages: PlacementTipMessage[]): PlacementTipMessage[] =>
  messages.map((m) => ({ created: at(m.id), ...m }));

const T = 1_800_000_000_000;

function fakeDeps(over: Partial<HoldSettleDeps> & { claimed?: number[]; tips?: any[] }) {
  let now = 0;
  const claimedSeq = [...(over.claimed ?? [0])];
  const tips = [...(over.tips ?? [[]])];
  const calls: Record<string, unknown[][]> = {
    abort: [],
    remove: [],
    hold: [],
    close: [],
    closeTurn: [],
    readTip: [],
  };
  const deps: HoldSettleDeps = {
    countClaimed: async () => (claimedSeq.length > 1 ? claimedSeq.shift()! : claimedSeq[0]),
    listStopPaused: async () => [],
    readTip: async (...a) => {
      calls.readTip.push(a);
      return tips.length > 1 ? tips.shift()! : tips[0];
    },
    abort: async (...a) => { calls.abort.push(a); return true; },
    removeMessage: async (...a) => { calls.remove.push(a); return true; },
    holdAsQueued: async (...a) => { calls.hold.push(a); },
    closeDelivered: async (...a) => { calls.close.push(a); },
    closeTurn: async (...a) => { calls.closeTurn.push(a); },
    keepsMessageIds: async () => false,
    sleep: async (ms) => { now += ms; },
    now: () => now,
    ...over,
  };
  return { deps, calls };
}

describe('settleInboxHoldAfterStop', () => {
  const u1 = id(T, 'USER1USER1USER');
  const a1 = id(T + 100, 'ASST1ASST1ASST');
  const u2 = id(T + 200, 'USER2USER2USER'); // forwarded, never read
  const u3 = id(T + 300, 'USER3USER3USER'); // forwarded, read by the aborted step
  const a3 = id(T + 400, 'ASST3ASST3ASST');

  test('nothing claimed, nothing stop-paused → no box access', async () => {
    const { deps, calls } = fakeDeps({});
    const out = await settleInboxHoldAfterStop('s', deps);
    expect(out.heldBack).toBe(0);
    expect(calls.readTip).toHaveLength(0);
    expect(calls.abort).toHaveLength(0);
  });

  test('waits for claimed deliveries to land, bounded', async () => {
    const { deps } = fakeDeps({ claimed: [1, 1, 1, 0] });
    const out = await settleInboxHoldAfterStop('s', deps);
    expect(out.waitedMs).toBe(300);
    expect(out.claimedLeft).toBe(0);
  });

  test('gives up on a delivery that never lands', async () => {
    const { deps } = fakeDeps({ claimed: [1] });
    const out = await settleInboxHoldAfterStop('s', deps);
    expect(out.waitedMs).toBeGreaterThanOrEqual(3_000);
    expect(out.claimedLeft).toBe(1);
  });

  test('an unreached forwarded prompt is removed from the box, held as queued, its turn closed', async () => {
    const tip = tipOf([
      { id: u1, role: 'user' },
      { id: a1, role: 'assistant', parentID: u1, completed: T + 150 },
      { id: u2, role: 'user' },
    ]);
    const { deps, calls } = fakeDeps({
      tips: [tip],
      listStopPaused: async () => [{ commandId: 'c2', wireIds: [u2] }],
    });
    const out = await settleInboxHoldAfterStop('s', deps);
    expect(out.heldBack).toBe(1);
    expect(calls.remove).toEqual([['s', u2]]);
    expect(calls.hold).toEqual([['c2']]);
    expect(calls.closeTurn).toEqual([['s', u2]]);
    expect(calls.abort).toHaveLength(0);
    // Not closed as delivered: the release then POSTs it for the first time.
    expect(calls.close).toHaveLength(0);
  });

  test('a forwarded prompt the aborted step READ closes as delivered (runs with the next send)', async () => {
    const tip = tipOf([
      { id: u1, role: 'user' },
      { id: u3, role: 'user' },
      { id: a3, role: 'assistant', parentID: u3, completed: T + 450 },
    ]);
    const { deps, calls } = fakeDeps({
      tips: [tip],
      listStopPaused: async () => [{ commandId: 'c3', wireIds: [u3] }],
    });
    const out = await settleInboxHoldAfterStop('s', deps);
    expect(out.closedAsInterrupted).toBe(1);
    expect(calls.close).toEqual([['c3']]);
    expect(calls.remove).toHaveLength(0);
  });

  // KRTX-4864: pi publishes a steered message only when a model call READS it.
  // An unread one lives in the runtime's own queue and a stop drops it, so it is
  // absent from the tip. The id heuristic of `reachedPlacement` then read a
  // later message the loop did read (a subagent's report, minted after the
  // steer) as proof the steer was read, closed the row as delivered, and the
  // first queued message was never sent.
  test('a steer a pi runtime never published is held back, not closed as read', async () => {
    const report = id(T + 250, 'RPT0RPT0RPT0RP'); // a later user message the loop did read
    const a4 = id(T + 350, 'ASST4ASST4ASST');
    const tip = tipOf([
      { id: u1, role: 'user' },
      { id: a1, role: 'assistant', parentID: u1, completed: T + 150 },
      { id: report, role: 'user' },
      { id: a4, role: 'assistant', parentID: report, completed: null },
    ]);
    const { deps, calls } = fakeDeps({
      tips: [tip],
      keepsMessageIds: async () => true,
      listStopPaused: async () => [{ commandId: 'c2', wireIds: [u2] }],
    });
    const out = await settleInboxHoldAfterStop('s', deps);
    expect(out.closedAsInterrupted).toBe(0);
    expect(out.heldBack).toBe(1);
    expect(calls.close).toHaveLength(0);
    expect(calls.hold).toEqual([['c2']]);
    // Nothing of it is on the box, so there is nothing to take back out.
    expect(calls.remove).toHaveLength(0);
  });

  test('a steer a pi runtime published (the step read it) still closes as delivered', async () => {
    const tip = tipOf([
      { id: u1, role: 'user' },
      { id: u3, role: 'user' },
      { id: a3, role: 'assistant', parentID: u3, completed: T + 450 },
    ]);
    const { deps, calls } = fakeDeps({
      tips: [tip],
      keepsMessageIds: async () => true,
      listStopPaused: async () => [{ commandId: 'c3', wireIds: [u3] }],
    });
    const out = await settleInboxHoldAfterStop('s', deps);
    expect(out.closedAsInterrupted).toBe(1);
    expect(calls.close).toEqual([['c3']]);
  });

  test('a full tip window that no longer reaches back to the steer proves nothing about it', async () => {
    // The steer may have been read and published long ago, below the window:
    // the id heuristic stays in charge and sees the later step that read it.
    const old = id(T - 60_000, 'OLDUSEROLDUSER');
    const messages: PlacementTipMessage[] = [];
    for (let i = 0; i < TIP_LIMIT / 2; i += 1) {
      const user = id(T + i * 1_000, `USER${String(i).padStart(2, '0')}USERUSER`);
      messages.push({ id: user, role: 'user' });
      messages.push({ id: id(T + i * 1_000 + 500, `ASST${String(i).padStart(2, '0')}ASSTASST`), role: 'assistant', parentID: user, completed: T + i * 1_000 + 600 });
    }
    expect(messages).toHaveLength(TIP_LIMIT);
    const { deps, calls } = fakeDeps({
      tips: [tipOf(messages)],
      keepsMessageIds: async () => true,
      listStopPaused: async () => [{ commandId: 'c0', wireIds: [old] }],
    });
    const out = await settleInboxHoldAfterStop('s', deps);
    expect(out.closedAsInterrupted).toBe(1);
    expect(calls.hold).toHaveLength(0);
  });

  test('a box still mid-step after the hold (an escaped delivery restarted it) is aborted again', async () => {
    const busyTip = tipOf([{ id: u3, role: 'user' }, { id: a3, role: 'assistant', parentID: u3, completed: null }]);
    const idleTip = tipOf([{ id: u3, role: 'user' }, { id: a3, role: 'assistant', parentID: u3, completed: T + 500 }]);
    const { deps, calls } = fakeDeps({
      claimed: [1, 0],
      tips: [busyTip, idleTip],
      listStopPaused: async () => [{ commandId: 'c3', wireIds: [u3] }],
    });
    const out = await settleInboxHoldAfterStop('s', deps);
    expect(out.reAborted).toBe(true);
    expect(calls.abort).toHaveLength(1);
    expect(out.closedAsInterrupted).toBe(1);
  });

  test('a removal that fails leaves the row stop-paused (no duplicate, no loss)', async () => {
    const tip = tipOf([{ id: u2, role: 'user' }]);
    const { deps, calls } = fakeDeps({
      tips: [tip],
      listStopPaused: async () => [{ commandId: 'c2', wireIds: [u2] }],
      removeMessage: async () => false,
    });
    const out = await settleInboxHoldAfterStop('s', deps);
    expect(out.heldBack).toBe(0);
    expect(calls.hold).toHaveLength(0);
  });

  test('an unreadable box leaves everything as the instant hold marked it', async () => {
    const { deps, calls } = fakeDeps({
      tips: [null],
      listStopPaused: async () => [{ commandId: 'c2', wireIds: [u2] }],
    });
    const out = await settleInboxHoldAfterStop('s', deps);
    expect(out.unreadable).toBe(true);
    expect(calls.hold).toHaveLength(0);
    expect(calls.close).toHaveLength(0);
  });
});

/**
 * The settle's re-abort is part of the Stop the user pressed. It reaches
 * the runtime without passing the sandbox proxy that stamps `UserStop`, and it
 * usually reaches the runtime FIRST: the hold route starts it before the client
 * sends its own abort. An unstamped re-abort closed the user's own turn as
 * `failed` with a bare `MessageAbortedError`, and the web showed "This turn
 * stopped before it finished. No reason was reported." (prod 2026-09-25).
 */
describe('the settle re-abort is a requested stop', () => {
  const aborts: Array<[string, unknown]> = [];
  mock.module('./abort-runtime-turn', () => ({
    abortRuntimeTurn: async (sessionId: string, opts?: unknown) => {
      aborts.push([sessionId, opts]);
      return true;
    },
  }));

  test('the live abort stamps UserStop on the open turn before it aborts', async () => {
    const { liveHoldSettleDeps } = await import('./inbox-hold-settle');
    expect(await liveHoldSettleDeps.abort('ses-1')).toBe(true);
    expect(aborts).toEqual([['ses-1', { requestedStop: true }]]);
  });
});
