/**
 * Ask AI in the artifact `···` sheet (KRTX-5255): the row shows only where the
 * caller can start a chat, and its press hands THIS artifact to the caller
 * once the sheet has closed (never two sheets at once). The sheet engine is a
 * stub; the close-then slot (`useCloseThen`) is the real one.
 */
import { afterEach, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useCloseThen } from '@/components/kortix/use-close-then';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const source = readFileSync(import.meta.dir + '/ArtifactActionsSheet.tsx', 'utf8');
const Empty = () => null;
const Pass = ({ children }: any) => children ?? null;
let rows: Array<{ label: string; onPress: () => void }> = [];
let dismissed = 0;

const SheetStub = React.forwardRef(({ children, onDismiss }: any, ref) => {
  React.useImperativeHandle(ref, () => ({
    present() {},
    dismiss() {
      dismissed++;
      onDismiss?.();
    },
    snapToIndex() {},
    snapToPosition() {},
  }));
  return children ?? null;
});

const moduleMocks: Record<string, Record<string, any>> = {
  'react-native': { View: Pass, Platform: { OS: 'ios' }, BackHandler: {}, Keyboard: { dismiss() {} }, Share: {} },
  'react-native-reanimated': { default: { View: Pass } },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
  'react-i18next': { useTranslation: () => ({ t: (key: string) => key }) },
  '@kortix/sdk/react': {
    useArtifactFolders: () => ({ data: [] }),
    useArtifactMutations: () => ({ pin: {}, update: {}, remove: {} }),
  },
  '@/components/kortix/sheet-parts': { SheetScrollView: Pass },
  '@/components/kortix/sheet': { KortixBottomSheetModal: SheetStub, useCloseThen },
  '@/components/kortix/confirm-dialog': { useConfirmDialog: () => ({ confirm() {}, dialog: null }) },
  '@/components/kortix/settings-list': {
    SettingsGroup: Pass,
    SettingsRow: (props: any) => {
      rows.push(props);
      return null;
    },
  },
  '@/components/kortix/toast-provider': { useToast: () => ({ error() {}, success() {} }) },
  '@/lib/haptics': { haptics: { tap() {}, medium() {}, warning() {}, success() {} } },
};

// Type-only imports are erased; every other import is a stub unless named above.
for (const [, name] of source.matchAll(/^import (?!type )[^;]*?from ['"]([^'"]+)['"]/gms)) {
  if (name === 'react') continue;
  const values = { ...(moduleMocks[name] ?? {}) };
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [, names] of source.matchAll(new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${escaped}['"]`, 'gs'))) {
    for (const item of names.split(',')) {
      const key = item.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0];
      if (key && !(key in values)) values[key] = Empty;
    }
  }
  mock.module(name, () => ({ default: Empty, ...values }));
}

let ArtifactActionsSheet: typeof import('./ArtifactActionsSheet').ArtifactActionsSheet;
let tree: ReactTestRenderer | undefined;
const ARTIFACT = { artifact_id: 'artifact-1', title: 'Q3 plan', pinned: false, can_manage: false } as any;

beforeAll(async () => {
  ({ ArtifactActionsSheet } = await import('./ArtifactActionsSheet'));
});
beforeEach(() => {
  rows = [];
  dismissed = 0;
});
afterEach(async () => {
  if (tree) await act(async () => tree?.unmount());
  tree = undefined;
});

async function present(onAskAi?: (artifact: unknown) => void) {
  const ref = React.createRef<any>();
  await act(async () => {
    tree = create(<ArtifactActionsSheet ref={ref} projectId="project-1" onAskAi={onAskAi} />);
  });
  rows = [];
  await act(async () => ref.current.present(ARTIFACT));
}

const askAiRow = () => rows.findLast((row) => row.label === 'artifacts.askAgent');

test('Ask AI hands this artifact to the caller after the sheet closes', async () => {
  const asked: unknown[] = [];
  await present((artifact) => asked.push({ artifact, dismissedBefore: dismissed }));
  const row = askAiRow();
  expect(row).toBeDefined();
  await act(async () => row!.onPress());
  expect(asked).toEqual([{ artifact: ARTIFACT, dismissedBefore: 1 }]);
});

test('no Ask AI row where the caller cannot start a chat', async () => {
  await present();
  expect(rows.length).toBeGreaterThan(0);
  expect(askAiRow()).toBeUndefined();
});
