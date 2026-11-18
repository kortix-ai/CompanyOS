'use client';

import { ApiError, type ProjectSessionGroup } from '@kortix/sdk';
import { useSetWorkspaceSessionGroupSharing } from '@kortix/sdk/react';
import { useState } from 'react';

import { EMPTY_PRINCIPAL_SELECTION, PrincipalPicker, type PrincipalSelection } from '../../access/access/principal-picker';
import { useTranslations } from '../../i18n';
import { Button } from '../../primitives/button';
import { Modal, ModalBody, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '../../primitives/modal';
import { errorToast, successToast } from '../../primitives/toast';

/** The picker's value for a space's current sharing: everyone, its members, or nobody else. */
function selectionOf(space: ProjectSessionGroup): PrincipalSelection {
  return space.visibility === 'project'
    ? { ...EMPTY_PRINCIPAL_SELECTION, everyone: true }
    : { ...EMPTY_PRINCIPAL_SELECTION, memberIds: [...(space.member_ids ?? [])] };
}

/**
 * Share a space: nobody else (the default), specific people, or everyone in
 * the workspace. Whoever it is shared with sees every session in it and its
 * Files folder. Only its creator opens this (`can_manage`).
 */
export function SpaceShareModal({
  projectId,
  space,
  open,
  onOpenChange,
}: {
  projectId: string;
  space: ProjectSessionGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('sessionSpaces');
  const share = useSetWorkspaceSessionGroupSharing(projectId);
  const [value, setValue] = useState<PrincipalSelection>(() => selectionOf(space));
  // Start from the stored sharing each time the dialog opens.
  const [openedFor, setOpenedFor] = useState(false);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) setValue(selectionOf(space));
  }
  const pending = share.isPending;

  const save = async () => {
    try {
      await share.mutateAsync({
        groupId: space.group_id,
        input: value.everyone ? { visibility: 'project' } : { visibility: 'private', member_ids: value.memberIds },
      });
      successToast(t('shared'));
      onOpenChange(false);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      errorToast(code === 'not_a_member' ? t('shareNotMember') : t('shareFailed'));
    }
  };

  return (
    <Modal open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <ModalContent className="lg:max-w-lg">
        <ModalHeader>
          <ModalTitle>{t('shareTitle', { name: space.name })}</ModalTitle>
          <ModalDescription>{t('shareDescription')}</ModalDescription>
        </ModalHeader>
        <ModalBody>
          <PrincipalPicker
            scope={{ kind: 'project', projectId }}
            kinds={['member']}
            everyone={{ label: t('shareEveryone') }}
            excludeUserIds={space.created_by ? [space.created_by] : undefined}
            value={value}
            onChange={setValue}
            searchPlaceholder={t('shareSearch')}
            autoFocus={false}
            disabled={pending}
          />
        </ModalBody>
        <ModalFooter className="sm:justify-between">
          <Button variant="outline-ghost" size="sm" className="w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button size="sm" className="w-full sm:w-auto" aria-busy={pending || undefined} disabled={pending} onClick={() => void save()}>
            {t('save')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
