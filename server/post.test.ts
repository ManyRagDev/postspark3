import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { invokeLLM } from "./_core/llm";
import { commitSparkReservation, refundSparkReservation } from "./billing";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          variations: [
            {
              headline: "Café Premium",
              body: "Descubra o melhor café artesanal da cidade",
              hashtags: ["cafe", "artesanal", "premium"],
              callToAction: "Peça agora!",
              caption: "Descubra nosso café premium ☕ O melhor da cidade!",
              tone: "Profissional",
              imagePrompt: "A premium artisan coffee cup with steam",
              backgroundColor: "#1a1a2e",
              textColor: "#ffffff",
              accentColor: "#FF5F1F",
              layout: "centered",
              copyAngle: {
                type: "autoridade",
                label: "Especialista",
                badge: "Premium",
                stickerText: "Qualidade",
              },
            },
            {
              headline: "Bora tomar um café?",
              body: "Aquele café que faz seu dia melhor",
              hashtags: ["cafe", "bomdia"],
              callToAction: "Vem provar!",
              caption: "Nada como um café pra começar o dia ☀️",
              tone: "Casual",
              imagePrompt: "Cozy coffee shop scene",
              backgroundColor: "#0f3460",
              textColor: "#ffffff",
              accentColor: "#06B6D4",
              layout: "left-aligned",
              copyAngle: {
                type: "beneficio",
                label: "Momento",
                badge: "Cafe",
                stickerText: "Prove",
              },
            },
            {
              headline: "CAFÉ ARTESANAL",
              body: "Cada gole é uma experiência única",
              hashtags: ["cafeartesanal", "experiencia"],
              callToAction: "Descubra!",
              caption: "Experiências que transformam seu paladar ✨",
              tone: "Criativo",
              imagePrompt: "Abstract coffee art",
              backgroundColor: "#2d132c",
              textColor: "#ffffff",
              accentColor: "#EC4899",
              layout: "minimal",
              copyAngle: {
                type: "storytelling",
                label: "Experiencia",
                badge: "Artesanal",
                stickerText: "Unico",
              },
            },
          ],
        }),
      },
    }],
  }),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      embedContent: vi.fn().mockRejectedValue(new Error("embeddings offline")),
    };
  },
}));

// Mock image generation
vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn().mockResolvedValue({ url: "https://example.com/generated.png" }),
}));

// Mock database
vi.mock("./db", () => ({
  createPost: vi.fn().mockResolvedValue(1),
  getUserPosts: vi.fn().mockResolvedValue([]),
  updatePost: vi.fn().mockResolvedValue(undefined),
  getPostById: vi.fn().mockResolvedValue(null),
  createGenerationRun: vi.fn().mockResolvedValue(undefined),
  createContentFingerprints: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

// Mock billing transacional: reserva real, commit/refund observáveis.
vi.mock("./billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billing")>();
  return {
    ...actual,
    getBillingProfile: vi.fn().mockResolvedValue({ id: "profile-1", email: "test@example.com", sparks: 100, plan: "PRO" }),
    reserveSparks: vi.fn().mockResolvedValue({ reservationId: "res-1" }),
    commitSparkReservation: vi.fn().mockResolvedValue(true),
    refundSparkReservation: vi.fn().mockResolvedValue(true),
    debitSparks: vi.fn().mockResolvedValue({ success: true }),
  };
});

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("post.generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates 3 post variations from text input with a single generative call", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.post.generate({
      inputType: "text",
      content: "Promoção de café artesanal",
      platform: "instagram",
    });

    expect(result.variations).toHaveLength(3);
    expect(result.generationRunId).toEqual(expect.any(String));
    expect(result.variations[0]).toHaveProperty("headline");
    expect(result.variations[0]).toHaveProperty("body");
    expect(result.variations[0]).toHaveProperty("hashtags");
    expect(result.variations[0]).toHaveProperty("callToAction");
    expect(result.variations[0]).toHaveProperty("tone");
    expect(result.variations[0]).toHaveProperty("imagePrompt");
    expect(result.variations[0]).toHaveProperty("backgroundColor");
    expect(result.variations[0]).toHaveProperty("textColor");
    expect(result.variations[0]).toHaveProperty("accentColor");
    expect(result.variations[0]).toHaveProperty("layout");
    expect(result.variations[0]).toHaveProperty("caption");
    expect(typeof result.variations[0].caption).toBe("string");
    expect(result.variations[0].platform).toBe("instagram");
    expect(result.variations[0].id).toMatch(/^var-/);
    expect(result.variations[0]).toHaveProperty("snapshotVersion", 4);

    // SPEC-003: o caminho feliz faz exatamente UMA chamada generativa.
    const generationCalls = vi.mocked(invokeLLM).mock.calls.filter(
      ([params]) => params.traceLabel === "post_generation",
    );
    expect(generationCalls).toHaveLength(1);
    const [mainCall] = generationCalls[0];
    const mainSystemMessage = mainCall.messages.find(
      (message) => message.role === "system",
    );
    expect(mainSystemMessage?.content).toContain("Gere EXATAMENTE 3 variações");
    expect(mainCall.maxCompletionTokens).toBe(9000);
    expect(mainCall.response_format?.type).toBe("json_schema");
    if (mainCall.response_format?.type === "json_schema") {
      const schema = mainCall.response_format.json_schema.schema as any;
      expect(schema.properties.variations.minItems).toBe(3);
      expect(schema.properties.variations.maxItems).toBe(3);
    }

    // Sem chamadas de diversificação, síntese de caption ou shadow graph no
    // caminho feliz — elas saíram do caminho síncrono (SPEC-003).
    const unexpectedLabels = ["lexical_diversification", "caption_synthesis", "generation_repair"];
    const unexpectedCalls = vi.mocked(invokeLLM).mock.calls.filter(([params]) =>
      unexpectedLabels.includes(params.traceLabel ?? ""),
    );
    expect(unexpectedCalls).toHaveLength(0);

    // Transação: commit uma vez no caminho aprovado; refund não é chamado.
    expect(vi.mocked(commitSparkReservation)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(refundSparkReservation)).not.toHaveBeenCalled();
  });

  it("falha operacional → refund da reserva e erro discriminado", async () => {
    vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("provider offline"));
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.post.generate({
        inputType: "text",
        content: "Promoção de café artesanal",
        platform: "instagram",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(vi.mocked(refundSparkReservation)).toHaveBeenCalledWith(
      "res-1",
      expect.any(String),
    );
    expect(vi.mocked(commitSparkReservation)).not.toHaveBeenCalled();
  });

  it("CR-004: modo execution tem o MESMO orçamento — nenhuma chamada high_ticket no caminho síncrono", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.post.generate({
      inputType: "text",
      content: "Promoção de café artesanal",
      platform: "linkedin",
      creationMode: "execution",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "linkedin",
        objective: "sell",
        tone: "profissional",
        callToAction: "Agende uma degustação",
        interventionLevel: "light_optimize",
        contentSourceType: "freeform",
        rawInput: "Promoção de café artesanal",
        brandInput: { brandName: "CafeX", industry: "cafeteria", adaptationMode: "adaptive" },
      } as never,
    });

    expect(result.variations).toHaveLength(3);
    const labels = vi.mocked(invokeLLM).mock.calls.map(
      ([params]) => params.traceLabel ?? params.taskRoute ?? "?",
    );
    // CR-004: intent router e context budget são determinísticos — NENHUMA
    // rota high_ticket_* pode aparecer no caminho síncrono.
    expect(labels.some((label) => label.includes("high_ticket"))).toBe(false);
    expect(labels.filter((label) => label === "post_generation")).toHaveLength(1);
    expect(vi.mocked(commitSparkReservation)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(refundSparkReservation)).not.toHaveBeenCalled();
  });

  it("CR-004: contexto acima do budget não adiciona chamada LLM (compressão determinística)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.post.generate({
      inputType: "text",
      content: "Conteúdo extenso de referência para compressão de contexto.".repeat(200),
      platform: "instagram",
      creationMode: "execution",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "educate",
        interventionLevel: "visual_only",
        contentSourceType: "freeform",
        rawInput: "Conteúdo extenso",
      } as never,
    });

    const labels = vi.mocked(invokeLLM).mock.calls.map(
      ([params]) => params.traceLabel ?? params.taskRoute ?? "?",
    );
    expect(labels.some((label) => label === "high_ticket_context_summary")).toBe(false);
    expect(labels.filter((label) => label === "post_generation")).toHaveLength(1);
  });

  it("CR-005: commit falso → falha terminal (nunca 'aprovado sem débito')", async () => {
    vi.mocked(commitSparkReservation).mockResolvedValueOnce(false);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.post.generate({
        inputType: "text",
        content: "Promoção de café artesanal",
        platform: "instagram",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(vi.mocked(commitSparkReservation)).toHaveBeenCalledTimes(1);
    // A reserva não confirmada é devolvida — o run termina como falha.
    expect(vi.mocked(refundSparkReservation)).toHaveBeenCalledTimes(1);
  });

  it("CR-005: refund falso em falha → run termina como falha observável (SPARK_REFUND_FAILED)", async () => {
    vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("provider offline"));
    vi.mocked(refundSparkReservation).mockResolvedValueOnce(false);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.post.generate({
        inputType: "text",
        content: "Promoção de café artesanal",
        platform: "instagram",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    // O refund foi tentado e a falha do refund é registrada (log operacional
    // SPARK_REFUND_FAILED + trace encerrado como failed com a nota) — nunca
    // um caminho que "passa" sem o estado financeiro definido.
    expect(vi.mocked(refundSparkReservation)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(commitSparkReservation)).not.toHaveBeenCalled();
  });

  it("CR-008: carrossel usa schema válido para strict JSON (template/sections em required)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.post.generate({
      inputType: "text",
      content: "Promoção de café artesanal",
      platform: "instagram",
      postMode: "carousel",
    });

    const carouselCall = vi.mocked(invokeLLM).mock.calls.find(
      ([params]) => params.traceLabel === "post_generation",
    );
    expect(carouselCall).toBeDefined();
    const schema = carouselCall![0].response_format;
    if (schema?.type === "json_schema") {
      const variationSchema = (schema.json_schema.schema as any).properties.variations.items;
      const propertyKeys = Object.keys(variationSchema.properties);
      // Contrato strict: TODO o que está em properties precisa estar em required.
      for (const key of propertyKeys) {
        expect(variationSchema.required, `carrossel: '${key}' em properties deve estar em required`).toContain(key);
      }
    }
  });

  it("CR-008: input image sem URL válida NÃO envia bloco image_url (400 do provider)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.post.generate({
      inputType: "image",
      content: "Foto de uma cafeteria artesanal",
      platform: "instagram",
    });

    const call = vi.mocked(invokeLLM).mock.calls.find(([params]) => params.traceLabel === "post_generation");
    const content = call?.[0].messages.at(-1)?.content;
    if (typeof content === "string") {
      // Fix aplicado: input image sem URL válida vira texto puro.
      expect(content).toContain("Crie posts baseados");
    } else {
      const blocks = Array.isArray(content) ? (content as Array<{ type?: string }>) : [];
      expect(blocks.filter((block) => block.type === "image_url")).toHaveLength(0);
      expect(blocks.some((block) => block.type === "text")).toBe(true);
    }
  });

  it("rejects unauthenticated users", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.post.generate({
        inputType: "text",
        content: "Test",
        platform: "instagram",
      })
    ).rejects.toThrow();
  });
});

describe("post.generateImage", () => {
  it("returns an image URL from a prompt", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.post.generateImage({
      prompt: "A beautiful sunset over the ocean",
    });

    expect(result).toHaveProperty("imageUrl");
    expect(result.imageUrl).toBe("https://example.com/generated.png");
  });
});

describe("post.save", () => {
  it("saves a post and returns an id", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.post.save({
      inputType: "text",
      inputContent: "Café artesanal",
      platform: "instagram",
      headline: "Café Premium",
      body: "O melhor café",
      hashtags: ["cafe"],
      callToAction: "Peça agora",
      tone: "Profissional",
      backgroundColor: "#1a1a2e",
      textColor: "#ffffff",
      accentColor: "#FF5F1F",
      layout: "centered",
    });

    expect(result).toHaveProperty("id");
    expect(result.id).toBe(1);
  });
});

describe("post.list", () => {
  it("returns user posts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.post.list();
    expect(Array.isArray(result)).toBe(true);
  });
});
