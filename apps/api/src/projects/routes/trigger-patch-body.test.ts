import { describe, expect, test } from 'bun:test';
import {
  EVENT_BODY_KEYS,
  TRIGGER_MANIFEST_KEYS,
  TRIGGER_PATCH_SHAPE,
  TRIGGER_PATCH_SHAPE_MATCHES_KEYS,
  TYPE_SPECIFIC_BODY_KEYS,
} from './trigger-patch-body';

/**
 * The PATCH handler branches on three body-key lists (is the manifest touched, which
 * keys a type change drops, which keys re-validate the event). They used to be three
 * hand-kept literals beside the PATCH schema; one table now owns the vocabulary.
 * These pin the derived lists to the sets the literals held, and the schema to the table.
 */
describe('trigger PATCH body keys', () => {
  test('EVENT_BODY_KEYS is the five event-subscription keys', () => {
    expect([...EVENT_BODY_KEYS].sort()).toEqual(
      ['connector', 'event', 'event_account', 'event_config', 'event_source'],
    );
  });

  test('TYPE_SPECIFIC_BODY_KEYS holds the per-type keys and every event key', () => {
    expect([...TYPE_SPECIFIC_BODY_KEYS].sort()).toEqual(
      [
        'app', 'cron', 'event', 'event_account', 'event_config', 'event_source', 'connector',
        'expect_event_within', 'every', 'interval', 'mode', 'run', 'run_at', 'secret_env', 'timezone',
      ].sort(),
    );
    for (const key of EVENT_BODY_KEYS) expect(TYPE_SPECIFIC_BODY_KEYS).toContain(key);
  });

  test('TRIGGER_MANIFEST_KEYS is the keys whose change writes the manifest', () => {
    expect([...TRIGGER_MANIFEST_KEYS].sort()).toEqual(
      [
        'agent', 'app', 'connector', 'cron', 'enabled', 'every', 'event', 'event_account', 'event_config',
        'event_source', 'expect_event_within', 'filter', 'max_lateness', 'max_runs_per_day',
        'max_runs_per_hour', 'model', 'name', 'overlap', 'prompt_template', 'promptTemplate', 'run_at',
        'runAt', 'schedule', 'secret_env', 'secretEnv', 'session_id', 'sessionId', 'session_key',
        'sessionKey', 'session_mode', 'sessionMode', 'target', 'timezone', 'type',
      ].sort(),
    );
  });

  test('the PATCH schema documents type, schedule and max_lateness', () => {
    expect(Object.keys(TRIGGER_PATCH_SHAPE)).toEqual(
      expect.arrayContaining(['type', 'schedule', 'max_lateness']),
    );
  });

  test('every documented manifest key is in the PATCH schema (the pin compiles)', () => {
    expect(TRIGGER_PATCH_SHAPE_MATCHES_KEYS).toBe(true);
    for (const key of TRIGGER_MANIFEST_KEYS) {
      const aliasOnly = /^[a-z]+[A-Z]/.test(key);
      if (!aliasOnly) expect(Object.keys(TRIGGER_PATCH_SHAPE)).toContain(key);
    }
  });
});
