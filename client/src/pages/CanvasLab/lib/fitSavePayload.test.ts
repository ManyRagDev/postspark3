import { describe, expect, it, vi } from "vitest";
import { fitSavePayload } from "./fitSavePayload";

describe("fitSavePayload", () => {
  it("keeps ordinary saves untouched", async () => {
    const payload = { canvasModel: { headline: "Post pequeno" } };
    const encode = vi.fn();

    expect(await fitSavePayload(payload, encode)).toBe(payload);
    expect(encode).not.toHaveBeenCalled();
  });

  it("compresses a repeated cover image once before sending and preserves the editor model", async () => {
    const image = `data:image/png;base64,${"a".repeat(1_900_000)}`;
    const compressed = "data:image/webp;base64,small-image";
    const payload = {
      imageUrl: image,
      canvasModel: {
        logoUrl: image,
        slides: [{ headline: "Capa", bgImage: image }],
      },
    };
    const encode = vi.fn(async () => compressed);

    const result = await fitSavePayload(payload, encode);

    expect(encode).toHaveBeenCalledTimes(1);
    expect(result.imageUrl).toBe(compressed);
    expect(result.canvasModel.logoUrl).toBe(compressed);
    expect(result.canvasModel.slides[0]).toEqual({ headline: "Capa", bgImage: compressed });
    expect(payload.canvasModel.slides[0].bgImage).toBe(image);
  });

  it("fails clearly when the oversized content cannot be reduced", async () => {
    const payload = { inputContent: "a".repeat(3_600_000) };

    await expect(fitSavePayload(payload)).rejects.toThrow("grande demais para salvar");
  });
});
