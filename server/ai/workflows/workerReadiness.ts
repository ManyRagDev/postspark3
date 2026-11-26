import { ENV } from "../../_core/env";

/** Requested only during admission/capabilities, never polled by a server loop.
 * No DB heartbeat fallback: a missing endpoint is an explicit deployment gap.
 */
export async function readDemandWorkerReadiness(fetcher: typeof fetch = fetch): Promise<{
  supportsTextRecovery: boolean;
  supportsFinalFitRepair: boolean;
  supportsTrioDelivery?: true;
  supportsEditorialTeam?: true;
  supportsEditorialSelection?: true;
  supportsArtworkCarousel?: true;
} | null> {
  if (!ENV.generationWorkerReadinessUrl) return null;
  try {
    const response = await fetcher(ENV.generationWorkerReadinessUrl, {
      signal: AbortSignal.timeout(3_000), redirect: "error",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (result?.ready !== true || result.transport !== "postgres-notify" || result.contractVersion !== 1) return null;
    return {
      supportsTextRecovery: result.textRecoveryVersion === 1,
      supportsFinalFitRepair: result.finalFitRepairVersion === 1,
      ...(result.trioDeliveryVersion === 1 ? { supportsTrioDelivery: true as const } : {}),
      ...(result.editorialTeamVersion === 1 ? { supportsEditorialTeam: true as const } : {}),
      ...(result.editorialSelectionVersion === 1 ? { supportsEditorialSelection: true as const } : {}),
      ...(result.artworkCarouselVersion === 1 ? { supportsArtworkCarousel: true as const } : {}),
    };
  } catch { return null; }
}

export async function isDemandWorkerReady(fetcher: typeof fetch = fetch): Promise<boolean> {
  return (await readDemandWorkerReadiness(fetcher)) !== null;
}
