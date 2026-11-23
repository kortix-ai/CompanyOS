'use client';

import { useEffect, useState } from 'react';

/**
 * The control ladder (D43) read live from the page's CSS variables, so the
 * spec tables show what the browser applies, not a copy that can drift. The
 * values live in visual-system.json `controls`; generate-tokens.ts writes them
 * to globals.css as `--control-<size>-*`.
 */
export const CONTROL_SIZE_NAMES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const;
export type ControlSizeName = (typeof CONTROL_SIZE_NAMES)[number];

export interface ControlSize {
  size: ControlSizeName;
  height: number;
  padding: number;
  paddingIcon: number;
  gap: number;
  icon: number;
  radius: number;
  iconOnlyRadius: number;
  tabPadding: number;
  tabGap: number;
  selectPs: number;
  selectPe: number;
}

function read(style: CSSStyleDeclaration, size: string, prop: string): number {
  return parseFloat(style.getPropertyValue(`--control-${size}-${prop}`)) || 0;
}

export function useControlSizes(): ControlSize[] {
  const [sizes, setSizes] = useState<ControlSize[]>([]);
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    setSizes(
      CONTROL_SIZE_NAMES.map((size) => ({
        size,
        height: read(style, size, 'height'),
        padding: read(style, size, 'padding'),
        paddingIcon: read(style, size, 'padding-icon'),
        gap: read(style, size, 'gap'),
        icon: read(style, size, 'icon'),
        radius: read(style, size, 'radius'),
        iconOnlyRadius: read(style, size, 'icon-only-radius'),
        tabPadding: read(style, size, 'tab-padding'),
        tabGap: read(style, size, 'tab-gap'),
        selectPs: read(style, size, 'select-ps'),
        selectPe: read(style, size, 'select-pe'),
      })),
    );
  }, []);
  return sizes;
}
