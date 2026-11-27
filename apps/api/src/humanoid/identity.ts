/**
 * The humanoid's Base Identity record: one row per humanoid workspace that
 * points at each part (inbox, phone, browser, drive, its own conversation).
 * Secrets never live here; they stay in the vault.
 */
import { humanoidIdentities } from '@kortix/db';
import { eq, sql } from 'drizzle-orm';
import { db } from '../shared/db';

export type HumanoidIdentityRow = typeof humanoidIdentities.$inferSelect;
export type HumanoidIdentityPatch = Partial<Omit<HumanoidIdentityRow, 'projectId' | 'createdAt' | 'updatedAt'>>;

export async function getHumanoidIdentity(projectId: string): Promise<HumanoidIdentityRow | null> {
  const [row] = await db.select().from(humanoidIdentities).where(eq(humanoidIdentities.projectId, projectId)).limit(1);
  return row ?? null;
}

/** Create the row, or return the one that exists (a second create is a no-op). */
export async function ensureHumanoidIdentity(
  projectId: string,
  init: { name: string; role?: string | null },
): Promise<HumanoidIdentityRow> {
  await db
    .insert(humanoidIdentities)
    .values({ projectId, name: init.name, role: init.role ?? null })
    .onConflictDoNothing({ target: humanoidIdentities.projectId });
  return (await getHumanoidIdentity(projectId))!;
}

export async function updateHumanoidIdentity(projectId: string, patch: HumanoidIdentityPatch): Promise<void> {
  await db
    .update(humanoidIdentities)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(humanoidIdentities.projectId, projectId));
}
