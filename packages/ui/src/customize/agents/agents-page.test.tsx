import { qk } from '@kortix/sdk/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

mock.module('../../internal/lib/use-project-can', () => ({
  useProjectCan: () => ({ allowed: false }),
  useProjectPageCans: () => ({}),
}));
mock.module('../use-configure-thread', () => ({
  useConfigureThread: () => ({ pending: false }),
  newConfigPrompt: () => '',
}));

const { AgentsPage } = await import('./agents-page');

// KRTX-3025: the card shows what the configuration grants, not the agent's prose.
describe('AgentsPage access line', () => {
  test('each grant reads All, None or its count', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(qk.project.detail('synthetic-project'), {
      account_id: 'synthetic-account',
      config: {
        default_agent: 'kortix',
        agents: [
          {
            name: 'kortix',
            path: 'agents/kortix.md',
            mode: 'primary',
            description: 'General knowledge worker.',
            scope: { env: 'all', connectors: 'all', kortix_permissions: 'all', kortix_cli: 'all' },
          },
          {
            name: 'store-builder',
            path: 'agents/store-builder.md',
            mode: 'primary',
            scope: { env: [], connectors: ['notion', 'gmail'], kortix_permissions: 'all', kortix_cli: 'all' },
          },
          {
            name: 'reflector',
            path: 'agents/reflector.md',
            mode: 'primary',
            scope: { env: [], connectors: [], kortix_permissions: 'all', kortix_cli: 'all' },
          },
        ],
      },
    });
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <AgentsPage projectId="synthetic-project" />
      </QueryClientProvider>,
    );
    // One grant vocabulary on every surface: All, None, or a count.
    expect(markup).toContain('title="Connectors: All"');
    expect(markup).toContain('title="Connectors: 2"');
    expect(markup).toContain('title="Secrets: None"');
    expect(markup).toContain('title="Permissions: All"');
    for (const absent of ['Full access', 'all permissions', 'No connectors', 'All Kortix actions', 'Default model']) {
      expect(markup).not.toContain(absent);
    }
  });
});

// KRTX-4810: the list shows each agent's role, so a helper My Kortix created
// reads as a subagent at a glance and a promoted one shows as primary.
describe('AgentsPage role badge', () => {
  const agentWithMode = (name: string, mode?: string) => ({
    name,
    path: `agents/${name}.md`,
    ...(mode ? { mode } : {}),
    description: `${name} does its job.`,
    scope: { env: [], connectors: [], kortix_permissions: [], kortix_cli: [] },
  });

  const render = (agents: ReturnType<typeof agentWithMode>[]) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(qk.project.detail('synthetic-project'), {
      account_id: 'synthetic-account',
      config: { default_agent: 'lead', agents },
    });
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <AgentsPage projectId="synthetic-project" />
      </QueryClientProvider>,
    );
  };

  test('each card names its role: primary, subagent, all', () => {
    const markup = render([
      agentWithMode('lead', 'primary'),
      agentWithMode('helper', 'subagent'),
      agentWithMode('both-ways', 'all'),
    ]);
    expect(markup).toContain('>Primary</span>');
    expect(markup).toContain('>Subagent</span>');
    expect(markup).toContain('>All</span>');
  });

  test('an undeclared mode reads as primary — the runtime\'s own assumption', () => {
    const markup = render([agentWithMode('undeclared')]);
    expect(markup).toContain('>Primary</span>');
    expect(markup).not.toContain('>Subagent</span>');
  });
});
