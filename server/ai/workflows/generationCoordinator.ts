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
  actor: string;
  savedProposals?: ProposalDelivery[];
  selectionReasons?: string[];
}
export interface GenerationCoordinatorDeps extends ProposalGraphDeps {
  persistUpdate?: (delivery: ProposalDelivery) => Promise<void>;
  /** Authorize exact assets and settle the configured billing policy before public ready. */
  deliver?: (
    delivery: Extract<ProposalDelivery, { status: "ready" }>
  ) => Promise<void>;
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
    const ready = proposals.filter(p => p.status === "ready").length;
    return generationCoordinatorSnapshotSchema.parse({
      requestId: this.input.requestId,
      runId: this.input.runId,
      overallStatus: active
        ? "running"
        : ready === proposals.length
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
        stage.includes("check") || stage.includes("validation")
          ? "checking"
          : "running";
      await this.update(
        proposalDeliverySchema.parse({ ...identity, status: state })
      );
    };
    let result: ProposalDelivery;
    try {
      result = await executeProposalWorkflow(
        {
          ...this.input,
          selectedDefinitions: this.definitions[slot],
          selectionReason: this.input.selectionReasons?.[slot],
          proposalId: saved.proposalId,
          slot,
          revision: saved.revision,
        },
        {
          ...this.deps,
          checkpoint,
          executeOperation:
            this.deps.operationForProposal?.(saved.proposalId) ??
            this.deps.executeOperation,
        }
      );
    } catch (error) {
      result = proposalDeliverySchema.parse({
        ...identity,
        status: "failed",
        errorReason:
          error instanceof Error ? error.message : "Falha operacional",
      });
    }
    if (result.status === "ready" && this.deps.deliver) {
      await this.update(
        proposalDeliverySchema.parse({
          ...identity,
          status: "delivery_pending",
        })
      );
      try {
        await this.deps.deliver(result);
      } catch (error) {
        if (
          ["22023", "23503", "23514"].includes(
            String((error as { code?: string })?.code)
          )
        ) {
          await this.update(
            proposalDeliverySchema.parse({
              ...identity,
              status: "failed",
              errorReason:
                error instanceof Error
                  ? error.message
                  : "Composição não elegível para entrega",
            })
          );
          return;
        }
        await this.update(
          proposalDeliverySchema.parse({
            ...identity,
            status: "delivery_pending",
            errorReason:
              error instanceof Error ? error.message : "Entrega pendente",
          })
        );
        return;
      }
    }
    await this.update(
      result,
      !(result.status === "ready" && this.deps.deliver)
    );
  }
  start(): Promise<GenerationCoordinatorSnapshot> {
    // Multiple callers in one process share one invocation; restarts use persisted checkpoints.
    if (this.started) return this.started;
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
    const graph = new StateGraph(State)
      .addNode("proposal_a", async () => {
        return runIsolated(0);
      })
      .addNode("proposal_b", async () => {
        return runIsolated(1);
      })
      .addNode("proposal_c", async () => {
        return runIsolated(2);
      })
      .addEdge(START, "proposal_a")
      .addEdge(START, "proposal_b")
      .addEdge(START, "proposal_c")
      .addEdge("proposal_a", END)
      .addEdge("proposal_b", END)
      .addEdge("proposal_c", END)
      .compile();
    this.started = graph
      .invoke({ finished: [] }, { signal: this.input.signal })
      .then(() => this.getSnapshot());
    return this.started;
  }
}
