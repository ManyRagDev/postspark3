import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { randomUUID } from "node:crypto";
import { advancedImageEdit, imageEditorConfigured } from "./client";
import { decodeImageData } from "./raster";
const imageData = createCanvas(12, 12).toDataURL("image/png");
const digest = decodeImageData(imageData).sha256;
const input = () => ({
  requestId: randomUUID(),
  imageData,
  operation: { kind: "trim" as const },
  format: "png" as const,
});
const result = (requestId: string) => ({
  requestId,
  imageData,
  sourceSha256: digest,
  resultSha256: digest,
  sourceDimensions: { width: 12, height: 12 },
  resultDimensions: { width: 12, height: 12 },
  format: "png",
});
beforeEach(() => {
  vi.stubEnv("ADVANCED_IMAGE_EDITOR_ENABLED", "true");
  vi.stubEnv("ADVANCED_IMAGE_PROCESSOR_URL", "http://image-editor:9417");
  vi.stubEnv("ADVANCED_IMAGE_PROCESSOR_TOKEN", "test-credential-".repeat(4));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("API to private processing transport", () => {
  it("is disabled until explicitly configured and does not invoke the transport", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("ADVANCED_IMAGE_EDITOR_ENABLED", "false");
    expect(imageEditorConfigured()).toBe(false);
    await expect(advancedImageEdit(input(), "actor")).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends only the trusted actor and validated intent and accepts a matching receipt", async () => {
    const body = input();
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify(result(body.requestId)))
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await advancedImageEdit(body, "actor")).toMatchObject({
      requestId: body.requestId,
      resultSha256: digest,
    });
    const options = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(options.body as string)).toMatchObject({
      actor: "actor",
      operation: { kind: "trim" },
    });
    expect(options.redirect).toBe("error");
  });
  it("refuses altered correlation/dimensions instead of returning a different image as a successful edit", async () => {
    const body = input();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ...result(body.requestId),
              sourceDimensions: { width: 100, height: 100 },
            })
          )
      )
    );
    await expect(advancedImageEdit(body, "actor")).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });
  it("bounds in-flight requests before decoding and releases permits after completion", async () => {
    const finish: Array<() => void> = [];
    const fetcher = vi.fn(
      (_url: unknown, options: RequestInit) =>
        new Promise<Response>(resolve => {
          const body = JSON.parse(options.body as string);
          finish.push(() =>
            resolve(new Response(JSON.stringify(result(body.requestId))))
          );
        })
    );
    vi.stubGlobal("fetch", fetcher);
    const a = advancedImageEdit(input(), "a");
    await expect(advancedImageEdit(input(), "a")).rejects.toMatchObject({
      code: "BUSY",
    });
    const b = advancedImageEdit(input(), "b");
    await expect(advancedImageEdit(input(), "c")).rejects.toMatchObject({
      code: "BUSY",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    finish.forEach(resolve => resolve());
    await Promise.all([a, b]);
  });
});
