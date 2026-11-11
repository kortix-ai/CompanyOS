/**
 * DrawerPeekCard — the project page as a card while the project drawer opens
 * (the ChatGPT iOS sidebar; Jay, 2026-11-11). It wraps the `Drawer`'s
 * children in `ProjectScreen`.
 *
 * `react-native-drawer-layout` (`drawerType="slide"`) moves the page right by
 * the drawer width. This card adds, from the drawer's progress on the UI
 * thread (`peekCardFrame`, `lib/ui/drawer-layout.ts`):
 * - corner radius 0 → 44pt (iOS) / 28pt (Android): the display corners
 * - scale 1 → 0.98
 * - a dim of the foreground ink, 0 → 8%
 * - a soft shadow, always on: while closed the card fills the window and the
 *   shadow falls outside it, so it shows only as the card moves.
 *
 * Reduce Motion: no scale and no radius in motion (the radius snaps on as soon
 * as the card moves); the library's translate stays.
 *
 * Two layers: the outer view casts the shadow (a clipping view cannot) and
 * only scales: its radius and shadow are fixed, so the shadow is drawn once,
 * never per frame. The inner view clips the page to the animated radius and
 * holds the dim. The drawer's own overlay
 * (transparent, `ProjectScreen`) lies over the card and closes the drawer on
 * a tap on the peek strip.
 */
import * as React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useDrawerProgress } from 'react-native-drawer-layout';
import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { useColorScheme } from 'nativewind';

import { PEEK_CARD_RADIUS, peekCardFrame } from '@/lib/ui/drawer-layout';
import { THEME, withAlpha } from '@/lib/utils/theme';

const RADIUS = Platform.OS === 'ios' ? PEEK_CARD_RADIUS.ios : PEEK_CARD_RADIUS.android;

export function DrawerPeekCard({ children }: { children: React.ReactNode }) {
  const progress = useDrawerProgress();
  const reducedMotion = useReducedMotion();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  // The page surface: the card's own fill, so the rounded corners never show
  // a transparent screen while the page under it draws nothing yet.
  const surface = isDark ? THEME.dark.background : THEME.light.background;
  // The light theme's ink both ways: a dark page dims to black, not to white.
  const ink = THEME.light.foreground;
  const shadow = `0px 0px 24px 0px ${withAlpha(ink, isDark ? 0.5 : 0.16)}`;

  const cardStyle = useAnimatedStyle(() => {
    const frame = peekCardFrame(progress.value, RADIUS, reducedMotion);
    return { transform: [{ scale: frame.scale }] };
  }, [reducedMotion]);
  const clipStyle = useAnimatedStyle(() => ({
    borderRadius: peekCardFrame(progress.value, RADIUS, reducedMotion).borderRadius,
  }), [reducedMotion]);
  const dimStyle = useAnimatedStyle(() => ({
    opacity: peekCardFrame(progress.value, RADIUS, reducedMotion).dim,
  }), [reducedMotion]);

  return (
    <Animated.View style={[styles.card, { boxShadow: shadow }, cardStyle]}>
      <Animated.View style={[styles.clip, { backgroundColor: surface }, clipStyle]}>
        {children}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: ink }, dimStyle]} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // No fill: the corners outside the clip show the sidebar surface.
  card: { flex: 1, borderRadius: RADIUS },
  clip: { flex: 1, overflow: 'hidden' },
});

/** The surface behind the card: the sidebar's own, so the card's corners show it. */
export function useDrawerBackdropColor(): string {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? THEME.dark.chromeBackground : THEME.light.chromeBackground;
}
