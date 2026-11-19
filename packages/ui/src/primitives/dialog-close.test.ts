/**
 * The close × of every dialog-like panel (Dialog, AlertDialog, ConfirmDialog,
 * Sheet, Modal) comes from one recipe (D45, founder 2026-11-12):
 *
 * - a ghost Button at sm (24px, the title's line height), icon only, muted
 *   until hover;
 * - on the title's line: at the panel's top padding, so its centre is the
 *   title's centre; and 16px from the end edge, the panel's side padding.
 *
 * Its grey ghost fill shows on hover only: a panel never opens with focus on
 * the × (dialog-initial-focus.test.ts).
 */
import { describe, expect, test } from 'bun:test';

import { buttonVariants } from './button';

import { DIALOG_CLOSE, DIALOG_CLOSE_LOOK, DIALOG_CLOSE_POSITION, DIALOG_CLOSE_STYLE } from './dialog-recipe';

const classes = (s: string) => s.split(/\s+/).filter(Boolean);

describe('dialog close ×', () => {
  test('is a ghost Button at sm, square and muted', () => {
    for (const c of classes(buttonVariants({ variant: 'ghost' }))) {
      if (c.startsWith('hover:bg') || c.startsWith('bg-')) expect(classes(DIALOG_CLOSE_LOOK)).toContain(c);
    }
    expect(classes(DIALOG_CLOSE_LOOK)).toContain('h-(--control-sm-height)');
    expect(classes(DIALOG_CLOSE_LOOK)).toContain('w-(--control-sm-height)');
    expect(classes(DIALOG_CLOSE_LOOK)).toContain('text-muted-foreground');
  });

  test('centres the × in its hover square: no padding survives, no gap', () => {
    expect(classes(DIALOG_CLOSE_LOOK)).toContain('p-0!');
    expect(classes(DIALOG_CLOSE_LOOK)).toContain('gap-0');
  });

  test('sits in the corner: one inset for the top and the end edge', () => {
    expect(classes(DIALOG_CLOSE_POSITION)).toContain('top-(--dialog-close-inset)');
    expect(classes(DIALOG_CLOSE_POSITION)).toContain('end-(--dialog-close-inset)');
  });

  test('is absolutely placed: position wins over the Button base `relative`', () => {
    expect(classes(DIALOG_CLOSE)).toContain('absolute');
    expect(classes(DIALOG_CLOSE)).not.toContain('relative');
  });

  test('the position also rides inline, so a missing class cannot drop the × onto the title', () => {
    expect(DIALOG_CLOSE_STYLE.position).toBe('absolute');
    expect(DIALOG_CLOSE_STYLE.insetInlineEnd).toContain('--dialog-close-inset');
    expect(DIALOG_CLOSE_STYLE.top).toBe(DIALOG_CLOSE_STYLE.insetInlineEnd);
  });
});
