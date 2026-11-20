import { generationTelemetryEventSchema, GENERATION_TELEMETRY_BATCH_SIZE, GENERATION_TELEMETRY_MAX_BYTES, type GenerationTelemetryEvent, type GenerationJourneyIdentity } from "@shared/generationTelemetry";

/** Disposable analysis only: no retry loop, no storage, no document or briefing. */
export function createGenerationTelemetry(send: (events: GenerationTelemetryEvent[]) => Promise<unknown>) {
  let pending: GenerationTelemetryEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const seen = new Set<string>();
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const events = pending.splice(0, GENERATION_TELEMETRY_BATCH_SIZE);
    if (events.length) void Promise.resolve().then(() => send(events)).catch(() => {});
  };
  return {
    record(
      identity: GenerationJourneyIdentity | undefined,
      exposureId: string,
      kind: GenerationTelemetryEvent["kind"],
      extra: {
        position?: number;
        originalPosition?: number;
        changes?: number;
        delta?: { fieldId?: string; property?: string; changeType?: string };
      } = {}
    ) {
      if (!identity) return;
      const parsed = generationTelemetryEventSchema.safeParse({
        ...identity,
        eventId: crypto.randomUUID(),
        exposureId,
        kind,
        changes: extra.changes ?? (kind === "edit" ? 1 : undefined),
        ...extra,
      });
      if (!parsed.success) return;
      const key = `${exposureId}:${identity.requestId}:${identity.proposalId}:${identity.revision}:${kind}`;
      if (kind === "exposure" && seen.has(key)) return;
      if (kind === "exposure") { seen.add(key); if (seen.size > 300) seen.delete(seen.values().next().value!); }
      if (kind === "edit") {
        const current = pending.find(event =>
          event.kind === "edit" &&
          event.proposalId === identity.proposalId &&
          event.requestId === identity.requestId &&
          event.revision === identity.revision &&
          event.exposureId === exposureId &&
          (event.delta?.fieldId ?? undefined) === (extra.delta?.fieldId ?? undefined) &&
          (event.delta?.property ?? undefined) === (extra.delta?.property ?? undefined)
        );
        if (current) {
          current.changes = Math.min(1000, (current.changes ?? 1) + (extra.changes ?? 1));
          if (extra.delta) current.delta = extra.delta;
          return;
        }
      }
      if (new TextEncoder().encode(JSON.stringify({ events: [...pending, parsed.data] })).length > GENERATION_TELEMETRY_MAX_BYTES) flush();
      pending.push(parsed.data);
      if (pending.length >= GENERATION_TELEMETRY_BATCH_SIZE) flush();
      else timer ??= setTimeout(flush, 2000);
    },
    flush,
    dispose() { flush(); seen.clear(); },
  };
}
