/**
 * Flows are black-box: they reach the product through HTTP and real CLI
 * processes only (tests/README.md, "Product flows"). A flow that imports
 * `apps/` code, or a package's `src/` internals, tests the code it imports
 * instead of the deployed contract, and breaks on a refactor with no bug.
 *
 * Allowed: Node built-ins, `pg`, the runner (`../core/*`, `../fixtures/*`),
 * sibling flow helpers (`./*`), the wire contract `@kortix/api-contract`
 * (and its subpaths), and the explicit exceptions below, each with its reason.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const FLOWS_DIR = resolve(import.meta.dirname, '../src/flows');

/** `specifier` → the flow file allowed to import it, and why. Add an entry only with a reason. */
const EXCEPTIONS: Record<string, { file: string; reason: string }> = {
  '../../../packages/shared/src/my-kortix-agent': {
    file: 'projects.flow.ts',
    // The rule "which agent names are My Kortix" is a pure function the API and
    // the clients share; PROJ flows assert the API applies that exact rule.
    reason: 'shared pure naming rule, no runtime behavior',
  },
  '../../../packages/agent-tunnel/src/agent': {
    file: 'tunnel-integrity.flow.ts',
    // The flow plays the desktop side of the tunnel: it runs the real agent
    // against the API, as the desktop app does. The package publishes no
    // entry for the agent class yet.
    reason: 'the flow runs the real tunnel agent as the client process',
  },
};

function allowed(specifier: string): boolean {
  if (specifier.startsWith('node:') || specifier === 'pg') return true;
  if (/^\.\.\/(core|fixtures)\//.test(specifier) || specifier.startsWith('./')) return true;
  return specifier === '@kortix/api-contract' || specifier.startsWith('@kortix/api-contract/');
}

function importsOf(file: string): string[] {
  const text = readFileSync(join(FLOWS_DIR, file), 'utf8');
  return ts.preProcessFile(text, true, true).importedFiles.map((i) => i.fileName);
}

describe('flow import boundary', () => {
  const files = readdirSync(FLOWS_DIR).filter((f) => f.endsWith('.ts'));

  it('reads the flows', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('imports no apps/ code and no package src/ internals outside the exceptions', () => {
    const violations: string[] = [];
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        if (allowed(specifier)) continue;
        if (EXCEPTIONS[specifier]?.file === file) continue;
        violations.push(`${file}: ${specifier}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps every exception in use, so the list cannot rot', () => {
    for (const [specifier, { file }] of Object.entries(EXCEPTIONS)) {
      expect(importsOf(file), `${file} no longer imports ${specifier}: delete the exception`).toContain(specifier);
    }
  });

  it('flags an apps/ import and a package src/ import', () => {
    // The classifier itself: a temporary violation must be caught.
    for (const bad of ['../../../apps/api/src/app', '@kortix/sdk/src/index', '../../../packages/db/src/schema', 'lodash-es']) {
      expect(allowed(bad)).toBe(false);
    }
  });
});
