'use client';

import { useTranslations } from '@/i18n/use-translations';
import { suggestSpaceIcon } from '@kortix/shared';
import type { ArtifactFolder } from '@kortix/sdk';
import { useArtifactFolderMutations, useArtifactMutations } from '@kortix/sdk/react';
import { Button } from '@kortix/ui/button';
import { ConfirmDialog } from '@kortix/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kortix/ui/dropdown-menu';
import { EntityAvatar } from '@kortix/ui/entity-avatar';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@kortix/ui/input-group';
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
import { useRef, useState } from 'react';

import { isArtifactDrag, readArtifactDrag } from './artifact-card';

/**
 * A drop target for a dragged artifact card: `folderId` null is the root. It
 * accepts only a card (not files or text), shows `over` while one hovers, and
 * moves the artifact on drop unless it already sits there.
 */
export function useArtifactDropTarget(projectId: string, folderId: string | null, name: string) {
  const t = useTranslations('artifacts');
  const { update } = useArtifactMutations(projectId);
  const [over, setOver] = useState(false);
  // dragenter/dragleave fire for every child: count them, so crossing a child does not flicker.
  const depth = useRef(0);
  const reset = () => {
    depth.current = 0;
    setOver(false);
  };
  return {
    over,
    pending: update.isPending,
    props: {
      onDragEnter: (event: React.DragEvent) => {
        if (!isArtifactDrag(event)) return;
        event.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      onDragOver: (event: React.DragEvent) => {
        if (!isArtifactDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      },
      onDragLeave: (event: React.DragEvent) => {
        if (!isArtifactDrag(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      },
      onDrop: (event: React.DragEvent) => {
        if (!isArtifactDrag(event)) return;
        event.preventDefault();
        reset();
        const drag = readArtifactDrag(event);
        if (!drag || drag.folderId === folderId) return;
        update.mutate(
          { artifactId: drag.artifactId, folder_id: folderId },
          {
            onSuccess: () => successToast(t('movedToFolder', { name })),
            onError: () => errorToast(t('moveFailed')),
          },
        );
      },
    },
  };
}

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
  const displayedIcon = icon ?? (name.trim() ? suggestSpaceIcon(name) : { glyph: { name: 'Folder', color: 'grey' } });
  const pending = mutations.create.isPending || mutations.update.isPending;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = {
      name: name.trim(),
      icon: 'emoji' in displayedIcon ? displayedIcon.emoji : null,
      icon_glyph: 'glyph' in displayedIcon ? displayedIcon.glyph : null,
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
      <ModalContent className="lg:max-w-sm">
        <ModalHeader>
          <ModalTitle>{t(folder ? 'editFolder' : 'newFolder')}</ModalTitle>
        </ModalHeader>
        <form onSubmit={submit}>
          <ModalBody>
            <Label htmlFor="artifact-folder-name" className="sr-only">{t('folderName')}</Label>
            <InputGroup className="h-12">
              <InputGroupAddon className="pl-1.5 has-[>button]:ml-0">
                <ProjectIconField
                  ariaLabel={t('folderIcon')}
                  value={displayedIcon}
                  onChange={(emoji) => setIcon({ emoji })}
                  onGlyphChange={(glyph) => setIcon({ glyph })}
                  onClear={icon ? () => setIcon(null) : undefined}
                  disabled={pending}
                  triggerClassName="size-9 border-0 shadow-none"
                />
              </InputGroupAddon>
              <InputGroupInput
                id="artifact-folder-name"
                autoFocus
                required
                maxLength={100}
                placeholder={t('folderName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
              />
            </InputGroup>
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
  const drop = useArtifactDropTarget(projectId, folder.folder_id, folder.name);
  return (
    <div
      {...drop.props}
      data-drop-over={drop.over || undefined}
      aria-busy={drop.pending || undefined}
      className="bg-secondary/50 data-[drop-over]:bg-secondary data-[drop-over]:ring-ring flex min-w-0 items-center gap-2 rounded-md px-3 py-2 transition-colors data-[drop-over]:ring-2"
    >
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
        {drop.pending ? <Loading className="text-muted-foreground ms-auto size-3.5 shrink-0" /> : null}
      </button>
      <ArtifactFolderActions folder={folder} projectId={projectId} />
    </div>
  );
}

/** The "Artifacts" crumb inside a folder: it opens the root, and a card dropped on it leaves the folder. */
export function ArtifactRootCrumb({ projectId, onOpen }: { projectId: string; onOpen: () => void }) {
  const t = useTranslations('artifacts');
  const drop = useArtifactDropTarget(projectId, null, t('title'));
  return (
    <Button
      {...drop.props}
      variant="ghost"
      size="sm"
      onClick={onOpen}
      data-drop-over={drop.over || undefined}
      aria-busy={drop.pending || undefined}
      className="data-[drop-over]:bg-secondary data-[drop-over]:ring-ring data-[drop-over]:ring-2"
    >
      {drop.pending ? <Loading className="size-3.5" /> : null}
      {t('title')}
    </Button>
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
