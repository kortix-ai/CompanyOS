/**
 * ArtifactViewerSheet — the one artifact viewer: a full-height sheet over the
 * Artifacts page or the thread, so closing it returns to the same place (the
 * `SandboxPreviewSheet` / `FilePreviewSheet` shape). Mounted once in the
 * project screen; `useArtifactViewerStore` opens it.
 *
 * Title row: X · the artifact's title · `···` (`ArtifactActionsSheet`, whose
 * Ask AI closes the viewer and opens project home with the artifact attached:
 * `onNewChat`). Body:
 * the page from its signed `view_url` (`ArtifactWebView`). A doc and an HTML
 * page render the same way: the server renders a doc's Markdown as styled,
 * theme-aware HTML. Docs are read-only here; editing stays on web.
 *
 * Failures: a refused or expired content URL (403/404/410) reads the
 * artifact again once for a fresh URL; a second failure, a server error or no
 * network shows the error with Try again. An artifact that is gone (404 on the
 * read) says so in web's words.
 */

import * as React from 'react';
import { BackHandler, Platform, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ApiError, type Artifact, type ArtifactDetail } from '@kortix/sdk';
import { useArtifact } from '@kortix/sdk/react';

import {
  ArtifactActionsSheet,
  type ArtifactActionsSheetRef,
} from '@/components/artifacts/ArtifactActionsSheet';
import { ArtifactWebView } from '@/components/artifacts/ArtifactWebView';
import { HEADER_ICON_SIZE } from '@/components/kortix/header-button';
import { KortixLoader } from '@/components/kortix/kortix-loader';
import { KortixBottomSheetModal } from '@/components/kortix/sheet';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { artifactHttpErrorAction } from '@/lib/artifacts/artifacts';
import { haptics } from '@/lib/haptics';
import { DotsThreeIcon } from '@/lib/icons';
import { THEME } from '@/lib/utils/theme';
import { useTone } from '@/lib/utils/tone';
import { useArtifactChatStore } from '@/stores/artifact-chat-store';
import { useAuthContext } from '@/contexts/AuthContext';
import { useArtifactViewerStore } from '@/stores/artifact-viewer-store';

export function ArtifactViewerSheet({
  projectId,
  onNewChat,
}: {
  projectId: string;
  /** Opens project home (the drawer's New session); Ask AI attaches the artifact first. */
  onNewChat: () => void;
}) {
  const { user } = useAuthContext();
  const userId = user?.id ?? null;
  const target = useArtifactViewerStore((s) =>
    s.userId === userId && s.target?.projectId === projectId ? s.target : null
  );
  const close = useArtifactViewerStore((s) => s.close);
  const modalRef = React.useRef<BottomSheetModal>(null);
  const actionsRef = React.useRef<ArtifactActionsSheetRef>(null);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const background = THEME[useTone()].background;

  // Hydration may finish after the project mounts. Bind only after it, and
  // never persist a signed content URL or another user's artifact.
  React.useEffect(() => {
    const bind = () => useArtifactViewerStore.getState().bind(userId, projectId);
    const unsubscribe = useArtifactViewerStore.persist.onFinishHydration(bind);
    if (useArtifactViewerStore.persist.hasHydrated()) bind();
    return () => {
      unsubscribe();
      const now = useArtifactViewerStore.getState();
      if (now.projectId === projectId) now.setProjectId(null);
    };
  }, [projectId, userId]);

  // The store is the source of truth: an open presents the sheet, its dismiss clears it.
  React.useEffect(() => {
    if (target?.projectId === projectId) modalRef.current?.present();
  }, [target, projectId]);

  // Android back closes the viewer before it reaches the project stack.
  React.useEffect(() => {
    if (Platform.OS !== 'android' || !target) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // The actions sheet over the viewer registers its own handler, which runs first.
      modalRef.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [target]);

  const query = useArtifact(target?.projectId, target?.artifactId);
  const artifact =
    query.data && query.data.artifact_id === target?.artifactId ? query.data : undefined;

  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = React.useCallback(async () => {
    // Keep the loaded page until the authorized read has updated the query.
    await query.refetch();
    setReloadKey((value) => value + 1);
  }, [query]);

  const openActions = React.useCallback(() => {
    if (!artifact) return;
    haptics.tap();
    actionsRef.current?.present(artifact);
  }, [artifact]);

  const askAi = React.useCallback(
    (picked: Artifact | ArtifactDetail) => {
      useArtifactChatStore.getState().attach(projectId, picked);
      modalRef.current?.dismiss();
      onNewChat();
    },
    [onNewChat, projectId]
  );

  const onRemoved = React.useCallback((artifactId: string) => {
    if (useArtifactViewerStore.getState().target?.artifactId === artifactId)
      modalRef.current?.dismiss();
  }, []);

  return (
    <>
      <KortixBottomSheetModal
        ref={modalRef}
        title={artifact?.title ?? target?.title ?? t('artifacts.title')}
        titleTrailing={
          artifact ? (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onPress={openActions}
              hitSlop={10}
              accessibilityLabel={t('artifacts.more')}>
              <Icon as={DotsThreeIcon} size={HEADER_ICON_SIZE} className="text-foreground" />
            </Button>
          ) : undefined
        }
        snapPoints={['100%']}
        enableDynamicSizing={false}
        topInset={insets.top}
        // The page scrolls inside the WebView. A content pan would take the drag
        // on Android, so only the handle and title row drag the sheet.
        enablePanDownToClose
        enableContentPanningGesture={false}
        backgroundStyle={{ backgroundColor: background }}
        onDismiss={close}>
        {target ? (
          <ArtifactBody
            // A new artifact or a Reload starts from a clean state.
            key={`${target.projectId}:${target.artifactId}:${reloadKey}`}
            query={query}
            artifactViewUrl={artifact?.version.view_url}
            background={background}
            bottomInset={insets.bottom}
            onRetry={reload}
          />
        ) : null}
      </KortixBottomSheetModal>
      {target ? (
        <ArtifactActionsSheet
          ref={actionsRef}
          projectId={target.projectId}
          onReload={reload}
          onRemoved={onRemoved}
          onAskAi={askAi}
          pushed
        />
      ) : null}
    </>
  );
}

function ArtifactBody({
  query,
  artifactViewUrl,
  background,
  bottomInset,
  onRetry,
}: {
  query: ReturnType<typeof useArtifact>;
  artifactViewUrl: string | undefined;
  background: string;
  bottomInset: number;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [pageError, setPageError] = React.useState(false);
  const retriedRef = React.useRef(false);
  const { refetch } = query;
  const [loadedUrl, setLoadedUrl] = React.useState(artifactViewUrl);
  const viewUrl = loadedUrl ?? artifactViewUrl;
  React.useEffect(() => {
    if (!loadedUrl && artifactViewUrl) setLoadedUrl(artifactViewUrl);
  }, [loadedUrl, artifactViewUrl]);

  const onHttpError = React.useCallback(
    (status: number) => {
      if (artifactHttpErrorAction(status, retriedRef.current) === 'refresh') {
        retriedRef.current = true;
        // A fresh read with a new signed URL remounts the WebView on it. A
        // failed read keeps the cached artifact, and the same URL loads
        // nothing new: both show the error instead of the refused page.
        const failedUrl = viewUrl;
        void refetch().then((result) => {
          const nextUrl = result.data?.version.view_url;
          if (result.isError || !nextUrl || nextUrl === failedUrl) setPageError(true);
          else setLoadedUrl(nextUrl);
        });
        return;
      }
      setPageError(true);
    },
    [viewUrl, refetch]
  );
  const onLoadError = React.useCallback(() => setPageError(true), []);

  const gone =
    query.isError &&
    query.error instanceof ApiError &&
    (query.error.status === 404 || query.error.status === 403);
  if (gone || (query.isError && !viewUrl)) {
    return gone ? (
      <ViewerStatus title={t('artifacts.notFoundTitle')} detail={t('artifacts.notFoundHint')} />
    ) : (
      <ViewerStatus
        title={t('artifacts.openError')}
        retryLabel={t('artifacts.retry')}
        onRetry={onRetry}
      />
    );
  }
  if (pageError) {
    return (
      <ViewerStatus
        title={t('artifacts.openError')}
        retryLabel={t('artifacts.retry')}
        onRetry={onRetry}
      />
    );
  }
  if (!viewUrl) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: background }}>
        <KortixLoader />
      </View>
    );
  }
  return (
    <ArtifactWebView
      key={viewUrl}
      viewUrl={viewUrl}
      background={background}
      bottomInset={bottomInset}
      onHttpError={onHttpError}
      onLoadError={onLoadError}
    />
  );
}

function ViewerStatus({
  title,
  detail,
  retryLabel,
  onRetry,
}: {
  title: string;
  detail?: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8">
      <Text variant="muted" className="text-center" accessibilityLiveRegion="polite">
        {title}
      </Text>
      {detail ? (
        <Text variant="muted" className="text-center">
          {detail}
        </Text>
      ) : null}
      {onRetry && retryLabel ? (
        <Button variant="secondary" size="lg" className="mt-1 rounded-full" onPress={onRetry}>
          <Text>{retryLabel}</Text>
        </Button>
      ) : null}
    </View>
  );
}
