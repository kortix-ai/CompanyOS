import { describe, expect, test } from 'bun:test';

import { NOT_TURN_PROMPTER, stopRefusalMessage } from './stop-refusal';

/** Pins the stop-refusal guard both hosts re-export (KRTX-4772). */
const MESSAGE = 'Only the member who started this run, the session owner or a project manager can stop it.';
const FALLBACK = 'fallback copy';

describe('NOT_TURN_PROMPTER', () => {
  test('the 403 code of a stop the server refused', () => {
    expect(NOT_TURN_PROMPTER).toBe('not_turn_prompter');
  });
});

describe('stopRefusalMessage', () => {
  test('a refused REST stop gives the server message', () => {
    const error = Object.assign(new Error(MESSAGE), { status: 403, code: 'not_turn_prompter' });
    expect(stopRefusalMessage(error)).toBe(MESSAGE);
    expect(stopRefusalMessage(error, FALLBACK)).toBe(MESSAGE);
  });

  test('a refused runtime abort keeps only status and message, and still counts', () => {
    expect(stopRefusalMessage(Object.assign(new Error(MESSAGE), { status: 403 }))).toBe(MESSAGE);
  });

  test('the server message wins over the fallback, trimmed', () => {
    expect(stopRefusalMessage({ code: 'not_turn_prompter', message: `  ${MESSAGE}  ` }, FALLBACK)).toBe(MESSAGE);
  });

  test('a refusal with no message takes the fallback', () => {
    expect(stopRefusalMessage(Object.assign(new Error(''), { status: 403 }), FALLBACK)).toBe(FALLBACK);
    expect(stopRefusalMessage({ code: 'not_turn_prompter' }, FALLBACK)).toBe(FALLBACK);
  });

  test('any other failure is not a refusal', () => {
    expect(stopRefusalMessage(Object.assign(new Error('boom'), { status: 500 }), FALLBACK)).toBeNull();
    expect(stopRefusalMessage(new Error('offline'))).toBeNull();
    expect(stopRefusalMessage(undefined)).toBeNull();
    expect(stopRefusalMessage('403')).toBeNull();
  });
});
