/**
 * The employee's Base Identity record: one row per employee workspace that
 * points at each part (inbox, phone, browser, drive, its own conversation).
 * Secrets never live here; they stay in the vault.
 */
import { employeeIdentities } from '@kortix/db';
import { eq, sql } from 'drizzle-orm';
import { db } from '../shared/db';

export type EmployeeIdentityRow = typeof employeeIdentities.$inferSelect;
export type EmployeeIdentityPatch = Partial<Omit<EmployeeIdentityRow, 'projectId' | 'createdAt' | 'updatedAt'>>;

export async function getEmployeeIdentity(projectId: string): Promise<EmployeeIdentityRow | null> {
  const [row] = await db.select().from(employeeIdentities).where(eq(employeeIdentities.projectId, projectId)).limit(1);
  return row ?? null;
}

/** Create the row, or return the one that exists (a second create is a no-op). */
export async function ensureEmployeeIdentity(
  projectId: string,
  init: { name: string; role?: string | null },
): Promise<EmployeeIdentityRow> {
  await db
    .insert(employeeIdentities)
    .values({ projectId, name: init.name, role: init.role ?? null })
    .onConflictDoNothing({ target: employeeIdentities.projectId });
  return (await getEmployeeIdentity(projectId))!;
}

export async function updateEmployeeIdentity(projectId: string, patch: EmployeeIdentityPatch): Promise<void> {
  await db
    .update(employeeIdentities)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(employeeIdentities.projectId, projectId));
}
