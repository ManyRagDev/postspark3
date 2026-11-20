import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createCanvas } from "@napi-rs/canvas";
import { randomUUID } from "node:crypto";
const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  configured: vi.fn(() => true),
  save: vi.fn(),
}));
vi.mock("../imageEditing/client", () => ({
  advancedImageEdit: mocks.process,
  imageEditorConfigured: mocks.configured,
  advancedImageCapabilities: vi.fn(async () => ({ available: true, tools: [] })),
}));
vi.mock("../mediaAssets", () => ({ saveUserMediaAsset: mocks.save }));
import { imageEditorRouter } from "./imageEditor";
import { decodeImageData } from "../imageEditing/raster";
import type { TrpcContext } from "../_core/context";
const owner = "00000000-0000-0000-0000-000000000001";
const imageData = createCanvas(8, 8).toDataURL("image/png");
const input = () => ({
  requestId: randomUUID(),
  imageData,
  operation: { kind: "trim" as const },
  format: "png" as const,
});
function context(auth = true) {
  return {
    req: new EventEmitter(),
    res: Object.assign(new EventEmitter(), { writableEnded: false }),
    user: auth
      ? { id: owner, role: "user", name: "User", email: "private@example.test" }
      : null,
  } as unknown as TrpcContext;
}
afterEach(() => vi.clearAllMocks());
describe("advanced image API ownership and publication", () => {
  it("requires authentication and does not process or publish for anonymous callers", async () => {
    const caller = imageEditorRouter.createCaller(context(false));
    await expect(caller.preview(input())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("previews without writing storage, binding processing to the authenticated actor", async () => {
    mocks.process.mockResolvedValue({ requestId: "preview" });
    const body = input();
    await imageEditorRouter.createCaller(context()).preview(body);
    expect(mocks.process).toHaveBeenCalledWith(
      body,
      owner,
      expect.any(AbortSignal)
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects changed receipts before publishing anything", async () => {
    const body = input(),
      hash = decodeImageData(imageData).sha256;
    await expect(
      imageEditorRouter
        .createCaller(context())
        .publish({
          ...body,
          result: {
            requestId: randomUUID(),
            imageData,
            sourceSha256: hash,
            resultSha256: hash,
            sourceDimensions: { width: 8, height: 8 },
            resultDimensions: { width: 8, height: 8 },
            format: "png",
          },
        })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("stores original and result only in the caller namespace and returns durable references", async () => {
    const body = input(),
      hash = decodeImageData(imageData).sha256,
      url = `/api/post-media/${owner}/${hash}`;
    mocks.save.mockResolvedValue({ url });
    const result = await imageEditorRouter
      .createCaller(context())
      .publish({
        ...body,
        result: {
          requestId: body.requestId,
          imageData,
          sourceSha256: hash,
          resultSha256: hash,
          sourceDimensions: { width: 8, height: 8 },
          resultDimensions: { width: 8, height: 8 },
          format: "png",
        },
      });
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenNthCalledWith(
      1,
      imageData,
      owner,
      expect.any(AbortSignal)
    );
    expect(result).toEqual({ inputUrl: url, resultUrl: url });
  });
});
