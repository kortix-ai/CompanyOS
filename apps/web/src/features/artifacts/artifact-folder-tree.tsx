'use client';

import type { ArtifactFolder } from '@kortix/sdk';
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@kortix/ui/dropdown-menu';
import { EntityAvatar } from '@kortix/ui/entity-avatar';
import { FolderIcon, FolderSimpleDashedIcon } from '@phosphor-icons/react';

import { useTranslations } from '@/i18n/use-translations';

/** The gallery root in a folder picker's radio value. */
export const ROOT_FOLDER = 'root';

/** The folders directly inside `parentId` (null: the gallery root), in the API's name order. */
export function folderChildren(folders: ArtifactFolder[], parentId: string | null) {
  return folders.filter((folder) => (folder.parent_folder_id ?? null) === parentId);
}

/** `id` and its ancestors, root first. Bounded, so a corrupt tree cannot loop. */
export function folderPath(folders: ArtifactFolder[], id: string | null): ArtifactFolder[] {
  const byId = new Map(folders.map((folder) => [folder.folder_id, folder]));
  const path: ArtifactFolder[] = [];
  for (let at = id ? byId.get(id) : undefined; at && path.length <= folders.length; at = at.parent_folder_id ? byId.get(at.parent_folder_id) : undefined) {
    path.unshift(at);
  }
  return path;
}

/** `id` and every folder below it: where that folder may not move. */
export function folderSubtree(folders: ArtifactFolder[], id: string): Set<string> {
  const subtree = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const folder of folders) {
      if (folder.parent_folder_id && subtree.has(folder.parent_folder_id) && !subtree.has(folder.folder_id)) {
        subtree.add(folder.folder_id);
        grew = true;
      }
    }
  }
  return subtree;
}

/** Every folder in tree order (a parent, then its children), with its depth. */
function folderRows(folders: ArtifactFolder[], exclude: Set<string>) {
  const rows: { folder: ArtifactFolder; depth: number }[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const folder of folderChildren(folders, parentId)) {
      if (exclude.has(folder.folder_id)) continue;
      rows.push({ folder, depth });
      visit(folder.folder_id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

/**
 * The radio rows of a "Move to folder" submenu: No folder, then every folder
 * as a tree (indented by depth) with its own icon. `exclude` hides folders a
 * folder cannot move into (itself and its subfolders).
 */
export function FolderTreeRadioItems({
  folders,
  value,
  onValueChange,
  exclude = new Set(),
}: {
  folders: ArtifactFolder[];
  /** The current folder id, or `ROOT_FOLDER`. */
  value: string;
  onValueChange: (folderId: string | null) => void;
  exclude?: Set<string>;
}) {
  const t = useTranslations('artifacts');
  const rows = folderRows(folders, exclude);
  return (
    <DropdownMenuRadioGroup
      value={value}
      onValueChange={(next) => {
        if (next !== value) onValueChange(next === ROOT_FOLDER ? null : next);
      }}
    >
      <DropdownMenuRadioItem value={ROOT_FOLDER} textValue={t('folderRoot')}>
        <span className="text-muted-foreground flex size-5 shrink-0 items-center justify-center">
          <FolderSimpleDashedIcon className="size-4" />
        </span>
        <span className="truncate">{t('folderRoot')}</span>
      </DropdownMenuRadioItem>
      {rows.length ? <DropdownMenuSeparator /> : null}
      {rows.map(({ folder, depth }) => (
        <DropdownMenuRadioItem key={folder.folder_id} value={folder.folder_id} textValue={folder.name}>
          {/* One step per level: the tree reads without connector lines. */}
          {depth ? <span aria-hidden className="shrink-0" style={{ width: `${depth}rem` }} /> : null}
          <EntityAvatar
            emoji={folder.icon}
            glyph={folder.icon_glyph}
            icon={FolderIcon}
            label={folder.name}
            size="xs"
            className="shrink-0"
          />
          <span className="truncate" title={folder.name}>
            {folder.name}
          </span>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
