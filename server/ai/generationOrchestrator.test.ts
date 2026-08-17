import { describe, expect, it, vi } from "vitest";
import {
  generatePostVariations,
  type GenerationRequest,
  type OrchestratorDeps,
  type OrchestratorInput,
} from "./generationOrchestrator";
import type { InvokeParams, InvokeResult } from "../_core/llm";
import type { PreparedGenerationPlan } from "./generationPipeline";
import type { ContentStrategy, ContentStrategyPlan } from "./contentStrategy";
import type { OriginalityResult } from "./semanticOriginality";
import { deriveIdempotencyKey } from "../billing";
import type { PostRecord } from "../db";
import type { GenerationDebugEvent } from "@shared/postspark";

// Juízes LLM desligados: os testes de orçamento contam apenas chamadas
// generativas via provider falso; a avaliação roda determinística.
vi.mock("../_core/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_core/env")>();
  return { ENV: { ...actual.ENV, aiLlmJudgeEnabled: false } };
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SOURCE_CONTENT = "cafe artesanal";

function strategy(index: number): ContentStrategy {
  return {
    id: `strategy-${index}`,
    title: `Estrategia ${index}`,
    topic: SOURCE_CONTENT,
    objective: "engage",
    audience: "publico principal",
    angle: (["pain", "benefit", "objection"] as const)[index % 3],
    hook: `${SOURCE_CONTENT}: o ponto que merece atencao agora`,
    promise: "Entregar uma perspectiva util e acionavel.",
    evidenceIds: [],
    score: { total: 80, topicRelevance: 80, objectiveAlignment: 80, evidenceGrounding: 80, distinctiveness: 80 },
  };
}

const VARIANT_STYLES = [
  {
    layout: "centered",
    tone: "Profissional",
    backgroundColor: "#1a1a2e",
    accentColor: "#FF5F1F",
    angleType: "autoridade",
    theme: "torra",
    headline: "Torra do cafe artesanal",
    body: "Acidez e doce preservados.",
    caption: "A torra define o sabor. Ponto de torra muda aroma, corpo e finalizacao da bebida artesanal.",
  },
  {
    layout: "left-aligned",
    tone: "Casual",
    backgroundColor: "#0f3460",
    accentColor: "#06B6D4",
    angleType: "beneficio",
    theme: "preparo",
    headline: "Metodos de preparo que elevam o cafe",
    body: "V60 e prensa francesa revelam notas diferentes do mesmo grao.",
    caption: "O preparo faz a diferenca. Voce conhece os metodos que extraem o melhor do cafe artesanal em cada xicara.",
  },
  {
    layout: "split",
    tone: "Criativo",
    backgroundColor: "#2d132c",
    accentColor: "#EC4899",
    angleType: "storytelling",
    theme: "moagem",
    headline: "A moagem certa muda tudo na bebida",
    body: "Granulometria adequada evita amargor e subextracao.",
    caption: "Moer na hora e o segredo. Ajustar a granulometria transforma por completo o resultado final da bebida.",
  },
];

function makeVariation(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const style = VARIANT_STYLES[(index - 1) % VARIANT_STYLES.length];
  return {
    headline: style.headline,
    body: style.body,
    hashtags: ["#cafe", "#artesanal"],
    callToAction: "Saiba mais agora",
    caption: style.caption,
    tone: style.tone,
    imagePrompt: "A premium artisan coffee cup with steam",
    backgroundColor: style.backgroundColor,
    textColor: "#ffffff",
    accentColor: style.accentColor,
    layout: style.layout,
    copyAngle: { type: style.angleType, label: `${style.theme} em foco`, badge: "Cafe", stickerText: style.theme },
    ...overrides,
  };
}

function carouselVariation(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...makeVariation(index),
    slides: Array.from({ length: 5 }, (_, slideIndex) => ({
      headline: `Slide ${slideIndex + 1} da variacao ${index}`,
      body: `Conteudo do slide ${slideIndex + 1} sobre cafe artesanal.`,
      slideNumber: slideIndex + 1,
      isTitleSlide: slideIndex === 0,
      isCtaSlide: slideIndex === 4,
    })),
    ...overrides,
  };
}

function makePlan(variations: Array<Record<string, unknown>>): PreparedGenerationPlan {
  const build = (variation: Record<string, unknown>, index: number): ContentStrategy => ({
    id: `strategy-${index + 1}`,
    title: `Estrategia ${index + 1}`,
    topic: SOURCE_CONTENT,
    objective: "engage",
    audience: "publico principal",
    angle: (["pain", "benefit", "objection"] as const)[index % 3],
    hook: String(variation.headline ?? ""),
    promise: String(variation.caption ?? "").slice(0, 80),
    evidenceIds: [],
    score: { total: 80, topicRelevance: 80, objectiveAlignment: 80, evidenceGrounding: 80, distinctiveness: 80 },
  });
  const selected = variations.map(build);
  return {
    strategies: { objective: "engage", candidates: selected, selected, fallbackUsed: true },
    promptContext: "CONTRATOS ESTRATEGICOS DAS VARIACOES:\n1. ...",
  };
}

function okResponse(payload: unknown): InvokeResult {
  return {
    id: "resp-1",
    created: 1,
    model: "openai/gpt-5-mini",
    provider: "openrouter",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify(payload) },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.0001 },
  };
}

function makeRequest(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    inputType: "text",
    content: SOURCE_CONTENT,
    platform: "instagram",
    postMode: "static",
    creationMode: "ideation",
    ...overrides,
  };
}

interface Harness {
  deps: OrchestratorDeps;
  calls: InvokeParams[];
  events: Omit<GenerationDebugEvent, "at">[];
  plan: PreparedGenerationPlan;
  setNow: (value: number) => void;
}

function makeHarness(overrides: Partial<OrchestratorDeps> = {}): Harness {
  const calls: InvokeParams[] = [];
  const events: Omit<GenerationDebugEvent, "at">[] = [];
  let now = 1000;
  const variations = [makeVariation(1), makeVariation(2), makeVariation(3)];
  const plan = makePlan(variations);
  const base: OrchestratorDeps = {
    generate: async (params) => {
      calls.push(params);
      return okResponse({ variations });
    },
    clock: () => now,
    assessOriginality: async (input): Promise<OriginalityResult> => ({
      assessments: (input.candidates ?? []).map((_, index) => ({
        score: 85,
        maxCandidateSimilarity: 0.1,
        maxSiteSimilarity: 0.05,
        maxHistorySimilarity: 0.05,
        closestSource: "none",
        fallbackUsed: false,
      })),
      embeddings: [],
      fallbackUsed: false,
    }),
    loadRecentPosts: async (): Promise<PostRecord[]> => [],
    trace: { id: "run-1", recordEvent: (event) => events.push(event) },
  };
  return {
    deps: { ...base, ...overrides },
    calls,
    events,
    plan,
    setNow: (value) => {
      now = value;
    },
  };
}

function makeInput(harness: Harness, overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    userUuid: "user-1",
    request: makeRequest(),
    siteIntelligence: null,
    executionBrief: null,
    plan: harness.plan,
    aiLlmJudgeEnabled: false,
    deadlineMs: null,
    ...overrides,
  };
}

function mainLabel(calls: InvokeParams[]): InvokeParams[] {
  return calls.filter((params) => params.traceLabel === "post_generation");
}

function repairLabel(calls: InvokeParams[]): InvokeParams[] {
  return calls.filter((params) => params.traceLabel === "generation_repair");
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe("generatePostVariations — orçamento de chamadas", () => {
  it("caminho feliz estático: exatamente 1 chamada generativa, 3 snapshots aprovados", async () => {
    const harness = makeHarness();
    const outcome = await generatePostVariations(makeInput(harness), harness.deps);

    expect(outcome.status).toBe("approved");
    if (outcome.status !== "approved") return;
    expect(harness.calls).toHaveLength(1);
    expect(outcome.metrics.generativeCalls).toBe(1);
    expect(outcome.metrics.repairCalls).toBe(0);
    expect(outcome.snapshots).toHaveLength(3);
    expect(outcome.snapshots[0].snapshotVersion).toBe(4);
    expect(outcome.snapshots[0].headline).toBeTruthy();
    expect(outcome.metrics.fallbacks).not.toContain("caption_deterministic_slots:0");
  });

  it("caminho feliz carrossel: exatamente 1 chamada generativa e 5 slides por variação", async () => {
    const harness = makeHarness({
      generate: async (params) => {
        harness.calls.push(params);
        return okResponse({
          variations: [carouselVariation(1), carouselVariation(2), carouselVariation(3)],
        });
      },
    });
    const outcome = await generatePostVariations(
      makeInput(harness, { request: makeRequest({ postMode: "carousel" }) }),
      harness.deps,
    );

    expect(outcome.status).toBe("approved");
    if (outcome.status !== "approved") return;
    expect(outcome.metrics.generativeCalls).toBe(1);
    expect(outcome.metrics.repairCalls).toBe(0);
    expect(outcome.snapshots).toHaveLength(3);
    for (const snapshot of outcome.snapshots) {
      expect(snapshot.slides).toHaveLength(5);
    }
  });

  it("slot incompleto dispara exatamente 1 reparo contendo APENAS o slot rejeitado", async () => {
    const harness = makeHarness({
      generate: async (params) => {
        harness.calls.push(params);
        if (harness.calls.length === 1) {
          return okResponse({
            variations: [
              makeVariation(1),
              makeVariation(2),
              makeVariation(3, { caption: "" }),
            ],
          });
        }
        return okResponse({ variations: [makeVariation(3)] });
      },
    });
    const outcome = await generatePostVariations(makeInput(harness), harness.deps);

    expect(outcome.status).toBe("approved");
    if (outcome.status !== "approved") return;
    expect(outcome.metrics.generativeCalls).toBe(2);
    expect(outcome.metrics.repairCalls).toBe(1);
    expect(repairLabel(harness.calls)).toHaveLength(1);
    const repairCall = repairLabel(harness.calls)[0];
    expect(repairCall.messages[1].content).toContain("SLOT 3");
    expect(repairCall.messages[1].content).not.toContain("SLOT 1:");
    expect(repairCall.messages[1].content).not.toContain("SLOT 2:");
    if (repairCall.response_format?.type === "json_schema") {
      const schema = repairCall.response_format.json_schema.schema as any;
      expect(schema.properties.variations.minItems).toBe(1);
      expect(schema.properties.variations.maxItems).toBe(1);
    }
  });

  it("reparo que não corrige o slot → conjunto rejeitado (status rejected)", async () => {
    const harness = makeHarness({
      generate: async (params) => {
        harness.calls.push(params);
        // CTA ausente: nem o reparo (que devolve o mesmo defeito) nem o
        // fallback determinístico de caption conseguem sanar o slot.
        const broken = makeVariation(3, { callToAction: "" });
        if (harness.calls.length === 1) {
          return okResponse({ variations: [makeVariation(1), makeVariation(2), broken] });
        }
        return okResponse({ variations: [broken] });
      },
    });
    const outcome = await generatePostVariations(makeInput(harness), harness.deps);

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.issues.length).toBeGreaterThan(0);
    expect(outcome.metrics.generativeCalls).toBe(2);
    expect(outcome.metrics.repairCalls).toBe(1);
  });

  it("deadline estourada durante o reparo → falha de deadline (não aprova)", async () => {
    let now = 1000;
    const harness = makeHarness({
      clock: () => now,
      generate: async (params) => {
        harness.calls.push(params);
        if (harness.calls.length === 1) {
          return okResponse({
            variations: [
              makeVariation(1),
              makeVariation(2),
              makeVariation(3, { caption: "" }),
            ],
          });
        }
        // O reparo leva tempo demais: ao retornar, o deadline já passou.
        now = 1000 + 120_000;
        return okResponse({ variations: [makeVariation(3)] });
      },
    });
    const outcome = await generatePostVariations(
      makeInput(harness, { deadlineMs: 1000 + 90_000 }),
      harness.deps,
    );

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.error.kind).toBe("deadline");
    expect(outcome.metrics.exceededDeadline).toBe(true);
    expect(outcome.metrics.generativeCalls).toBe(2);
  });

  it("falha operacional do provider → status failed, sem reparo", async () => {
    const harness = makeHarness({
      generate: async () => {
        throw new Error("provider offline");
      },
    });
    const outcome = await generatePostVariations(makeInput(harness), harness.deps);

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.error.kind).toBe("provider");
    expect(outcome.metrics.generativeCalls).toBe(0);
    expect(outcome.metrics.repairCalls).toBe(0);
  });

  it("resposta principal sem variações parseáveis → falha de parse", async () => {
    const harness = makeHarness({
      generate: async (params) => {
        harness.calls.push(params);
        return okResponse({ notVariations: true });
      },
    });
    const outcome = await generatePostVariations(makeInput(harness), harness.deps);

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.error.kind).toBe("parse");
  });

  it("input por imagem: a chamada principal carrega a imagem no user content", async () => {
    const harness = makeHarness();
    const outcome = await generatePostVariations(
      makeInput(harness, {
        request: makeRequest({ inputType: "image", imageUrl: "data:image/png;base64,AAAA" }),
      }),
      harness.deps,
    );

    expect(outcome.status).toBe("approved");
    const mainCall = mainLabel(harness.calls)[0];
    const userMessage = mainCall?.messages.find((message) => message.role === "user");
    expect(Array.isArray(userMessage?.content)).toBe(true);
    if (Array.isArray(userMessage?.content)) {
      expect(userMessage?.content.some((part) => part.type === "image_url")).toBe(true);
    }
  });

  it("deadline excedida antes da chamada principal → falha de deadline sem chamadas", async () => {
    const harness = makeHarness();
    harness.setNow(5000);
    const outcome = await generatePostVariations(
      makeInput(harness, { deadlineMs: 2000 }),
      harness.deps,
    );

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.error.kind).toBe("deadline");
    expect(harness.calls).toHaveLength(0);
    expect(outcome.metrics.exceededDeadline).toBe(true);
  });

  it("variedade insuficiente → reparo com os 3 slots; se continuar igual, rejected", async () => {
    const harness = makeHarness({
      generate: async (params) => {
        harness.calls.push(params);
        return okResponse({
          variations: [makeVariation(1), makeVariation(1), makeVariation(1)],
        });
      },
    });
    const outcome = await generatePostVariations(makeInput(harness), harness.deps);

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.issues.some((issue) => issue.type === "diversity")).toBe(true);
    expect(outcome.metrics.generativeCalls).toBe(2);
    expect(repairLabel(harness.calls)[0].messages[1].content).toContain("DIVERSIDADE");
  });

  it("caption curta demais → fallback determinístico marcado e caption preenchida", async () => {
    const harness = makeHarness({
      generate: async (params) => {
        harness.calls.push(params);
        return okResponse({
          variations: [
            makeVariation(1),
            makeVariation(2),
            makeVariation(3, { caption: "Curtinha." }),
          ],
        });
      },
    });
    const outcome = await generatePostVariations(makeInput(harness), harness.deps);

    expect(outcome.status).toBe("approved");
    if (outcome.status !== "approved") return;
    expect(outcome.snapshots[2].caption?.trim().length).toBeGreaterThan(40);
    expect(outcome.metrics.fallbacks.some((fallback) => fallback.startsWith("caption_deterministic_slots:"))).toBe(true);
    expect(harness.events.some((event) => event.stage === "caption_synthesis" && event.status === "fallback")).toBe(true);
  });

  it("fallback de estratégia determinística registrado nas métricas", async () => {
    const harness = makeHarness();
    const outcome = await generatePostVariations(makeInput(harness), harness.deps);

    expect(outcome.status).toBe("approved");
    if (outcome.status !== "approved") return;
    expect(outcome.metrics.fallbacks).toContain("strategy_deterministic");
  });

  it("fallback de originalidade registrado quando embeddings não disponíveis", async () => {
    const harness = makeHarness({
      assessOriginality: async () => ({
        assessments: [],
        embeddings: [],
        fallbackUsed: true,
      }),
    });
    const outcome = await generatePostVariations(makeInput(harness), harness.deps);

    expect(outcome.status).toBe("approved");
    if (outcome.status !== "approved") return;
    expect(outcome.metrics.fallbacks).toContain("originality");
  });
});

describe("transação financeira — chave de idempotência (double-submit)", () => {
  it("dois requests idênticos do mesmo usuário derivam a MESMA chave", () => {
    const request = { inputType: "text", content: "cafe artesanal", postMode: "static", platform: "instagram" };
    const first = deriveIdempotencyKey("user-1", request);
    const second = deriveIdempotencyKey("user-1", request);
    expect(first).toBe(second);
  });

  it("requests diferentes derivam chaves diferentes", () => {
    const first = deriveIdempotencyKey("user-1", { inputType: "text", content: "cafe", postMode: "static", platform: "instagram" });
    const second = deriveIdempotencyKey("user-1", { inputType: "text", content: "cha", postMode: "static", platform: "instagram" });
    expect(first).not.toBe(second);
  });
});
