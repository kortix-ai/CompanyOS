import { describe, expect, mock, test } from 'bun:test';

// Under bun test there is no react-server bundler condition, so the
// `server-only` guard package would throw on the metadata module's
// next-intl/server import. Neutralize it; the metadata logic stays real.
mock.module('server-only', () => ({}));

// `requestLocale()` reads the request scope (`getLocale` from
// next-intl/server), which does not exist under bun test. Pin it to `en`, the
// default prerendered locale, so each layout module resolves its real SEO
// record against the real English catalog.
const nextIntlServer = await import('next-intl/server');
mock.module('next-intl/server', () => ({ ...nextIntlServer, getLocale: async () => 'en' }));

// bun hoists static imports above the mocks, so every layout module loads
// dynamically, after the mocks registered. Ten routes host their metadata in
// the page itself (their pass-through layout was deleted); the rest re-export
// from a layout.
const modules: Record<string, { generateMetadata: () => Promise<Record<string, unknown>> }> = {};
for (const [name, path] of Object.entries({
  home: '@/app/[locale]/(public)/(marketing)/(home)/page',
  'case-studies': '@/app/[locale]/(public)/(marketing)/case-studies/layout',
  compliance: '@/app/[locale]/(public)/(marketing)/compliance/page',
  contact: '@/app/[locale]/(public)/(marketing)/contact/layout',
  developers: '@/app/[locale]/(public)/(marketing)/developers/page',
  enterprise: '@/app/[locale]/(public)/(marketing)/enterprise/page',
  framework: '@/app/[locale]/(public)/(marketing)/framework/page',
  mobile: '@/app/[locale]/(public)/(marketing)/mobile/page',
  multiplayer: '@/app/[locale]/(public)/(marketing)/multiplayer/page',
  pricing: '@/app/[locale]/(public)/(marketing)/pricing/layout',
  security: '@/app/[locale]/(public)/(marketing)/security/page',
  'self-hosted': '@/app/[locale]/(public)/(marketing)/self-hosted/page',
  slack: '@/app/[locale]/(public)/(marketing)/slack/page',
  sovereign: '@/app/[locale]/(public)/(marketing)/sovereign/page',
  teams: '@/app/[locale]/(public)/(marketing)/teams/page',
  'white-label': '@/app/[locale]/(public)/(marketing)/white-label/page',
  services: '@/app/[locale]/(public)/(sales)/services/layout',
  legal: '@/app/[locale]/(public)/(seo)/legal/layout',
  download: '@/app/[locale]/(public)/download/page',
}) as [string, string][]) {
  modules[name] = (await import(path)) as never;
}

describe('public marketing layouts resolve their route metadata', () => {
  for (const [name, mod] of Object.entries(modules)) {
    test(`${name} resolves its canonical URL, title and hreflang set`, async () => {
      const metadata = await mod.generateMetadata();
      expect(metadata).toMatchSnapshot();
      const canonical = (metadata.alternates as { canonical?: unknown } | undefined)?.canonical;
      expect(String(canonical)).toMatch(/^https:\/\/kortix\.com(\/[a-z-]+)?/);
      const title = (metadata.title as { absolute?: string } | undefined)?.absolute ?? metadata.title;
      expect(title).toBeTruthy();
    });
  }
});
