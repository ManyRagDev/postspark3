import { recoveryAction } from "./generationRecovery";
import { failureFromError } from "@shared/generationFailure";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import {
  generationCoordinatorSnapshotSchema,
  proposalDeliverySchema,
  type GenerationCoordinatorSnapshot,
  type ProposalDelivery,
} from "@shared/generationContracts";
import {
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
  selectionReasons?: string[];
  editorialApproaches?: Array<string | null>;
  perProposalImageObligations?: ProposalExecutionInput["imageObligation"][];
}
export interface GenerationCoordinatorDeps extends ProposalGraphDeps {
  replan?: (slot: number, attempt: number, currentFamilies: string[]) => Promise<{ definitions: ComponentDefinitionV1[]; plan: import("@shared/generationPlan").ViableGenerationPlan } | null>;
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
  private started?: Promise<GenerationCoordinatorSnapshot>;
  private definitions: ComponentDefinitionV1[][];
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
    if (slotPlan && slotPlan.status !== "viable") {
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
    const checkpoint: ProposalGraphDeps["checkpoint"] = async (
      stage,
      context
    ) => {
      await this.deps.checkpoint?.(stage, context);
      const state =
        stage === "recovering"
          ? "recovering"
          : stage.includes("check") || stage.includes("validation")
            ? "checking"
            : "running";
      await this.update(
        proposalDeliverySchema.parse({ ...identity, status: state })
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
    let attemptIndex = saved.attempt?.index ?? 0;
    const plannedRecoveryCount = this.input.planning?.recoveryRepertoires[slot]?.length ?? 0;
    const attemptLimit = this.input.reviewPolicyVersion === 10 ? 1 + plannedRecoveryCount : candidates.length;
    while (attemptIndex < attemptLimit) {
      let currentDefs = candidates[attemptIndex];
      let narrativePlan = slotPlan?.status === "viable" ? slotPlan : undefined;
      const attemptSuffix = attemptIndex === 0 ? "" : `-fb${attemptIndex}`;
      const effectiveProposalId = `${saved.proposalId}${attemptSuffix}`;
      const attempt = {index:attemptIndex,id:effectiveProposalId};
      await this.update(proposalDeliverySchema.parse({...identity,status:attemptIndex?"recovering":"running",attempt}));
      try {
        if (this.input.reviewPolicyVersion === 10 && attemptIndex > 0) {
          const currentFamilies = Array.from(this.proposals.values()).filter(p => p.slot !== slot).map(p => p.status === "ready" ? p.bundle.family : this.input.planning?.offers[p.slot]?.family).filter((v): v is string => typeof v === "string");
          const replanned = await this.deps.replan?.(slot, attemptIndex, currentFamilies);
          if (!replanned) { attemptIndex++; continue; }
          currentDefs = replanned.definitions;
          narrativePlan = replanned.plan;
        }
        result = await executeProposalWorkflow(
          {
            ...this.input,
            selectedDefinitions: currentDefs,
            narrativePlan,
            generationIntent: this.input.planning?.intent,
            ...(this.input.planning?.intent.editorial ? { editorialCatalog: this.input.planning.editorialCatalog ?? null } : {}),
            selectionReason: narrativePlan?.reason ?? this.input.selectionReasons?.[slot],
            editorialApproach: narrativePlan?.editorialApproach ?? this.input.editorialApproaches?.[slot],
            imageObligation:
              this.input.perProposalImageObligations?.[slot] ??
              this.input.imageObligation,
            proposalId: saved.proposalId,
            slot,
            revision: saved.revision,
          },
          {
            ...this.deps,
            checkpoint: async(stage,context)=>{await checkpoint?.(stage,context);await this.update(proposalDeliverySchema.parse({...identity,status:stage==="recovering"?"recovering":"running",attempt}));},
            recoveryOperationKeys:this.deps.recoveryOperationKeys ? ()=>this.deps.recoveryOperationKeys!(saved.proposalId,effectiveProposalId) : undefined,
            persistReviewExpectation:this.deps.expectationForProposal ? (key,expectation)=>this.deps.expectationForProposal!(effectiveProposalId,key,expectation) : undefined,
            reviewOperations: this.deps.reviewOperations ? ()=>this.deps.reviewOperations!(effectiveProposalId) : undefined,
            executeOperation:
              this.deps.operationForProposal?.(effectiveProposalId) ??
              this.deps.executeOperation,
          }
        );
        // Garantir que a entrega final preserve o proposalId canônico registrado para o slot
        result = proposalDeliverySchema.parse({
          ...result,
          proposalId: saved.proposalId,
          attempt,
        });
      } catch (error) {
        result = proposalDeliverySchema.parse({
          ...identity,
          status: "failed",
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
      if((action==="next_template" || this.input.reviewPolicyVersion!==9 && this.input.reviewPolicyVersion!==10 && result.status==="failed" && !["proposal_cancelled","generation_deadline_exceeded"].includes(result.errorReason??"")) && attemptIndex+1<attemptLimit){attemptIndex++;continue;}
      break;
    }
    const finalResult = result.status === "planned" ? proposalDeliverySchema.parse({ ...identity, status: "failed", errorReason: "artwork_unusable", failure: { code: "artwork_unusable", stage: "copy", retryable: false } }) : result;
    if (finalResult.status === "ready" && this.deps.deliver) {
      await this.update(
        proposalDeliverySchema.parse({
          ...identity,
          status: "delivery_pending",
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
  }
  start(options: { maxConcurrency?: 1 | 3 } = {}): Promise<GenerationCoordinatorSnapshot> {
    // Multiple callers in one process share one invocation; restarts use persisted checkpoints.
    if (this.started) return this.started;
    if (options.maxConcurrency !== undefined && ![1, 3].includes(options.maxConcurrency))
      throw new Error("invalid_proposal_concurrency");
    const runIsolated = async (slot: number) => {
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
