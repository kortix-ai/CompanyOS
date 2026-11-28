/**
 * TurnSources — "N sources" in the action bar under a finished answer: the
 * favicons of the first sites the response read, then the count. A tap opens
 * a bottom sheet with every page (favicon, title, domain); a row opens the
 * page in the in-app browser.
 *
 * Mirrors apps/web `session/turn/turn-sources.tsx`. The pages come from the
 * SDK's `deriveTurnSources`, the same list web shows. Mobile shows them in the
 * app's bottom sheet (`KortixBottomSheetModal`: the iOS native sheet, gorhom
 * on Android), laid out like the Activity sheet: a bordered 24pt tile, then
 * the text (Jay, 2026-11-28: a sheet like the Activity sheet, not a popover).
 */

import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { TurnSource } from '@kortix/sdk';

import { KortixBottomSheetModal } from '@/components/kortix/sheet';
import { SheetScrollView } from '@/components/kortix/sheet-parts';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FaviconAvatar } from '@/components/session/tool/shared/web-source-row';
import { FONT_MEDIUM, TURN_TYPE, useTurnPalette } from '@/components/session/tool/shared/styles';
import { openExternalLink } from '@/lib/utils/open-link';

import { TURN_ACTION_HIT_SLOP } from './session-turn-meta';

/** Favicons drawn in the button before the count (web: 3). */
const STACK = 3;
/** Web `text-xs`: 13px / 16px. */
const TEXT_XS = { fontSize: 13, lineHeight: 16 } as const;
/** Opens at 40% of the screen like the Activity sheet; drag up for the full height. */
const SNAP_POINTS = ['40%'];
/** The Activity sheet's lengths (`activity-sheet.tsx` `SHEET`). */
const SHEET = { padX: 18, padTop: 12, padBottom: 24, marker: 24, tileRadius: 7, markerGap: 16, rowGap: 20 } as const;

export function TurnSources({ sources }: { sources: readonly TurnSource[] }) {
  const { t } = useTranslation();
  const palette = useTurnPalette();
  const [open, setOpen] = React.useState(false);
  if (sources.length === 0) return null;

  const label = t('sessions.turnSources', { count: sources.length });
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        hitSlop={TURN_ACTION_HIT_SLOP}
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        className="h-7 gap-1.5 px-2"
        testID="session-turn-sources">
        <View className="flex-row">
          {sources.slice(0, STACK).map((source, index) => (
            <View
              key={source.url}
              style={{ marginLeft: index === 0 ? 0 : -4, borderRadius: 5, borderWidth: 1, borderColor: palette.background }}>
              <FaviconAvatar value={source.url} />
            </View>
          ))}
        </View>
        <Text style={[TEXT_XS, { color: palette.mutedForeground, fontVariant: ['tabular-nums'] }]}>{label}</Text>
      </Button>
      {open ? <TurnSourcesSheet title={label} sources={sources} onDismiss={() => setOpen(false)} /> : null}
    </>
  );
}

/** Mounted only while open, so a long transcript holds no idle sheets. */
function TurnSourcesSheet({
  title,
  sources,
  onDismiss,
}: {
  title: string;
  sources: readonly TurnSource[];
  onDismiss: () => void;
}) {
  const ref = React.useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  React.useEffect(() => {
    ref.current?.present();
  }, []);

  return (
    <KortixBottomSheetModal
      ref={ref}
      title={title}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={onDismiss}>
      <SheetScrollView
        testID="session-turn-sources-panel"
        contentContainerStyle={{
          paddingHorizontal: SHEET.padX,
          paddingTop: SHEET.padTop,
          paddingBottom: insets.bottom + SHEET.padBottom,
          gap: SHEET.rowGap,
        }}>
        {sources.map((source) => (
          <SourceRow key={source.url} source={source} />
        ))}
      </SheetScrollView>
    </KortixBottomSheetModal>
  );
}

function SourceRow({ source }: { source: TurnSource }) {
  const palette = useTurnPalette();
  // Layout on a plain View: css-interop drops a function `style` on Pressable.
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={source.title}
      onPress={() => openExternalLink(source.url)}
      className="active:opacity-60">
      <View style={{ flexDirection: 'row', gap: SHEET.markerGap }}>
        <View
          style={{
            width: SHEET.marker,
            height: SHEET.marker,
            borderRadius: SHEET.tileRadius,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.background,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
          <FaviconAvatar value={source.url} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={[TURN_TYPE.sheetEntry, { fontFamily: FONT_MEDIUM, color: palette.foreground }]}>
            {source.title}
          </Text>
          <Text numberOfLines={1} style={[TEXT_XS, { color: palette.mutedForeground }]}>
            {source.domain}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
