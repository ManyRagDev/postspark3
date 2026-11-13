import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  readFrozenCatalog,
  applyFrozenCatalog,
  validateImportTarget,
  type FrozenPackage,
  type FrozenImportPort,
} from "./importFrozenCatalog";
import { completeDesignTestDefinitions } from "../../shared/completeDesignGeneration.fixture";
import {
  createComponentDefinition,
  compactComponentCard,
} from "../../shared/componentAssembly";
import { arsenalHash } from "../../shared/arsenalContent";
const actor = "11111111-1111-4111-8111-111111111111",
  directories: string[] = [];
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const bytes = Buffer.from("offline asset byte-integrity fixture");
function bundle(): FrozenPackage {
  const d = completeDesignTestDefinitions()[0];
  const definition = createComponentDefinition({
    ...d,
    assets: d.assets.map(a => ({
      ...a,
      kind: "catalog",
      bytes: bytes.length,
      sha256: sha(bytes),
    })),
  });
  return {
    sourceHash: "a".repeat(64),
    definitions: [definition],
    assets: definition.assets.map(manifest => ({ manifest, bytes })),
    families: 1,
  };
}
async function packageDir() {
  const b = bundle(),
    dir = await mkdtemp(join(tmpdir(), "frozen-catalog-"));
  directories.push(dir);
  await mkdir(join(dir, "assets"));
  await mkdir(join(dir, "definitions"));
  const files: Record<string, { bytes: number; sha256: string }> = {};
  const put = async (name: string, value: unknown) => {
    const data = Buffer.isBuffer(value)
      ? value
      : Buffer.from(JSON.stringify(value));
    await writeFile(join(dir, name), data);
    files[name] = { bytes: data.length, sha256: sha(data) };
  };
  for (const d of b.definitions) await put(`definitions/${d.id}.json`, d);
  for (const a of b.assets) await put(`assets/${a.manifest.sha256}`, a.bytes);
  const snapshot = {
      rows: b.definitions.map(d => ({
        card: compactComponentCard(d),
        component_id: d.id,
        definition_hash: d.hash,
      })),
    },
    hash = arsenalHash(snapshot);
  await put("snapshot.json", { revision: "offline-source", hash, snapshot });
  await put("registry.json", {
    entries: [
      {
        id: "test",
        definitions: b.definitions.map(d => ({ id: d.id, hash: d.hash })),
      },
    ],
  });
  await put("provenance.json", {});
  const manifest = {
    catalogHash: hash,
    definitions: b.definitions.length,
    assets: b.assets.length,
    activationApproved: false,
    files,
  };
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest));
  return { dir, b, manifest };
}
function port(b: FrozenPackage) {
  let rows: any[] = [];
  const grants = new Set<string>();
  const p: FrozenImportPort = {
    assertAdmin: vi.fn(async () => {}),
    inspect: vi.fn(async () => ({ activeRevision: null, components: rows })),
    checkAsset: vi.fn(async () => {}),
    upload: vi.fn(async () => {}),
    stage: vi.fn(async ds => {
      rows = ds.map(d => ({
        id: d.id,
        hash: d.hash,
        status: "draft",
        definition: d,
      }));
      return { revision: "7", hash: "b".repeat(64) };
    }),
    grant: vi.fn(async (ds, a) => {
      for (const d of ds)
        for (const asset of d.assets) grants.add(`${a}:${d.id}:${asset.id}`);
    }),
  };
  return { p, grants };
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(d => rm(d, { recursive: true, force: true }))
  );
  vi.restoreAllMocks();
});
describe("frozen catalog import boundary", () => {
  it("verifies package entirely offline and rejects corruption before any runtime import", async () => {
    const { dir, b, manifest } = await packageDir();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(Error("network forbidden"));
    expect((await readFrozenCatalog(dir)).definitions).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
    await writeFile(join(dir, `definitions/${b.definitions[0].id}.json`), "{}");
    await expect(readFrozenCatalog(dir, manifest.catalogHash)).rejects.toThrow(
      "file_mismatch"
    );
  });
  it("rejects wrong expected hash and approved package", async () => {
    const { dir, manifest } = await packageDir();
    await expect(readFrozenCatalog(dir, "c".repeat(64))).rejects.toThrow(
      "expected_hash"
    );
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify({ ...manifest, activationApproved: true })
    );
    await expect(readFrozenCatalog(dir)).rejects.toThrow();
  });
  it("rejects symlink escape", async () => {
    const { dir } = await packageDir();
    await rm(join(dir, "snapshot.json"));
    await symlink("/etc/passwd", join(dir, "snapshot.json"));
    await expect(readFrozenCatalog(dir)).rejects.toThrow("path_escape");
  });
  it("requires exact host including port and valid actor without URL credentials", () => {
    expect(
      validateImportTarget(
        "http://127.0.0.1:8000",
        "127.0.0.1:8000",
        actor,
        "a".repeat(64)
      )
    ).toBe("http://127.0.0.1:8000");
    expect(() =>
      validateImportTarget(
        "https://wrong.test",
        "target.test",
        actor,
        "a".repeat(64)
      )
    ).toThrow();
    expect(() =>
      validateImportTarget(
        "https://secret@target.test",
        "target.test",
        actor,
        "a".repeat(64)
      )
    ).toThrow();
    expect(() =>
      validateImportTarget(
        "https://target.test",
        "target.test",
        "not-uuid",
        "a".repeat(64)
      )
    ).toThrow();
  });
  it("stages without activation and grants only confirmed actor; repeat has same identities", async () => {
    const b = bundle(),
      { p, grants } = port(b);
    const first = await applyFrozenCatalog(b, actor, p),
      size = grants.size;
    expect(await applyFrozenCatalog(b, actor, p)).toEqual(first);
    expect(grants.size).toBe(size);
    expect([...grants].every(g => g.startsWith(actor + ":"))).toBe(true);
    expect(first).toMatchObject({
      sourceHash: b.sourceHash,
      revision: "7",
      activeRevision: null,
      activationApproved: false,
      editorialMissing: true,
      generatable: false,
      sourceGrantsPresent: false,
    });
    expect(Object.keys(p)).not.toContain("activate");
  });
  it("rejects non-admin before reads or writes", async () => {
    const b = bundle(),
      { p } = port(b);
    vi.mocked(p.assertAdmin).mockRejectedValue(Error("not_admin"));
    await expect(applyFrozenCatalog(b, actor, p)).rejects.toThrow("not_admin");
    expect(p.inspect).not.toHaveBeenCalled();
    expect(p.upload).not.toHaveBeenCalled();
  });
  it("rejects active head, foreign component, changed bytes and approved existing component before writes", async () => {
    const b = bundle();
    for (const state of [
      { activeRevision: "1", components: [] },
      {
        activeRevision: null,
        components: [
          { id: "foreign", hash: "a", status: "draft", definition: {} },
        ],
      },
      {
        activeRevision: null,
        components: [
          {
            id: b.definitions[0].id,
            hash: b.definitions[0].hash,
            status: "approved",
            definition: b.definitions[0],
          },
        ],
      },
      {
        activeRevision: null,
        components: [
          {
            id: b.definitions[0].id,
            hash: b.definitions[0].hash,
            status: "draft",
            definition: {},
          },
        ],
      },
    ]) {
      const { p } = port(b);
      vi.mocked(p.inspect).mockResolvedValue(state);
      await expect(applyFrozenCatalog(b, actor, p)).rejects.toThrow();
      expect(p.upload).not.toHaveBeenCalled();
      expect(p.stage).not.toHaveBeenCalled();
    }
  });
  it("preflights every asset conflict before uploads", async () => {
    const b = bundle(),
      { p } = port(b);
    vi.mocked(p.checkAsset).mockRejectedValue(Error("asset_conflict"));
    await expect(applyFrozenCatalog(b, actor, p)).rejects.toThrow(
      "asset_conflict"
    );
    expect(p.upload).not.toHaveBeenCalled();
  });
  it("does not grant if head changed during stage", async () => {
    const b = bundle(),
      { p } = port(b);
    vi.mocked(p.inspect)
      .mockResolvedValueOnce({ activeRevision: null, components: [] })
      .mockResolvedValueOnce({ activeRevision: "9", components: [] });
    await expect(applyFrozenCatalog(b, actor, p)).rejects.toThrow(
      "head_changed"
    );
    expect(p.grant).not.toHaveBeenCalled();
  });
});
