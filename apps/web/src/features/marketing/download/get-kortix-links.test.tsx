import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { GetKortixGrid, MCP_GUIDE_HREF } from '@kortix/ui/internal/apps-and-extensions/get-kortix-grid';

for (const platform of ['macos', 'android'] as const) {
  test(`${platform} visitors reach every installer, computer pairing and the MCP guide`, () => {
    const html = renderToStaticMarkup(<GetKortixGrid platform={platform} />);
    for (const href of ['/download/macos', '/download/windows', '/download/linux', '/settings/computer', MCP_GUIDE_HREF]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('https://apps.apple.com/app/kortix/id6754448524');
    expect(html).toContain('https://play.google.com/store/apps/details?id=com.kortix.application');
    expect(html).toContain('https://chromewebstore.google.com/detail/');
  });
}
