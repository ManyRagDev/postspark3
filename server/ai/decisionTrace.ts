import { getGenerationTrace, recordGenerationEvent } from "./generationTrace";
import {
  localDiagnosticsEnabled,
  writeLocalDiagnostic,
} from "./localDiagnostics";
import type { DECISION_TRACE_STAGES } from "@shared/generationDecisionTrace";

/** Snapshot before delivery normalization can change the in-memory object.
 * Local-demand writes each observation immediately; journal/run traces retain it too. */
export function recordDecisionObservation(
  stage: (typeof DECISION_TRACE_STAGES)[number],
  data: object
) {
  const snapshot = structuredClone(data);
  recordGenerationEvent({
    stage,
    status: "completed",
    detail: "observation_v1",
    data: snapshot,
  });
  const trace = getGenerationTrace();
  if (trace && localDiagnosticsEnabled()) {
    void writeLocalDiagnostic(trace.id, {
      kind: "decision_observation_v1",
      id: trace.id,
      userUuid: trace.userUuid,
      events: [
        {
          stage,
          status: "completed",
          detail: "observation_v1",
          at: new Date().toISOString(),
          data: snapshot,
        },
      ],
    }).catch(() =>
      console.error("[decision-trace] Falha ao persistir observação local", {
        requestId: trace.id,
        stage,
      })
    );
  }
}
