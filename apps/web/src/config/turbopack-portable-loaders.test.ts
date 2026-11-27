import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { relativizeTurbopackLoaders } from './turbopack-portable-loaders';

const DIR = '/work/suna-a/apps/web';

describe('relativizeTurbopackLoaders', () => {
  test('makes loader paths and path options inside the app relative', () => {
    const out = relativizeTurbopackLoaders(
      {
        reactStrictMode: true,
        turbopack: {
          resolveAlias: { canvas: { browser: './src/lib/empty-module.ts' } },
          rules: {
            '*.es.js': { condition: { all: ['browser'] }, loaders: [{ loader: `${DIR}/scripts/phosphor-weights-loader.cjs`, options: { weights: ['regular'] } }] },
            '*.{md,mdx}': {
              loaders: [{ loader: 'fumadocs-mdx/webpack/mdx', options: { type: 'turbopack', configPath: `${DIR}/source.config.ts`, outDir: `${DIR}/.source`, compiledConfigPath: `${DIR}/.source/source.config.mjs`, isDev: true } }],
              as: '*.js',
            },
          },
        },
      },
      DIR,
    );
    expect(out).toEqual({
      reactStrictMode: true,
      turbopack: {
        resolveAlias: { canvas: { browser: './src/lib/empty-module.ts' } },
        rules: {
          '*.es.js': { condition: { all: ['browser'] }, loaders: [{ loader: './scripts/phosphor-weights-loader.cjs', options: { weights: ['regular'] } }] },
          '*.{md,mdx}': {
            loaders: [{ loader: 'fumadocs-mdx/webpack/mdx', options: { type: 'turbopack', configPath: './source.config.ts', outDir: './.source', compiledConfigPath: './.source/source.config.mjs', isDev: true } }],
            as: '*.js',
          },
        },
      },
    });
  });

  test('leaves paths outside the app, string loaders, rule arrays and a config without rules alone', () => {
    const outside = { loader: '/work/suna-a/node_modules/x/loader.js', options: { root: '/work/suna-a', dir: DIR } };
    const out = relativizeTurbopackLoaders({ turbopack: { rules: { '*.svg': ['@svgr/webpack'], '*.x': [{ loaders: [outside, 'raw-loader'] }] } } }, DIR);
    expect(out).toEqual({ turbopack: { rules: { '*.svg': ['@svgr/webpack'], '*.x': [{ loaders: [outside, 'raw-loader'] }] } } });
    const bare = { reactStrictMode: true };
    expect(relativizeTurbopackLoaders(bare, DIR)).toBe(bare);
  });

  test('does not change the config it was given', () => {
    const input = { turbopack: { rules: { '*.js': { loaders: [{ loader: `${DIR}/l.cjs` }] } } } };
    relativizeTurbopackLoaders(input, DIR);
    expect(input.turbopack.rules['*.js'].loaders[0].loader).toBe(`${DIR}/l.cjs`);
  });

  test('next.config.ts applies it to the composed config', () => {
    const nextConfig = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8');
    expect(nextConfig).toMatch(/relativizeTurbopackLoaders\(withMDX\(/);
  });
});
