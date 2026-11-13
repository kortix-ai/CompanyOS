import { describe, expect, it } from 'vitest';
import { readWorkflow } from '../src/fixtures/repo';

// rustc 1.100 (2026-11-09) broke the `screenshots` crate (E0277 `!: ReadAll`)
// and failed the Linux deb. Capture CI must install one pinned toolchain.
describe('capture-build.yml pins the Rust toolchain', () => {
  const source = readWorkflow('capture-build.yml');
  const installs = source.match(/rustup toolchain install .*/g) ?? [];
  const defaults = source.match(/rustup default .*/g) ?? [];

  it('declares one exact RUST_TOOLCHAIN version', () => {
    expect(source).toMatch(/^ {2}RUST_TOOLCHAIN: \d+\.\d+\.\d+$/m);
  });

  it('installs and defaults to the pin in every Rust job, never a floating channel', () => {
    expect(installs.length).toBeGreaterThan(0);
    expect(defaults).toHaveLength(installs.length);
    for (const line of installs) expect(line).toMatch(/^rustup toolchain install "\$RUST_TOOLCHAIN" /);
    for (const line of defaults) expect(line).toBe('rustup default "$RUST_TOOLCHAIN"');
    expect(source).not.toMatch(/rustup (toolchain install|default) (stable|beta|nightly)/);
  });
});
