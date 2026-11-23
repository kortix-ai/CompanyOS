import { describe, expect, test } from 'bun:test';
import { planReviewVerdict } from './review-verdict';
import { reviewSwipeVerdicts } from './review-swipe';

describe('reviewSwipeVerdicts', () => {
  test('a change merges right and closes left', () => {
    const { right, left } = reviewSwipeVerdicts('change');
    expect(planReviewVerdict('cr:synthetic', right!)).toEqual({ call: 'merge', changeRequestId: 'synthetic' });
    expect(planReviewVerdict('cr:synthetic', left!)).toEqual({ call: 'close', changeRequestId: 'synthetic' });
  });

  test('a connector call approves right and denies left', () => {
    const { right, left } = reviewSwipeVerdicts('approval');
    expect(planReviewVerdict('call:synthetic', right!)).toEqual({
      call: 'resolve_approval',
      executionId: 'synthetic',
      decision: 'approve',
    });
    expect(planReviewVerdict('call:synthetic', left!)).toEqual({
      call: 'resolve_approval',
      executionId: 'synthetic',
      decision: 'deny',
    });
  });

  test('a decision takes no swipe', () => {
    expect(reviewSwipeVerdicts('decision')).toEqual({ right: null, left: null });
  });
});
