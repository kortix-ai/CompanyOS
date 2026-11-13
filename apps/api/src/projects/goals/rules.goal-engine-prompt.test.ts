import { describe, expect, test } from 'bun:test';
import { goalEnginePrompt } from './rules';

const ID = '0f8e2b1c-3d4a-4b5c-8d6e-7f8091a2b3c4';

describe('goalEnginePrompt reads the goal a prompt names', () => {
  test('a goal-queue prompt yields the id after "goal "', () => {
    expect(goalEnginePrompt({ source: 'system:goal', text: `Resume goal ${ID} now.` })).toEqual({ goalId: ID });
  });

  test('a goal-queue prompt without an id still counts, with a null id', () => {
    expect(goalEnginePrompt({ source: 'system:goal', text: 'Resume the goal.' })).toEqual({ goalId: null });
  });

  test('the id must be lowercase and stand alone', () => {
    expect(goalEnginePrompt({ source: 'system:goal', text: `goal ${ID.toUpperCase()}` })).toEqual({ goalId: null });
    expect(goalEnginePrompt({ source: 'system:goal', text: `goal ${ID}ff` })).toEqual({ goalId: null });
    expect(goalEnginePrompt({ source: 'system:goal', text: `subgoal ${ID}` })).toEqual({ goalId: null });
  });

  test('a reminder counts only with the wake marker and an id', () => {
    expect(goalEnginePrompt({ source: 'trigger:reminder', text: `Goal wake: box. Check goal ${ID}.` })).toEqual({ goalId: ID });
    expect(goalEnginePrompt({ source: 'trigger:reminder', text: `Check goal ${ID}.` })).toBeNull();
    expect(goalEnginePrompt({ source: 'trigger:reminder', text: 'Goal wake: box.' })).toBeNull();
  });

  test('a person\'s prompt is never a goal-engine prompt', () => {
    expect(goalEnginePrompt({ source: 'user', text: `goal ${ID}` })).toBeNull();
  });
});
