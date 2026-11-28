/**
 * "N sources" under an answer: the count in the button, one row per page in
 * the card, and a row opens its page. Run with `bun test --isolate`.
 */
import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { TurnSource } from '@kortix/sdk';

type HostProps = React.PropsWithChildren<Record<string, unknown>>;
const host = (name: string) => ({ children, ...props }: HostProps) => React.createElement(name, props, children);
const none = () => null;

const opened: unknown[] = [];

mock.module('react-native', () => ({ View: host('view'), ScrollView: host('scroll-view') }));
mock.module('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o: { count: number }) => `${key}:${o.count}` }),
}));
mock.module('@/components/kortix/pressable-surface', () => ({ PressableSurface: host('pressable') }));
mock.module('@/components/ui/button', () => ({ Button: host('button') }));
mock.module('@/components/ui/popover', () => ({
  Popover: host('popover'),
  PopoverTrigger: host('popover-trigger'),
  PopoverContent: host('popover-content'),
}));
mock.module('@/components/ui/text', () => ({ Text: host('text') }));
mock.module('@/components/session/tool/shared/web-source-row', () => ({ FaviconAvatar: none }));
mock.module('@/components/session/tool/shared/styles', () => ({
  useTurnPalette: () => ({ background: 'white', foreground: 'black', mutedForeground: 'gray', muted: 'silver' }),
}));
mock.module('@/lib/ui/portal-hosts', () => ({ OVERLAY_PORTAL_HOST: 'overlay' }));
mock.module('@/lib/utils/open-link', () => ({ openExternalLink: (url: unknown) => void opened.push(url) }));
mock.module('./session-turn-meta', () => ({ TURN_ACTION_HIT_SLOP: {} }));

let TurnSources: typeof import('./turn-sources').TurnSources;
beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ({ TurnSources } = await import('./turn-sources'));
});

let tree: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  opened.length = 0;
});

const SOURCES: TurnSource[] = [
  { url: 'https://a.example/x', title: 'Page A', domain: 'a.example' },
  { url: 'https://b.example/y', title: 'Page B', domain: 'b.example', snippet: 'Excerpt.' },
];

function render(sources: TurnSource[]) {
  act(() => {
    tree = create(<TurnSources sources={sources} />);
  });
  return tree!;
}

describe('TurnSources', () => {
  test('an answer that read no page shows no button', () => {
    expect(render([]).toJSON()).toBeNull();
  });

  test('the button counts the pages and the card lists each one', () => {
    const root = render(SOURCES).root;
    expect(root.findByProps({ testID: 'session-turn-sources' }).props.accessibilityLabel).toBe('sessions.turnSources:2');
    const rows = root.findAll((node) => node.type === 'pressable');
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual(['Page A', 'Page B']);
  });

  test('a row opens its page', () => {
    const rows = render(SOURCES).root.findAll((node) => node.type === 'pressable');
    act(() => (rows[1]!.props.onPress as () => void)());
    expect(opened).toEqual(['https://b.example/y']);
  });
});
