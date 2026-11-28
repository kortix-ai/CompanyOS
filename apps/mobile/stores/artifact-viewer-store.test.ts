import { beforeEach, expect, test } from 'bun:test';
import { storage } from './in-memory-async-storage';
import { useArtifactViewerStore as store } from './artifact-viewer-store';

beforeEach(() => {
  storage.clear();
  store.setState({ projectId: null, target: null, userId: null, byUser: {} });
});

test('recreating the project restores only its signed-in user’s open artifact', async () => {
  store.getState().bind('user-a', 'project-a');
  const target = { projectId: 'project-a', artifactId: 'artifact-a', title: 'Synthetic plan' };
  store.getState().open(target);
  const saved = storage.get('kortix.artifactViewer');
  expect(saved).toBeDefined();
  store.setState({ projectId: null, target: null, userId: null, byUser: {} });
  if (!saved) throw new Error('Viewer was not saved');
  storage.set('kortix.artifactViewer', saved);
  await store.persist.rehydrate();
  store.getState().bind('user-a', 'project-a');
  expect(store.getState().target).toEqual(target);
  store.getState().bind('user-b', 'project-a');
  expect(store.getState().target).toBeNull();
});

test('closing and changing projects do not resurrect an artifact', () => {
  store.getState().bind('user-a', 'project-a');
  store.getState().open({ projectId: 'project-a', artifactId: 'artifact-a' });
  store.getState().close();
  store.getState().bind('user-a', 'project-a');
  expect(store.getState().target).toBeNull();
  store.getState().open({ projectId: 'project-a', artifactId: 'artifact-a' });
  store.getState().bind('user-a', 'project-b');
  expect(store.getState().target).toBeNull();
  store.getState().bind('user-a', 'project-a');
  expect(store.getState().target).toBeNull();
});

test('sign-out clears the live and persisted selection', async () => {
  store.getState().bind('user-a', 'project-a');
  store.getState().open({ projectId: 'project-a', artifactId: 'artifact-a' });
  store.getState().reset();
  await store.persist.rehydrate();
  store.getState().bind('user-a', 'project-a');
  expect(store.getState().target).toBeNull();
  expect(store.getState().byUser).toEqual({});
});

test('untrusted storage is rejected and no signed URL is persisted', async () => {
  store.getState().bind('user-a', 'project-a');
  store.getState().open({ projectId: 'project-a', artifactId: 'artifact-a' });
  expect(storage.get('kortix.artifactViewer')).not.toContain('view_url');
  storage.set(
    'kortix.artifactViewer',
    JSON.stringify({ state: { byUser: { 'user-a': { projectId: 42 } } }, version: 0 })
  );
  await store.persist.rehydrate();
  store.getState().bind('user-a', 'project-a');
  expect(store.getState().target).toBeNull();
});
