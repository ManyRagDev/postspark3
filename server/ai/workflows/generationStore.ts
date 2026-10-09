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

export type GenerationRequestStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export interface GenerationPreparedState {
  selectedDefinitions: ComponentDefinitionV1[][];
  contextContent?: string;
  visualPreference?: unknown;
  selectionReasons?: string[];
  briefInterpretation?: unknown;
  executionBrief?: unknown;
}

export interface RequestRecord {
  id: string;
  ownerId: string;
  input: OrchestratedGenerationInput;
  inputHash: string;
  status: GenerationRequestStatus;
  experimental: boolean;
  deadlineAt: number;
  proposals: ProposalDelivery[];
  prepared?: GenerationPreparedState;
  leaseToken?: string;
  leaseUntil?: number;
  errorReason?: string;
  billingMode: "dev_pilot";
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

export interface GenerationStore {
  admission(input: {
    ownerId: string;
    idempotencyKey: string;
    inputHash: string;
    input: OrchestratedGenerationInput;
    experimental: boolean;
    deadlineAt?: number;
  }): Promise<AdmissionResult>;
  claim(workerId: string): Promise<ClaimedGeneration | null>;
  workerHeartbeat(workerId: string): Promise<void>;
  isAvailable(): Promise<boolean>;
  get(requestId: string, ownerId: string): Promise<RequestRecord | null>;
  cancel(requestId: string, ownerId: string): Promise<RequestRecord | null>;
  heartbeat(requestId: string, leaseToken: string): Promise<RequestRecord>;
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
    status: "completed" | "partial" | "failed",
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

function requestRecord(value: any): RequestRecord {
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
    id: String(value.id),
    ownerId: String(value.owner_id ?? value.ownerId),
    input: value.input as OrchestratedGenerationInput,
    inputHash: String(value.input_hash ?? value.inputHash),
    status: value.status as GenerationRequestStatus,
    experimental: Boolean(value.experimental),
    deadlineAt,
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
    billingMode: "dev_pilot",
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
    return requestRecord(data);
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
      const data = await rpc("generation_v5_admit", {
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

    async isAvailable() {
      return (await rpc("generation_v5_is_available")) === true;
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
      return data ? requestRecord(data) : null;
    },

    heartbeat(requestId, leaseToken) {
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

    beginOperation(requestId, leaseToken, operationKey, replaySafe = false) {
      return operation(
        requestId,
        leaseToken,
        operationKey,
        replaySafe ? "begin_safe" : "begin"
      );
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
      return requestRecord(data);
    },

    async finish(requestId, leaseToken, status, errorReason) {
      const data = await rpc("generation_v5_finish", {
        p_id: requestId,
        p_lease_token: leaseToken,
        p_status: status,
        p_error_reason: errorReason ?? null,
      });
      return requestRecord(data);
    },
  };
}
