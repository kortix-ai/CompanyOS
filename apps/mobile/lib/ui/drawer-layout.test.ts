import { describe, expect, test } from 'bun:test';

import {
  DRAWER_MAX_WIDTH,
  DRAWER_MIN_PEEK,
  PEEK_CARD_DIM,
  PEEK_CARD_SCALE,
  drawerSwipeEdgeWidth,
  peekCardFrame,
  projectDrawerWidth,
} from './drawer-layout';

describe('projectDrawerWidth', () => {
  test('a phone in portrait: 82% of the window', () => {
    expect(projectDrawerWidth(375)).toBe(308); // iPhone SE: 67pt peek
    expect(projectDrawerWidth(393)).toBe(322); // iPhone 16: 71pt peek
  });

  test('a large phone, landscape and iPad: capped at 360', () => {
    expect(projectDrawerWidth(440)).toBe(DRAWER_MAX_WIDTH);
    expect(projectDrawerWidth(874)).toBe(DRAWER_MAX_WIDTH);
    expect(projectDrawerWidth(1024)).toBe(DRAWER_MAX_WIDTH);
  });

  test('the peek strip never drops under 56pt', () => {
    expect(projectDrawerWidth(280)).toBe(280 - DRAWER_MIN_PEEK);
  });

  test('no window yet: 0, never NaN', () => {
    expect(projectDrawerWidth(0)).toBe(0);
    expect(projectDrawerWidth(Number.NaN)).toBe(0);
  });
});

describe('peekCardFrame', () => {
  test('closed: a plain page', () => {
    expect(peekCardFrame(0, 44, false)).toEqual({ borderRadius: 0, scale: 1, dim: 0 });
  });

  test('open: the rounded, slightly smaller, dimmed card', () => {
    const open = peekCardFrame(1, 44, false);
    expect(open.borderRadius).toBe(44);
    expect(open.scale).toBeCloseTo(PEEK_CARD_SCALE, 6);
    expect(open.dim).toBeCloseTo(PEEK_CARD_DIM, 6);
  });

  test('half way: linear in progress, so it tracks the finger', () => {
    const half = peekCardFrame(0.5, 44, false);
    expect(half.borderRadius).toBe(22);
    expect(half.scale).toBeCloseTo(1 - (1 - PEEK_CARD_SCALE) / 2, 6);
  });

  test('Reduce Motion: no scale, the radius snaps on, the dim stays', () => {
    expect(peekCardFrame(0, 44, true)).toEqual({ borderRadius: 0, scale: 1, dim: 0 });
    const moving = peekCardFrame(0.3, 44, true);
    expect(moving.borderRadius).toBe(44);
    expect(moving.scale).toBe(1);
    expect(moving.dim).toBeCloseTo(0.3 * PEEK_CARD_DIM, 6);
  });

  test('progress outside 0…1 (a spring) is clamped', () => {
    expect(peekCardFrame(1.2, 44, false).borderRadius).toBe(44);
    expect(peekCardFrame(-0.1, 44, false).borderRadius).toBe(0);
  });
});

describe('drawerSwipeEdgeWidth', () => {
  test('a thread: the left third, so sideways scrollers keep the rest', () => {
    expect(drawerSwipeEdgeWidth('view', 393)).toBe(131);
  });

  test('every other project route: the whole page', () => {
    for (const route of ['index', 'sessions', 'files', 'account', 'inbox', null]) {
      expect(drawerSwipeEdgeWidth(route, 393)).toBe(393);
    }
  });
});
