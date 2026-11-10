import { errorChain } from './error-cause';

/** PostgreSQL SQLSTATE 23505, including errors wrapped by Drizzle and postgres.js. */
export function isUniqueViolation(error: unknown): boolean {
  return errorChain(error).some((node) => node.code === '23505');
}

/** The constraint a PostgreSQL 23505 names (postgres.js `constraint_name`), through Drizzle wrapping; null for any other error. */
export function uniqueViolationConstraint(error: unknown): string | null {
  for (const node of errorChain(error)) {
    if (node.code === '23505') {
      return typeof node.constraint_name === 'string' ? node.constraint_name : null;
    }
  }
  return null;
}
