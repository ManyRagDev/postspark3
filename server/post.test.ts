import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { invokeLLM } from "./_core/llm";

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
  it("generates 3 post variations from text input", async () => {
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

    const slotCall = vi.mocked(invokeLLM).mock.calls.find(
      ([params]) => params.traceLabel === "post_generation_1",
    );
    const slotSystemMessage = slotCall?.[0].messages.find(
      (message) => message.role === "system",
    );
    const slotSchema = slotCall?.[0].response_format;
    expect(slotSystemMessage?.content).toContain("Gere exatamente UMA variação");
    expect(slotSystemMessage?.content).not.toContain("Gere EXATAMENTE 3 variações");
    expect(slotSystemMessage?.content).not.toContain("As 3 variações");
    expect(slotCall?.[0].maxCompletionTokens).toBe(3072);
    expect(slotSchema?.type).toBe("json_schema");
    if (slotSchema?.type === "json_schema") {
      const schema = slotSchema.json_schema.schema as any;
      expect(schema.properties.variations.minItems).toBe(1);
      expect(schema.properties.variations.maxItems).toBe(1);
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
