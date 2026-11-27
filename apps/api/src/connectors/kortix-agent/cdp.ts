/**
 * A minimal Chrome DevTools Protocol client over one WebSocket: commands with
 * ids and timeouts, flat sessions (`Target.attachToTarget {flatten:true}`),
 * and event listeners. Enough to drive a Platinum Browser from the API without
 * Playwright.
 */

export const CDP_CALL_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 15_000;

export class CdpError extends Error {
  constructor(
    readonly method: string,
    message: string,
  ) {
    super(`${method}: ${message}`);
    this.name = 'CdpError';
  }
}

export class CdpClosedError extends Error {
  constructor() {
    super('the browser connection closed');
    this.name = 'CdpClosedError';
  }
}

export interface CdpEvent {
  method: string;
  params: Record<string, unknown>;
  sessionId?: string;
}

interface Pending {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(event: CdpEvent) => void>();
  closed = false;

  private constructor(private readonly ws: WebSocket) {
    ws.onmessage = (message) => this.receive(String(message.data));
    ws.onclose = () => this.fail();
    ws.onerror = () => this.fail();
  }

  static open(url: string): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('the browser did not accept the connection in 15 s'));
      }, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve(new CdpConnection(ws));
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('the browser refused the connection'));
      };
    });
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    options: { sessionId?: string; timeoutMs?: number } = {},
  ): Promise<T> {
    if (this.closed) return Promise.reject(new CdpClosedError());
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CdpError(method, `no answer in ${Math.round((options.timeoutMs ?? CDP_CALL_TIMEOUT_MS) / 1000)} s`));
      }, options.timeoutMs ?? CDP_CALL_TIMEOUT_MS);
      this.pending.set(id, { method, resolve: resolve as (value: unknown) => void, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params, ...(options.sessionId ? { sessionId: options.sessionId } : {}) }));
    });
  }

  on(listener: (event: CdpEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.ws.close();
    this.fail();
  }

  private receive(text: string): void {
    let message: { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: Record<string, unknown>; sessionId?: string };
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new CdpError(pending.method, message.error.message ?? 'failed'));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (message.method) {
      const event: CdpEvent = { method: message.method, params: message.params ?? {}, ...(message.sessionId ? { sessionId: message.sessionId } : {}) };
      for (const listener of this.listeners) listener(event);
    }
  }

  private fail(): void {
    this.closed = true;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new CdpClosedError());
      this.pending.delete(id);
    }
  }
}
