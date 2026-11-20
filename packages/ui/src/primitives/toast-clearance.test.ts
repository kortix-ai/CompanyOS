import { describe, expect, test } from 'bun:test';

import { toastClearance } from './toast-clearance';

const DESKTOP = { width: 1440, height: 900 };

describe('toastClearance', () => {
  test('a docked composer that reaches into the corner lane lifts toasts above its top edge', () => {
    // Composer x 500–1260 overlaps the lane x 1060–1416.
    expect(toastClearance({ top: 780, bottom: 880, left: 500, right: 1260, width: 760, height: 100 }, DESKTOP)).toBe(132);
  });

  test('a docked composer left of the corner lane leaves toasts at the window corner', () => {
    // A side panel fills the right; the composer ends at x 900, left of the lane.
    expect(toastClearance({ top: 780, bottom: 880, left: 300, right: 900, width: 600, height: 100 }, DESKTOP)).toBe(0);
  });

  test('a hidden (pre-mounted) composer asks for nothing', () => {
    expect(toastClearance({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }, DESKTOP)).toBe(0);
  });

  test('a composer that is not docked at the bottom asks for nothing', () => {
    expect(toastClearance({ top: 380, bottom: 540, left: 340, right: 1100, width: 760, height: 160 }, DESKTOP)).toBe(0);
  });

  test('a tall docked composer (top above the middle) still lifts toasts', () => {
    expect(toastClearance({ top: 300, bottom: 880, left: 500, right: 1260, width: 760, height: 580 }, DESKTOP)).toBe(612);
  });

  test('on a phone every bottom composer is in the lane', () => {
    expect(toastClearance({ top: 700, bottom: 820, left: 20, right: 380, width: 360, height: 120 }, { width: 390, height: 844 })).toBe(156);
  });
});
