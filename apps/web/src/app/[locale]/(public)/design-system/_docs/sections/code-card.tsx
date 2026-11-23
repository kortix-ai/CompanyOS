'use client';

import { CodeBlock, HighlightedCode, UnifiedMarkdown } from '@kortix/ui/markdown';

import { DocPage, DocSection, Example } from '../doc';

const APP = `import { createKortix } from '@kortix/sdk';

const kortix = createKortix({
  backendUrl: 'https://api.kortix.com',
  getToken: () => process.env.KORTIX_API_KEY,
});

export default function App() {
  return <Workspace client={kortix} />;
}`;

const HOOK = `import { useSession } from '@kortix/sdk/react';
import { useEffect } from 'react';

/**
 * Identify the person behind a session once it is ready, and only once.
 * The hook owns the whole runtime lifecycle; the caller reads its state.
 */
export function useIdentifyUser(projectId: string, sessionId: string, userId: string) {
  const session = useSession(projectId, sessionId);

  useEffect(() => {
    if (session.status !== 'ready') return;
    analytics.identify(userId, {
      project: projectId,
      session: sessionId,
      model: session.model?.id,
    });
  }, [session.status, session.model?.id, projectId, sessionId, userId]);

  return session;
}

/** Group a session's tool calls by tool name, newest first. */
export function groupToolCalls(calls: ToolCall[]): Map<string, ToolCall[]> {
  const groups = new Map<string, ToolCall[]>();
  for (const call of [...calls].sort((a, b) => b.startedAt - a.startedAt)) {
    const list = groups.get(call.tool) ?? [];
    list.push(call);
    groups.set(call.tool, list);
  }
  return groups;
}

/** The share of calls that failed, per tool, as a whole percentage. */
export function failureRates(groups: Map<string, ToolCall[]>): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const [tool, calls] of groups) {
    const failed = calls.filter((call) => call.status === 'error').length;
    rates[tool] = Math.round((failed / calls.length) * 100);
  }
  return rates;
}`;

const LANGUAGES = [
  ['bash', 'pnpm add @kortix/sdk\nkortix login'],
  ['json', '{\n  "name": "weekly-digest",\n  "schedule": "0 9 * * 1"\n}'],
  ['python', 'from kortix import Kortix\n\nclient = Kortix(api_key="…")\nprint(client.projects.list())'],
] as const;

const MARKDOWN = "Install the SDK, then sign in:\n\n```bash\npnpm add @kortix/sdk\nkortix login\n```\n\nThe agent's answers render code the same way.";

/** One code block, as UnifiedMarkdown renders a fenced block in chat. */
function Block({ code, language }: { code: string; language: string }) {
  return (
    <CodeBlock code={code} language={language} className="my-0">
      <HighlightedCode code={code} language={language} />
    </CodeBlock>
  );
}

export default function CodeCardPage() {
  return (
    <DocPage
      title="Code Card"
      lead="The one code block: a language label and a copy button over the highlighted body. It is the block UnifiedMarkdown renders for a fenced code block in chat, files and docs, so a sample anywhere looks like the agent's answer."
    >
      <DocSection title="Default">
        <Example
          previewClassName="block p-4"
          code={`import { CodeBlock, HighlightedCode } from '@kortix/ui/markdown';

<CodeBlock code={source} language="tsx">
  <HighlightedCode code={source} language="tsx" />
</CodeBlock>`}
        >
          <Block code={APP} language="tsx" />
        </Example>
      </DocSection>

      <DocSection title="Languages" description="The label is the language, lowercase. The palette is the same for every grammar.">
        <Example
          previewClassName="flex-col items-stretch gap-3 p-4"
          code={LANGUAGES.map(([l]) => `<CodeBlock code={source} language="${l}">…</CodeBlock>`).join('\n')}
        >
          {LANGUAGES.map(([language, code]) => (
            <Block key={language} code={code} language={language} />
          ))}
        </Example>
      </DocSection>

      <DocSection title="Long code" description="The body stops at 520px and scrolls; the label and the copy button stay put. While a message streams, it follows the newest line.">
        <Example previewClassName="block p-4" code={`<CodeBlock code={longSource} language="ts" isStreaming={streaming}>…</CodeBlock>`}>
          <Block code={HOOK} language="ts" />
        </Example>
      </DocSection>

      <DocSection title="In markdown" description="A fenced block in any UnifiedMarkdown content renders this card. Nothing to wire.">
        <Example previewClassName="block p-4" code={`<UnifiedMarkdown trust="agent" content={markdown} />`}>
          <UnifiedMarkdown trust="agent" content={MARKDOWN} />
        </Example>
      </DocSection>
    </DocPage>
  );
}
