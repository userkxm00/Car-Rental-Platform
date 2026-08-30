import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextState {
  requestId: string;
  startedAt: number;
}

/**
 * Per-request async context (Node AsyncLocalStorage).
 *
 * The correlation middleware runs every request inside this store; logging
 * and error handling read the active request ID without threading parameters
 * through the call stack. Provider-neutral and dependency-free.
 */
const store = new AsyncLocalStorage<RequestContextState>();

export function runWithRequestContext<T>(state: RequestContextState, fn: () => T): T {
  return store.run(state, fn);
}

export function currentRequestContext(): RequestContextState | undefined {
  return store.getStore();
}

export function currentRequestId(): string | undefined {
  return store.getStore()?.requestId;
}
