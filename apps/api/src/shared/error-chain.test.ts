import { describe, expect, test } from 'bun:test';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { isAuditContentionError } from './error-cause';
import { isUniqueViolation, uniqueViolationConstraint } from './postgres-errors';
import { isTransientDatabaseError } from './database-errors';

// Characterization: the cause-chain contracts every classifier shares. These
// pin the behavior the shared walk must keep — how deep a wrapped SQLSTATE is
// still classified, that a cycle terminates, and that a wrapper code does not
// shadow a contended cause.

function driverError(code: string, constraintName?: string) {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    name: 'PostgresError',
    code,
    ...(constraintName ? { constraint_name: constraintName } : {}),
  });
}

describe('a wrapped 23505 classifies as a unique violation', () => {
  test('three cause links deep', () => {
    const error = { cause: { cause: { cause: driverError('23505') } } };
    expect(isUniqueViolation(error)).toBe(true);
  });

  test('the constraint name is read off the same depth', () => {
    const error = { cause: { cause: { cause: driverError('23505', 'projects_slug_key') } } };
    expect(uniqueViolationConstraint(error)).toBe('projects_slug_key');
  });

  test('a 23505 without a constraint name yields null, and other codes yield null', () => {
    expect(uniqueViolationConstraint({ cause: driverError('23505') })).toBeNull();
    expect(uniqueViolationConstraint({ cause: driverError('23503', 'other_key') })).toBeNull();
  });

  test('a cause cycle terminates', () => {
    const a: { cause?: unknown } = {};
    const b: { cause?: unknown } = { cause: a };
    a.cause = b;
    expect(isUniqueViolation(a)).toBe(false);
    expect(uniqueViolationConstraint(a)).toBeNull();
  });
});

describe('a 57P03 inside a real DrizzleQueryError classifies as transient', () => {
  test('isTransientDatabaseError reads the wrapped driver SQLSTATE', () => {
    const error = new DrizzleQueryError(
      'insert into "kortix"."audit_events" values ($1)',
      ['probe'],
      driverError('57P03'),
    );
    expect(isTransientDatabaseError(error)).toBe(true);
  });

  test('a cause cycle terminates', () => {
    const a: { cause?: unknown; code?: string } = { code: '42P01' };
    const b: { cause?: unknown } = { cause: a };
    a.cause = b;
    expect(isTransientDatabaseError(a)).toBe(false);
  });
});

describe('isAuditContentionError', () => {
  // The wrapper's own code is not in either contention set; the contended
  // cause underneath it must still classify (every node, not the first code).
  test('a synthetic wrapper code does not shadow a contended cause', () => {
    const error = Object.assign(new Error('wrapper'), {
      code: 'APP_OOPS',
      cause: driverError('55P03'),
    });
    expect(isAuditContentionError(error)).toBe(true);
  });

  test('a defect code on every node stays false', () => {
    expect(isAuditContentionError(driverError('23505'))).toBe(false);
    expect(isAuditContentionError(new Error('plain'))).toBe(false);
  });
});
