import { createHash } from "node:crypto";
import {
  generationCoordinatorSnapshotSchema,
  type GenerationCoordinatorSnapshot,
} from "@shared/generationContracts";
import { type OrchestratedGenerationInput } from "@shared/generationRequest";
import { ENV } from "../../_core/env";
import { invokeLLM } from "../../_core/llm";
import {
  loadSiteIntelligence,
  siteIntelligenceToPrompt,
} from "../../siteIntelligence";
import { scrapeUrl } from "../../siteContent";
import {
  createGenerationStore,
  type GenerationStore,
  type RequestRecord,
} from "./generationStore";
import { GenerationCoordinator } from "./generationCoordinator";
import {
  prepareOrchestratedGeneration,
  type PreparedGeneration,
} from "./generationPreparation";
import type { ProposalGraphDeps } from "./proposalGraph";
import { generateProposalMediaForSlot } from "./proposalMedia";
import { arsenalHash } from "@shared/arsenalContent";
import {
  settleV5GenerationReservation,
  getReservationByIdempotencyKey,
  isBillingDisabled,
} from "../../billing";

export class ReconciliationRequiredError extends Error {
  constructor(key: string) {
    super(`reconciliation_required:${key}`);
  }
}

export function requestInputHash(input: OrchestratedGenerationInput): string {
  const { idempotencyKey, ...payload } = input;
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function requestSnapshot(
  record: RequestRecord
): GenerationCoordinatorSnapshot {
  const expired = record.deadlineAt <= Date.now();
  const active =
    !expired && (record.status === "queued" || record.status === "running");
  const proposals = record.proposals.map(p =>
    expired &&
    [
      "planned",
      "running",
      "checking",
      "recovering",
      "delivery_pending",
    ].includes(p.status)
      ? {
          ...p,
          status: "expired" as const,
          errorReason: "generation_deadline_exceeded",
        }
      : p
  );
  const ready = proposals.filter(p => p.status === "ready").length;
  return generationCoordinatorSnapshotSchema.parse({
    requestId: record.id,
    runId: record.id,
    overallStatus:
      record.status === "cancelled"
        ? "cancelled"
        : active
          ? "running"
          : ready === 3
            ? "completed"
            : ready
              ? "partial"
              : "failed",
    proposals,
    updatedAt: Date.now(),
  });
}

/** Journal first, external effect second. Uncertain effects require reconciliation, never replay. */
export function durableOperations(
  store: GenerationStore,
  record: RequestRecord,
  leaseToken: string,
  signal: AbortSignal,
  prefix = "",
  replaySafe = false
) {
  return async <T>(key: string, work: () => Promise<T>): Promise<T> => {
    signal.throwIfAborted();
    if (Date.now() >= record.deadlineAt)
      throw new Error("generation_deadline_exceeded");
    const operationKey = `${prefix}${key}`;
    const existing = await store.beginOperation(
      record.id,
      leaseToken,
      operationKey,
      replaySafe
    );
    if (existing.state === "completed") return existing.result as T;
    if (existing.state === "uncertain")
      throw new ReconciliationRequiredError(operationKey);
    try {
      const result = await work();
      // Persist returned output even if cancellation just arrived: it must never be purchased twice.
      await store.persistOperationResult(
        record.id,
        leaseToken,
        operationKey,
        result
      );
      signal.throwIfAborted();
      return result;
    } catch (error) {
      await store
        .markOperationUncertain(record.id, leaseToken, operationKey)
        .catch(() => undefined);
      throw error;
    }
  };
}

export async function loadGenerationContext(
  input: OrchestratedGenerationInput,
  ownerId: string
): Promise<string> {
  if (input.siteIntelligenceId) {
    const site = await loadSiteIntelligence(input.siteIntelligenceId, ownerId);
    if (!site)
      throw new Error("Inteligência de site indisponível para este usuário");
    return `${siteIntelligenceToPrompt(site)}\n${site.evidence.map(e => `[${e.kind}] ${e.text}`).join("\n")}`.slice(
      0,
      24000
    );
  }
  const siteUrl =
    input.inputType === "url"
      ? input.content
      : input.executionBrief?.brandInput?.websiteUrl;
  if (siteUrl) {
    const page = await scrapeUrl(siteUrl);
    if (!page.content?.trim())
      throw new Error("Não foi possível obter conteúdo verificável da URL");
    return `${input.inputType === "url" ? "" : input.content + "\n"}URL: ${siteUrl}\nTítulo: ${page.title}\nDescrição: ${page.description}\nConteúdo: ${page.content}`.slice(
      0,
      24000
    );
  }
  return input.content;
}

export interface RuntimeDeps {
  store: GenerationStore;
  prepare: typeof prepareOrchestratedGeneration;
  graphDeps?: Partial<ProposalGraphDeps>;
  loadContext: typeof loadGenerationContext;
  settleReservation?: typeof settleV5GenerationReservation;
}

/** A separate worker owns invocation; HTTP handlers only admit/read/cancel durable requests. */
export async function executeClaimedGeneration(
  record: RequestRecord,
  leaseToken: string,
  overrides: Partial<RuntimeDeps> = {}
): Promise<GenerationCoordinatorSnapshot> {
  const deps: RuntimeDeps = {
    store: overrides.store ?? createGenerationStore(),
    prepare: prepareOrchestratedGeneration,
    loadContext: loadGenerationContext,
    ...overrides,
  };
  const controller = new AbortController();
  const remaining = record.deadlineAt - Date.now();
  if (remaining <= 0)
    return requestSnapshot(
      await deps.store.finish(
        record.id,
        leaseToken,
        "failed",
        "generation_deadline_exceeded"
      )
    );
  const timer = setTimeout(
    () => controller.abort(new Error("generation_deadline_exceeded")),
    remaining
  );
  let pulsing = false;
  const heartbeat = setInterval(async () => {
    if (pulsing) return;
    pulsing = true;
    try {
      const latest = await deps.store.heartbeat(record.id, leaseToken);
      if (latest.status === "cancelled")
        controller.abort(new Error("generation_cancelled"));
    } catch (error) {
      controller.abort(error);
    } finally {
      pulsing = false;
    }
  }, 10000);
  try {
    const operation = async <T>(key: string, work: () => Promise<T>) =>
      durableOperations(
        deps.store,
        record,
        leaseToken,
        controller.signal,
        "prepare:",
        ["context", "preferences", "catalog", "definitions"].includes(key)
      )(key, work);
    const prepared = (record.prepared ??
      (await deps.prepare(
        record.input,
        record.ownerId,
        record.experimental,
        record.deadlineAt,
        {
          loadContext: deps.loadContext,
          signal: controller.signal,
          operation,
          generate: params =>
            invokeLLM({
              ...params,
              signal: controller.signal,
              disableFallback: true,
            }),
        }
      ))) as PreparedGeneration;
    if (!record.prepared)
      await deps.store.savePrepared(record.id, leaseToken, prepared);
    controller.signal.throwIfAborted();
    const coordinator = new GenerationCoordinator(
      {
        requestId: record.id,
        runId: record.id,
        actor: record.ownerId,
        prompt: record.input.content,
        contextContent: prepared.contextContent,
        selectedDefinitions: prepared.selectedDefinitions,
        selectionReasons: prepared.selectionReasons,
        experimental: record.experimental,
        visualPreference: prepared.visualPreference,
        imageObligation: prepared.imageObligation,
        executionBrief: record.input.executionBrief,
        creationMode: record.input.creationMode,
        platform: record.input.platform,
        tone: record.input.tone,
        model: record.input.model,
        postMode: record.input.postMode,
        deadlineMs: record.deadlineAt,
        signal: controller.signal,
        savedProposals: record.proposals,
        referenceImages: [
          record.input.imageUrl,
          record.input.executionBrief?.brandInput?.referenceImageUrl,
        ].filter((v): v is string => Boolean(v)),
      },
      {
        actor: record.ownerId,
        generateText: params =>
          invokeLLM({
            ...params,
            signal: controller.signal,
            disableFallback: true,
          }),
        mediaAdapter: {
          generate: request =>
            generateProposalMediaForSlot(request, {
              // The proposal graph wraps this entire adapter call in its durable operation.
              runIdempotent: async (_key, work) => work(),
            }),
        },
        ...deps.graphDeps,
        persistUpdate: async delivery => {
          await deps.store.checkpointProposal(record.id, leaseToken, delivery);
        },
        deliver: async delivery => {
          try {
            await deps.store.commitDelivery(record.id, leaseToken, delivery);
          } catch (error) {
            // A lost HTTP response is not proof that the transaction rolled back.
            const latest = await deps.store
              .get(record.id, record.ownerId)
              .catch(() => null);
            const committed = latest?.proposals.find(
              p =>
                p.proposalId === delivery.proposalId &&
                p.revision === delivery.revision
            );
            if (
              committed?.status === "ready" &&
              arsenalHash(committed.bundle) === arsenalHash(delivery.bundle)
            )
              return;
            throw error;
          }
        },
        operationForProposal: proposalId => async (params, work) =>
          durableOperations(
            deps.store,
            record,
            leaseToken,
            controller.signal,
            `${proposalId}:`
          )(params.operationKey, work),
      }
    );
    const snapshot = await coordinator.start();
    if (
      snapshot.overallStatus !== "running" &&
      snapshot.overallStatus !== "cancelled"
    )
      await deps.store.finish(record.id, leaseToken, snapshot.overallStatus);

    // Settle V5 billing reservation proportionally only once the run reached a terminal state
    if (snapshot.overallStatus !== "running") {
      const isCancelled = snapshot.overallStatus === "cancelled";
      const readyCount = isCancelled
        ? 0
        : snapshot.proposals.filter(p => p.status === "ready").length;
      const settle = deps.settleReservation ?? settleV5GenerationReservation;
      const res = await getReservationByIdempotencyKey(
        record.ownerId,
        record.input.idempotencyKey
      ).catch(() => null);
      const reservationId =
        res?.id ?? (isBillingDisabled() ? "dev-mock" : null);
      if (reservationId) {
        await settle({
          reservationId,
          postMode: record.input.postMode ?? "static",
          deliveredReadyCount: readyCount,
          totalProposalsCount: 3,
          generationRunId: record.id,
        }).catch(err => {
          console.warn(
            "[generationRuntime] Error settling V5 reservation:",
            err
          );
        });
      }
    }

    return snapshot;
  } catch (error) {
    const latest = await deps.store.get(record.id, record.ownerId);
    if (latest?.status === "cancelled") return requestSnapshot(latest);
    const message =
      error instanceof Error ? error.message : "generation_failed";
    const readyCount =
      latest?.proposals.filter(p => p.status === "ready").length ?? 0;
    const settle = deps.settleReservation ?? settleV5GenerationReservation;
    const res = await getReservationByIdempotencyKey(
      record.ownerId,
      record.input.idempotencyKey
    ).catch(() => null);
    const reservationId = res?.id ?? (isBillingDisabled() ? "dev-mock" : null);
    if (reservationId) {
      await settle({
        reservationId,
        postMode: record.input.postMode ?? "static",
        deliveredReadyCount: readyCount,
        totalProposalsCount: 3,
        generationRunId: record.id,
      }).catch(err => {
        console.warn(
          "[generationRuntime] Error settling V5 reservation on failure:",
          err
        );
      });
    }
    // A lost lease cannot finalize another worker's request; the fence rejects this update.
    return requestSnapshot(
      await deps.store.finish(
        record.id,
        leaseToken,
        readyCount > 0 ? "partial" : "failed",
        message
      )
    );
  } finally {
    clearTimeout(timer);
    clearInterval(heartbeat);
  }
}

export function generationV5Enabled() {
  return ENV.generationV5Mode === "dev";
}
