import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRepertoireImportMode } from "./repertoireImportMode";
import { arsenalHash } from "../../shared/arsenalContent";
import {
  assemblyIdentity,
  compactComponentCard,
  createComponentDefinition,
} from "../../shared/componentAssembly";
import { completeDesignTestDefinitions } from "../../shared/completeDesignGeneration.fixture";
import { authorFamilyCarouselRepertoire } from "../../server/designCatalog/familyCarouselRepertoire";

const io = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  stage: vi.fn(),
  prepare: vi.fn(),
  manifest: vi.fn(),
  snapshot: vi.fn(),
  definition: vi.fn(),
}));
vi.mock("node:fs/promises", async importOriginal => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  default: { readFile: io.readFile, writeFile: io.writeFile },
}));
vi.mock("../../server/db", () => ({
  getDb: () => ({ rpc: io.rpc, from: io.from }),
}));
vi.mock("../../server/designCatalog/componentStore", () => ({
  prepareComponentDraft: io.prepare,
}));
vi.mock(
  "../../server/designCatalog/versionedCatalog",
  async importOriginal => ({
    ...(await importOriginal<
      typeof import("../../server/designCatalog/versionedCatalog")
    >()),
    withCatalogStaging: io.stage,
    readCatalogManifest: io.manifest,
    readCatalogSnapshot: io.snapshot,
    readCatalogDefinition: io.definition,
  })
);

describe("repertoire import mode", () => {
  it("requires no actor for verification and keeps an explicit revision", () => {
    expect(
      parseRepertoireImportMode(["package", "--verify-staged-revision", "3"])
    ).toEqual({ packagePath: "package", kind: "verify-staged", revision: "3" });
    expect(parseRepertoireImportMode(["package", "--verify-only"]).kind).toBe(
      "verify-local"
    );
    expect(
      parseRepertoireImportMode(["package", assemblyIdentity("admin")]).kind
    ).toBe("stage");
  });
  it.each([
    [],
    ["package"],
    ["package", "--verify-staged-revision"],
    ["package", "--verify-staged-revision", "0"],
    ["package", "--verify-staged-revision", "3.1"],
    ["package", "--verify-staged-revision", "3", "--verify-only"],
    ["package", assemblyIdentity("admin"), "--verify-staged-revision", "3"],
    ["package", "--verify-staged-revison", "3"],
  ])("rejects invalid or mixed modes %j", (...args) => {
    expect(() => parseRepertoireImportMode(args)).toThrow();
  });
});

describe("read-only reconciliation command", () => {
  const original = completeDesignTestDefinitions()[0];
  const source = createComponentDefinition({
    ...original,
    id: assemblyIdentity("readback-source"),
    completeDesign: { ...original.completeDesign!, authorshipRevision: 1 },
  });
  const definitions = [source, ...authorFamilyCarouselRepertoire(source)];
  const row = (d: typeof source) => ({
    component_id: d.id,
    definition_hash: d.hash,
    card: compactComponentCard(d),
    assets: d.assets,
    definition: d,
    design_components: {
      status: "draft",
      definition_hash: d.hash,
      source: d.source,
    },
  });
  const rows = definitions.map(row);
  const snapshot = { rows: [row(original), ...rows] };
  const manifest = {
    format: "postspark.catalog-repertoire",
    version: 3,
    snapshotHash: arsenalHash(rows),
    definitions: definitions.length,
    familyCandidates: 1,
    rows: [{ sourceId: original.id, sourceHash: original.hash }],
  };
  const argv = process.argv;
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = [
      "node",
      "importRepertoire.ts",
      "package",
      "--verify-staged-revision",
      "3",
    ];
    io.readFile.mockImplementation(async (p: string) =>
      JSON.stringify(p.endsWith("manifest.json") ? manifest : rows)
    );
    io.rpc.mockResolvedValue({
      data: { revision: "1", hash: "active-hash", dirty: false },
      error: null,
    });
    io.from.mockImplementation((table: string) => {
      expect(table).toBe("design_components");
      return {
        select: () => ({
          in: async () => ({
            data: [{ id: original.id, definition_hash: original.hash }],
            error: null,
          }),
        }),
      };
    });
    io.manifest.mockResolvedValue({
      revision: "3",
      hash: arsenalHash(snapshot),
    });
    io.snapshot.mockResolvedValue(snapshot);
    io.definition.mockImplementation(async (_revision, id) =>
      definitions.find(d => d.id === id)
    );
  });
  afterEach(() => {
    process.argv = argv;
    vi.restoreAllMocks();
  });
  it("uses the actual family/hash checks without invoking any staging or package write", async () => {
    await import("./importRepertoire");
    expect(io.stage).not.toHaveBeenCalled();
    expect(io.prepare).not.toHaveBeenCalled();
    expect(io.writeFile).not.toHaveBeenCalled();
    expect(io.rpc.mock.calls).toEqual([
      ["catalog_manifest"],
      ["catalog_manifest"],
    ]);
    expect(io.manifest).toHaveBeenCalledWith("3");
    expect(io.definition).toHaveBeenCalledTimes(definitions.length);
    const report = JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]);
    expect(report).toMatchObject({
      readOnly: true,
      stagedRevision: "3",
      activeRevision: "1",
      readbackVerified: true,
    });
  });
  it("rejects a cached snapshot that does not match the remote revision", async () => {
    io.manifest.mockResolvedValue({ revision: "3", hash: "another-hash" });
    await expect(import("./importRepertoire")).rejects.toThrow(
      "Remote revision snapshot hash mismatch"
    );
    expect(io.stage).not.toHaveBeenCalled();
    expect(io.prepare).not.toHaveBeenCalled();
  });
  it("rejects a divergent frozen definition", async () => {
    io.definition.mockResolvedValue(original);
    await expect(import("./importRepertoire")).rejects.toThrow(
      "Definition readback mismatch"
    );
    expect(io.writeFile).not.toHaveBeenCalled();
  });
  it("does not report success if the active catalog changed during verification", async () => {
    io.rpc
      .mockResolvedValueOnce({
        data: { revision: "1", hash: "active-hash", dirty: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { revision: "2", hash: "changed", dirty: false },
        error: null,
      });
    await expect(import("./importRepertoire")).rejects.toThrow(
      "Active catalog changed during this command"
    );
    expect(io.stage).not.toHaveBeenCalled();
    expect(io.writeFile).not.toHaveBeenCalled();
  });
});
