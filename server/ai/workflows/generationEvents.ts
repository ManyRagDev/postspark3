import { EventEmitter } from "node:events";
import type { RequestRecord } from "./generationStore";
export type GenerationEvent = {
  requestId: string;
  ownerId: string;
  status: string;
  proposals: Array<{ proposalId: string; revision: number; status: string }>;
  error?: string;
  billingPending?: boolean;
  phase?: string;
  kind?: "brand-capture";
};
export const generationEvents = new EventEmitter();
generationEvents.setMaxListeners(100);
const lastEvents = new Map<string, string>();
export function publishGenerationRecord(record: RequestRecord) {
  const event: GenerationEvent = {
    requestId: record.id,
    ownerId: record.ownerId,
    status: record.status,
    billingPending:
      record.billingMode === "reserved" && !record.billingSettledAt,
    ...(record.dispatchError ? { error: record.dispatchError } : {}),
    proposals: record.proposals.map(p => ({
      proposalId: p.proposalId,
      revision: p.revision,
      status: p.status,
    })),
  };
  publishWorkEvent(event);
}
export function publishWorkEvent(event:GenerationEvent){
  const signature = JSON.stringify(event);
  if (lastEvents.get(event.requestId) === signature) return;
  lastEvents.set(event.requestId, signature);
  if (lastEvents.size > 1000)
    lastEvents.delete(lastEvents.keys().next().value!);
  if (
    process.env.POSTSPARK_DEMAND_CHILD === "1" &&
    process.send &&
    process.connected
  )
    process.send(
      { type: "generation-progress", event },
      (error: Error | null) => {
        if (error)
          console.warn(
            "[generation:events] Canal local encerrado; progresso permanece persistido."
          );
      }
    );
  else generationEvents.emit(event.requestId, event);
}
