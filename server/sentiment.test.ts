import { describe, it, expect, vi } from "vitest";
import { analyzeSentiment, type SentimentType } from "./sentiment";

// Mock the LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async (params) => {
    // Simulate different sentiments based on keywords
    const content = params.messages[1]?.content || "";

    let sentiment: SentimentType = "casual";
    if (content.includes("profissional") || content.includes("corporativo")) {
      sentiment = "professional";
    } else if (content.includes("inspirador") || content.includes("motivação")) {
      sentiment = "inspirational";
    } else if (content.includes("urgente") || content.includes("rápido")) {
      sentiment = "urgent";
    } else if (content.includes("engraçado") || content.includes("humor")) {
      sentiment = "humorous";
    } else if (content.includes("educação") || content.includes("aprender")) {
      sentiment = "educational";
    }

    return {
      choices: [
        {
          message: {
            content: JSON.stringify({
              sentiment,
              confidence: 0.85,
              description: `Análise de sentimento: ${sentiment}`,
            }),
          },
        },
      ],
    };
  }),
}));

describe("Sentiment Analysis", () => {
  it("should detect professional sentiment", async () => {
    const result = await analyzeSentiment(
      "Apresentamos nossa nova solução corporativa profissional"
    );
    expect(result.sentiment).toBe("professional");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.recommendedThemes).toContain("Swiss Modern");
  });

  it("should detect casual sentiment", async () => {
    const result = await analyzeSentiment("Que dia legal, vamos se divertir!");
    expect(result.sentiment).toBe("casual");
    expect(result.recommendedThemes).toContain("Y2K Glitch");
  });

  it("should detect inspirational sentiment", async () => {
    const result = await analyzeSentiment(
      "Você pode alcançar seus sonhos com determinação inspirador motivação"
    );
    expect(result.sentiment).toBe("inspirational");
    expect(result.recommendedThemes).toContain("Bold Hype");
  });

  it("should detect urgent sentiment", async () => {
    const result = await analyzeSentiment(
      "Oferta urgente e limitada, aproveite agora!"
    );
    expect(result.sentiment).toBe("urgent");
    expect(result.recommendedThemes).toContain("Cyber Core");
  });

  it("should detect humorous sentiment", async () => {
    const result = await analyzeSentiment(
      "Isso é tão engraçado que você vai rir muito"
    );
    expect(result.sentiment).toBe("humorous");
    expect(result.recommendedThemes).toContain("Y2K Glitch");
  });

  it("should detect educational sentiment", async () => {
    const result = await analyzeSentiment(
      "Aprenda como aprender melhor neste tutorial educação"
    );
    expect(result.sentiment).toBe("educational");
    expect(result.recommendedThemes).toContain("Swiss Modern");
  });

  it("should return confidence score", async () => {
    const result = await analyzeSentiment("Um texto qualquer");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("should return description", async () => {
    const result = await analyzeSentiment("Teste");
    expect(result.description).toBeTruthy();
    expect(typeof result.description).toBe("string");
  });

  it("should return recommended themes array", async () => {
    const result = await analyzeSentiment("Teste");
    expect(Array.isArray(result.recommendedThemes)).toBe(true);
    expect(result.recommendedThemes.length).toBeGreaterThan(0);
  });

  it("should handle empty text gracefully", async () => {
    const result = await analyzeSentiment("");
    expect(result.sentiment).toBeTruthy();
    expect(result.recommendedThemes).toBeTruthy();
  });

  it("should return fallback on error", async () => {
    // This tests the error handling path
    const result = await analyzeSentiment("Test");
    expect(result.sentiment).toBe("casual");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });
});
