/** One document's validation fence. Failed validation never publishes cached private state. */
export function createBrowserLifecycle<T>(options: {
  validate(): Promise<T>;
  clear(): void;
  publish(value: T): void;
  error(error: unknown): void;
}) {
  let generation = 0;
  let running = false;
  let queued = false;
  let stopped = false;
  const revoke = () => {
    stopped = true;
    generation++;
    options.clear();
  };
  const revalidate = (hide = true) => {
    if (stopped) return;
    generation++;
    if (hide) options.clear();
    if (running) { queued = true; return; }
    running = true;
    queued = false;
    const version = generation;
    void options.validate().then(value => {
      if (!stopped && generation === version) options.publish(value);
    }).catch(error => {
      // The SDK emits invalidation while rejecting a failed acquisition. Do not
      // recursively acquire again in response to that same failure.
      queued = false;
      options.clear();
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 404) revoke();
      if (!stopped || status === 401 || status === 404) options.error(error);
    }).finally(() => {
      running = false;
      if (queued && !stopped) revalidate();
    });
  };
  return { revalidate, revoke, dispose() { stopped = true; generation++; } };
}
