import { artifactFolders } from "@kortix/db";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../shared/db";

export type GalleryFolderRow = typeof artifactFolders.$inferSelect;
type Input = {
  name: string;
  icon?: string | null;
  icon_glyph?: { name: string; color: string } | null;
};
type Actor = { userId: string; manageAny: boolean };
type Result =
  { status: 200; row?: GalleryFolderRow } | { status: 403 } | { status: 404 };

export function listGalleryFolders(projectId: string) {
  return db
    .select()
    .from(artifactFolders)
    .where(eq(artifactFolders.projectId, projectId))
    .orderBy(asc(artifactFolders.name));
}
export async function createGalleryFolder(
  projectId: string,
  userId: string,
  input: Input,
) {
  const [row] = await db
    .insert(artifactFolders)
    .values({
      projectId,
      name: input.name,
      icon: input.icon,
      iconGlyph: input.icon_glyph,
      createdByUserId: userId,
    })
    .returning();
  return row!;
}
async function change(
  projectId: string,
  folderId: string,
  actor: Actor,
  input?: Partial<Input>,
): Promise<Result> {
  const where = and(
    eq(artifactFolders.projectId, projectId),
    eq(artifactFolders.folderId, folderId),
  );
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(artifactFolders)
      .where(where)
      .for("update");
    if (!row) return { status: 404 };
    if (row.createdByUserId !== actor.userId && !actor.manageAny)
      return { status: 403 };
    if (!input) {
      // The FK sets only gallery_folder_id to NULL; Files paths and sharing stay intact.
      await tx.delete(artifactFolders).where(where);
      return { status: 200 };
    }
    const [updated] = await tx
      .update(artifactFolders)
      .set({
        name: input.name ?? row.name,
        ...(input.icon !== undefined
          ? { icon: input.icon, ...(input.icon ? { iconGlyph: null } : {}) }
          : {}),
        ...(input.icon_glyph !== undefined
          ? {
              iconGlyph: input.icon_glyph,
              ...(input.icon_glyph ? { icon: null } : {}),
            }
          : {}),
      })
      .where(where)
      .returning();
    return { status: 200, row: updated! };
  });
}
export const editGalleryFolder = (
  projectId: string,
  folderId: string,
  actor: Actor,
  input: Partial<Input>,
) => change(projectId, folderId, actor, input);
export const removeGalleryFolder = (
  projectId: string,
  folderId: string,
  actor: Actor,
) => change(projectId, folderId, actor);
