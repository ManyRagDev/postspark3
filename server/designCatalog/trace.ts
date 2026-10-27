import {localDiagnosticsEnabled,writeLocalDiagnostic} from "../ai/localDiagnostics";
import { getDb } from "../db";
import { appendOperationalLog } from "../_core/operationalLog";
import { recordGenerationEvent } from "../ai/generationTrace";

/** Callers pass only IDs, counts, scores and reason codes. Never brief, copy, images or fonts. */
export async function traceCatalog(
  traceId: string,
  actorId: string,
  stage: string,
  status: "started" | "completed" | "fallback" | "failed" | "rejected",
  data: Record<string, unknown>,
  eventKey?: string,
) {
  const event = {
    trace_id: traceId,
    actor_id: actorId,
    stage,
    status,
    data,
    event_key: eventKey ?? (stage === "catalog.compile" ? `compile:${data.slot}` : null),
  };
  recordGenerationEvent({
    stage,
    status,
    detail: stage,
    data: { traceId, ...data },
  });
  console.info(
    JSON.stringify({ event: "DESIGN_CATALOG", traceId, stage, status, ...data })
  );
  try {
    if(localDiagnosticsEnabled()){await writeLocalDiagnostic(traceId,event);return true;}
    const { error } = await getDb()
      .from("design_catalog_events")
      .upsert(event, {
        onConflict: "trace_id,event_key",
        ignoreDuplicates: true,
      })
      .abortSignal(AbortSignal.timeout(2000));
    if (error) throw error;
    return true;
  } catch (error) {
    const diagnostic = {
      traceId,
      stage,
      code: String((error as any)?.code ?? "unavailable"),
    };
    console.error(
      JSON.stringify({
        event: "DESIGN_CATALOG_TRACE_PERSIST_FAILED",
        ...diagnostic,
      })
    );
    await appendOperationalLog(
      "DESIGN_CATALOG_TRACE_PERSIST_FAILED",
      diagnostic
    );
    return false;
  }
}
