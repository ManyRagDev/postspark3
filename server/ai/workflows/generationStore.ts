import {ENV} from "../../_core/env";
import {publishGenerationRecord} from "./generationEvents";
import { randomUUID } from "node:crypto";
import type { ComponentDefinitionV1 } from "../../../shared/componentAssembly";
import { completeDesignVariationV1Schema } from "../../../shared/completeDesignGeneration";
import {
  proposalDeliverySchema,
  type ProposalDelivery,
} from "../../../shared/generationContracts";
import type { OrchestratedGenerationInput } from "../../../shared/generationRequest";
import { projectProposalVariation } from "../../../shared/proposalProjection";
import { getDb } from "../../db";
import { recordGenerationEvent } from "../generationTrace";

export type GenerationRequestStatus =
  | "queued"
  | "running"
  | "awaiting_reconciliation"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export interface GenerationPreparedState {
  preparationVersion?: 2 | 3 | 4 | 5;
  reviewPolicyVersion?: 5 | 6 | 7 | 8 | 9;
  reviewExecutionConfig?: import("@shared/proposalReview").ReviewExecutionConfigV1 | import("@shared/proposalReviewV7").ReviewExecutionConfigV2 | import("@shared/proposalReviewV8").ReviewExecutionConfigV3 | import("@shared/proposalReviewV9").ReviewExecutionConfigV4;
  editorialContextHash?: string;
  editorialContext?: import("./editorialContextV8").EditorialContext;
  electionReceipt?: import("../../../shared/designElection").AnyElectionDecision;
  selectedOffers?: import("@shared/completeDesignOffers").CompleteDesignOfferV1[];
  selectedDefinitions: ComponentDefinitionV1[][];
  alternativeDefinitions?: ComponentDefinitionV1[][][];
  alternativeOffers?: import("@shared/completeDesignOffers").CompleteDesignOfferV1[][];
  recoveryPlanHash?: string;
  imageSourceReading?: import("./generationImageSource").ImageSourceReading|null;
  sourceReferences?: import("./proposalGraph").ProposalSourceReference[];
  contextContent?: string;
  visualPreference?: unknown;
  selectionReasons?: string[];
  editorialApproaches?: Array<string | null>;
  briefInterpretation?: unknown;
  executionBrief?: unknown;
  imageObligation?: import("@shared/generationContracts").ImageObligation;
  perProposalImageObligations?: import("@shared/generationContracts").ImageObligation[];
}

export interface RequestRecord {
  executionMode?: "external" | "local-demand";
  executorScope?: string;
  catalogRevision?: string;
  dispatchError?: string;
  id: string;
  ownerId: string;
  input: OrchestratedGenerationInput;
  inputHash: string;
  status: GenerationRequestStatus;
  experimental: boolean;
  deadlineAt: number;
  createdAt?: number;
  proposals: ProposalDelivery[];
  prepared?: GenerationPreparedState;
  leaseToken?: string;
  leaseUntil?: number;
  errorReason?: string;
  billingMode: "dev_pilot" | "unlimited" | "reserved";
  billingReservationId?: string;
  billingSettledAt?: number;
  billingError?: string;
}

export interface AdmissionResult {
  record: RequestRecord;
  created: boolean;
}

export interface ClaimedGeneration {
  record: RequestRecord;
  leaseToken: string;
}

export interface OperationStart {
  state: "new" | "completed" | "uncertain";
  result?: unknown;
}

export interface GenerationOperationRecord {
  operationKey: string;
  state: string;
  result?: unknown;
  expectation?: unknown;
}

export interface GenerationStore {
  persistReviewExpectation?:(id:string,lease:string,key:string,expectation:unknown)=>Promise<void>;
  admission(input: {
    ownerId: string;
    idempotencyKey: string;
    inputHash: string;
    input: OrchestratedGenerationInput;
    experimental: boolean;
    deadlineAt?: number;
    executorScope?: string;
    catalogRevision?: string;
  }): Promise<AdmissionResult>;
  claim(workerId: string): Promise<ClaimedGeneration | null>;
  workerHeartbeat(workerId: string): Promise<void>;
  isAvailable(): Promise<boolean>;
  reconcile(): Promise<number>;
  catalogAvailability(): Promise<{ approved: number; draft: number }>;
  get(requestId: string, ownerId: string): Promise<RequestRecord | null>;
  listOperations(
    requestId: string,
    ownerId: string
  ): Promise<GenerationOperationRecord[]>;
  recentSelections(
    ownerId: string,
    excludeRequestId: string
  ): Promise<import("../../../shared/designSelection").RecentDesignSelection[]>;
  getByIdempotencyKey(
    ownerId: string,
    key: string
  ): Promise<RequestRecord | null>;
  cancel(requestId: string, ownerId: string): Promise<RequestRecord | null>;
  heartbeat(requestId: string, leaseToken: string): Promise<Pick<RequestRecord,"status">>;
  savePrepared(
    requestId: string,
    leaseToken: string,
    prepared: GenerationPreparedState
  ): Promise<RequestRecord>;
  checkpointProposal(
    requestId: string,
    leaseToken: string,
    delivery: ProposalDelivery
  ): Promise<RequestRecord>;
  beginOperation(
    requestId: string,
    leaseToken: string,
    operationKey: string,
    replaySafe?: boolean
  ): Promise<OperationStart>;
  persistOperationResult(
    requestId: string,
    leaseToken: string,
    operationKey: string,
    result: unknown
  ): Promise<void>;
  markOperationUncertain(
    requestId: string,
    leaseToken: string,
    operationKey: string
  ): Promise<void>;
  commitDelivery(
    requestId: string,
    leaseToken: string,
    delivery: ProposalDelivery
  ): Promise<RequestRecord>;
  finish(
    requestId: string,
    leaseToken: string,
    status: "completed" | "partial" | "failed" | "awaiting_reconciliation",
    errorReason?: string
  ): Promise<RequestRecord>;
}

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{
    data: any;
    error: { message?: string; code?: string } | null;
  }>;
  from?: (...args: any[]) => any;
};

function fail(error: { message?: string; code?: string } | null): void {
  if (!error) return;
  const cause = new Error(
    error.message || "generation_store_error"
  ) as Error & {
    code?: string;
  };
  cause.code = error.code;
  throw cause;
}

function timestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function requestRecord(value: any): RequestRecord {
  if (!value || typeof value !== "object")
    throw new Error("generation_store_invalid_record");
  const proposals = Array.isArray(value.proposals)
    ? value.proposals.map((proposal: unknown) =>
        proposalDeliverySchema.parse(proposal)
      )
    : [];
  const deadlineAt = timestamp(value.deadline_at ?? value.deadlineAt);
  if (!deadlineAt || proposals.length !== 3)
    throw new Error("generation_store_invalid_record");
  const leaseUntil = timestamp(value.lease_until ?? value.leaseUntil);
  return {
    executionMode: value.execution_mode ?? "external",
    executorScope: value.executor_scope ?? undefined,
    catalogRevision: value.catalog_revision != null ? String(value.catalog_revision) : undefined,
    dispatchError: value.dispatch_error ?? undefined,
    id: String(value.id),
    ownerId: String(value.owner_id ?? value.ownerId),
    input: value.input as OrchestratedGenerationInput,
    inputHash: String(value.input_hash ?? value.inputHash),
    status: value.status as GenerationRequestStatus,
    experimental: Boolean(value.experimental),
    deadlineAt,
    ...(timestamp(value.created_at)
      ? { createdAt: timestamp(value.created_at) }
      : {}),
    proposals,
    ...(value.prepared
      ? { prepared: value.prepared as GenerationPreparedState }
      : {}),
    ...((value.lease_token ?? value.leaseToken)
      ? { leaseToken: String(value.lease_token ?? value.leaseToken) }
      : {}),
    ...(leaseUntil ? { leaseUntil } : {}),
    ...((value.error_reason ?? value.errorReason)
      ? { errorReason: String(value.error_reason ?? value.errorReason) }
      : {}),
    billingMode: value.billing_mode ?? value.billingMode ?? "dev_pilot",
    billingReservationId:
      value.billing_reservation_id ?? value.billingReservationId,
    billingSettledAt: timestamp(
      value.billing_settled_at ?? value.billingSettledAt
    ),
    billingError: value.billing_error ?? value.billingError,
  };
}

function outputProjection(
  delivery: ProposalDelivery,
  input: OrchestratedGenerationInput
) {
  if (delivery.status !== "ready") return null;
  const bundle = completeDesignVariationV1Schema.parse(delivery.bundle);
  return projectProposalVariation(bundle, {
    platform: input.platform,
    tone: input.tone,
    creationMode: input.creationMode,
    executionBrief: input.executionBrief,
  });
}

export function createGenerationStore(
  db: RpcClient = getDb()
): GenerationStore {
  async function rpc(name: string, args: Record<string, unknown> = {}) {
    const result = await db.rpc(name, args);
    fail(result.error);
    return result.data;
  }

  async function updateLease(
    requestId: string,
    leaseToken: string,
    action: "heartbeat" | "prepared" | "checkpoint" | "commit",
    payload?: unknown
  ): Promise<RequestRecord> {
    const data = await rpc("generation_v5_lease_update", {
      p_id: requestId,
      p_lease_token: leaseToken,
      p_action: action,
      p_payload: payload ?? null,
    });
    const record=requestRecord(data);publishGenerationRecord(record);return record;
  }

  async function operation(
    requestId: string,
    leaseToken: string,
    operationKey: string,
    action: "begin" | "begin_safe" | "complete" | "uncertain",
    result?: unknown
  ): Promise<OperationStart> {
    const data = await rpc("generation_v5_operation", {
      p_id: requestId,
      p_lease_token: leaseToken,
      p_operation_key: operationKey,
      p_action: action,
      p_result: result ?? null,
    });
    if (!data || !["new", "completed", "uncertain"].includes(data.state))
      throw new Error("generation_store_invalid_operation_state");
    return data as OperationStart;
  }

  async function loadById(requestId: string): Promise<RequestRecord> {
    if (!db.from) throw new Error("generation_store_read_unavailable");
    const result = await db
      .from("generation_v5_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    fail(result.error);
    return requestRecord(result.data);
  }

  return {
    async persistReviewExpectation(id,lease,key,expectation){await rpc("generation_review_expectation",{p_id:id,p_lease:lease,p_key:key,p_expectation:expectation});},
    async listOperations(requestId, ownerId) {
      if (!db.from) throw new Error("generation_store_read_unavailable");
      const owned = await db
        .from("generation_v5_requests")
        .select("id")
        .eq("id", requestId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      fail(owned.error);
      if (!owned.data) return [];
      const result = await db
        .from("generation_v5_operations")
        .select("operation_key,state,result,expectation")
        .eq("request_id", requestId);
      fail(result.error);
      return (result.data ?? []).map((operation: any) => ({
        operationKey: operation.operation_key,
        state: operation.state,
        result: operation.result,
        expectation:operation.expectation,
      }));
    },

    async recentSelections(ownerId, excludeRequestId) {
      const degraded = (error: { code?: string } | null | undefined) => {
        // Persist only a diagnostic code, never raw provider/DB messages or data.
        const code =
          error?.code && /^[a-z0-9_-]{1,40}$/i.test(error.code)
            ? error.code
            : "read_failed";
        recordGenerationEvent({
          stage: "recent_selections",
          status: "fallback",
          detail: "history_unavailable",
          data: { code, historyAvailable: false, returnedRequests: 0 },
        });
        console.warn("[generationStore] Histórico recente indisponível:", code);
        return [];
      };
      try {
        if (!db.from)
          return degraded({ code: "generation_store_read_unavailable" });
        const result = await db
          .from("generation_v5_requests")
          .select("id,proposals")
          .eq("owner_id", ownerId)
          .neq("id", excludeRequestId)
          .in("status", ["completed", "partial", "cancelled"])
          .contains("proposals", JSON.stringify([{ status: "ready" }]))
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(5);
        if (result.error) {
          return degraded(result.error);
        }
        const selections = (result.data ?? [])
          .map((record: any) => ({
            requestId: record.id,
            selections: (record.proposals ?? []).flatMap((raw: unknown) => {
              const parsed = proposalDeliverySchema.safeParse(raw);
              if (!parsed.success || parsed.data.status !== "ready") return [];
              return [
                {
                  family: parsed.data.bundle.family,
                  designIds: Array.from(
                    new Set(
                      parsed.data.bundle.slides.flatMap(
                        slide =>
                          slide.composition.origin.componentAssembly
                            ?.componentIds ?? []
                      )
                    )
                  ),
                },
              ];
            }),
          }))
          .filter((record: any) => record.selections.length > 0);
        recordGenerationEvent({
          stage: "recent_selections",
          status: "completed",
          detail: "history_loaded",
          data: { historyAvailable: true, returnedRequests: selections.length },
        });
        return selections;
      } catch (error) {
        return degraded(error as { code?: string } | undefined);
      }
    },
    async admission(input) {
      if (input.input.ownerId !== input.ownerId)
        throw new Error("generation_input_owner_mismatch");
      if (input.input.idempotencyKey !== input.idempotencyKey)
        throw new Error("generation_idempotency_key_mismatch");
      const id = randomUUID();
      const now = Date.now();
      const deadlineAt = Math.min(
        input.deadlineAt ?? now + 10 * 60_000,
        now + 10 * 60_000
      );
      if (deadlineAt <= now)
        throw new Error("generation_deadline_must_be_future");
      const data = await rpc(input.executorScope ? "generation_admit_local" : input.catalogRevision ? "generation_admit_external" : "generation_admit", {
        ...(input.executorScope ? {p_scope:input.executorScope}:{}),
        ...(input.catalogRevision ? {p_revision:input.catalogRevision}:{}),
        p_id: id,
        p_owner: input.ownerId,
        p_idempotency_key: input.idempotencyKey,
        p_input_hash: input.inputHash,
        p_input: input.input,
        p_experimental: input.experimental,
        p_deadline_at: new Date(deadlineAt).toISOString(),
      });
      const { created, ...stored } = data;
      return { record: requestRecord(stored), created: Boolean(created) };
    },

    async claim(workerId) {
      const data = await rpc("generation_v5_claim", { p_worker_id: workerId });
      if (data == null) return null;
      const leaseToken = String(data.leaseToken ?? data.lease_token ?? "");
      if (!leaseToken) throw new Error("generation_store_lease_token_missing");
      return { record: requestRecord(data), leaseToken };
    },

    async workerHeartbeat(workerId) {
      await rpc("generation_v5_worker_heartbeat", { p_worker_id: workerId });
    },

    async catalogAvailability() {
      const counts = await rpc("generation_catalog_availability");
      return {
        approved: Number(counts?.approved ?? 0),
        draft: Number(counts?.draft ?? 0),
      };
    },

    async reconcile() {
      return Number(await rpc("generation_reconcile"));
    },

    async isAvailable() {
      return (await rpc("generation_v5_is_available")) === true;
    },

    async getByIdempotencyKey(ownerId, key) {
      if (!db.from) throw new Error("generation_store_read_unavailable");
      const result = await db
        .from("generation_v5_requests")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("idempotency_key", key)
        .maybeSingle();
      fail(result.error);
      return result.data ? requestRecord(result.data) : null;
    },

    async get(requestId, ownerId) {
      if (!db.from) throw new Error("generation_store_read_unavailable");
      const result = await db
        .from("generation_v5_requests")
        .select("*")
        .eq("id", requestId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      fail(result.error);
      return result.data ? requestRecord(result.data) : null;
    },

    async cancel(requestId, ownerId) {
      const data = await rpc("generation_v5_cancel", {
        p_id: requestId,
        p_owner: ownerId,
      });
      if(!data)return null;const record=requestRecord(data);publishGenerationRecord(record);return record;
    },

    async heartbeat(requestId, leaseToken) {
      if(ENV.localDemandEnabled){const data=await rpc('generation_renew_local_lease',{p_id:requestId,p_lease_token:leaseToken});return {status:data.status as RequestRecord["status"]};}
      return updateLease(requestId, leaseToken, "heartbeat");
    },

    savePrepared(requestId, leaseToken, prepared) {
      return updateLease(requestId, leaseToken, "prepared", prepared);
    },

    async checkpointProposal(requestId, leaseToken, delivery) {
      const parsed = proposalDeliverySchema.parse(delivery);
      const record = await updateLease(requestId, leaseToken, "checkpoint", {
        delivery: parsed,
        projection: null,
      });
      return record;
    },

    async beginOperation(
      requestId,
      leaseToken,
      operationKey,
      replaySafe = false
    ) {
      try {
        return await operation(
          requestId,
          leaseToken,
          operationKey,
          replaySafe ? "begin_safe" : "begin"
        );
      } catch (error: any) {
        if (
          replaySafe &&
          operationKey === "prepare:recent_selections" &&
          typeof error?.message === "string" &&
          error.message.includes(
            "Only unpaid preparation reads may be replayed"
          )
        ) {
          // Rolling-upgrade compatibility only: ordinary begin cannot replay an
          // interrupted read. Migration 0038 is still needed for crash recovery.
          return await operation(requestId, leaseToken, operationKey, "begin");
        }
        throw error;
      }
    },

    async persistOperationResult(requestId, leaseToken, operationKey, result) {
      const persisted = await operation(
        requestId,
        leaseToken,
        operationKey,
        "complete",
        result
      );
      if (persisted.state !== "completed")
        throw new Error("generation_operation_uncertain_result_not_committed");
    },

    async markOperationUncertain(requestId, leaseToken, operationKey) {
      await operation(requestId, leaseToken, operationKey, "uncertain");
    },

    async commitDelivery(requestId, leaseToken, delivery) {
      const parsed = proposalDeliverySchema.parse(delivery);
      if (parsed.status !== "ready")
        throw new Error("generation_delivery_must_be_ready");
      const current = await loadById(requestId);
      const projected = outputProjection(parsed, current.input);
      const data = await rpc("generation_v5_lease_update", {
        p_id: requestId,
        p_lease_token: leaseToken,
        p_action: "commit",
        p_payload: { delivery: parsed, projection: projected },
      });
      const record=requestRecord(data);publishGenerationRecord(record);return record;
    },

    async finish(requestId, leaseToken, status, errorReason) {
      const data = await rpc("generation_v5_finish", {
        p_id: requestId,
        p_lease_token: leaseToken,
        p_status: status,
        p_error_reason: errorReason ?? null,
      });
      const record=requestRecord(data);publishGenerationRecord(record);return record;
    },
  };
}
