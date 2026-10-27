import { beforeEach, describe, it, expect, vi } from "vitest";
import { componentAssemblyFixture } from "../../shared/componentAssembly.fixture";
import {
  createComponentDefinition,
  compactComponentCard,
} from "../../shared/componentAssembly";
import { arsenalHash } from "@shared/arsenalContent";
const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  tables: [] as string[],
  rows: [] as any[],
  payloads: new Map<string, any>(),
  failWrite: false,
}));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(async (path: string) => {
    if (!state.files.has(path)) throw new Error("ENOENT");
    return state.files.get(path);
  }),
  writeFile: vi.fn(async (path: string, data: string) => {
    if (state.failWrite) throw new Error("ENOSPC");
    state.files.set(path, data);
  }),
  rename: vi.fn(async (a: string, b: string) => {
    state.files.set(b, state.files.get(a)!);
    state.files.delete(a);
  }),
}));
vi.mock("../db", () => ({
  getDb: () => ({
    rpc: vi.fn(async () => ({
      data: {
        revision: "1",
        formatVersion: 1,
        dirty: false,
        hash: arsenalHash({ rows: state.rows }),
      },
    })),
    from: (table: string) => {
      state.tables.push(table);
      const filters: any = {};
      const q: any = {
        select: () => q,
        eq: (k: string, v: string) => {
          filters[k] = v;
          return q;
        },
        single: async () => ({
          data:
            table === "catalog_revisions"
              ? {
                  snapshot: { rows: state.rows },
                  content_hash: arsenalHash({ rows: state.rows }),
                }
              : { payload: state.payloads.get(filters.component_id) },
        }),
      };
      return q;
    },
  }),
}));
function seed() {
  const definition = createComponentDefinition({
    ...componentAssemblyFixture()[0],
    completeDesign: { family: "example", baselineVerified: true },
  });
  const row = {
    component_id: definition.id,
    definition_hash: definition.hash,
    card: compactComponentCard(definition),
    design_components: {
      status: "approved",
      definition_hash: definition.hash,
      source: definition.source,
    },
  };
  state.rows = [row];
  state.payloads.set(definition.id, {
    ...row,
    definition,
    assets: definition.assets,
  });
  return definition;
}
beforeEach(() => {
  vi.resetModules();
  state.files.clear();
  state.tables = [];
  state.rows = [];
  state.payloads.clear();
  state.failWrite = false;
});
describe("immutable local catalogue", () => {
  it("downloads ten uses once, hydrates only the selected definition, and reuses disk after restart", async () => {
    const d = seed();
    let cache = await import("./versionedCatalog");
    await Promise.all(
      Array.from({ length: 10 }, () => cache.readCatalogSnapshot("1"))
    );
    expect(state.tables).toEqual(["catalog_revisions"]);
    const snapshot = await cache.readCatalogSnapshot("1");
    expect(snapshot.rows[0]).not.toHaveProperty("definition");
    await Promise.all([
      cache.readCatalogDefinition("1", d.id, d.hash),
      cache.readCatalogDefinition("1", d.id, d.hash),
    ]);
    expect(state.tables).toEqual([
      "catalog_revisions",
      "catalog_revision_definitions",
    ]);
    vi.resetModules();
    cache = await import("./versionedCatalog");
    await cache.readCatalogSnapshot("1");
    await cache.readCatalogDefinition("1", d.id, d.hash);
    expect(state.tables).toHaveLength(2);
  });
  it("replaces corrupt files and remains usable when disk is full", async () => {
    seed();
    let cache = await import("./versionedCatalog");
    await cache.readCatalogSnapshot("1");
    for (const key of state.files.keys()) state.files.set(key, "corrupt");
    vi.resetModules();
    state.failWrite = true;
    cache = await import("./versionedCatalog");
    await expect(cache.readCatalogSnapshot("1")).resolves.toHaveProperty(
      "rows"
    );
    expect(state.tables).toHaveLength(2);
    await cache.readCatalogSnapshot("1");
    expect(state.tables).toHaveLength(2);
  });
  it("rejects a complete publication with mismatched cards or missing assets", async () => {
    const d = seed();
    const cache = await import("./versionedCatalog");
    const row = state.payloads.get(d.id);
    expect(() =>
      cache.validateCatalogSnapshot(
        { rows: [{ ...row, card: { ...row.card, hash: "0".repeat(64) } }] },
        true
      )
    ).toThrow();
    expect(() =>
      cache.validateCatalogSnapshot({ rows: [{ ...row, assets: [] }] }, true)
    ).toThrow();
  });
  it("keeps the admitted revision in asynchronous preparation context", async () => {
    seed();
    const cache = await import("./versionedCatalog");
    await cache.withCatalogRevision("1", async () => {
      await Promise.resolve();
      expect(cache.pinnedCatalogRevision()).toBe("1");
      await cache.readCatalogSnapshot();
    });
    expect(cache.pinnedCatalogRevision()).toBeUndefined();
    expect(state.tables).toEqual(["catalog_revisions"]);
  });
  it("downloads selected asset bytes once and rejects mismatching bytes", async () => {
    const { createHash } = await import("node:crypto"),
      { cachedAssetBytes } = await import("./localAssetCache");
    const bytes = Buffer.from("verified asset"),
      hash = createHash("sha256").update(bytes).digest("hex"),
      download = vi.fn(async () => bytes);
    await Promise.all([
      cachedAssetBytes(hash, download),
      cachedAssetBytes(hash, download),
    ]);
    await cachedAssetBytes(hash, download);
    expect(download).toHaveBeenCalledTimes(1);
    await expect(
      cachedAssetBytes("a".repeat(64), async () => bytes)
    ).rejects.toThrow("asset_integrity_mismatch");
  });
});
