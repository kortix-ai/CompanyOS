/** Recently verified handle hashes partition rate budgets, never authorization. */
// replica-local: positive hints partition only this replica's limiter; cold replicas keep the anonymous budget until broker verification.
const verified = new Map<string, number>();
const TTL_MS = 10 * 60_000;
const CAPACITY = 10_000;
export function rememberBrowserBudgetHandle(hash: string): void {
  verified.delete(hash);
  if (verified.size >= CAPACITY) verified.delete(verified.keys().next().value!);
  verified.set(hash, Date.now() + TTL_MS);
}
export function browserBudgetHandleKnown(hash: string): boolean {
  const until = verified.get(hash);
  if (until === undefined) return false;
  if (until <= Date.now()) {
    verified.delete(hash);
    return false;
  }
  return true;
}
export function forgetBrowserBudgetHandle(hash: string): void {
  verified.delete(hash);
}
