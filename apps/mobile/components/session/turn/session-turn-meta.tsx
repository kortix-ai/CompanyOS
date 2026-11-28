/**
 * SessionTurnMeta — the ⋯ button under a finished turn and the bottom sheet it
 * opens with the turn's numbers: when it finished, how long it took, what it
 * cost, how many tokens it used.
 *
 * Web shows these in a popover (`features/session/session-turn-meta.tsx`).
 * Mobile shows them in the app's bottom sheet (`KortixBottomSheetModal`: the
 * iOS native sheet, gorhom on Android), sized to its rows, with the Activity
 * sheet's side padding (Jay, 2026-11-28: a sheet, not a popover). Rows come
 * from `turnMetaRows` (`lib/session/turn-meta.ts`), a port of web's
 * `sessionTurnMetaRows`.
 */

import * as React from 'react';
import { View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { KortixBottomSheetModal, useContentSheetBottomInset } from '@/components/kortix/sheet';
import { SheetView } from '@/components/kortix/sheet-parts';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { DotsThreeIcon } from '@/lib/icons';
import { turnMetaRows, type TurnMetaCost } from '@/lib/session/turn-meta';
import { THEME, withAlpha } from '@/lib/utils/theme';
import { useTone } from '@/lib/utils/tone';

/** Web ticks the relative "Finished" row every 15s while the panel is open. */
const TICK_MS = 15_000;

/** Web `size-[1.05rem]` = 16.8px. */
export const TURN_ACTION_ICON_SIZE = 17;
/**
 * Turn action buttons are `Button size="icon-sm"` (28pt box). 8pt above and
 * below make the touch target 44pt tall; 4pt at the sides (36pt wide) stops
 * short of the neighbouring action, which sits 2pt away.
 */
export const TURN_ACTION_HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 } as const;

/** App body size on the Activity sheet's 24pt line pitch. */
const TEXT_ROW = { fontSize: 15, lineHeight: 24 } as const;
/** The Activity sheet's side padding and bottom clearance. */
const PAD_X = 18;
const PAD_BOTTOM = 24;

export function SessionTurnMeta({
  endedAt,
  durationMs,
  cost,
}: {
  endedAt: number | null;
  durationMs: number | null;
  cost: TurnMetaCost | null | undefined;
}) {
  const scheme = useTone();
  const [open, setOpen] = React.useState(false);
  const [now, setNow] = React.useState<number | null>(null);

  const handleOpen = React.useCallback(() => {
    // Read the clock on open, so the first visible frame is current.
    setNow(Date.now());
    setOpen(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [open]);

  // Closed, `now` is null; the fallback only decides whether the button exists.
  const rows = React.useMemo(
    () => turnMetaRows({ endedAt, now: now ?? endedAt ?? 0, durationMs, cost }),
    [endedAt, now, durationMs, cost]
  );

  // A ⋯ that opens onto an empty sheet is worse than no ⋯ at all.
  if (rows.length === 0) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        hitSlop={TURN_ACTION_HIT_SLOP}
        onPress={handleOpen}
        accessibilityLabel="Turn details"
        testID="session-turn-meta-trigger">
        <Icon as={DotsThreeIcon} size={TURN_ACTION_ICON_SIZE} color={withAlpha(THEME[scheme].foreground, 0.7)} />
      </Button>
      {open ? <TurnMetaSheet rows={rows} onDismiss={() => setOpen(false)} /> : null}
    </>
  );
}

/** Mounted only while open, so a long transcript holds no idle sheets. */
function TurnMetaSheet({
  rows,
  onDismiss,
}: {
  rows: ReadonlyArray<{ label: string; value: string }>;
  onDismiss: () => void;
}) {
  const ref = React.useRef<BottomSheetModal>(null);
  const bottomInset = useContentSheetBottomInset();
  React.useEffect(() => {
    ref.current?.present();
  }, []);

  return (
    <KortixBottomSheetModal ref={ref} title="Details" enablePanDownToClose onDismiss={onDismiss}>
      <SheetView
        testID="session-turn-meta-panel"
        style={{ paddingHorizontal: PAD_X, paddingTop: 4, paddingBottom: bottomInset + PAD_BOTTOM, gap: 12 }}>
        {rows.map((row) => (
          <View key={row.label} className="flex-row items-baseline justify-between gap-6">
            <Text className="text-muted-foreground" style={TEXT_ROW}>
              {row.label}
            </Text>
            <Text className="text-foreground" style={[TEXT_ROW, { fontVariant: ['tabular-nums'] }]}>
              {row.value}
            </Text>
          </View>
        ))}
      </SheetView>
    </KortixBottomSheetModal>
  );
}
