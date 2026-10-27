// @vitest-environment happy-dom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { cachedCatalog, clearCatalogCache } from "./catalogCache";
const value = (revision = "1", ownerId = "u") => ({
  revision,
  ownerId,
  scope: "approved",
  formatVersion: 1 as const,
  hash: arsenalHash([]),
  rows: [],
});
beforeEach(async () => {
  await clearCatalogCache();
});
describe("browser catalogue", () => {
  it("coalesces concurrent and sequential actions even when disk is unavailable", async () => {
    const download = vi.fn(async () => value());
    await Promise.all(
      Array.from({ length: 5 }, () =>
        cachedCatalog("p", "u", "approved", "1", download)
      )
    );
    for (let i = 0; i < 5; i++)
      await cachedCatalog("p", "u", "approved", "1", download);
    expect(download).toHaveBeenCalledTimes(1);
  });
  it("rejects corrupt or differently scoped responses, then retries cleanly", async () => {
    await expect(
      cachedCatalog("p", "u", "approved", "2", async () => ({
        ...value("2"),
        rows: ["corruption"],
      }))
    ).rejects.toThrow();
    await expect(
      cachedCatalog("p", "u", "approved", "2", async () => value("2", "other"))
    ).rejects.toThrow();
    expect(
      await cachedCatalog("p", "u", "approved", "2", async () => value("2"))
    ).toEqual(value("2"));
  });
  it("does not retain a response arriving after logout", async () => {
    let release!: (v: ReturnType<typeof value>) => void;
    const result = cachedCatalog(
      "p",
      "u",
      "approved",
      "3",
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await clearCatalogCache();
    release(value("3"));
    await expect(result).rejects.toThrow("catalog_session_changed");
    const download = vi.fn(async () => value("3"));
    await cachedCatalog("p", "u", "approved", "3", download);
    expect(download).toHaveBeenCalledTimes(1);
  });
});
