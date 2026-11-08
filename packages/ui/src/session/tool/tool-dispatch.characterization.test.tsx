import './tools/register';
import { ToolPartRenderer } from './tool-part-renderer';
import { ToolRegistry } from './shared/registry';
import type { ToolPart } from '../../internal/session-types';
import { toolCallBlock } from '@kortix/sdk';
import { describe, expect, test } from 'bun:test';
import { IntlTestProvider } from '../../test-utils/intl';
import { renderToStaticMarkup } from 'react-dom/server';

/** The text of rendered markup: tags removed until none remain (one pass can leave a tag behind). */
function textOf(html: string): string {
  let text = html;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);
  return text;
}

const part = (tool: string) => ({
  type: 'tool', tool, callID: 'characterization',
  state: { status: 'completed', input: { command: 'echo dispatch' }, output: 'dispatch-result', metadata: {} },
}) as unknown as ToolPart;

function render(tool: string) {
  return renderToStaticMarkup(
    <IntlTestProvider locale="en" onError={() => {}}>
      <ToolPartRenderer call={toolCallBlock(part(tool))} sessionId="child" defaultOpen />
    </IntlTestProvider>,
  );
}

describe('tool registry dispatch', () => {
  test('registered bash tool renders its command', () => {
    expect(ToolRegistry.get('bash')).toBeDefined();
    // Text only: once Shiki has loaded in this process (another file highlighted code), the
    // command renders as token spans.
    expect(textOf(render('bash'))).toContain('echo dispatch');
  });

  test('unknown tool renders the generic fallback', () => {
    expect(ToolRegistry.get('unregistered/characterization')).toBeUndefined();
    expect(render('unregistered/characterization')).toContain('Characterization');
  });
});
