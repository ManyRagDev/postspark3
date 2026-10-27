import { describe, it, expect, vi, afterEach } from "vitest";
import { ENV } from "../../_core/env";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { proposalReviewRecordSchema } from "@shared/proposalReview";
import {
  applyReviewCorrections,
  corroboratesTextCorrection,
  reviewProposal,
  type ReviewCopy,
  type RenderReviewScenes,
} from "./proposalReview";
import type {
  ProposalExecutionInput,
  ProposalGraphDeps,
} from "./proposalGraph";

vi.mock("./proposalRenderer", () => ({ renderReviewScenes: undefined }));

const actor = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";
const definitions = [completeDesignTestDefinitions()[0]];
const input: ProposalExecutionInput = {
  requestId: "private-request",
  runId,
  proposalId: "private-proposal",
  slot: 0,
  prompt: "Evento começa às 12h",
  sourceReferences: [
    {
      url: "https://private.test/?token=secret",
      facts: "Evento começa às 12h",
    },
  ],
  referenceImages: ["https://private.test/image?token=secret"],
};
const copy: ReviewCopy = {
  caption: "Legenda original",
  hashtags: ["#evento"],
  slides: [
    {
      values: [
        { fieldId: "field-0", value: "Evento começa às 13h" },
        { fieldId: "field-1", value: "Apoio saudável" },
      ],
      mediaPrompts: [],
    },
  ],
};
const compositions = [
  instantiateCompleteDesign({
    definition: definitions[0],
    values: copy.slides[0].values,
    mediaPrompts: [],
    runId,
    slot: 0,
    slide: 0,
    planHash: "a".repeat(64),
    experimental: true,
  }),
];
const renderReviewScenes: RenderReviewScenes = async ({ compositions }) =>
  compositions.map((_scene, slideIndex) => ({
    slideIndex,
    renderer: "CanvasPostStage",
    width: 864,
    height: 1080,
    dataUri: "data:image/png;base64,aW1hZ2U=",
  }));
const reply = (response: unknown) =>
  ({ choices: [{ message: { content: JSON.stringify(response) } }] }) as any;
const clean = {
  outcome: "reviewed",
  reviewedSlides: [0],
  findings: [],
  limitation: "",
};
const contradiction = {
  category: "factual_contradiction",
  slideIndex: 0,
  fieldId: "field-0",
  observed: "Evento começa às 13h",
  expected: "Evento começa às 12h",
  sourceQuote: "Evento começa às 12h",
  explanation: "Horário difere da fonte fornecida",
  action: "replace_text",
} as const;
const deps = (response: unknown = clean): ProposalGraphDeps => ({
  actor,
  generateText: vi.fn(async () => reply(response)),
  renderReviewScenes,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("required evidence-based proposal review", () => {
  it("sends the complete rendered sequence using the multimodal route and excludes private references", async () => {
    const d = deps();
    const record = await reviewProposal(
      input,
      d,
      definitions,
      compositions,
      copy,
      "initial"
    );
    expect(record.status).toBe("passed");
    expect(proposalReviewRecordSchema.safeParse(record).success).toBe(true);
    const call = vi.mocked(d.generateText).mock.calls[0][0];
    expect(call).toMatchObject({
      taskRoute: "post_evaluation",
      maxTransportAttempts: 1,
      disableFallback: true,
      disableStructuredRepair: true,
    });
    expect(call.model).toBeUndefined();
    expect(JSON.stringify(call.messages)).toContain("image_url");
    expect(JSON.stringify(call.messages)).toContain("Evento começa às 12h");
    expect(JSON.stringify(call.messages)).not.toContain("private.test");
    expect(JSON.stringify(call.messages)).not.toContain(actor);
    expect(JSON.stringify(record)).not.toContain("data:image");
  });

  it.each([
    null,
    { ...clean, reviewedSlides: [] },
    {
      ...clean,
      outcome: "inconclusive",
      limitation: "Não consigo ler o slide",
    },
    { ...clean, reviewedSlides: [0, 0] },
  ])(
    "does not certify malformed/inconclusive/incomplete responses: %j",
    async response => {
      expect(
        (
          await reviewProposal(
            input,
            deps(response),
            definitions,
            compositions,
            copy,
            "initial"
          )
        ).status
      ).toBe("inconclusive");
    }
  );

  it("keeps aesthetic and uncorroborated visual/factual opinions diagnostic", async () => {
    for (const finding of [
      { ...contradiction, category: "aesthetic", explanation: "Sem impacto" },
      {
        ...contradiction,
        category: "contrast",
        explanation: "Parece ilegível",
      },
      {
        ...contradiction,
        sourceQuote: "Evento começa às 99h",
        expected: "Evento começa às 99h",
      },
      {
        ...contradiction,
        expected: "Outro conceito",
        sourceQuote: "Outro conceito",
      },
      { ...contradiction, fieldId: "nonexistent" },
    ]) {
      const record = await reviewProposal(
        input,
        deps({ ...clean, findings: [finding] }),
        definitions,
        compositions,
        copy,
        "initial"
      );
      expect(record.status).toBe("passed");
      expect(record.findings[0].authority).toBe("diagnostic");
    }
  });

  it("accepts only exact scalar field numeric contradictions backed by an exact supplied source", async () => {
    const record = await reviewProposal(
      input,
      deps({ ...clean, findings: [contradiction] }),
      definitions,
      compositions,
      copy,
      "initial"
    );
    expect(record.status).toBe("correction_required");
    expect(record.findings[0].authority).toBe("corroborated");
    const changed = applyReviewCorrections(copy, record);
    expect(changed.slides[0].values[0].value).toBe("Evento começa às 12h");
    expect(changed.slides[0].values[1]).toBe(copy.slides[0].values[1]);
    expect(changed.caption).toBe(copy.caption);
    expect(changed.hashtags).toBe(copy.hashtags);
    expect(changed.slides[0].mediaPrompts).toBe(copy.slides[0].mediaPrompts);
    expect(
      corroboratesTextCorrection(
        { ...contradiction, observed: "13h" },
        copy,
        input
      )
    ).toBe(false);
    expect(
      corroboratesTextCorrection(contradiction, copy, {
        ...input,
        prompt: "Evento começa às 13h",
      })
    ).toBe(false);
    expect(
      corroboratesTextCorrection(contradiction, copy, {
        ...input,
        contextContent: "Evento começa às 14h",
      })
    ).toBe(false);
    expect(
      corroboratesTextCorrection(contradiction, copy, {
        ...input,
        executionBrief: { interventionLevel: "visual_only" } as any,
      })
    ).toBe(false);
  });

  it.each([
    "É falso que Evento começa às 12h. O horário ainda não foi divulgado.",
    "Não é verdade que Evento começa às 12h.",
    "Se Evento começa às 12h, o aviso será atualizado.",
    "Talvez Evento começa às 12h.",
    'A fonte escreveu "Evento começa às 12h", sem confirmar.',
    "It is untrue that Evento começa às 12h.",
    // Even an unknown attribution/negation phrase cannot gain authority by excerpt.
    "Refutação: Evento começa às 12h.",
  ])(
    "does not authorize an excerpt of ambiguous/negated facts: %s",
    async facts => {
      const ambiguousInput = {
        ...input,
        sourceReferences: [{ facts }],
      };
      expect(
        corroboratesTextCorrection(contradiction, copy, ambiguousInput)
      ).toBe(false);
      const record = await reviewProposal(
        ambiguousInput,
        deps({ ...clean, findings: [contradiction] }),
        definitions,
        compositions,
        copy,
        "initial"
      );
      expect(record.findings[0].authority).toBe("diagnostic");
      expect(applyReviewCorrections(copy, record)).toEqual(copy);
    }
  );

  it("requires a complete user assertion plus a matching complete facts/context field", () => {
    expect(
      corroboratesTextCorrection(contradiction, copy, {
        ...input,
        prompt: "Crie um post sobre o evento",
      })
    ).toBe(false);
    expect(
      corroboratesTextCorrection(contradiction, copy, {
        ...input,
        sourceReferences: [],
      })
    ).toBe(false);
    expect(
      corroboratesTextCorrection(contradiction, copy, {
        ...input,
        sourceReferences: [],
        contextContent: "Evento começa às 12h",
      })
    ).toBe(true);
  });

  it.each([
    "É falso que Evento começa às 12h. O horário ainda não foi divulgado.",
    "Evento começa às 14h",
    "Evento começa às 13h",
    "O horário é incerto.",
    "O horário correto é 14h", // Different wording is still unresolved context.
    "Na verdade, será à tarde.",
    "Refutação: Evento começa às 12h.",
  ])(
    "refuses conflicting or ambiguous context even alongside complete matching assertions: %s",
    contextContent => {
      expect(
        corroboratesTextCorrection(contradiction, copy, {
          ...input,
          contextContent,
        })
      ).toBe(false);
    }
  );

  it("refuses an explicitly negated complete assertion and ambiguous brief notes", () => {
    const expected = "Evento não começa às 12h";
    const observed = "Evento não começa às 13h";
    const negatedCopy = structuredClone(copy);
    negatedCopy.slides[0].values[0].value = observed;
    expect(
      corroboratesTextCorrection(
        { ...contradiction, observed, expected, sourceQuote: expected },
        negatedCopy,
        { ...input, prompt: expected, sourceReferences: [{ facts: expected }] }
      )
    ).toBe(false);
    expect(
      corroboratesTextCorrection(contradiction, copy, {
        ...input,
        executionBrief: { notes: "O horário ainda não foi divulgado." } as any,
      })
    ).toBe(false);
  });

  it("reuses durable review effects and invalidates cache for a different rendered scene or brief", async () => {
    const d = deps();
    const saved = new Map<string, unknown>();
    d.executeOperation = async ({ operationKey }, work) => {
      if (saved.has(operationKey)) return saved.get(operationKey) as any;
      const value = await work();
      saved.set(operationKey, value);
      return value;
    };
    const first = await reviewProposal(
      input,
      d,
      definitions,
      compositions,
      copy,
      "initial"
    );
    const repeated = await reviewProposal(
      input,
      d,
      definitions,
      compositions,
      copy,
      "initial"
    );
    expect(first.inputHash).toBe(repeated.inputHash);
    expect(d.generateText).toHaveBeenCalledTimes(1);
    const changed = await reviewProposal(
      { ...input, contextContent: "Novo fato" },
      d,
      definitions,
      compositions,
      copy,
      "initial"
    );
    expect(changed.inputHash).not.toBe(first.inputHash);
    d.renderReviewScenes = async request =>
      (await renderReviewScenes(request)).map(s => ({
        ...s,
        dataUri: "data:image/png;base64,b3V0cmE=",
      }));
    expect(
      (
        await reviewProposal(
          input,
          d,
          definitions,
          compositions,
          copy,
          "initial"
        )
      ).inputHash
    ).not.toBe(first.inputHash);
    expect(d.generateText).toHaveBeenCalledTimes(3);
    expect(
      [...saved.keys()].every(key => /^review:initial:[a-f0-9]{64}$/.test(key))
    ).toBe(true);
    const revision = await reviewProposal(
      { ...input, revision: 2 },
      d,
      definitions,
      compositions,
      copy,
      "initial"
    );
    expect(revision.inputHash).not.toBe(first.inputHash);
    expect(d.generateText).toHaveBeenCalledTimes(4);
  });

  it("does not pay when renderer is missing, returns remote URLs or omits slides", async () => {
    for (const renderer of [
      undefined,
      async () => [],
      async () => [
        {
          slideIndex: 0,
          renderer: "CanvasPostStage",
          width: 864,
          height: 1080,
          dataUri: "https://private.test/?token=secret",
        },
      ],
    ]) {
      const d = {
        ...deps(),
        renderReviewScenes: renderer as RenderReviewScenes | undefined,
      };
      const record = await reviewProposal(
        input,
        d,
        definitions,
        compositions,
        copy,
        "initial"
      );
      expect(record.status).toBe("inconclusive");
      expect(d.generateText).not.toHaveBeenCalled();
      expect(record.limitation).not.toContain("secret");
    }
  });

  it("bounds review transport even when an injected provider ignores cancellation", async () => {
    vi.useFakeTimers();
    const d = deps();
    d.generateText = vi.fn(() => new Promise(() => undefined));
    const pending = reviewProposal(
      input,
      d,
      definitions,
      compositions,
      copy,
      "initial"
    );
    await vi.advanceTimersByTimeAsync(ENV.proposalReviewTimeoutMs + 1);
    expect((await pending).limitation).toBe("proposal_review_timeout");
  });

  it("records uncertain durable operations without dispatching another paid review", async () => {
    const d = deps();
    d.executeOperation = vi.fn(async () => {
      throw new Error("reconciliation_required:private-operation-id");
    });
    const result = await reviewProposal(
      input,
      d,
      definitions,
      compositions,
      copy,
      "initial"
    );
    expect(result.status).toBe("inconclusive");
    expect(result.limitation).toBe("proposal_review_reconciliation_required");
    expect(result.limitation).not.toContain("private-operation-id");
    expect(d.generateText).not.toHaveBeenCalled();
  });

  it("prevents review work after deadline or user cancellation and aborts an in-flight provider", async () => {
    const d = deps();
    await expect(
      reviewProposal(
        { ...input, deadlineMs: Date.now() - 1 },
        d,
        definitions,
        compositions,
        copy,
        "initial"
      )
    ).rejects.toThrow("proposal_deadline_expired");
    expect(d.generateText).not.toHaveBeenCalled();
    const controller = new AbortController();
    d.generateText = vi.fn(async ({ signal }) => {
      controller.abort(new Error("generation_cancelled"));
      signal?.throwIfAborted();
      return reply(clean);
    });
    await expect(
      reviewProposal(
        { ...input, signal: controller.signal },
        d,
        definitions,
        compositions,
        copy,
        "initial"
      )
    ).rejects.toThrow("generation_cancelled");
  });
});
