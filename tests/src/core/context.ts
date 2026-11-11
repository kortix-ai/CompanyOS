/**
 * Async-local recorder so the HTTP client can attribute every request +
 * assertion to the currently-running step without manual wiring.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Assertion, Captured } from "./result";

export interface StepRecorder {
  pushRequest(c: Captured): void;
  pushAssertion(a: Assertion): void;
}

const als = new AsyncLocalStorage<StepRecorder>();

export function withRecorder<T>(rec: StepRecorder, fn: () => Promise<T>): Promise<T> {
  return als.run(rec, fn);
}

export function currentRecorder(): StepRecorder | undefined {
  return als.getStore();
}

/**
 * The `x-kortix-test-case` id of the code running now: `<runId>/<flowId>/<attempt>/<step>`.
 * Set by the runner around the flow body (step 0) and around each step, so
 * every request a flow or its fixtures send names the case it belongs to.
 */
const caseStorage = new AsyncLocalStorage<string>();

export function withTestCase<T>(caseId: string, fn: () => Promise<T>): Promise<T> {
  return caseStorage.run(caseId, fn);
}

export function currentTestCase(): string | undefined {
  return caseStorage.getStore();
}
