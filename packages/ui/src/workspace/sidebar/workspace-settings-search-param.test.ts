import { describe, expect, test } from 'bun:test';

import { withSettingsQuery } from './workspace-settings-sidebar-nav';

describe('withSettingsQuery', () => {
  test('adds the query to a plain path', () => {
    expect(withSettingsQuery('/workspaces/w1/settings/general', 'en')).toBe(
      '/workspaces/w1/settings/general?settings_q=en',
    );
  });

  test('keeps the existing params and the hash', () => {
    expect(withSettingsQuery('/s/security?tab=keys#rules', 'key')).toBe(
      '/s/security?tab=keys&settings_q=key#rules',
    );
  });

  test('replaces an older query', () => {
    expect(withSettingsQuery('/s/general?settings_q=old', 'new')).toBe('/s/general?settings_q=new');
  });

  test('an empty query removes the param and leaves no bare "?"', () => {
    expect(withSettingsQuery('/s/general?settings_q=en', '')).toBe('/s/general');
    expect(withSettingsQuery('/s/general?tab=a&settings_q=en', '  ')).toBe('/s/general?tab=a');
  });
});
