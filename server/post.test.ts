import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
            },
          ],
        }),
      },
    }],
  }),
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

    expect(result).toHaveLength(3);
    expect(result[0]).toHaveProperty("headline");
    expect(result[0]).toHaveProperty("body");
    expect(result[0]).toHaveProperty("hashtags");
    expect(result[0]).toHaveProperty("callToAction");
    expect(result[0]).toHaveProperty("tone");
    expect(result[0]).toHaveProperty("imagePrompt");
    expect(result[0]).toHaveProperty("backgroundColor");
    expect(result[0]).toHaveProperty("textColor");
    expect(result[0]).toHaveProperty("accentColor");
    expect(result[0]).toHaveProperty("layout");
    expect(result[0]).toHaveProperty("caption");
    expect(typeof result[0].caption).toBe("string");
    expect(result[0].platform).toBe("instagram");
    expect(result[0].id).toMatch(/^var-/);
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
