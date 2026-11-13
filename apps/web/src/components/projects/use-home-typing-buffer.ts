'use client';

import { useComposerPrefillStore } from '@kortix/ui/internal/stores/composer-prefill-store';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';

/**
 * The project id when the address is a project home, else `null`: the home
 * (`/workspaces/<id>`) and the chat it redirects to when chats are on
 * (`/workspaces/<id>/chat`, whose `SpaceView` consumes the same store), with
 * or without a locale prefix. Both are one route for the buffer, so the
 * redirect neither restarts nor drops it. A session route keeps its own
 * draft, and `/workspaces/start` is not a project.
 */
export function homeProjectIdFromPath(pathname: string | null): string | null {
  const match = pathname?.match(/\/workspaces\/([^/?#]+)(?:\/chat)?\/?$/);
  const id = match?.[1];
  return id && id !== 'start' ? decodeURIComponent(id) : null;
}

/** The home composer's editor. While it is absent, typed keys have no target. */
const COMPOSER_EDITOR = '[data-composer-editor]';

/**
 * Keeps what a person types while the project home is still loading.
 *
 * Until the home composer's editor exists, the page has no input: first the
 * loading frame (`ProjectPendingScreen`), then the shell while the lazy editor
 * mounts. Under a slow API that lasts seconds, and every key typed in it
 * reached `<body>` and was lost (product audit F-023: 13 of 15 words lost at
 * 12 s of API latency).
 *
 * Printable keys and Backspace aimed at `<body>` now build a buffer, stored
 * as a `restoreDraft` prefill in `useComposerPrefillStore`. Each key writes
 * the WHOLE buffer, so whichever write the home composer's host consumes last
 * (`ProjectHome`, or `SpaceView` when home opens a chat) carries every key;
 * the composer appends it to the restored draft once the editor exists. An
 * empty buffer is written too, so Backspace can take back a write that was
 * already consumed. The buffer resets once the editor exists.
 *
 * Only keys whose target is `<body>` are taken: a focused button or link
 * (an access-gate screen, the sidebar) keeps its own keys, Space included.
 * A prompt handed over by another surface (desktop Quick Entry, `?q=`) wins:
 * once one appears, the buffer stops until the editor exists, even after the
 * host consumed it from the store.
 *
 * A layout effect, not a passive one: React runs child passive effects before
 * the parent's, so `ProjectHome` (a child) could consume a handed-over
 * prompt before a passive subscription here saw it.
 *
 * The handover latch lives in a ref, so StrictMode's dev re-run of the effect
 * keeps it after `ProjectHome` consumed the prompt.
 *
 * The entry is not dropped when the route leaves the home: home redirects to
 * `/chat` when chats are on, and `SpaceView` consumes it there. Known edge:
 * keys typed on an access-gate screen, followed by leaving the project before
 * any home composer mounts, land in that project's home composer on a later
 * visit in the same tab.
 *
 * Mounted by `ProjectAccessBoundary`, which stays mounted from the first
 * paint to the composer. Keys typed before React hydrates are not seen.
 * Enter is ignored: nothing is sent from a screen the person cannot see.
 * Shortcuts (Cmd, Ctrl, Alt) and IME composition pass through untouched.
 */
export function useHomeTypingBuffer(): void {
  const projectId = homeProjectIdFromPath(usePathname());
  const latch = useRef<{ projectId: string | null; handedOver: boolean }>({ projectId: null, handedOver: false });

  useLayoutEffect(() => {
    if (!projectId || typeof window === 'undefined') {
      latch.current = { projectId: null, handedOver: false };
      return;
    }
    if (latch.current.projectId !== projectId) latch.current = { projectId, handedOver: false };
    const state = latch.current;
    let text = '';
    const watch = (entry: { restoreDraft?: boolean } | undefined) => {
      if (entry && !entry.restoreDraft) state.handedOver = true;
    };
    watch(useComposerPrefillStore.getState().prefillByProject[projectId]);
    const unsubscribe = useComposerPrefillStore.subscribe((store) => watch(store.prefillByProject[projectId]));

    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector(COMPOSER_EDITOR)) {
        text = '';
        state.handedOver = false;
        return;
      }
      if (state.handedOver || event.defaultPrevented || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target !== document.body && event.target !== document.documentElement) return;
      if (event.key === 'Backspace') {
        if (!text) return;
        text = text.slice(0, -1);
      } else if (event.key.length === 1) {
        text += event.key;
      } else {
        return;
      }
      // Space would scroll the page; the key belongs to the composer.
      event.preventDefault();
      useComposerPrefillStore.getState().setPrefill(projectId, text, { restoreDraft: true });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unsubscribe();
    };
  }, [projectId]);
}
