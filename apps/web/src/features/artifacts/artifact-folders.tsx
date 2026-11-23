'use client';

import { useTranslations } from '@/i18n/use-translations';
import type { ArtifactFolder } from '@kortix/sdk';
import { useArtifactFolderMutations } from '@kortix/sdk/react';
import { Button } from '@kortix/ui/button';
import { ConfirmDialog } from '@kortix/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kortix/ui/dropdown-menu';
import { EntityAvatar } from '@kortix/ui/entity-avatar';
import { Input } from '@kortix/ui/input';
import { Label } from '@kortix/ui/label';
import Loading from '@kortix/ui/loading';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@kortix/ui/modal';
import { errorToast, successToast } from '@kortix/ui/toast';
import {
  ProjectIconField,
  type ProjectIconValue,
} from '@kortix/ui/workspace/projects/modal/project-icon-field';
import { DotsThreeIcon, FolderIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { useState } from 'react';

export function ArtifactFolderEditor({
  projectId,
  folder,
  onClose,
}: {
  projectId: string;
  folder?: ArtifactFolder;
  onClose: () => void;
}) {
  const t = useTranslations('artifacts');
  const mutations = useArtifactFolderMutations(projectId);
  const [name, setName] = useState(folder?.name ?? '');
  const [icon, setIcon] = useState<ProjectIconValue>(
    folder?.icon_glyph
      ? { glyph: folder.icon_glyph }
      : folder?.icon
        ? { emoji: folder.icon }
        : null,
  );
  const pending = mutations.create.isPending || mutations.update.isPending;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = {
      name: name.trim(),
      icon: icon && 'emoji' in icon ? icon.emoji : null,
      icon_glyph: icon && 'glyph' in icon ? icon.glyph : null,
    };
    try {
      if (folder) await mutations.update.mutateAsync({ folderId: folder.folder_id, ...input });
      else await mutations.create.mutateAsync(input);
      successToast(t(folder ? 'folderSaved' : 'folderCreated'));
      onClose();
    } catch {
      errorToast(t('folderSaveFailed'));
    }
  };
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <ModalContent className="lg:max-w-lg">
        <ModalHeader>
          <ModalTitle>{t(folder ? 'editFolder' : 'newFolder')}</ModalTitle>
        </ModalHeader>
        <form onSubmit={submit}>
          <ModalBody>
            <div className="flex items-end gap-3">
              <ProjectIconField
                ariaLabel={t('folderIcon')}
                value={icon}
                onChange={(emoji) => setIcon({ emoji })}
                onGlyphChange={(glyph) => setIcon({ glyph })}
                onClear={() => setIcon(null)}
                disabled={pending}
                fallbackLabel={name}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="artifact-folder-name">{t('folderName')}</Label>
                <Input
                  id="artifact-folder-name"
                  autoFocus
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline-ghost" onClick={onClose} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()} aria-busy={pending}>
              {pending ? <Loading className="size-4" /> : null}
              {t(folder ? 'saveFolder' : 'createFolder')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

export function ArtifactFolderTile({
  folder,
  projectId,
  onOpen,
}: {
  folder: ArtifactFolder;
  projectId: string;
  onOpen: () => void;
}) {
  return (
    <div className="bg-secondary/50 flex min-w-0 items-center gap-2 rounded-md px-3 py-2">
      <button
        type="button"
        className="focus-visible:outline-ring flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md text-start focus-visible:outline-2"
        onClick={onOpen}
      >
        <EntityAvatar
          emoji={folder.icon}
          glyph={folder.icon_glyph}
          icon={FolderIcon}
          label={folder.name}
          size="md"
        />
        <span className="truncate text-sm font-medium" title={folder.name}>
          {folder.name}
        </span>
      </button>
      <ArtifactFolderActions folder={folder} projectId={projectId} />
    </div>
  );
}

export function ArtifactFolderActions({ folder, projectId }: { folder: ArtifactFolder; projectId: string }) {
  const t = useTranslations('artifacts');
  const mutations = useArtifactFolderMutations(projectId);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  return (<>
      {folder.can_manage ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('folderActions', { name: folder.name })}
            >
              <DotsThreeIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <PencilSimpleIcon />
              {t('editFolder')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(true)}>
              <TrashIcon />
              {t('deleteFolder')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {editing ? (
        <ArtifactFolderEditor
          projectId={projectId}
          folder={folder}
          onClose={() => setEditing(false)}
        />
      ) : null}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t('deleteFolderTitle', { name: folder.name })}
        description={t('deleteFolderHint')}
        isPending={mutations.remove.isPending}
        confirmVariant="destructive"
        confirmLabel={t('deleteFolder')}
        onConfirm={async () => {
          try {
            await mutations.remove.mutateAsync(folder.folder_id);
            successToast(t('folderDeleted'));
            setRemoving(false);
          } catch {
            errorToast(t('folderDeleteFailed'));
          }
        }}
      />
  </>);
}
