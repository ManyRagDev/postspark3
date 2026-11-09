import { describe, expect, it, vi } from "vitest";
import { templateIngestionRouter } from "./templateIngestion";
import * as designRecreation from "../designRecreation";
import * as screenshotService from "../screenshotService";
import * as publicUrlModule from "../publicUrl";
import type { RecreationRecipe } from "@shared/designRecreation";

describe("templateIngestionRouter", () => {
  const dummyRecipe: RecreationRecipe = {
    format: "postspark.admin2.recipe",
    version: 2,
    id: "rec-test-1",
    title: "Layout Extraído",
    createdAt: new Date().toISOString(),
    model: "gpt-4o",
    provider: "openai",
    usage: { inputTokens: 100, outputTokens: 50 },
    scene: {
      schemaVersion: 2,
      source: { widthPx: 1080, heightPx: 1080, mimeType: "image/png", preparedHash: "abc", originalHash: null },
      artboard: { background: "#000000" },
      layers: [],
      fonts: [],
      warnings: [],
      decoderVersion: "admin2-vision-3",
      rendererVersion: "admin2-konva-2",
    },
    missingElements: [],
    notes: [],
  };

  it("ingests from a valid image data URL", async () => {
    vi.spyOn(designRecreation, "decodeRecreation").mockResolvedValueOnce(dummyRecipe);

    const caller = templateIngestionRouter.createCaller({
      user: { id: "user-123", email: "test@example.com" } as any,
      req: {} as any,
      res: {} as any,
    });

    const result = await caller.ingestFromImage({
      imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });

    expect(result.recipe.id).toBe("rec-test-1");
    expect(result.previewDataUrl).toContain("data:image/png;base64,");
  });

  it("ingests from URL via screenshot service", async () => {
    vi.spyOn(publicUrlModule, "publicUrl").mockResolvedValueOnce(undefined as any);
    vi.spyOn(screenshotService, "captureScreenshot").mockResolvedValueOnce(
      Buffer.from("fake-png-bytes") as unknown as ArrayBuffer
    );
    vi.spyOn(designRecreation, "decodeRecreation").mockResolvedValueOnce(dummyRecipe);

    const caller = templateIngestionRouter.createCaller({
      user: { id: "user-123", email: "test@example.com" } as any,
      req: {} as any,
      res: {} as any,
    });

    const result = await caller.ingestFromUrl({
      url: "https://example.com/mock-design",
      viewport: "desktop",
    });

    expect(result.recipe.id).toBe("rec-test-1");
    expect(result.previewDataUrl).toContain("data:image/png;base64,");
  });

  it("rejects invalid or inaccessible URLs cleanly", async () => {
    vi.spyOn(publicUrlModule, "publicUrl").mockRejectedValueOnce(new Error("Endereço restrito"));

    const caller = templateIngestionRouter.createCaller({
      user: { id: "user-123", email: "test@example.com" } as any,
      req: {} as any,
      res: {} as any,
    });

    await expect(
      caller.ingestFromUrl({ url: "https://127.0.0.1/private" })
    ).rejects.toThrow("URL inacessível ou restrita");
  });
});
