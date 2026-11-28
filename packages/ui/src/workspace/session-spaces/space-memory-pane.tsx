'use client';

import { ApiError } from '@kortix/sdk';
import { useAddWorkspaceMemoryNote, useWorkspaceMemoryPages } from '@kortix/sdk/react';
import { useEffect, useId, useState } from 'react';

import { useTranslations } from '../../i18n';
import { Button } from '../../primitives/button';
import { ErrorState } from '../../primitives/error-state';
import Loading from '../../primitives/loading';
import { Skeleton } from '../../primitives/skeleton';
import { Textarea } from '../../primitives/textarea';
import { successToast } from '../../primitives/toast';
import { MemoryView } from '../memory/memory-view';

/** The API's cap on a note (`MEMORY_LIMITS.note_chars`). */
const NOTE_MAX = 1000;

type Failure = 'secret' | 'readOnly' | 'failed';
const FAILURE_BY_CODE: Record<string, Failure> = { secret_detected: 'secret', layer_read_only: 'readOnly' };

/**
 * The Memory pane of Space settings. A space with pages gets the full memory
 * view (the page list beside the open page). A space with none gets the one
 * thing it needs: a composer under the pane's header to save the first note,
 * so the pane never opens on an empty canvas with a floating popover.
 */
export function SpaceMemoryPane({
  projectId,
  groupId,
  place,
  onDraftChange,
}: {
  projectId: string;
  groupId: string;
  place: string;
  /** Whether the composer holds an unsaved note, so closing the dialog can ask first. */
  onDraftChange?: (hasDraft: boolean) => void;
}) {
  const t = useTranslations('sessionSpaces.settings');
  const tMemory = useTranslations('spaces.memory');
  const pages = useWorkspaceMemoryPages(projectId, groupId);

  if (pages.isError && !pages.data) {
    return (
      <div className="px-6 py-6">
        <ErrorState
          size="sm"
          title={tMemory('loadError')}
          action={
            <Button variant="outline" size="sm" onClick={() => void pages.refetch()}>
              {tMemory('retry')}
            </Button>
          }
        />
      </div>
    );
  }
  if (pages.data && pages.data.length > 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MemoryView projectId={projectId} layerKey={groupId} place={place} />
      </div>
    );
  }
  // The composer mounts only for a list known to be empty: typed text must not
  // vanish when the list arrives with pages and the page view replaces it.
  if (!pages.data) {
    return (
      <div aria-busy className="space-y-6 px-6 py-6">
        <Skeleton className="h-3 w-96 max-w-full py-0 motion-reduce:animate-none" />
        <Skeleton className="h-28 w-full rounded-lg py-0 motion-reduce:animate-none" />
      </div>
    );
  }
  return (
    <div className="space-y-6 px-6 py-6">
      <p className="text-muted-foreground text-sm text-pretty">{t('memoryDescription')}</p>
      <NoteComposer projectId={projectId} groupId={groupId} onDraftChange={onDraftChange} />
      <p className="text-muted-foreground border-t pt-4 text-sm">{t('memoryEmpty')}</p>
    </div>
  );
}

/** One note for the space's memory, in the prompt input's shape. Enter saves; Shift+Enter starts a new line. */
function NoteComposer({
  projectId,
  groupId,
  onDraftChange,
}: {
  projectId: string;
  groupId: string;
  onDraftChange?: (hasDraft: boolean) => void;
}) {
  const t = useTranslations('sessionSpaces.settings');
  const tMemory = useTranslations('spaces.memory');
  const hintId = useId();
  const add = useAddWorkspaceMemoryNote(projectId, groupId);
  const [text, setText] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const hasDraft = text.trim().length > 0;
  useEffect(() => {
    onDraftChange?.(hasDraft);
  }, [hasDraft, onDraftChange]);
  // Unmounting (the first note became a page, or the dialog closed) leaves no draft behind.
  useEffect(() => () => onDraftChange?.(false), [onDraftChange]);

  const save = () => {
    const note = text.trim();
    if (!note || add.isPending) return;
    // `mutateAsync`: the first note swaps this pane to the page list, which
    // unmounts the composer, and TanStack drops an unmounted caller's callbacks.
    add.mutateAsync({ text: note }).then(
      () => {
        setText('');
        successToast(tMemory('rememberThis.saved'));
      },
      (err) => setFailure((err instanceof ApiError && err.code && FAILURE_BY_CODE[err.code]) || 'failed'),
    );
  };

  return (
    <form
      className="bg-popover focus-within:border-ring duration-fast rounded-lg border transition-colors"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Textarea
        value={text}
        maxLength={NOTE_MAX}
        minHeight={72}
        maxHeight={240}
        aria-label={t('memoryLabel')}
        aria-invalid={failure ? true : undefined}
        aria-describedby={hintId}
        placeholder={t('memoryPlaceholder')}
        className="rounded-none border-0 bg-transparent px-3 pt-3 font-normal shadow-none focus:ring-0"
        onChange={(event) => {
          setText(event.target.value);
          setFailure(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            save();
          }
        }}
      />
      <div className="flex items-center justify-between gap-3 px-3 pb-2.5">
        <p id={hintId} role={failure ? 'alert' : undefined} className={failure ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
          {failure ? tMemory(`remember.status.${failure}`) : tMemory('remember.hint')}
        </p>
        <Button type="submit" size="sm" disabled={!text.trim() || add.isPending} aria-busy={add.isPending || undefined}>
          {add.isPending ? <Loading className="size-3.5 shrink-0" /> : null}
          {tMemory('remember.send')}
        </Button>
      </div>
    </form>
  );
}
