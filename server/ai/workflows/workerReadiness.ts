import { ENV } from "../../_core/env";

/** Requested only during admission/capabilities, never polled by a server loop.
 * No DB heartbeat fallback: a missing endpoint is an explicit deployment gap.
 */
export async function isDemandWorkerReady(fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!ENV.generationWorkerReadinessUrl) return false;
  try {
    const response = await fetcher(ENV.generationWorkerReadinessUrl, {
      signal: AbortSignal.timeout(3_000), redirect: "error",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result?.ready === true && result?.transport === "postgres-notify" && result?.contractVersion === 1;
  } catch { return false; }
}
