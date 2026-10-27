import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import type { ArsenalComposition } from "@shared/designArsenal";

const owned = vi.hoisted(() => vi.fn());
vi.mock("../../mediaAssets", () => ({ loadOwnedMediaReference: owned }));
import { hydrateReviewComposition } from "./proposalRenderer";

const actor = "00000000-0000-4000-8000-000000000001";
const scene = (url: string) =>
  ({ version: 2, elements: [], assets: [], media: { photo: { url } } }) as ArsenalComposition;
beforeEach(() => vi.clearAllMocks());

describe("review renderer media boundary", () => {
  it("hydrates immutable raster assets by verified manifest without mutating the persisted scene", async () => {
    const bytes=createCanvas(32,32).toBuffer("image/png");
    const sha256=createHash("sha256").update(bytes).digest("hex");
    const asset={id:`image-${sha256}`,kind:"catalog" as const,sha256,mimeType:"image/png",bytes:bytes.length};
    const input={version:2,media:{},assets:[asset],elements:[{id:"background",kind:"media",imageAssetId:asset.id}]} as unknown as ArsenalComposition;
    const loader=vi.fn().mockResolvedValue(bytes);
    const hydrated=await hydrateReviewComposition(input,{actor,loadAssetBytes:loader});
    expect(hydrated.media.background.url).toBe(`data:image/png;base64,${bytes.toString("base64")}`);
    expect(input.media).toEqual({});
    expect(loader).toHaveBeenCalledWith(asset,undefined);
    await expect(hydrateReviewComposition(input,{actor,loadAssetBytes:async()=>Buffer.from("wrong")})).rejects.toThrow("image_hash_mismatch");
    await expect(hydrateReviewComposition({...input,assets:[]},{actor,loadAssetBytes:loader})).rejects.toThrow("image_manifest_missing");
    loader.mockClear();
    await expect(hydrateReviewComposition(input,{actor,loadAssetBytes:loader,signal:AbortSignal.abort(new Error("cancelled"))})).rejects.toThrow("cancelled");
    expect(loader).not.toHaveBeenCalled();
  });
  it.each([
    "https://example.com/photo.png",
    "http://169.254.169.254/latest/meta-data/",
    "file:///etc/passwd",
    "data:image/svg+xml;base64,PHN2Zz4=",
  ])("rejects browser-fetchable or active media: %s", async url => {
    await expect(
      hydrateReviewComposition(scene(url), { actor })
    ).rejects.toThrow("unsafe_media");
    expect(owned).not.toHaveBeenCalled();
  });
  it("checks actual raster bytes and preserves the caller's document", async () => {
    const uri = createCanvas(32, 32).toDataURL("image/png");
    const input = scene(uri);
    const result = await hydrateReviewComposition(input, { actor });
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    await expect(
      hydrateReviewComposition(scene("data:image/png;base64,bm90IGltYWdl"), {
        actor,
      })
    ).rejects.toThrow();
    await expect(
      hydrateReviewComposition(scene(uri.replace("image/png", "image/jpeg")), {
        actor,
      })
    ).rejects.toThrow("invalid_media");
  });
  it("resolves private media through the owner-bound server loader, once per URL", async () => {
    const url = `/api/post-media/${actor}/${"a".repeat(64)}`;
    const dataUri = createCanvas(32, 32).toDataURL("image/png");
    owned.mockResolvedValue({ dataUri });
    const input = scene(url);
    input.media.second = { ...input.media.photo };
    const signal = new AbortController().signal;
    const result = await hydrateReviewComposition(input, { actor, signal });
    expect(owned).toHaveBeenCalledTimes(1);
    expect(owned).toHaveBeenCalledWith(url, actor, signal);
    expect(result.media.photo.url).toBe(dataUri);
    expect(input.media.photo.url).toBe(url);
  });
  it("does not read private media after cancellation or deadline", async () => {
    const url = `/api/post-media/${actor}/${"a".repeat(64)}`;
    await expect(
      hydrateReviewComposition(scene(url), {
        actor,
        signal: AbortSignal.abort(new Error("cancelled")),
      })
    ).rejects.toThrow("cancelled");
    await expect(
      hydrateReviewComposition(scene(url), {
        actor,
        deadlineMs: Date.now() - 1,
      })
    ).rejects.toThrow("timeout");
    expect(owned).not.toHaveBeenCalled();
  });
});
