import { AsyncLocalStorage } from "node:async_hooks";
export type ProviderFailureClass = "transient" | "rate_limit" | "credentials" | "quota";
type FailureObserver = (kind: ProviderFailureClass) => unknown | Promise<unknown>;
const observers = new AsyncLocalStorage<{ notify: FailureObserver; observed: WeakSet<object> }>();
/** Typed upstream errors only; never mistake user authentication for API credentials.
 * This circuit-breaker signal does not authorize repeating an ambiguous operation. */
export function classifyProviderFailure(error: unknown): ProviderFailureClass | undefined {
  const e = error as { name?: string; status?: number; cause?: unknown } | null;
  if (e?.name !== "ProviderRequestError") return e?.cause ? classifyProviderFailure(e.cause) : undefined;
  if (e.status === 401 || e.status === 403) return "credentials";
  if (e.status === 402) return "quota";
  if (e.status === 429) return "rate_limit";
  if (e.status === undefined || (e.status >= 500 && e.status <= 599)) return "transient";
  return undefined;
}
export async function observeProviderFailure(error: unknown): Promise<void> {
  const kind = classifyProviderFailure(error);
  const observer = observers.getStore();
  if (!kind || !observer) return;
  if (typeof error === "object" && error !== null) {
    if (observer.observed.has(error)) return;
    observer.observed.add(error);
  }
  try { await observer.notify(kind); }
  catch {
    // The observer owns readiness/pending persistence. Its outage must never
    // replace the provider error or skip marking the operation uncertain.
  }
}
export function withProviderFailureObserver<T>(observer: FailureObserver, work: () => Promise<T>): Promise<T> {
  return observers.run({ notify: observer, observed: new WeakSet() }, work);
}
