import { afterEach, expect, mock, test } from 'bun:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ApiError } from '@kortix/sdk';
import { useArtifactViewerStore as store } from '@/stores/artifact-viewer-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
interface Props {
  children?: React.ReactNode;
  [key: string]: unknown;
}
const host =
  (name: string) =>
  ({ children, ...props }: Props) =>
    React.createElement(name, props, children);
const none = () => null;
let url = 'https://api.example.test/v1/artifacts/s/first/';
let error: ApiError | null = null;
let mounts = 0;
const refetch = async () => ({ isError: false, data: { version: { view_url: url } } });
mock.module('react-native', () => ({
  View: host('view'),
  Platform: { OS: 'ios' },
  BackHandler: {},
}));
mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-a' } }),
}));
mock.module('@kortix/sdk/react', () => ({
  useArtifact: () => ({
    data: { artifact_id: 'artifact-a', title: 'Synthetic plan', version: { view_url: url } },
    isError: !!error,
    error,
    refetch,
  }),
}));
mock.module('@/components/artifacts/ArtifactActionsSheet', () => ({ ArtifactActionsSheet: none }));
mock.module('@/components/artifacts/ArtifactWebView', () => ({
  ArtifactWebView: (props: Props) => {
    React.useEffect(() => {
      mounts++;
    }, []);
    return React.createElement('article', { ...props, 'data-artifact-page': true });
  },
}));
mock.module('@/components/kortix/sheet', () => ({
  KortixBottomSheetModal: React.forwardRef<unknown, { children?: React.ReactNode }>(({ children }, ref) => {
    React.useImperativeHandle(ref, () => ({ present: none, dismiss: none }));
    return React.createElement('sheet', {}, children);
  }),
}));
mock.module('@/components/kortix/header-button', () => ({ HEADER_ICON_SIZE: 20 }));
mock.module('@/components/kortix/kortix-loader', () => ({ KortixLoader: none }));
mock.module('@/components/ui/button', () => ({ Button: host('button') }));
mock.module('@/components/ui/icon', () => ({ Icon: none }));
mock.module('@/components/ui/text', () => ({ Text: host('text') }));
mock.module('@/lib/icons', () => ({ DotsThreeIcon: none }));
mock.module('@/lib/haptics', () => ({ haptics: { tap: none } }));
mock.module('@/lib/utils/tone', () => ({ useTone: () => 'light' }));
mock.module('@/lib/utils/theme', () => ({ THEME: { light: { background: 'white' } } }));
const { ArtifactViewerSheet } = await import('./ArtifactViewerSheet');
let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  store.setState({ projectId: null, target: null, userId: null, byUser: {} });
  error = null;
});
const screen = () => <ArtifactViewerSheet projectId="project-a" onNewChat={none} />;

test('foreground metadata refresh keeps the loaded page and its local state', async () => {
  mounts = 0;
  store.setState({ userId: 'user-a' });
  store.getState().setProjectId('project-a');
  store.getState().open({ projectId: 'project-a', artifactId: 'artifact-a' });
  await act(async () => {
    tree = create(screen());
  });
  const first = tree?.root.findByProps({ 'data-artifact-page': true }).props.viewUrl;
  url = 'https://api.example.test/v1/artifacts/s/rotated/';
  await act(async () => tree?.update(screen()));
  expect(tree?.root.findByProps({ 'data-artifact-page': true }).props.viewUrl).toBe(first);
  expect(mounts).toBe(1);
  // An actual expired page may request a fresh URL, without a foreground reload.
  await act(async () =>
    tree?.root.findByProps({ 'data-artifact-page': true }).props.onHttpError(403)
  );
  expect(tree?.root.findByProps({ 'data-artifact-page': true }).props.viewUrl).toBe(url);
});

test('a gone artifact never keeps showing cached content', async () => {
  store.setState({ userId: 'user-a' });
  store.getState().setProjectId('project-a');
  store.getState().open({ projectId: 'project-a', artifactId: 'artifact-a' });
  await act(async () => {
    tree = create(screen());
  });
  error = new ApiError('Gone', { status: 404 });
  await act(async () => tree?.update(screen()));
  expect(tree?.root.findAllByProps({ 'data-artifact-page': true })).toHaveLength(0);
  expect(JSON.stringify(tree?.toJSON())).toContain('artifacts.notFoundTitle');
});
