import { createHash, randomUUID } from "node:crypto";
import { getGenerationTrace } from "../../ai/generationTrace";
import { installMatrixTransport, reserveQuote } from "./budget";
import {
  evidenceHash,
  openSharedBudget,
  readSharedBudget,
  withBudgetFileLock,
} from "./sharedBudget";
import { writeJson } from "./journal";

export interface LocalGuardConfig {
  live: true;
  budgetFile: string;
  campaignId: string;
  maxUsd: number;
  maxCalls: number;
  supabaseOrigin: string;
  catalogRevision: string;
  pipelineHash: string;
  reviewModel: string;
}
const digestText = (text: string) =>
  createHash("sha256").update(text.trim()).digest("hex");
const bodyOf = (init?: RequestInit) =>
  typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

/** Temporary fetch instrumentation, installed in the backend and inherited Node workers. */
export async function installLocalJourneyGuard(
  config: LocalGuardConfig,
  traceId = () => getGenerationTrace()?.id
) {
  const expected = new URL(config.supabaseOrigin);
  if (
    expected.protocol !== "https:" ||
    expected.origin !== config.supabaseOrigin ||
    !/^[1-9]\d*$/.test(config.catalogRevision)
  )
    throw new Error("local_guard_origin_or_revision_invalid");
  const { budget, quotes, campaign } = await openSharedBudget({
    file: config.budgetFile,
    campaignId: config.campaignId,
    maxUsd: config.maxUsd,
    maxCalls: config.maxCalls,
    live: config.live,
    pipelineHash: config.pipelineHash,
  });
  if (campaign.kind !== "local-journeys" || campaign.maxExecutions !== 2)
    throw new Error("local_journey_campaign_required");
  const review = quotes.find(q => q.id === config.reviewModel);
  if (!review) throw new Error("local_guard_review_quote_missing");
  const minimumReview = (carousel: boolean) =>
    reserveQuote(
      {
        model: config.reviewModel,
        messages: [{ image_url: "review-bound" }],
        max_tokens: carousel ? 12288 : 9216,
      },
      review
    ).usd;
  const permitAdmission = async (body: any) => {
    const input = body?.p_input,
      choice = body?.p_generation_config?.choice;
    // Studio preserves the original here; content may append a visual preference.
    // The permit never depends on a text rewritten by a model.
    const rawText = input?.executionBrief?.rawInput ?? input?.content;
    if (
      input?.aspectRatio !== "4:5" ||
      input?.platform !== "instagram" ||
      input?.includeDraftDesigns !== true ||
      body?.p_experimental !== true ||
      input?.executionBrief?.brandInput?.brandColors?.length ||
      input?.executionBrief?.brandInput?.fontHint
    )
      throw new Error(
        "local_journey_catalog_scope_differs_from_verified_matrix"
      );
    if (
      !input ||
      input.inputType !== "text" ||
      input.projectId ||
      input.projectSnapshot ||
      input.projectDossier ||
      input.siteIntelligenceId ||
      input.imageUrl ||
      input.referenceImages?.length ||
      input.sources?.some(
        (s: any) =>
          s.kind !== "text" || digestText(s.value) !== digestText(rawText)
      ) ||
      input.executionBrief?.brandInput?.logoUrl ||
      input.executionBrief?.brandInput?.websiteUrl ||
      input.executionBrief?.brandInput?.referenceImageUrl
    )
      throw new Error("local_journey_requires_authorized_synthetic_text_only");
    if (
      String(body.p_revision) !== config.catalogRevision ||
      body.p_generation_config?.generationStrategyVersion !== 2
    )
      throw new Error("local_journey_catalog_or_strategy_changed");
    if (input.postMode === "carousel" && input.slideCount !== 5)
      throw new Error("local_journey_requires_five_slides");
    if (
      !(await budget.canPrepare(minimumReview(input.postMode === "carousel")))
    )
      throw new Error("local_journey_budget_exhausted_before_admission");
    await withBudgetFileLock(config.budgetFile, async () => {
      const state = await readSharedBudget(config.budgetFile);
      const permit = state.journeys.find(
        j =>
          j.postMode === input.postMode &&
          j.choice === choice &&
          j.contentHash === digestText(rawText)
      );
      if (!permit) throw new Error("local_journey_not_in_approved_plan");
      const idempotencyHash = evidenceHash(body.p_idempotency_key);
      if (
        permit.idempotencyHash &&
        (permit.idempotencyHash !== idempotencyHash ||
          permit.inputHash !== body.p_input_hash)
      )
        throw new Error("local_journey_already_admitted_no_extra_generation");
      if (!permit.idempotencyHash)
        Object.assign(permit, {
          idempotencyHash,
          inputHash: body.p_input_hash,
          requestId: body.p_id,
          admissionState: "started",
          generationConfigHash: body.p_generation_config.configurationHash,
          strategyVersion: 2,
          catalogRevision: config.catalogRevision,
        });
      await writeJson(config.budgetFile, state);
    });
  };
  const restore = installMatrixTransport(
    budget,
    new Map(quotes.map(q => [q.id, q])),
    {
      allowApplicationRequest: async (url, method, _request, init) => {
        if (url.origin !== expected.origin) return false;
        if (!/^\/(?:rest|auth|storage)\/v1(?:\/|$)/.test(url.pathname))
          throw new Error("local_guard_supabase_route_not_allowed");
        if (!["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"].includes(method))
          throw new Error("local_guard_supabase_method_not_allowed");
        const rpc = url.pathname.startsWith("/rest/v1/rpc/")
          ? url.pathname.slice("/rest/v1/rpc/".length)
          : undefined;
        if (method === "POST" && rpc?.startsWith("generation_admit"))
          await permitAdmission(bodyOf(init));
        else if (method === "POST" && rpc?.startsWith("brand_capture_"))
          throw new Error("local_guard_brand_capture_outside_journeys");
        else if (method === "POST" && rpc?.startsWith("generation_")) {
          const body = bodyOf(init),
            id = body?.p_id;
          if (
            id &&
            !(await readSharedBudget(config.budgetFile)).journeys.some(
              j => j.requestId === id
            )
          )
            throw new Error("local_guard_unrelated_generation_request");
        }
        if (
          ["PATCH", "DELETE"].includes(method) &&
          url.pathname === "/rest/v1/generation_v5_requests"
        ) {
          const id = url.searchParams.get("id")?.replace(/^eq\./, "");
          if (
            !id ||
            !(await readSharedBudget(config.budgetFile)).journeys.some(
              j => j.requestId === id
            )
          )
            throw new Error("local_guard_unrelated_generation_mutation");
        }
        return true;
      },
      onApplicationResponse: async (url, _request, init, response) => {
        if (!url.pathname.startsWith("/rest/v1/rpc/")) return;
        const rpc = url.pathname.split("/").pop(),
          body = bodyOf(init);
        if (!response.ok || !body) return;
        if (rpc?.startsWith("generation_admit")) {
          const receipt: any = await response.clone().json();
          if (!receipt?.id)
            throw new Error("local_journey_admission_receipt_missing_id");
          await withBudgetFileLock(config.budgetFile, async () => {
            const state = await readSharedBudget(config.budgetFile);
            const permit = state.journeys.find(
              j => j.idempotencyHash === evidenceHash(body.p_idempotency_key)
            );
            if (!permit) throw new Error("local_journey_admission_permit_lost");
            permit.requestId = receipt.id;
            permit.admissionState = "completed";
            await writeJson(config.budgetFile, state);
          });
        }
        if (rpc === "generation_v5_operation" && body.p_action === "complete") {
          // Exact provider IDs connect transport receipts to the durable operation.
          // Missing IDs remain transport-labelled; concurrent slots are never guessed.
          const ids = new Set<string>();
          const visit = (x: any) => {
            if (x && typeof x === "object") {
              if (typeof x.providerId === "string") ids.add(x.providerId);
              for (const v of Object.values(x)) visit(v);
            }
          };
          visit(body.p_result);
          if (ids.size)
            await withBudgetFileLock(config.budgetFile, async () => {
              const state = await readSharedBudget(config.budgetFile);
              for (const call of state.calls)
                if (
                  call.metadata?.campaignId === config.campaignId &&
                  call.metadata?.generationRequestId === body.p_id &&
                  call.providerId &&
                  ids.has(call.providerId)
                )
                  call.metadata = {
                    ...call.metadata,
                    canonicalOperationKey: body.p_operation_key,
                    operationSource: "durable_journal_provider_id",
                  };
              await writeJson(config.budgetFile, state);
            });
        }
      },
      context: async payload => {
        const id = traceId();
        const permit = (
          await readSharedBudget(config.budgetFile)
        ).journeys.find(
          j => j.requestId === id && j.admissionState === "completed"
        );
        if (!id || !permit)
          throw new Error("local_paid_request_without_authorized_journey");
        const schema = String(
          payload.response_format?.json_schema?.name ??
            (payload.modalities?.includes("image") ? "image" : "text")
        );
        return {
          operation: `${config.campaignId}:${permit.id}:${id}:transport:${schema}:${randomUUID()}`,
          metadata: {
            campaignId: config.campaignId,
            phase: "local-journeys",
            journeyId: permit.id,
            protocolVersion: 3,
            reviewPolicyVersion: 10,
            pipelineHash: config.pipelineHash,
            generationRequestId: id,
            generationConfigHash: permit.generationConfigHash!,
            strategyVersion: permit.strategyVersion!,
            catalogRevision: permit.catalogRevision!,
            operationSource: "transport_schema_pending_journal_correlation",
            schema,
            payloadHash: evidenceHash(payload),
          },
        };
      },
    }
  );
  return { budget, restore };
}
