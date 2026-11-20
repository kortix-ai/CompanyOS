import type { TokenCounts } from '../domain/usage';

export interface ClaudeUsage extends TokenCounts {
  model: string | null;
  complete: boolean;
}

/** Observe bounded usage metadata while preserving response bytes and backpressure. */
export function observeClaudeUsage(response: Response, record: (usage: ClaudeUsage) => void): Response {
  if (!response.body) return response;
  const streaming = response.headers.get('content-type')?.includes('text/event-stream');
  const decoder = new TextDecoder();
  let carry = '';
  let oversizedJson = false;
  let input = 0;
  let output = 0;
  let read = 0;
  let write = 0;
  let seen = false;
  let complete = false;
  let valid = true;
  let model: string | null = null;
  const count = (value: unknown) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
    valid = false;
    return 0;
  };
  const consume = (text: string) => {
    try {
      const event: unknown = JSON.parse(text);
      if (!event || typeof event !== 'object') return;
      if (!('type' in event) && streaming) return;
      const message = 'type' in event && event.type === 'message_start' && 'message' in event ? event.message : event;
      if (!message || typeof message !== 'object') return;
      if ('model' in message && typeof message.model === 'string') model = message.model;
      const usage = 'usage' in message ? message.usage : null;
      if (usage && typeof usage === 'object') {
        seen = true;
        input = Math.max(input, count('input_tokens' in usage ? usage.input_tokens : null));
        output = Math.max(output, count('output_tokens' in usage ? usage.output_tokens : null));
        read = Math.max(read, count('cache_read_input_tokens' in usage ? usage.cache_read_input_tokens : null));
        write = Math.max(write, count('cache_creation_input_tokens' in usage ? usage.cache_creation_input_tokens : null));
      }
      if (('type' in event && event.type === 'message_stop') || !streaming) complete = true;
    } catch { /* Non-JSON and oversized frames carry no usable usage. */ }
  };
  const push = (text: string) => {
    carry += text;
    if (streaming) {
      let newline: number;
      while ((newline = carry.indexOf('\n')) >= 0) {
        const line = carry.slice(0, newline);
        carry = carry.slice(newline + 1);
        if (line.startsWith('data:')) consume(line.slice(5).trim());
      }
    }
    // Never retain generated content or an unbounded unterminated frame.
    if (carry.length > 1024 * 1024) { carry = ''; oversizedJson = true; }
  };
  const finish = () => {
    push(decoder.decode());
    if (streaming) { if (carry.startsWith('data:')) consume(carry.slice(5).trim()); }
    else if (!oversizedJson) consume(carry);
    if (seen) record({ model, promptTokens: input + read + write, completionTokens: output, cachedTokens: read, cacheWriteTokens: write, complete: complete && valid });
  };
  const reader = response.body.getReader();
  let finished = false;
  const once = () => { if (!finished) { finished = true; finish(); } };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) { once(); controller.close(); return; }
        push(decoder.decode(next.value, { stream: true }));
        controller.enqueue(next.value);
      } catch (error) { once(); controller.error(error); }
    },
    async cancel(reason) { once(); await reader.cancel(reason); },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
