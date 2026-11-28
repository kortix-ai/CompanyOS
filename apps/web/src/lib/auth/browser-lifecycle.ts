/** One document's validation fence. Failed validation never publishes cached private state. */
export function createBrowserLifecycle<T>(options: {
  validate(): Promise<T>;
  clear(): void;
  publish(value: T): void;
  error(error: unknown): void;
}) {
  let generation = 0;
  let visible = false;
  let running = false;
  let queued = false;
  let queuedHide = false;
  let stopped = false;
  const revoke = () => {
    stopped = true;
    generation++;
    visible = false;
    options.clear();
  };
  const revalidate = (hide = true) => {
    if (stopped) return;
    generation++;
    if (hide) {
      visible = false;
      options.clear();
    }
    if (running) {
      queued = true;
      queuedHide ||= hide;
      return;
    }
    running = true;
    queued = false;
    const version = generation;
    void options
      .validate()
      .then((value) => {
        if (!stopped && generation === version) {
          visible = true;
          options.publish(value);
        }
      })
      .catch((error) => {
        if (stopped || (generation !== version && queued)) return;
        const status = (error as { status?: number })?.status;
        const rejected = status === 401 || status === 403 || status === 404;
        if (!hide && visible && !rejected) return;
        visible = false;
        options.clear();
        if (rejected) revoke();
        if (!stopped || rejected) options.error(error);
      })
      .finally(() => {
        running = false;
        if (queued && !stopped) {
          const hideNext = queuedHide;
          queuedHide = false;
          revalidate(hideNext);
        }
      });
  };
  return {
    revalidate,
    revoke,
    dispose() {
      stopped = true;
      generation++;
    },
  };
}
