import { FirstDeliveryQueue } from "./firstDeliveryQueue";
import { recordGenerationEvent } from "../generationTrace";
import { recoveryAction } from "./generationRecovery";
import { failureFromError } from "@shared/generationFailure";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import { PROPOSAL_SELECTION_POLICY } from "@shared/familyNeutrality";
import { firstDeliveryReviewSlot } from "@shared/generationPlan";
import {
  generationCoordinatorSnapshotSchema,
  proposalDeliverySchema,
  type GenerationCoordinatorSnapshot,
  type ProposalDelivery,
} from "@shared/generationContracts";
import {
  canRepairOverflow,
  executeProposalWorkflow,
  type ProposalExecutionInput,
  type ProposalGraphDeps,
} from "./proposalGraph";

export interface GenerationCoordinatorInput
  extends Omit<
    ProposalExecutionInput,
    "proposalId" | "slot" | "selectedDefinition" | "selectedDefinitions"
  > {
  offeredDefinitions?: ComponentDefinitionV1[];
  selectedDefinitions?: ComponentDefinitionV1[][];
  alternativeDefinitions?: ComponentDefinitionV1[][][];
  planning?: import("@shared/generationPlan").GenerationPlanningReceipt;
  actor: string;
  savedProposals?: ProposalDelivery[];
  activeRecoveryFamilies?: ReadonlyMap<number, string>;
  selectionReasons?: string[];
  editorialApproaches?: Array<string | null>;
  perProposalImageObligations?: ProposalExecutionInput["imageObligation"][];
}
export interface GenerationCoordinatorDeps extends ProposalGraphDeps {
  replan?: (slot: number, attempt: number, currentFamilies: string[]) => Promise<{ definitions: ComponentDefinitionV1[]; plan: import("@shared/generationPlan").ViableGenerationPlan } | null>;
  recoverDelivery?: (
    input: ProposalExecutionInput,
    reuseOriginal: boolean,
    context?: {
      recoveryAttempt: number;
      lastChance?: boolean;
      excludedCandidateIds: string[];
      excludedFamilies: string[];
      sourceDefinitions: ComponentDefinitionV1[];
      sourceAttemptId: string;
      claimFamily: (family: string) => boolean;
    },
  ) => ReturnType<typeof import("./generationDeliveryRecovery").recoverGenerationDelivery>;
  persistUpdate?: (delivery: ProposalDelivery) => Promise<void>;
  /** Authorize exact assets and settle the configured billing policy before public ready. */
  deliver?: (
    delivery: Extract<ProposalDelivery, { status: "ready" }>
  ) => Promise<void>;
  uncertainOperations?:(proposalId:string)=>Promise<boolean>;
  expectationForProposal?:(proposalId:string,key:string,expectation:unknown)=>Promise<void>;
  operationForProposal?: (
    proposalId: string
  ) => NonNullable<ProposalGraphDeps["executeOperation"]>;
}
const terminal = new Set([
  "ready",
  "failed",
  "cancelled",
  "expired",
  "waiting_input",
  "awaiting_reconciliation",
]);

/** LangGraph fan-out. The database store, rather than process listeners, owns durable state. */
export class GenerationCoordinator {
  private proposals = new Map<number, ProposalDelivery>();
  private listeners = new Set<
    (snapshot: GenerationCoordinatorSnapshot) => void
  >();
  private firstDeliveryQueue?: FirstDeliveryQueue;
  private started?: Promise<GenerationCoordinatorSnapshot>;
  private definitions: ComponentDefinitionV1[][];
  // Reserve a replacement before the first await, including during parallel recovery.
  private replacementOwners = new Map<string, number>();
  private layoutOwners = new Map<string, number>();
  private executingSlots = new Set<number>();
  private reserveWaiters = new Set<() => void>();
  private get sharedReserves() {
    return this.input.generationConfig?.trioDeliveryVersion === 1;
  }
  private get distinctProposals() {
    return this.input.planning?.proposalSelectionVersion === PROPOSAL_SELECTION_POLICY.version;
  }
  constructor(
    private input: GenerationCoordinatorInput,
    private deps: GenerationCoordinatorDeps
  ) {
    this.definitions =
      input.selectedDefinitions ??
      (input.offeredDefinitions ?? []).map(d => [d]);
    if (this.definitions.length !== 3)
      throw new Error("O coordenador requer três propostas pinadas");
    this.definitions.forEach((_, slot) => {
      const saved = input.savedProposals?.find(p => p.slot === slot);
      if (this.sharedReserves) {
        const family = saved?.status === "ready" ? saved.bundle?.family
          : this.input.activeRecoveryFamilies?.get(slot) ??
            (!saved || !terminal.has(saved.status) ? input.planning?.offers[slot]?.family : undefined);
        if (family) this.replacementOwners.set(family, slot);
        const layout = saved?.status === "ready" && saved.diagnostics.find(d => d.code === "proposal_layout_signature");
        if (layout) this.layoutOwners.set(layout.evidence, slot);
      } else if (this.distinctProposals && saved) {
        const family = saved.status === "ready" ? saved.bundle?.family : saved.attempt?.index
          ? input.planning?.recoveryRepertoires[slot]?.[saved.attempt.index - 1]?.family : undefined;
        if (family) this.replacementOwners.set(family, slot);
      }
      this.proposals.set(
        slot,
        proposalDeliverySchema.parse(
          saved ?? {
            proposalId: `p-${input.runId}-${slot}`,
            runId: input.runId,
            slot,
            status: "planned",
            revision: 1,
          }
        )
      );
    });
  }
  private releaseCandidate(slot: number) {
    let releasedFamily = false;
    this.replacementOwners.forEach((owner, key) => {
      if (owner === slot) releasedFamily = this.replacementOwners.delete(key) || releasedFamily;
    });
    this.layoutOwners.forEach((owner, key) => {
      if (owner === slot) this.layoutOwners.delete(key);
    });
    if (releasedFamily) this.notifyReserveChange();
  }
  private notifyReserveChange() {
    this.reserveWaiters.forEach(wake => wake());
  }
  private async waitForCandidate(slot: number, tried: Set<string>) {
    const reserves = this.input.planning?.deliveryReserves?.[slot] ?? [];
    const temporarilyHeld = (family: string) => {
      const owner = this.replacementOwners.get(family);
      return owner !== undefined && owner !== slot &&
        this.executingSlots.has(owner) && !terminal.has(this.proposals.get(owner)!.status);
    };
    const held = reserves.filter(reserve => !tried.has(reserve.plan.candidateId) && temporarilyHeld(reserve.family));
    const deadline = this.input.deadlineMs;
    if (!held.length || deadline === undefined || deadline <= Date.now() || this.input.signal?.aborted) return;
    await new Promise<void>(resolve => {
      const done = () => {
        clearTimeout(timer);
        this.input.signal?.removeEventListener("abort", done);
        this.reserveWaiters.delete(wake);
        resolve();
      };
      const wake = () => {
        if (held.some(reserve => !this.replacementOwners.has(reserve.family)) ||
            held.every(reserve => !temporarilyHeld(reserve.family))) done();
      };
      const timer = setTimeout(done, deadline - Date.now());
      this.reserveWaiters.add(wake);
      this.input.signal?.addEventListener("abort", done, { once: true });
    });
  }
  private claimLayout(slot: number, signature: string) {
    const owner = this.layoutOwners.get(signature);
    if (owner !== undefined && owner !== slot) return false;
    this.layoutOwners.forEach((owner, key) => {
      if (owner === slot) this.layoutOwners.delete(key);
    });
    this.layoutOwners.set(signature, slot);
    return true;
  }
  getSnapshot(): GenerationCoordinatorSnapshot {
    const proposals = Array.from(this.proposals.values()).sort(
      (a, b) => a.slot - b.slot
    );
    const active = proposals.some(p => !terminal.has(p.status));
    const pending = proposals.some(p=>p.status==="awaiting_reconciliation");
    const ready = proposals.filter(p => p.status === "ready").length;
    return generationCoordinatorSnapshotSchema.parse({
      requestId: this.input.requestId,
      runId: this.input.runId,
      overallStatus: active
        ? "running"
        : pending ? "awaiting_reconciliation" : ready === proposals.length
          ? "completed"
          : ready
            ? "partial"
            : "failed",
      proposals,
      updatedAt: Date.now(),
    });
  }
  onUpdate(listener: (snapshot: GenerationCoordinatorSnapshot) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private async update(delivery: ProposalDelivery, persist = true) {
    const parsed = proposalDeliverySchema.parse(delivery);
    if (persist) await this.deps.persistUpdate?.(parsed);
    this.proposals.set(parsed.slot, parsed);
    if (this.sharedReserves && terminal.has(parsed.status)) this.notifyReserveChange();
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(this.getSnapshot());
      } catch {
        /* Observers cannot change delivery. */
      }
    }
  }
  private async runProposal(slot: number) {
    const saved = this.proposals.get(slot)!;
    if (terminal.has(saved.status)) return;
    const { bundle: _ignored, ...identity } = saved as ProposalDelivery & {
      bundle?: unknown;
    };
    const slotPlan = this.input.planning?.slots[slot];
    const deliveryRecovery = Boolean(this.input.planning?.deliveryReserves && this.deps.recoverDelivery);
    const visualTextRepair = this.input.reviewExecutionConfig?.version === 5 &&
      this.input.reviewExecutionConfig.automaticReviewVersion === 4 &&
      this.input.reviewExecutionConfig.textFlexibilityVersion === 1 &&
      this.input.reviewExecutionConfig.visualTextRepairVersion === 1;
    const startFromReserve = deliveryRecovery && slotPlan && slotPlan.status !== "viable" &&
      (this.sharedReserves || slotPlan.status === "insufficient_fit") && Boolean(this.input.planning?.deliveryReserves?.[slot]?.length);
    if (slotPlan && slotPlan.status !== "viable" && !startFromReserve) {
      const code = slotPlan.status === "insufficient_fit" ? "selection_insufficient_fit" : "planning_response_invalid";
      await this.update(proposalDeliverySchema.parse({ ...identity, status: "failed", completedAt: Date.now(), errorReason: code, failure: { code, stage: "selection", retryable: false }, diagnostics: [{ code, target: `slot-${slot}`, evidence: slotPlan.reason }] }));
      return;
    }
    await this.update(
      proposalDeliverySchema.parse({
        ...identity,
        status: "running",
        errorReason: undefined,
      })
    );
    const checkpointFor = (attempt: NonNullable<ProposalDelivery["attempt"]>): NonNullable<ProposalGraphDeps["checkpoint"]> => async (stage, context) => {
      recordGenerationEvent({ stage: "proposal_checkpoint",
        status: stage.endsWith("started") ? "started" : stage.endsWith("rejected") ? "rejected" : stage.endsWith("failed") ? "failed" : "completed",
        detail: stage, data: { slot, proposalId: identity.proposalId, slideCount: context?.slideCount, operationKey: context?.operationKey },
      });
      await this.deps.checkpoint?.(stage, context);
      const state =
        stage === "recovering"
          ? "recovering"
          : stage.includes("check") || stage.includes("validation")
            ? "checking"
            : "running";
      await this.update(
        proposalDeliverySchema.parse({ ...identity, status: state, attempt })
      );
    };
    let result: ProposalDelivery = proposalDeliverySchema.parse({
      ...identity,
      status: "planned",
    });
    const candidates = [
      this.definitions[slot],
      ...(this.input.alternativeDefinitions?.[slot] ?? []).slice(0, 3),
    ];
    let attemptIndex = saved.attempt?.index ?? (startFromReserve ? 1 : 0);
    const plannedRecoveryCount = this.input.planning?.recoveryRepertoires[slot]?.length ?? 0;
    // Original + at most three distinct recovery decisions, sharing the original
    // deadline, journal and paid repair budgets. Never one paid try per reserve.
    const attemptLimit = deliveryRecovery ? 4 : this.input.reviewPolicyVersion === 10 ? 1 + plannedRecoveryCount : candidates.length;
    const triedCandidateIds = new Set(slotPlan?.status === "viable" ? [slotPlan.candidateId] : []);
    let sourceDefinitions = this.definitions[slot];
    let sourceAttemptId = saved.proposalId;
    const proposalInput: ProposalExecutionInput = {
      ...this.input,
      selectedDefinitions: undefined,
      firstDeliveryReviewRecovery: slot === firstDeliveryReviewSlot(this.input.planning),
      generationIntent: this.input.planning?.intent,
      visualRequirements: this.input.planning?.visualRequirements,
      ...(this.input.planning?.intent.editorial ? { editorialCatalog: this.input.planning.editorialCatalog ?? null } : {}),
      imageObligation: this.input.perProposalImageObligations?.[slot] ?? this.input.imageObligation,
      proposalId: saved.proposalId,
      slot,
      revision: saved.revision,
    };
    const finalFitEnabled = deliveryRecovery && this.input.generationConfig?.finalFitRepairVersion === 1 &&
      this.input.executionBrief?.interventionLevel !== "visual_only" && proposalInput.generationIntent?.adaptation !== "literal";
    // An unavailable reserve can end the sequence earlier than the numerical limit.
    // Replay that last measured attempt through its original journal, never its selector.
    let retryFinalFit: (() => Promise<ProposalDelivery>) | undefined;
    while (attemptIndex < attemptLimit) {
      let currentDefs = candidates[attemptIndex];
      let narrativePlan = slotPlan?.status === "viable" ? slotPlan : undefined;
      let recovered: Awaited<ReturnType<NonNullable<GenerationCoordinatorDeps["recoverDelivery"]>>> = null;
      let replacementFamily: string | undefined;
      if (this.distinctProposals && !deliveryRecovery && attemptIndex > 0) {
        replacementFamily = this.input.planning?.recoveryRepertoires[slot]?.[attemptIndex - 1]?.family;
        const owner = replacementFamily ? this.replacementOwners.get(replacementFamily) : undefined;
        if (!replacementFamily || (owner !== undefined && owner !== slot) ||
            this.input.planning?.offers.some(offer => offer?.family === replacementFamily)) {
          attemptIndex++;
          continue;
        }
        this.replacementOwners.set(replacementFamily, slot);
      }
      const attemptSuffix = attemptIndex === 0 ? "" : `-fb${attemptIndex}`;
      const effectiveProposalId = `${saved.proposalId}${attemptSuffix}`;
      const attempt = {index:attemptIndex,id:effectiveProposalId};
      const previousFailure = result.failure ?? saved.failure;
      try {
        if (deliveryRecovery && attemptIndex > 0) {
          const otherFamilies = () => this.distinctProposals ? Array.from(new Set([
            ...(this.sharedReserves ? [] : Array.from(this.proposals.values()).filter(p => p.slot !== slot).map(p => p.status === "ready" ? p.bundle?.family : this.input.planning?.offers[p.slot]?.family)),
            ...Array.from(this.replacementOwners).filter(([, owner]) => owner !== slot).map(([family]) => family),
          ].filter((family): family is string => Boolean(family)))) : [];
          recovered = await this.deps.recoverDelivery!(proposalInput,
            previousFailure?.stage === "copy" && ["artwork_unusable", "proposal_visual_duplicate"].includes(previousFailure.code), {
            recoveryAttempt: attemptIndex,
            lastChance: this.input.generationConfig?.textRecoveryVersion === 1 && attemptIndex === attemptLimit-1 &&
              (this.sharedReserves || !Array.from(this.proposals.values()).some(p=>p.status==="ready")),
            excludedCandidateIds: Array.from(triedCandidateIds),
            excludedFamilies: otherFamilies(),
            sourceDefinitions,
            sourceAttemptId,
            claimFamily: family => {
              if (!this.distinctProposals) return true;
              if (this.sharedReserves && this.replacementOwners.get(family) === slot) return true;
              if (otherFamilies().includes(family)) return false;
              if (this.sharedReserves) this.releaseCandidate(slot);
              // Synchronous claim after measurement, before another slot can
              // choose the same replacement; AI execution remains concurrent.
              this.replacementOwners.set(family, slot);
              return true;
            },
          });
          if (!recovered) {
            if (!this.sharedReserves) break;
            this.releaseCandidate(slot);
            if (attemptIndex + 1 < attemptLimit) await this.waitForCandidate(slot, triedCandidateIds);
            if (this.input.signal?.aborted || (this.input.deadlineMs ?? Infinity) <= Date.now()) break;
            attemptIndex++;
            continue;
          }
          // A historical persisted decision may replay the failed original.
          // Keep that receipt immutable, then progress under the next key.
          if (triedCandidateIds.has(recovered.plan.candidateId)) { attemptIndex++; continue; }
          currentDefs = recovered.definitions;
          narrativePlan = recovered.plan;
          triedCandidateIds.add(narrativePlan.candidateId);
        } else if (this.input.reviewPolicyVersion === 10 && attemptIndex > 0) {
          const currentFamilies = Array.from(this.proposals.values()).filter(p => p.slot !== slot).map(p => p.status === "ready" ? p.bundle?.family : this.input.planning?.offers[p.slot]?.family).filter((v): v is string => typeof v === "string");
          if (this.distinctProposals) for (const [family, owner] of Array.from(this.replacementOwners))
            if (owner !== slot && !currentFamilies.includes(family)) currentFamilies.push(family);
          const replanned = await this.deps.replan?.(slot, attemptIndex, currentFamilies);
          if (!replanned) { attemptIndex++; continue; }
          if (replacementFamily && (!replanned.definitions.length || replanned.definitions.some(def => def.completeDesign?.family !== replacementFamily)))
            throw new Error("proposal_replacement_family_mismatch");
          currentDefs = replanned.definitions;
          narrativePlan = replanned.plan;
        }
        await this.update(proposalDeliverySchema.parse({ ...identity, status: attemptIndex ? "recovering" : "running", attempt,
          ...(deliveryRecovery && attemptIndex > 0 && previousFailure ? { failure: previousFailure } : {}),
        }));
        const runAttempt = (finalFit: boolean) => executeProposalWorkflow(
          {
            ...proposalInput,
            selectedDefinitions: currentDefs,
            narrativePlan,
            deliveryRecoveryEnabled: deliveryRecovery,
            finalFit,
            deferCopyRepair: !finalFit && !visualTextRepair && deliveryRecovery && (attemptIndex === 0 || !recovered?.recoveryCopy),
            recoveryCopy: recovered?.recoveryCopy,
            recoverySourceCopy: recovered?.recoverySourceCopy,
            rewriteForRecovery: recovered?.rewriteForRecovery,
            selectionReason: recovered ? "Composição compatível escolhida para recuperar a entrega." : narrativePlan?.reason ?? this.input.selectionReasons?.[slot],
            editorialApproach: narrativePlan?.editorialApproach ?? this.input.editorialApproaches?.[slot],
          },
          {
            ...this.deps,
            attemptId: effectiveProposalId,
            checkpoint: checkpointFor(attempt),
            recoveryOperationKeys:this.deps.recoveryOperationKeys ? ()=>this.deps.recoveryOperationKeys!(saved.proposalId,effectiveProposalId) : undefined,
            persistReviewExpectation:this.deps.expectationForProposal ? (key,expectation)=>this.deps.expectationForProposal!(effectiveProposalId,key,expectation) : undefined,
            reviewOperations: this.deps.reviewOperations ? ()=>this.deps.reviewOperations!(effectiveProposalId) : undefined,
            // Scope finalFitOperation per attemptId so reserve attempts never collide
            // with a previous family's receipt; proposal-wide paid budget is enforced via recoveryOperationKeys.
            finalFitOperation: this.deps.operationForProposal?.(effectiveProposalId),
            claimLayout: this.sharedReserves ? signature => this.claimLayout(slot, signature) : undefined,
            hasUncertainEffect: () => this.deps.uncertainOperations?.(saved.proposalId) ?? Promise.resolve(false),
            executeOperation:
              this.deps.operationForProposal?.(effectiveProposalId) ??
              this.deps.executeOperation,
          }
        );
        const atLimit = attemptIndex + 1 === attemptLimit;
        result = await runAttempt(finalFitEnabled && atLimit);
        retryFinalFit = finalFitEnabled && !atLimit && this.deps.operationForProposal &&
          result.failure?.code === "artwork_unusable" && result.failure.stage === "copy" &&
          canRepairOverflow(result.findings, this.sharedReserves)
          ? async () => proposalDeliverySchema.parse({ ...await runAttempt(true), attempt })
          : undefined;
        // Garantir que a entrega final preserve o proposalId canônico registrado para o slot
        result = proposalDeliverySchema.parse({
          ...result,
          proposalId: saved.proposalId,
          attempt,
        });
        sourceDefinitions = currentDefs;
        sourceAttemptId = effectiveProposalId;
      } catch (error) {
        retryFinalFit = undefined;
        result = proposalDeliverySchema.parse({
          ...identity,
          status: "failed",
          ...(this.distinctProposals ? { attempt } : {}),
          failure: failureFromError(error),
          errorReason: failureFromError(error).code,
        });
      }

      // Se a proposta ficou pronta, encerra o loop com sucesso
      if (result.status === "ready") {
        break;
      }

      const action=recoveryAction({uncertain:await this.deps.uncertainOperations?.(saved.proposalId),failure:result.failure,remainingMs:(this.input.deadlineMs??Infinity)-Date.now(),templateAttempts:attemptIndex+1,textRecoveries:1,formalRepairs:1,cancelled:result.status==="cancelled"||result.status==="expired"});
      if(action==="await_reconciliation" && (this.input.reviewPolicyVersion===9 || this.input.reviewPolicyVersion===10)){
        result=proposalDeliverySchema.parse({...result,status:"awaiting_reconciliation",attempt,completedAt:undefined});
        break;
      }
      if (this.sharedReserves) this.releaseCandidate(slot);
      const recoverableContent = deliveryRecovery && result.status === "failed" &&
        (["copy_response_invalid", "review_content_rejected", "content_requirement_unmet", "review_inconclusive", "review_response_invalid", "review_response_truncated"].includes(result.failure?.code ?? "") ||
          (this.sharedReserves && ["proposal_visual_duplicate", "catalog_component_ineligible", "llm_request_invalid"].includes(result.failure?.code ?? ""))) &&
        (this.input.deadlineMs ?? Infinity) > Date.now() && !this.input.signal?.aborted;
      if((action==="next_template" || recoverableContent || this.input.reviewPolicyVersion!==9 && this.input.reviewPolicyVersion!==10 && result.status==="failed" && !["proposal_cancelled","generation_deadline_exceeded"].includes(result.errorReason??"")) && attemptIndex+1<attemptLimit){
        await this.firstDeliveryQueue?.nextAttempt(slot,result.findings?.length || Number.MAX_SAFE_INTEGER);
        if(this.input.signal?.aborted || (this.input.deadlineMs ?? Infinity)<=Date.now()) break;
        attemptIndex++;
        continue;
      }
      break;
    }
    if (retryFinalFit && result.status === "failed" && !this.input.signal?.aborted &&
        (this.input.deadlineMs ?? Infinity) > Date.now() && !await this.deps.uncertainOperations?.(saved.proposalId)) {
      result = await retryFinalFit();
      if (result.status === "failed" && await this.deps.uncertainOperations?.(saved.proposalId)) {
        result = proposalDeliverySchema.parse({ ...result, status: "awaiting_reconciliation", completedAt: undefined });
      }
    }
    if (result.status === "planned") {
      const code = this.sharedReserves ? "selection_insufficient_fit" : "artwork_unusable";
      result = proposalDeliverySchema.parse({ ...identity, status: "failed", errorReason: code,
        failure: { code, stage: this.sharedReserves ? "selection" : "copy", retryable: false } });
    }
    const finalResult = result;
    if (finalResult.status === "ready" && this.deps.deliver) {
      await this.update(
        proposalDeliverySchema.parse({
          ...identity,
          status: "delivery_pending",
          ...(this.distinctProposals ? { attempt: finalResult.attempt } : {}),
        })
      );
      try {
        await this.deps.deliver(finalResult);
      } catch (error) {
        if (
          ["22023", "23503", "23514"].includes(
            String((error as { code?: string })?.code)
          )
        ) {
          await this.update(
            proposalDeliverySchema.parse({
              ...(({bundle, ...delivery}) => delivery)(finalResult as Extract<ProposalDelivery,{status:"ready"}>),
              status: "failed",
              failure: {code:"catalog_component_ineligible",stage:"delivery",retryable:false},
              errorReason: "catalog_component_ineligible",
            })
          );
          if (this.sharedReserves) this.releaseCandidate(slot);
          return;
        }
        await this.update(
          proposalDeliverySchema.parse({
            ...(({bundle, ...delivery}) => delivery)(finalResult as Extract<ProposalDelivery,{status:"ready"}>),
            status: "delivery_pending",
            errorReason:
              error instanceof Error ? error.message : "Entrega pendente",
          })
        );
        return;
      }
    }
    await this.update(
      finalResult,
      !(finalResult.status === "ready" && this.deps.deliver)
    );
    if (this.sharedReserves && ["failed", "expired", "cancelled"].includes(finalResult.status))
      this.releaseCandidate(slot);
  }
  start(options: { maxConcurrency?: 1 | 3 } = {}): Promise<GenerationCoordinatorSnapshot> {
    // Multiple callers in one process share one invocation; restarts use persisted checkpoints.
    if (this.started) return this.started;
    if (options.maxConcurrency !== undefined && ![1, 3].includes(options.maxConcurrency))
      throw new Error("invalid_proposal_concurrency");
    if (this.input.generationConfig?.textRecoveryVersion === 1 && options.maxConcurrency !== 1 &&
        !Array.from(this.proposals.values()).some(p=>p.status==="ready"))
      this.firstDeliveryQueue = new FirstDeliveryQueue([0,1,2]);
    const runIsolated = async (slot: number) => {
      this.executingSlots.add(slot);
      try {
        await this.runProposal(slot);
      } catch (error) {
        // An unavailable checkpoint/ambiguous commit cannot finalize sibling work.
        // The durable lease/journal owns recovery; no new paid effect is started here.
        const previous = this.proposals.get(slot)!;
        if (previous.status !== "ready")
          this.proposals.set(
            slot,
            proposalDeliverySchema.parse({
              ...previous,
              status: "delivery_pending",
              errorReason:
                error instanceof Error
                  ? error.message
                  : "Checkpoint indisponível",
            })
          );
      }
      this.firstDeliveryQueue?.finish(slot,this.proposals.get(slot)?.status==="ready");
      this.executingSlots.delete(slot);
      if (this.sharedReserves) this.notifyReserveChange();
      return { finished: [slot] };
    };
    const State = Annotation.Root({
      finished: Annotation<number[]>({
        reducer: (a, b) => [...a, ...b],
        default: () => [],
      }),
    });
    const builder = new StateGraph(State)
      .addNode("proposal_a", async () => {
        return runIsolated(0);
      })
      .addNode("proposal_b", async () => {
        return runIsolated(1);
      })
      .addNode("proposal_c", async () => {
        return runIsolated(2);
      });
    // Explicit graph ordering schedules the whole proposal before its workflow
    // creates review deadlines. Product callers retain the ordinary fan-out.
    const graph = (options.maxConcurrency === 1
      ? builder.addEdge(START, "proposal_a").addEdge("proposal_a", "proposal_b")
          .addEdge("proposal_b", "proposal_c").addEdge("proposal_c", END)
      : builder.addEdge(START, "proposal_a").addEdge(START, "proposal_b")
          .addEdge(START, "proposal_c").addEdge("proposal_a", END)
          .addEdge("proposal_b", END).addEdge("proposal_c", END)).compile();
    this.started = graph
      // Evaluation can bound whole graph nodes before any proposal work starts.
      // The application omits this option and retains its normal three-way fan-out.
      // No transport is queued inside a running review's phase deadline.
      .invoke({ finished: [] }, { signal: this.input.signal })
      .then(() => this.getSnapshot());
    return this.started;
  }
}
