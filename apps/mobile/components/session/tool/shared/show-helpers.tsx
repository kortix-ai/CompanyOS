/**
 * `show` tool helpers.
 *
 * Mirrors apps/web `tool/shared/show-helpers.tsx`:
 * - `useShowOpenInTab` — an HTML file → its static-server preview, a localhost
 *   URL → the sandbox preview, both in-session (`SandboxPreviewSheet`, KRTX-602);
 *   an app link to an artifact of this project → the artifact viewer sheet
 *   (`openArtifactLink`); any other safe http(s) URL → external; a path → the file viewer (`showOpenTarget`;
 *   see `navigation.tsx` for each mobile target);
 * - `ShowFileActions` — web: Refresh · Full screen · "Preview". Mobile: Refresh
 *   · "Preview" (the full-screen file viewer).
 *
 * The show type/file glyphs (`showTypeIcon` / `showFileTypeIcon`) live in
 * `./tool-icons`, with the other tool icon maps. Not ported here:
 * `ShowCarousel` / `ShowContentRenderer` (web `features/file-renderers`). They
 * are content renderers, not primitives, and belong to the `show` renderer port.
 */

import { useCallback, useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ArrowClockwiseIcon, type AppIcon } from '@/lib/icons';
import { openArtifactLink } from '@/lib/artifacts/open-artifact-link';
import { fileKeys } from '@/lib/files/hooks';
import { showOpenTarget, type ShowRowModel } from '@/lib/session/tools/web-show';
import { useSandboxImage } from '@/components/session/turn/use-sandbox-image';
import { SettingsRow } from '@/components/kortix/settings-list';
import { webSpace } from '@/lib/session/user-message';
import { TURN_SPACE, useTurnPalette } from './styles';
import { useProxyUrl, useToolNavigation } from './navigation';

export function useShowOpenInTab(props: { type: string; url: string; path: string; title: string }) {
  const { type, url, path, title } = props;
  const { enabled, openExternal, openFile, openPreview } = useToolNavigation();
  const target = useMemo(() => showOpenTarget({ type, url, path }), [type, url, path]);
  const proxy = useProxyUrl(target?.kind === 'localhost' ? url : '');
  const htmlStaticProxy = useProxyUrl(target?.kind === 'html-file' ? target.staticUrl : '');

  return useCallback(() => {
    if (!target) return;
    // A localhost app or an HTML file opens in the in-session sheet (KRTX-602):
    // the session stays mounted, and the sheet's one-tap X returns to the same
    // position. Only an external URL and a sandbox file go elsewhere.
    if (target.kind === 'html-file' && htmlStaticProxy) {
      const fileName = path.split('/').pop() || path;
      openPreview(htmlStaticProxy.proxyUrl, title || fileName);
      return;
    }
    if (target.kind === 'localhost' && proxy) {
      openPreview(proxy.proxyUrl, title || `localhost:${proxy.port}`);
      return;
    }
    if (target.kind === 'external') {
      // An artifact of this project opens in the artifact viewer, over the
      // session; any other link (a public share link included) in the browser.
      if (enabled && openArtifactLink(target.url, title)) return;
      openExternal(target.url);
      return;
    }
    // A file target, or a preview whose proxy is not resolved yet: the file viewer.
    if (path && enabled) openFile(path);
  }, [enabled, htmlStaticProxy, openExternal, openFile, openPreview, path, proxy, target, title]);
}

/**
 * One `show` output in the transcript, as a `SettingsRow` inside the card's
 * `SettingsGroup` (COR-107; Jay, 2026-09-22): the app's own list row, so the
 * transcript reuses the list language every page already uses instead of a
 * bespoke card. Leading slot: the image itself for an image, else the type
 * glyph. Label: the file name. Description: the kind. The chevron comes with
 * `onPress`, and the payload opens in the file sheet or the Browser tab.
 */
export function ShowResultRow({
  entry,
  model,
  icon,
  directImageUrl,
}: {
  /** The output this row names: what `useShowOpenInTab` opens. */
  entry: { type: string; url: string; path: string; title: string };
  model: ShowRowModel;
  icon: AppIcon;
  /** A direct image URL, when the still is remote rather than in the sandbox. */
  directImageUrl?: string;
}) {
  const { enabled } = useToolNavigation();
  const open = useShowOpenInTab(entry);
  const wantsSandboxImage = model.thumb === 'image' && !!entry.path && !directImageUrl;
  const sandboxImage = useSandboxImage(entry.path, wantsSandboxImage);
  const imageUri =
    directImageUrl || (wantsSandboxImage && sandboxImage.phase === 'load' ? sandboxImage.source?.uri : undefined);

  return (
    <SettingsRow
      {...(imageUri
        ? {
            leading: (
              <Image
                source={{ uri: imageUri }}
                resizeMode="cover"
                style={{ width: SHOW_ROW_THUMB, height: SHOW_ROW_THUMB, borderRadius: 6 }}
              />
            ),
          }
        : { icon })}
      label={model.title}
      dense
      onPress={enabled ? open : undefined}
      accessibilityLabel={`${model.title}, ${model.subtitle}`}
    />
  );
}

/** The leading still in a show row: the settings list's own icon slot, squared. */
const SHOW_ROW_THUMB = 22;

/** Refresh invalidates file queries; onRefresh remounts the card body to reload image bytes. */
export function ShowFileActions({ path, onRefresh }: { path: string; onRefresh?: () => void }) {
  const palette = useTurnPalette();
  const queryClient = useQueryClient();
  const { openFile } = useToolNavigation();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void queryClient
      .invalidateQueries({ queryKey: fileKeys.all })
      .finally(() => {
        setRefreshing(false);
        onRefresh?.();
      });
  }, [onRefresh, queryClient]);

  const open = useCallback(() => openFile(path), [openFile, path]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: webSpace(1), flexShrink: 0 }}>
      <Button variant="ghost" size="icon" onPress={handleRefresh} disabled={refreshing} accessibilityLabel="Refresh">
        <Icon as={ArrowClockwiseIcon} size={TURN_SPACE.icon} color={palette.mutedForeground} />
      </Button>
      <Button variant="secondary" size="sm" onPress={open} accessibilityHint="Opens the file full screen">
        <Text>Preview</Text>
      </Button>
    </View>
  );
}
