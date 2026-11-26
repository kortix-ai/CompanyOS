'use client';

import type { ReactNode } from 'react';
import { TopicTabs } from '../kit/topic-tabs';
import type { HowTab } from './content';
import { InlineCode } from './inline-code';

/**
 * "How it works" for a surface page, in the home page's HowItWorksTabs shape
 * (the same as /security's LayerTabs): the heading and the tabs on the left,
 * the selected tab on the right as two short sentences over one visual.
 * Panels arrive rendered from the server, one per tab.
 */
export function SurfaceTabs({
  title,
  titleMuted,
  tabs,
  panels,
}: {
  title: string;
  titleMuted: string;
  tabs: readonly HowTab[];
  panels: readonly ReactNode[];
}) {
  const topics = { title, titleMuted, tabs: tabs.map((tab) => ({
    ...tab,
    description: <InlineCode text={tab.description} />,
    body: tab.body.map((line) => <InlineCode key={line} text={line} />),
  })) };
  return <TopicTabs topics={topics} renderedPanels={panels} label={title} idPrefix="surface" />;
}
