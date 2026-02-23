import { invokeLLM } from "./_core/llm";

export type SentimentType = "professional" | "casual" | "inspirational" | "humorous" | "urgent" | "educational";

export interface SentimentAnalysis {
  sentiment: SentimentType;
  confidence: number;
  description: string;
  recommendedThemes: string[];
}

const SENTIMENT_PROMPTS: Record<SentimentType, string> = {
  professional: "Tom profissional, corporativo, confiável e formal",
  casual: "Tom casual, amigável, descontraído e acessível",
  inspirational: "Tom inspirador, motivacional, esperançoso e empoderador",
  humorous: "Tom humorístico, leve, divertido e irônico",
  urgent: "Tom urgente, imperativo, chamada à ação imediata",
  educational: "Tom educacional, informativo, didático e explicativo",
};

const THEME_MAPPING: Record<SentimentType, string[]> = {
  professional: ["Swiss Modern", "Dark Academia", "Morning Paper"],
  casual: ["Y2K Glitch", "Eco Zen", "Bold Hype"],
  inspirational: ["Velvet Noir", "Cyber Core", "Bold Hype"],
  humorous: ["Y2K Glitch", "Bold Hype", "Eco Zen"],
  urgent: ["Cyber Core", "Bold Hype", "Morning Paper"],
  educational: ["Swiss Modern", "Morning Paper", "Dark Academia"],
};

export async function analyzeSentiment(text: string): Promise<SentimentAnalysis> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um especialista em análise de sentimento e tom de texto. Analise o texto fornecido e retorne um JSON com:
- sentiment: um dos seguintes valores: "professional", "casual", "inspirational", "humorous", "urgent", "educational"
- confidence: número entre 0 e 1 indicando confiança da análise
- description: breve descrição do tom detectado (máx 50 palavras)

Retorne APENAS o JSON, sem explicações adicionais.`,
        },
        {
          role: "user",
          content: `Analise este texto: "${text}"`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sentiment_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              sentiment: {
                type: "string",
                enum: [
                  "professional",
                  "casual",
                  "inspirational",
                  "humorous",
                  "urgent",
                  "educational",
                ],
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              description: {
                type: "string",
              },
            },
            required: ["sentiment", "confidence", "description"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") throw new Error("No response from LLM");

    const parsed = JSON.parse(content) as {
      sentiment: SentimentType;
      confidence: number;
      description: string;
    };

    return {
      sentiment: parsed.sentiment,
      confidence: parsed.confidence,
      description: parsed.description,
      recommendedThemes: THEME_MAPPING[parsed.sentiment as SentimentType] || [
        "Swiss Modern",
        "Cyber Core",
        "Bold Hype",
      ],
    };
  } catch (error) {
    console.error("[Sentiment Analysis] Error:", error);
    // Fallback to casual sentiment
    return {
      sentiment: "casual",
      confidence: 0.5,
      description: "Análise padrão",
      recommendedThemes: THEME_MAPPING.casual,
    };
  }
}
