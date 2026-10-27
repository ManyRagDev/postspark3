import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: {
    openRouterApiKey: "test-key",
    openRouterImageModel: "google/gemini-3.1-flash-image",
    openRouterV5ImageModel: "google/gemini-3.1-flash-image",
    openRouterSiteUrl: "https://example.com",
    openRouterAppName: "PostSpark Test",
  },
}));

vi.mock("./_core/operationalLog", () => ({
  appendOperationalLog: vi.fn(),
}));

import { generateBackgroundImage } from "./imageGenerateBackground";
import { ENV } from "./_core/env";
import {
  runWithGenerationTrace,
  type GenerationTrace,
} from "./ai/generationTrace";

const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

afterEach(() => {
  ENV.openRouterImageModel = "google/gemini-3.1-flash-image";
  ENV.openRouterV5ImageModel = "google/gemini-3.1-flash-image";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generateBackgroundImage", () => {
  it.each([
    [true, true],
    [false, true],
    [true, false],
  ])(
    "captures actual image evidence; unreported cost/model remain unknown (%s, %s)",
    async (withCost, withModel) => {
      const trace: GenerationTrace = {
        id: "run",
        userUuid: "owner",
        inputType: "text",
        inputContent: "private",
        platform: "instagram",
        postMode: "static",
        creationMode: "execution",
        requestedModel: "requested",
        startedAt: Date.now(),
        calls: [],
        events: [],
      };
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "image-provider-receipt",
            ...(withModel ? { model: "reported-image-model" } : {}),
            usage: {
              prompt_tokens: 12,
              completion_tokens: 24,
              total_tokens: 36,
              ...(withCost ? { cost: 0.07 } : {}),
            },
            choices: [
              {
                message: {
                  images: [
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:image/png;base64,${pngBytes.toString("base64")}`,
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      );
      vi.stubGlobal("fetch", fetchMock);
      await runWithGenerationTrace(trace, () =>
        generateBackgroundImage("Private scene", "pollinations_hd", "4:5")
      );
      expect(trace.calls).toHaveLength(1);
      expect(trace.calls[0]).toMatchObject({
        providerId: "image-provider-receipt",
        effectiveModel: withModel ? "reported-image-model" : "unknown",
        effectiveModelReported: withModel,
        promptTokens: 12,
        completionTokens: 24,
        totalTokens: 36,
        costSource: withCost ? "provider" : "unknown",
        estimatedCostUsd: withCost ? 0.07 : 0,
      });
      expect(JSON.stringify(trace.calls[0].response)).not.toContain(
        pngBytes.toString("base64")
      );
    }
  );
  it("extracts the structured OpenRouter image and ignores unrelated base64 strings", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                reasoning_details: [
                  { data: Buffer.alloc(600, 7).toString("base64") },
                ],
                images: [
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/png;base64,${pngBytes.toString("base64")}`,
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateBackgroundImage(
      "test prompt",
      "pollinations_hd",
      "5:6"
    );

    expect(result).toBe(`data:image/png;base64,${pngBytes.toString("base64")}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.image_config.aspect_ratio).toBe("4:5");
    expect(payload.messages[0].content[0].text).toContain(
      "5:6 social media canvas"
    );
    expect(payload.messages[0].content[0].text).toContain("test prompt");
    expect(payload.messages[0].content[0].text).toContain(
      "without legible invented copy"
    );
  });

  it("rejects an invalid image signature and uses Pollinations fallback", async () => {
    const fakeBase64 = Buffer.alloc(600, 7).toString("base64");
    const jpegBytes = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(32),
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  images: [
                    {
                      image_url: { url: `data:image/png;base64,${fakeBase64}` },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(jpegBytes, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateBackgroundImage(
      "test prompt",
      "pollinations_hd",
      "9:16"
    );

    expect(result).toBe(
      `data:image/jpeg;base64,${jpegBytes.toString("base64")}`
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "gen.pollinations.ai/image/"
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "width=1080&height=1920"
    );
  });

  it("transmits reference image bytes to the verified model and never falls back without reference support", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("provider unavailable", { status: 503 }))
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateBackgroundImage("keep this scene", "pollinations_hd", "4:5", {
        routePolicy: "strict",
        originalImages: [
          { url: `data:image/png;base64,${pngBytes.toString("base64")}` },
        ],
      })
    ).rejects.toThrow("OpenRouter image generation failed");

    expect(fetchMock).toHaveBeenCalled();
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.model).toBe("google/gemini-3.1-flash-image");
    expect(payload.messages[0].content[1]).toEqual({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${pngBytes.toString("base64")}`,
      },
    });
  });

  it("fails before calling a model whose reference capability is not verified", async () => {
    ENV.openRouterV5ImageModel = "google/gemini-3.1-flash-image-preview";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateBackgroundImage("scene", "pollinations_hd", "4:5", {
        routePolicy: "strict",
        originalImages: [
          { url: `data:image/png;base64,${pngBytes.toString("base64")}` },
        ],
      })
    ).rejects.toThrow("capabilities não verificadas");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not silently change image providers in strict mode without references", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("unavailable", { status: 503 }))
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateBackgroundImage("scene", "pollinations_hd", "4:5", {
        routePolicy: "strict",
      })
    ).rejects.toThrow("OpenRouter image generation failed");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("routes product purpose primarily to ByteDance Seedream 5.0 Pro", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                images: [
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/png;base64,${pngBytes.toString("base64")}`,
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateBackgroundImage(
      "product shot of artisan coffee",
      "pollinations_hd",
      "1:1",
      {
        routePolicy: "strict",
        purpose: "product",
      }
    );

    expect(result).toBe(`data:image/png;base64,${pngBytes.toString("base64")}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.model).toBe("bytedance-seed/seedream-5-0-pro");
  });

  it("falls back to Gemini Flash Image when primary Seedream model returns 503 and never calls Pollinations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("Service Unavailable", { status: 503 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  images: [
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:image/png;base64,${pngBytes.toString("base64")}`,
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateBackgroundImage(
      "product shot of coffee beans",
      "pollinations_hd",
      "1:1",
      {
        routePolicy: "strict",
        purpose: "product",
      }
    );

    expect(result).toBe(`data:image/png;base64,${pngBytes.toString("base64")}`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const call1 = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const call2 = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(call1.model).toBe("bytedance-seed/seedream-5-0-pro");
    expect(call2.model).toBe("google/gemini-3.1-flash-image");
    // Ensure Pollinations endpoint was never called
    expect(String(fetchMock.mock.calls[0][0])).toContain("openrouter.ai");
    expect(String(fetchMock.mock.calls[1][0])).toContain("openrouter.ai");
  });
});
