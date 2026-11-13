import { cn } from '../lib/utils';
import { buttonVariants } from './button';

/**
 * One look for Dialog, Modal, AlertDialog and ConfirmDialog (D45). Measured
 * from the reference design system and held in the `dialog` tokens
 * (visual-system.json → --dialog-*): 16px on every side, 16px
 * between blocks, a 4px gap from title to description, 12px corners. The close
 * button is a 24px ghost Button on the title's line, 16px from the end edge;
 * Cancel is secondary.
 *
 * Spacing never stacks: Dialog and AlertDialog put padding and gap on the
 * panel; Modal (whose parts may be full-bleed) gives each part only the space
 * above it, and the footer alone the bottom padding.
 */
export const DIALOG_RADIUS = 'rounded-(--dialog-radius)';
export const DIALOG_PADDING = 'gap-(--dialog-gap) px-(--dialog-padding) pt-(--dialog-padding-top) pb-(--dialog-padding)';
/** pe-10 (37px) keeps the title clear of the close button (10px inset + 24px). */
export const DIALOG_HEADER = 'flex flex-col gap-(--dialog-header-gap) pe-10 text-left';
export const DIALOG_TITLE = 'text-foreground text-base leading-6 font-medium';
export const DIALOG_DESCRIPTION = 'text-muted-foreground text-sm';
export const DIALOG_FOOTER = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end';
/**
 * Where the × sits: in the top end corner, the same distance from both edges
 * (`dialog.close_inset`, 10px), tighter than the 16px content padding (founder,
 * 2026-11-12: "move it more to top right").
 */
export const DIALOG_CLOSE_POSITION = 'absolute end-(--dialog-close-inset) top-(--dialog-close-inset)';
/**
 * What the × looks like: a ghost Button at sm, icon only, muted until hover.
 * Its grey fill shows on hover only: a panel never opens with focus on the ×
 * (`dialogInitialFocusTarget`).
 */
export const DIALOG_CLOSE_LOOK = cn(
  buttonVariants({ variant: 'ghost', size: 'sm' }),
  // p-0! and gap-0: the sm size pads the start of a button that begins with an
  // icon (a more specific rule than px-0), and the gap would count the sr-only
  // label. Either one pushes the × off the centre of its hover square.
  'text-muted-foreground hover:text-foreground w-(--control-sm-height) gap-0 p-0!',
);
/** Look first, then position: the ghost Button's `relative` gives way to `absolute`. */
export const DIALOG_CLOSE = cn(DIALOG_CLOSE_LOOK, DIALOG_CLOSE_POSITION);
/**
 * The same position as an inline style, set on every ×. A class can be
 * missing from a stylesheet (a tab whose CSS predates the class, a host whose
 * Tailwind build did not scan it); without its end offset an absolute × falls
 * back to the start edge, on top of the title. The style always applies.
 */
export const DIALOG_CLOSE_STYLE = {
  position: 'absolute',
  top: 'var(--dialog-close-inset, 10px)',
  insetInlineEnd: 'var(--dialog-close-inset, 10px)',
} as const;
/** Dialog, Modal and AlertDialog actions sit one step above the default
 *  control: lg (34px), not md (founder, 2026-11-12). */
export const DIALOG_ACTION_SIZE = 'lg' as const;
/**
 * The same step for the buttons a caller puts in a Dialog or Modal footer:
 * every Button that is a direct child takes the lg height, padding, gap and
 * corner, so no caller has to pass size="lg". (A Sheet's footer keeps md.)
 */
export const DIALOG_FOOTER_ACTIONS =
  '*:data-[slot=button]:h-(--control-lg-height) *:data-[slot=button]:px-(--control-lg-padding) *:data-[slot=button]:gap-(--control-lg-gap) *:data-[slot=button]:rounded-(--control-lg-radius)';

/** The backdrop behind every dialog: a light 25% dim with a soft blur (D45). */
export const DIALOG_OVERLAY = 'bg-black/25 backdrop-blur-sm';
