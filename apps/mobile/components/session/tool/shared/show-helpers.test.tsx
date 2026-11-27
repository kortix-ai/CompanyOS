import { describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockGraph } from '@/lib/testing/mock-graph';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const host = (name: string) => function Host({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) { return React.createElement(name, props, children); };
const openFile = mock((_path: string) => {});
await mockGraph(['components/session/tool/shared/show-helpers.tsx'], ['@tanstack/react-query', '@/lib/session/tools/web-show'], {
  'react-native': { View: host('view'), Image: host('image') },
  '@/components/ui/button': { Button: host('button') },
  '@/components/ui/text': { Text: host('text') },
  '@/components/ui/icon': { Icon: host('icon') },
  'components/session/tool/shared/styles': { useTurnPalette: () => ({ mutedForeground: 'muted' }), TURN_SPACE: { icon: 16 } },
  'components/session/tool/shared/navigation': { useToolNavigation: () => ({ openFile }) },
  '@/lib/files/hooks': { fileKeys: { all: ['files'] } },
  '@/lib/session/user-message': { webSpace: (n: number) => n * 4 },
});
const { ShowFileActions } = await import('./show-helpers');

describe('ShowFileActions caller contract', () => {
  for (const path of ['/workspace/report.md', '/workspace/a folder/日本語 #1.csv']) {
    test(`refresh settles before notification and preview preserves ${path}`, async () => {
      const client = new QueryClient();
      let settle = () => {};
      const invalidation = new Promise<void>((resolve) => { settle = resolve; });
      const invalidate = mock(() => invalidation);
      client.invalidateQueries = invalidate;
      const onRefresh = mock(() => {});
      let tree: ReturnType<typeof create>;
      await act(async () => { tree = create(<QueryClientProvider client={client}><ShowFileActions path={path} onRefresh={onRefresh} /></QueryClientProvider>); });
      const buttons = () => tree.root.findAllByType('button');
      expect(buttons()).toHaveLength(2);
      expect(buttons()[0].props.accessibilityLabel).toBe('Refresh');
      expect(buttons()[1].findByType('text').props.children).toBe('Preview');
      expect(buttons().some((button) => button.props.accessibilityLabel === 'Full screen')).toBe(false);
      await act(async () => { buttons()[0].props.onPress(); });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['files'] });
      expect(buttons()[0].props.disabled).toBe(true);
      expect(onRefresh).not.toHaveBeenCalled();
      await act(async () => { settle(); await invalidation; });
      expect(buttons()[0].props.disabled).toBe(false);
      expect(onRefresh).toHaveBeenCalledTimes(1);
      buttons()[1].props.onPress();
      expect(openFile).toHaveBeenLastCalledWith(path);
      await act(async () => { tree.unmount(); });
      client.clear();
    });
  }
});
