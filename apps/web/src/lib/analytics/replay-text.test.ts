/**
 * Which text a masked session replay may show: our own interface text from
 * the translation catalog, with numbers in its placeholders. Everything else,
 * such as a workspace name, a session title or an agent's message, is hidden.
 */
import { describe, expect, test } from 'bun:test';

import en from '../../../translations/en.json';
import { maskReplayText } from './posthog-config';
import { messageTexts, normalizeUiText, UiTextIndex } from './replay-text';

const CATALOG = {
  providers: {
    title: 'Connect a model',
    available: 'Available',
    metaKey: 'API key',
    models: '{count, plural, one {# model} other {# models}}',
    searchPlaceholder: 'Search {count} providers…',
    inUse: 'In use',
  },
  plans: { badge: '{plan, select, pro {Pro plan} other {Free plan}}' },
  files: { remove: 'Delete {name}?' },
  guide: { intro: 'Read the <link>setup guide</link> first' },
  billing: { amount: '{amount}' },
  broken: { message: 'Unclosed {count' },
};

function index(): UiTextIndex {
  const ui = new UiTextIndex();
  ui.addCatalog(CATALOG, 'en');
  return ui;
}

const show = (ui: UiTextIndex, text: string) => ui.reveal(text, maskReplayText);

describe('normalizeUiText', () => {
  test('spaces collapse and every number becomes #', () => {
    expect(normalizeUiText('  14   models ')).toBe('# models');
    expect(normalizeUiText('1,234.5 credits')).toBe('# credits');
    expect(normalizeUiText('1 234 crédits')).toBe('# crédits');
  });
});

describe('messageTexts', () => {
  test('a placeholder becomes a number; plural and select add every branch', () => {
    expect(messageTexts('{count, plural, one {# model} other {# models}}', 'en')).toEqual([
      '# model',
      '# models',
    ]);
    expect(messageTexts('{plan, select, pro {Pro plan} other {Free plan}}', 'en')).toEqual([
      'Pro plan',
      'Free plan',
    ]);
    expect(messageTexts('Delete {name}?', 'en')).toEqual(['Delete #?']);
  });

  test('a rich-text tag splits the message into the pieces the page renders', () => {
    expect(messageTexts('Read the <link>setup guide</link> first', 'en')).toEqual([
      'Read the',
      'setup guide',
      'first',
    ]);
  });

  test('a message without a letter adds nothing, and a broken message is skipped', () => {
    expect(messageTexts('{amount}', 'en')).toEqual([]);
    expect(messageTexts('Unclosed {count', 'en')).toEqual([]);
  });
});

describe('UiTextIndex', () => {
  test('interface text stays readable, with the numbers it renders', () => {
    const ui = index();
    for (const text of [
      'Connect a model',
      'Available',
      '14 models',
      '1 model',
      'Search 12 providers…',
    ]) {
      expect(show(ui, text)).toBe(text);
    }
    expect(show(ui, 'Pro plan')).toBe('Pro plan');
    expect(show(ui, 'setup guide')).toBe('setup guide');
  });

  test('customer text is hidden, also where a placeholder would stand', () => {
    const ui = index();
    for (const text of ['Zephyrine Quillfeather', 'Delete Marigold-77 roadmap.xlsx?']) {
      expect(show(ui, text)).toBe(maskReplayText(text));
    }
    expect(show(ui, 'Delete 12?')).toBe('Delete 12?');
    expect(show(ui, 'Marigold models')).toBe('******** ******');
  });

  test('a text with no letter is hidden, even when a message is only a placeholder', () => {
    const ui = index();
    expect(show(ui, '1,234')).toBe('*****');
    expect(show(ui, '$ 99')).toBe('* **');
  });

  test('parts joined by our separators are judged one by one', () => {
    const ui = index();
    expect(show(ui, 'API key · 14 models')).toBe('API key · 14 models');
    expect(show(ui, 'Zephyrine · 3 models')).toBe('********* · 3 models');
    expect(show(ui, 'In use · 3')).toBe('In use · *');
    expect(ui.has('API key · 14 models')).toBe(true);
    expect(ui.has('Zephyrine · 3 models')).toBe(false);
  });

  test('a shell pipe or a table row is not split into parts', () => {
    const ui = index();
    const command = 'cat notes.md | Available';
    expect(show(ui, command)).toBe(maskReplayText(command));
  });

  test('provider names are interface text without a catalog', () => {
    const ui = new UiTextIndex();
    expect(show(ui, 'Anthropic')).toBe('Anthropic');
    expect(show(ui, 'OpenRouter')).toBe('OpenRouter');
    expect(show(ui, 'Available')).toBe('*********');
  });

  test('an empty index hides everything', () => {
    const ui = new UiTextIndex([]);
    expect(show(ui, 'Anthropic')).toBe('*********');
    expect(show(ui, '   ')).toBe('   ');
  });

  test('the shipped English catalog covers the provider dialog', () => {
    const ui = new UiTextIndex();
    ui.addCatalog(en, 'en');
    for (const text of ['Available', 'Show more', 'API key · 14 models', 'Settings']) {
      expect(show(ui, text)).toBe(text);
    }
    const canary = 'Zephyrine Quillfeather launch plan';
    expect(show(ui, canary)).toBe(maskReplayText(canary));
  });
});
