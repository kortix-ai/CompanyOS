/**
 * Which verdict each swipe gives on a review item, in the card deck of the
 * Review page. Right is the item's yes, left its no. A decision needs a
 * chosen option, so it takes no swipe: its card opens the detail.
 *
 * - change: right merges, left closes the change request.
 * - approval: right approves, left denies.
 * - output, batch: right approves, left dismisses.
 */
import type { ReviewItemKind, ReviewVerdict } from '@kortix/sdk';

export interface ReviewSwipeVerdicts {
  right: ReviewVerdict | null;
  left: ReviewVerdict | null;
}

const SWIPE_VERDICTS: Record<ReviewItemKind, ReviewSwipeVerdicts> = {
  change: { right: 'approve', left: 'reject' },
  approval: { right: 'approve', left: 'reject' },
  output: { right: 'approve', left: 'dismiss' },
  batch: { right: 'approve', left: 'dismiss' },
  decision: { right: null, left: null },
};

export function reviewSwipeVerdicts(kind: ReviewItemKind): ReviewSwipeVerdicts {
  return SWIPE_VERDICTS[kind];
}
