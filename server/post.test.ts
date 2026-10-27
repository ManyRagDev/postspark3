import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { commitSparkReservation, refundSparkReservation, reserveSparks } from "./billing";
import { generateCompleteDesignVariations } from "./ai/completeDesignGeneration";
import { retrieveCompleteDesignCards } from "./designCatalog/completeDesignStore";
vi.mock("./designCatalog/componentStore",()=>({retrieveComponentCardsForGeneration:vi.fn().mockResolvedValue([]),hydrateComponents:vi.fn()}));
vi.mock("./ai/completeDesignGeneration",()=>({generateCompleteDesignVariations:vi.fn().mockRejectedValue(new Error("complete design boundary reached"))}));
vi.mock("./designCatalog/completeDesignStore",()=>({retrieveCompleteDesignCards:vi.fn().mockResolvedValue([{id:"offered-complete-design"}])}));

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

describe("retired post.generate boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it.each([undefined, 2, 3, 4] as const)("directs contract %s callers to the durable Studio without billing/provider calls", async (version) => {
    await expect(appRouter.createCaller(createAuthContext()).post.generate({ inputType: "text", content: "Post café", platform: "instagram", designContractVersion: version })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("generation.start") });
    expect(reserveSparks).not.toHaveBeenCalled();
    expect(invokeLLM).not.toHaveBeenCalled();
    expect(generateCompleteDesignVariations).not.toHaveBeenCalled();
  });
  it("requires authentication even at the compatibility boundary", async () => {
    const ctx = createAuthContext(); ctx.user = null;
    await expect(appRouter.createCaller(ctx).post.generate({ inputType: "text", content: "Post café", platform: "instagram" })).rejects.toMatchObject({code:"UNAUTHORIZED"});
  });
});

describe("post.generateImage", () => {
  it("commits image pricing only after delivery and refunds failed generation",async()=>{
    const caller=appRouter.createCaller(createAuthContext());
    vi.mocked(generateImage).mockRejectedValueOnce(new Error("image provider unavailable"));
    await expect(caller.post.generateImage({prompt:"Scene",idempotencyKey:"image-click-1"})).rejects.toThrow("image provider unavailable");
    expect(reserveSparks).toHaveBeenCalledWith(expect.anything(),25,"image-click-1","Geração de imagem IA");
    expect(commitSparkReservation).not.toHaveBeenCalled();
    expect(refundSparkReservation).toHaveBeenCalledTimes(1);
  });

  it("returns an image URL from a prompt", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.post.generateImage({
      prompt: "A beautiful sunset over the ocean",
    });

    expect(result).toHaveProperty("imageUrl");
    expect(result.imageUrl).toBe("https://example.com/generated.png");
  });

  it("passes the post meaning and canvas proportion to image generation", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await caller.post.generateImage({
      prompt: "abstract sale tags",
      aspectRatio: "9:16",
      postContext: {
        headline: "O preço subiu antes da promoção",
        body: "Compare o histórico de preços.",
        familyName: "Pôster Editorial",
        backgroundColor: "#101828",
        accentColor: "#F59E0B",
      },
    });

    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "abstract sale tags",
      aspectRatio: "9:16",
      postContext: expect.objectContaining({ headline: "O preço subiu antes da promoção" }),
    }));
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
