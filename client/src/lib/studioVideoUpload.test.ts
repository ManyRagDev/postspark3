import { expect, it, vi } from "vitest";
import { uploadStudioAsset } from "../../../labs/mare-studio/dist/studio-upload.js";

it("resumes only missing chunks after interruption and reuses the registered asset", async () => {
  const parts = new Map<number, Blob>(),
    assetId = crypto.randomUUID(),
    uploadId = crypto.randomUUID();
  const file = new Blob(["one-two-three"]);
  let disconnect = true,
    complete = false;
  const digests: string[] = [];
  const fetch = vi.fn(async (path: string, req: RequestInit) => {
    if (path === "/api/mare/uploads") {
      const input = JSON.parse(String(req.body));
      digests.push(input.sha256);
      return Response.json(
        complete
          ? { assetId }
          : { uploadId, partBytes: 4, received: Array.from(parts.keys()) }
      );
    }
    if (path.endsWith("/complete")) {
      expect(await new Blob(Array.from(parts.values())).text()).toBe(
        "one-two-three"
      );
      complete = true;
      return Response.json({ assetId });
    }
    const index = Number(path.split("/").pop());
    if (index === 1 && disconnect) {
      disconnect = false;
      throw Error("offline");
    }
    expect(parts.has(index)).toBe(false);
    parts.set(index, req.body as Blob);
    return Response.json({ part: index });
  });
  vi.stubGlobal("fetch", fetch);
  try {
    await expect(uploadStudioAsset(file)).rejects.toThrow("offline");
    expect(Array.from(parts.keys())).toEqual([0]);
    expect((await uploadStudioAsset(file)).assetId).toBe(assetId);
    expect((await uploadStudioAsset(file)).assetId).toBe(assetId);
    expect(new Set(digests).size).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
