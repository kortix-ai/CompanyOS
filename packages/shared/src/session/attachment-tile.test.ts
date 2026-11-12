import { describe, expect, test } from 'bun:test';

import { LONG_NAME_THRESHOLD, NAME_TAIL_CHARS, attachmentExtension, isPreviewableImage, splitFilenameForTile } from './attachment-tile';

/** Pins the five tile rules both hosts re-export (KRTX-4772). */
describe('attachmentExtension', () => {
  test('reads the extension from the name, lowercase', () => {
    expect(attachmentExtension('Report.PDF')).toBe('pdf');
  });

  test('falls back to the MIME subtype', () => {
    expect(attachmentExtension('noext', 'image/svg+xml')).toBe('svg');
    expect(attachmentExtension('noext', 'image/x-icon')).toBe('icon');
    expect(attachmentExtension('noext', 'application/vnd.ms-excel')).toBe('ms-excel');
  });

  test('is empty when neither says anything', () => {
    expect(attachmentExtension('noext')).toBe('');
    expect(attachmentExtension('.env')).toBe('');
  });

  test('rejects an "extension" longer than 8 characters', () => {
    expect(attachmentExtension('a.verylongext', 'text/plain')).toBe('plain');
  });
});

describe('isPreviewableImage', () => {
  test('raster image MIME types are previewable', () => {
    expect(isPreviewableImage('a.png', 'image/png')).toBe(true);
    expect(isPreviewableImage('a.jpg', 'image/jpeg')).toBe(true);
  });

  test('SVG is never previewable', () => {
    expect(isPreviewableImage('logo.svg', 'image/svg+xml')).toBe(false);
  });

  test('non-image MIME types are not previewable', () => {
    expect(isPreviewableImage('a.pdf', 'application/pdf')).toBe(false);
    expect(isPreviewableImage('a.png')).toBe(false);
  });
});

describe('splitFilenameForTile', () => {
  test('the thresholds', () => {
    expect(LONG_NAME_THRESHOLD).toBe(24);
    expect(NAME_TAIL_CHARS).toBe(10);
  });

  test('a name of 24 characters or fewer is not split', () => {
    expect(splitFilenameForTile('a'.repeat(24))).toBeNull();
  });

  test('a longer name splits into head and the last 10 characters', () => {
    expect(splitFilenameForTile('design-review-notes-chatux.md')).toEqual({
      head: 'design-review-notes',
      tail: '-chatux.md',
    });
  });
});
