/**
 * TurnSources — "N sources" in the action bar under a finished answer: the
 * favicons of the first sites the response read, then the count. A tap opens
 * a card above it with every page (favicon, title, domain); a row opens the
 * page in the in-app browser.
 *
 * Mirrors apps/web `session/turn/turn-sources.tsx`. The pages come from the
 * SDK's `deriveTurnSources`, the same list web shows. Web opens them in the
 * side panel; mobile uses the popover card of the ⋯ turn details beside it
 * (Jay, 2026-09-23: a popover card, not a bottom sheet).
 */

import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TurnSource } from '@kortix/sdk';

import { PressableSurface } from '@/components/kortix/pressable-surface';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Text } from '@/components/ui/text';
import { FaviconAvatar } from '@/components/session/tool/shared/web-source-row';
import { useTurnPalette } from '@/components/session/tool/shared/styles';
import { OVERLAY_PORTAL_HOST } from '@/lib/ui/portal-hosts';
import { openExternalLink } from '@/lib/utils/open-link';

import { TURN_ACTION_HIT_SLOP } from './session-turn-meta';

/** Favicons drawn in the button before the count (web: 3). */
const STACK = 3;
/** The card keeps 12pt clear of the screen edges and the safe area. */
const EDGE_GAP = 12;
/** The list scrolls past this height. */
const LIST_MAX_HEIGHT = 320;
/** Web `text-xs`: 13px / 16px. */
const TEXT_XS = { fontSize: 13, lineHeight: 16 } as const;
const TEXT_SM = { fontSize: 15, lineHeight: 20 } as const;

export function TurnSources({ sources }: { sources: readonly TurnSource[] }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const palette = useTurnPalette();
  if (sources.length === 0) return null;

  const label = t('sessions.turnSources', { count: sources.length });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          hitSlop={TURN_ACTION_HIT_SLOP}
          accessibilityLabel={label}
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
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        portalHost={OVERLAY_PORTAL_HOST}
        insets={{
          top: insets.top + EDGE_GAP,
          bottom: insets.bottom + EDGE_GAP,
          left: insets.left + EDGE_GAP,
          right: insets.right + EDGE_GAP,
        }}
        className="w-80 p-1.5"
        testID="session-turn-sources-panel">
        <ScrollView style={{ maxHeight: LIST_MAX_HEIGHT }} bounces={false}>
          {sources.map((source) => (
            <PressableSurface
              key={source.url}
              accessibilityRole="link"
              accessibilityLabel={source.title}
              onPress={() => openExternalLink(source.url)}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8 },
                pressed && { backgroundColor: palette.muted },
              ]}>
              <FaviconAvatar value={source.url} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[TEXT_SM, { color: palette.foreground }]}>
                  {source.title}
                </Text>
                <Text numberOfLines={1} style={[TEXT_XS, { color: palette.mutedForeground }]}>
                  {source.domain}
                </Text>
              </View>
            </PressableSurface>
          ))}
        </ScrollView>
      </PopoverContent>
    </Popover>
  );
}
