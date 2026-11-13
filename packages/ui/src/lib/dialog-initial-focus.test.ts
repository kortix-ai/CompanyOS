/**
 * A dialog, sheet or modal opens with focus on its first field, else on the
 * panel itself, never on a button. Base UI's default (the first tabbable
 * element) is the close × in a panel with no field, and a focused × paints its
 * focus chrome the moment the panel opens.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { dialogInitialFocusTarget } from './base-ui-compat';

const win = new Window();
const doc = win.document as unknown as Document;
const proto = win.HTMLElement.prototype as unknown as { getClientRects: () => unknown[] };
const original = proto.getClientRects;

beforeAll(() => {
  // happy-dom has no layout: an element is "rendered" unless it says `data-hidden`.
  proto.getClientRects = function (this: HTMLElement) {
    return this.closest('[data-hidden]') ? [] : [{}];
  };
});
afterAll(() => {
  proto.getClientRects = original;
});

function panel(html: string): HTMLElement {
  const el = doc.createElement('div');
  el.innerHTML = html;
  return el as HTMLElement;
}

const CLOSE = '<button aria-label="Close">×</button>';

describe('dialogInitialFocusTarget', () => {
  test('a panel with only a close × focuses the panel, not the ×', () => {
    const p = panel(`${CLOSE}<p>Model, sandbox and usage for this session.</p>`);
    expect(dialogInitialFocusTarget(p)).toBe(p);
  });

  test('a panel with buttons only (an alert dialog) focuses the panel', () => {
    const p = panel(`${CLOSE}<button>Cancel</button><button>Delete</button>`);
    expect(dialogInitialFocusTarget(p)).toBe(p);
  });

  test('the first field wins over the × that comes before it', () => {
    const p = panel(`${CLOSE}<input name="secret" /><textarea></textarea>`);
    expect(dialogInitialFocusTarget(p)?.getAttribute('name')).toBe('secret');
  });

  test('an autofocus element wins over an earlier field', () => {
    const p = panel('<input name="a" /><textarea data-autofocus name="b"></textarea>');
    expect(dialogInitialFocusTarget(p)?.getAttribute('name')).toBe('b');
  });

  test('hidden, disabled and inert fields are skipped', () => {
    const p = panel(
      '<input type="hidden" name="h" /><input disabled name="d" />' +
        '<div data-hidden><input name="gone" /></div><div inert><input name="inert" /></div>' +
        '<input name="real" />',
    );
    expect(dialogInitialFocusTarget(p)?.getAttribute('name')).toBe('real');
  });
});
