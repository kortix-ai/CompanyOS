import { expect, mock, test } from 'bun:test';

const realQuery = await import('@tanstack/react-query');
mock.module('@tanstack/react-query', () => ({ ...realQuery, useQuery: (config: unknown) => config }));
const { useArtifacts } = await import('./use-artifacts');

test('root filters preserve previews while folder navigation never exposes previous cards', () => {
  const cards = [{ artifact_id: 'a1' }];
  const placeholder = (next: string | undefined, previous: string | undefined) => {
    const query = useArtifacts('p1', { folder_id: next }) as unknown as {
      placeholderData: (data: unknown, query: unknown) => unknown;
    };
    return query.placeholderData(cards, { queryKey: ['artifacts', JSON.stringify({ folder_id: previous })] });
  };
  expect(placeholder(undefined, 'root')).toBe(cards);
  expect(placeholder('root', undefined)).toBe(cards);
  expect(placeholder('folder-a', 'folder-a')).toBe(cards);
  expect(placeholder('folder-a', 'folder-b')).toBeUndefined();
  expect(placeholder('folder-a', 'root')).toBeUndefined();
  expect(placeholder('root', 'folder-a')).toBeUndefined();
});
