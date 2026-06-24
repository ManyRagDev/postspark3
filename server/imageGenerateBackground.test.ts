import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: {
    openRouterApiKey: "test-key",
    openRouterImageModel: "test-image-model",
    openRouterSiteUrl: "https://example.com",
    openRouterAppName: "PostSpark Test",
  },
}));

vi.mock("./_core/operationalLog", () => ({
  appendOperationalLog: vi.fn(),
}));

import { generateBackgroundImage } from "./imageGenerateBackground";

const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generateBackgroundImage", () => {
  it("extracts the structured OpenRouter image and ignores unrelated base64 strings", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{
        message: {
          reasoning_details: [{ data: Buffer.alloc(600, 7).toString("base64") }],
          images: [{
            type: "image_url",
            image_url: { url: `data:image/png;base64,${pngBytes.toString("base64")}` },
          }],
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateBackgroundImage("test prompt", "pollinations_hd");

    expect(result).toBe(`data:image/png;base64,${pngBytes.toString("base64")}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid image signature and uses Pollinations fallback", async () => {
    const fakeBase64 = Buffer.alloc(600, 7).toString("base64");
    const jpegBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32)]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          message: {
            images: [{ image_url: { url: `data:image/png;base64,${fakeBase64}` } }],
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(jpegBytes, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateBackgroundImage("test prompt", "pollinations_hd");

    expect(result).toBe(`data:image/jpeg;base64,${jpegBytes.toString("base64")}`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("gen.pollinations.ai/image/");
  });
});
