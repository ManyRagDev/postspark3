import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateImage } from "./imageGeneration";
import { generateBackgroundImage } from "../imageGenerateBackground";
import { saveUserMediaAsset } from "../mediaAssets";
import { storagePut } from "server/storage";

vi.mock("../imageGenerateBackground", () => ({
  generateBackgroundImage: vi.fn().mockResolvedValue("data:image/png;base64,aGVsbG8="),
}));
vi.mock("server/storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://example.com/background.png" }),
}));

vi.mock("../mediaAssets",()=>({saveUserMediaAsset:vi.fn().mockImplementation((_data: string, owner: string) => ({url:`/api/post-media/${owner}/${"a".repeat(64)}`}))}));

beforeEach(() => vi.clearAllMocks());

describe("generateImage", () => {
  it("persists owned images before returning and bypasses expiring proxy URLs",async()=>{
    const result=await generateImage({prompt:"A botanical scene",ownerId:"owner"});
    expect(result.url).toBe(`/api/post-media/owner/${"a".repeat(64)}`);
    expect(saveUserMediaAsset).toHaveBeenCalledWith("data:image/png;base64,aGVsbG8=","owner");
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("grounds the provider prompt in the final post and forwards the canvas proportion", async () => {
    const result = await generateImage({
      prompt: "abstract sale tags",
      aspectRatio: "9:16",
      postContext: {
        headline: "O preço subiu antes da promoção",
        body: "Compare o histórico antes de comprar.",
      },
    });

    expect(result.url).toBe("https://example.com/background.png");
    expect(generateBackgroundImage).toHaveBeenCalledWith(
      expect.stringContaining("O preço subiu antes da promoção"),
      "pollinations_hd",
      "9:16",
    );
    expect(storagePut).toHaveBeenCalledTimes(1);
  });

  it("forwards V5 context and authorized reference bytes to the strict route, then persists privately", async () => {
    const signal = new AbortController().signal;
    const result = await generateImage({
      prompt: "A selected scene",
      ownerId: "owner",
      aspectRatio: "1:1",
      routePolicy: "strict",
      signal,
      postContext: { headline: "Mensagem principal", compositionGuidance: "Manter a cena reconhecível" },
      originalImages: [{ b64Json: "aGVsbG8=", mimeType: "image/png" }],
    });

    expect(result.url).toBe(`/api/post-media/owner/${"a".repeat(64)}`);
    expect(generateBackgroundImage).toHaveBeenCalledWith(
      expect.stringContaining("Mensagem principal"),
      "pollinations_hd",
      "1:1",
      {
        routePolicy: "strict",
        originalImages: [{ b64Json: "aGVsbG8=", mimeType: "image/png" }],
        signal,
      },
    );
    expect(saveUserMediaAsset).toHaveBeenCalledWith("data:image/png;base64,aGVsbG8=", "owner", signal);
  });

  it("requires an owner for strict V5 generation", async () => {
    await expect(generateImage({ prompt: "scene", routePolicy: "strict" })).rejects.toThrow("Proprietário");
    expect(generateBackgroundImage).not.toHaveBeenCalled();
  });
});
