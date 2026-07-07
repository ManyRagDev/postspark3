import type {
  HighTicketGraphState,
  HighTicketGraphStatus,
  HighTicketPipelineInput,
  HighTicketPipelineResult,
  WorkerPayload,
} from "@shared/highTicket";
import { getUserPosts } from "../../db";
import { loadHighTicketContext } from "./contextLoader";
import { routeHighTicketIntent } from "./intentRouter";
import { runHighTicketWorkers } from "./workers";
import { assessHighTicketOriginality, persistHighTicketFingerprints } from "./semanticOriginality";
import { evaluateHighTicketQa } from "./qaEvaluator";
import { reviseRejectedPayloads } from "./correctionLoop";
import { validateVisualContract } from "./visualContractValidator";
import { mapWorkerPayloadsToPostVariations } from "./finalMapper";
import { createHighTicketRun, persistHighTicketGraphState } from "./persist";
import { synthesizeHighTicketCaptions } from "./captionSynthesis";

const MAX_CORRECTION_ATTEMPTS = 2;

function now() {
  return new Date().toISOString();
}

function createInitialState(input: HighTicketPipelineInput): HighTicketGraphState {
  return {
    runId: input.runId,
    status: "created",
    attempt: 0,
    input: {
      inputType: input.inputType,
      content: input.content,
      platform: input.platform,
      postMode: input.postMode,
      creationMode: input.creationMode,
      executionBrief: input.executionBrief,
    },
    workers: [],
    qa: [],
    control: {
      maxCorrectionAttempts: MAX_CORRECTION_ATTEMPTS,
    },
    events: [
      {
        at: now(),
        status: "created",
        detail: "High Ticket graph initialized.",
      },
    ],
  };
}

async function transition(input: {
  userUuid: string;
  state: HighTicketGraphState;
  status: HighTicketGraphStatus;
  detail: string;
  data?: unknown;
}): Promise<void> {
  input.state.status = input.status;
  input.state.events.push({
    at: now(),
    status: input.status,
    detail: input.detail,
    data: input.data,
  });
  await persistHighTicketGraphState({ userUuid: input.userUuid, state: input.state });
}

function assertExactlyThree(payloads: WorkerPayload[]): void {
  if (payloads.length !== 3) {
    throw new Error(`High Ticket graph requires exactly 3 payloads, received ${payloads.length}.`);
  }
}

export async function runHighTicketGraph(
  input: HighTicketPipelineInput,
): Promise<HighTicketPipelineResult> {
  const state = createInitialState(input);
  await createHighTicketRun(input);
  await persistHighTicketGraphState({ userUuid: input.userUuid, state });

  try {
    state.context = await loadHighTicketContext(input);
    await transition({
      userUuid: input.userUuid,
      state,
      status: state.context.compressed ? "context_compressed" : "context_loaded",
      detail: state.context.compressed ? "Context loaded and compressed." : "Context loaded.",
      data: {
        compressed: state.context.compressed,
        fallbackNotes: state.context.fallbackNotes,
        compressionNotes: state.context.compressionNotes,
      },
    });

    state.routing = await routeHighTicketIntent(state.context);
    await transition({
      userUuid: input.userUuid,
      state,
      status: "routed",
      detail: "Intent router produced 3 angle assignments.",
      data: state.routing,
    });

    state.workers = await runHighTicketWorkers({
      briefing: state.context,
      angles: state.routing.angles,
    });
    assertExactlyThree(state.workers);
    await transition({
      userUuid: input.userUuid,
      state,
      status: "workers_completed",
      detail: "Workers produced 3 atomic payloads.",
    });

    const recentPosts = await getUserPosts(input.userUuid, 20).catch(() => []);
    let revisedIndexes: number[] = [];
    let revisionFailedIndexes: number[] = [];

    state.originality = await assessHighTicketOriginality({
      runId: input.runId,
      userUuid: input.userUuid,
      briefing: state.context,
      angles: state.routing.angles,
      payloads: state.workers,
      recentPosts,
    });
    await transition({
      userUuid: input.userUuid,
      state,
      status: "originality_completed",
      detail: "Semantic originality assessed (initial).",
      data: { fallbackUsed: state.originality.fallbackUsed },
    });

    while (true) {
      const qa = await evaluateHighTicketQa({
        runId: input.runId,
        briefing: state.context,
        angles: state.routing.angles,
        payloads: state.workers,
        originality: state.originality,
      });
      state.qa = qa.results;
      await transition({
        userUuid: input.userUuid,
        state,
        status: "qa_completed",
        detail: `${qa.acceptedIndexes.length}/3 payloads approved by QA.`,
        data: state.qa,
      });

      if (qa.rejectedIndexes.length === 0) break;
      if (state.attempt >= MAX_CORRECTION_ATTEMPTS) {
        throw new Error(`QA rejected ${qa.rejectedIndexes.length} payload(s) after max attempts.`);
      }

      state.attempt += 1;
      const revised = await reviseRejectedPayloads({
        briefing: state.context,
        payloads: state.workers,
        qa: state.qa,
        rejectedIndexes: qa.rejectedIndexes,
      });
      state.workers = revised.payloads;
      revisedIndexes = Array.from(new Set([...revisedIndexes, ...revised.revisedIndexes]));
      revisionFailedIndexes = Array.from(new Set([...revisionFailedIndexes, ...revised.revisionFailedIndexes]));
      await transition({
        userUuid: input.userUuid,
        state,
        status: "revision_completed",
        detail: `Correction attempt ${state.attempt} completed.`,
        data: { revisedIndexes, revisionFailedIndexes },
      });

      // Recalculate originality only after real revision
      state.originality = await assessHighTicketOriginality({
        runId: input.runId,
        userUuid: input.userUuid,
        briefing: state.context,
        angles: state.routing.angles,
        payloads: state.workers,
        recentPosts,
      });
      await transition({
        userUuid: input.userUuid,
        state,
        status: "originality_completed",
        detail: "Semantic originality reassessed after revision.",
        data: { fallbackUsed: state.originality.fallbackUsed },
      });
    }

    const visual = validateVisualContract({
      payloads: state.workers,
      briefing: state.context,
      postMode: input.postMode,
    });
    if (!visual.valid) {
      throw new Error(`Visual contract failed: ${visual.issues.map((item) => item.message).join("; ")}`);
    }
    await transition({
      userUuid: input.userUuid,
      state,
      status: "visual_contract_validated",
      detail: "Visual contract validator approved all payloads.",
      data: visual,
    });

    let variations = mapWorkerPayloadsToPostVariations({
      payloads: state.workers,
      angles: state.routing.angles,
      briefing: state.context,
      runId: input.runId,
      evaluations: state.qa.map((item) => item.evaluation),
      originality: state.originality.assessments,
      revisionCount: state.attempt,
      revisedIndexes,
      revisionFailedIndexes,
    });
    try {
      variations = await synthesizeHighTicketCaptions({
        variations,
        platform: input.platform,
        postMode: input.postMode,
        tone: state.context.brand.toneOfVoice,
        angles: state.routing.angles,
      });
      await transition({
        userUuid: input.userUuid,
        state,
        status: "caption_synthesized",
        detail: "Captions synthesized from final visual content.",
      });
    } catch (error) {
      await transition({
        userUuid: input.userUuid,
        state,
        status: "caption_synthesized",
        detail: "Caption synthesis failed; worker captions preserved.",
        data: error instanceof Error ? error.message : String(error),
      });
    }
    if (variations.length !== 3) {
      throw new Error(`Final mapper produced ${variations.length} variations; expected 3.`);
    }
    state.output = { variations };
    await persistHighTicketFingerprints({
      runId: input.runId,
      userUuid: input.userUuid,
      briefing: state.context,
      angles: state.routing.angles,
      payloads: state.workers,
      originality: state.originality,
      variations,
    });
    await transition({
      userUuid: input.userUuid,
      state,
      status: "completed",
      detail: "High Ticket graph completed with 3 approved variations.",
      data: { variationCount: variations.length },
    });

    return { generationRunId: input.runId, variations, graphState: state };
  } catch (error) {
    state.control.failedReason = error instanceof Error ? error.message : String(error);
    await transition({
      userUuid: input.userUuid,
      state,
      status: "failed",
      detail: "High Ticket graph failed.",
      data: state.control.failedReason,
    });
    throw error;
  }
}
