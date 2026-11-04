import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parseEditorialCatalogImportArgs,
  parseEditorialSnapshotEnvelope,
  runEditorialCatalogImport,
  validateEditorialCatalogSources,
  type EditorialCatalogImportDependencies,
} from "../../harness/completeDesigns/importEditorialCatalog";
import seedJson from "../../harness/completeDesigns/editorialCatalogSeed.json";
import { arsenalHash } from "../../shared/arsenalContent";
import { componentAssemblyFixture } from "../../shared/componentAssembly.fixture";
import { compactComponentCard, createComponentDefinition } from "../../shared/componentAssembly";
import {
  editorialCatalogDocumentSchema,
  editorialCatalogHash,
  type EditorialCatalogDocument,
} from "../../shared/editorialIntent";
import type { CatalogSnapshot } from "./versionedCatalog";

const sourceId = "10000000-0000-4000-8000-000000000001";
const editorialRevision = "20000000-0000-4000-8000-000000000001";
const revision = "4";
function fixture() {
  const definition = createComponentDefinition({
    ...componentAssemblyFixture()[0], id: sourceId,
    completeDesign: { family: "same-name", baselineVerified: true },
  });
  const snapshot: CatalogSnapshot = { rows: [{
    component_id: definition.id, definition_hash: definition.hash,
    card: compactComponentCard(definition),
    design_components: { status: "approved", definition_hash: definition.hash, source: definition.source },
  }] };
  const document: EditorialCatalogDocument = { version: 1,
    intents: [{ id: "nova_intencao", label: "Nova intenção", description: "Abordagem nova definida pelo catálogo, sem enum no runtime." }],
    designs: [{ sourceId, sourceHash: definition.hash, intentIds: ["nova_intencao"], rationale: "Uma capacidade editorial anotada." }],
  };
  const envelope = { revision, hash: arsenalHash(snapshot), snapshot };
  const dependencies = {
    readDocument: vi.fn(async () => document),
    readLocalSnapshot: vi.fn(async () => envelope),
    readRemoteSnapshot: vi.fn(async () => ({ snapshot, hash: envelope.hash })),
    publish: vi.fn(async (catalogRevision: string, value: EditorialCatalogDocument) => ({
      version: 1 as const, catalogRevision, revision: editorialRevision,
      hash: editorialCatalogHash(value), document: value,
    })),
  } satisfies EditorialCatalogImportDependencies;
  return { definition, snapshot, document, envelope, dependencies };
}

describe("editorial catalog CLI", () => {
  const args = ["--catalog-revision", revision, "--file", "authored.json"];
  it("defaults to local verification and accepts publication only explicitly", () => {
    expect(parseEditorialCatalogImportArgs(args)).toEqual({ catalogRevision: revision, file: "authored.json", publish: false });
    expect(parseEditorialCatalogImportArgs([...args, "--publish", "--snapshot", "snapshot.json"])).toEqual({
      catalogRevision: revision, file: "authored.json", publish: true, snapshotFile: "snapshot.json",
    });
  });
  it.each([
    [], ["--catalog-revision", "4"], ["--file", "seed.json"],
    ["--catalog-revision", "0", "--file", "seed.json"],
    ["--catalog-revision", "04", "--file", "seed.json"],
    ["--catalog-revision", "9223372036854775808", "--file", "seed.json"],
    [...args, "--publish", "--publish"], [...args, "--force"],
    [...args, "--file", "other.json"], [...args, "--snapshot"],
  ])("rejects malformed or conflicting arguments before side effects: %j", bad => {
    expect(() => parseEditorialCatalogImportArgs(bad)).toThrow();
  });
  it("accepts a newly authored intent and design without seed or model dependencies", async () => {
    const { dependencies, document } = fixture();
    const result = await runEditorialCatalogImport(parseEditorialCatalogImportArgs(args), dependencies);
    expect(result).toEqual({ catalogRevision: revision, hash: editorialCatalogHash(document), intents: 1, designs: 1,
      mode: "verify-local", published: false, remoteCalls: 0 });
    expect(dependencies.readRemoteSnapshot).not.toHaveBeenCalled();
    expect(dependencies.publish).not.toHaveBeenCalled();
  });
  it("rejects a malformed document without reading a snapshot", async () => {
    const { dependencies, document } = fixture();
    document.designs[0].intentIds = ["undeclared"];
    await expect(runEditorialCatalogImport(parseEditorialCatalogImportArgs([...args, "--publish"]), dependencies)).rejects.toThrow();
    expect(dependencies.readLocalSnapshot).not.toHaveBeenCalled();
    expect(dependencies.readRemoteSnapshot).not.toHaveBeenCalled();
    expect(dependencies.publish).not.toHaveBeenCalled();
  });
  it("fails a local cache miss without falling back to network", async () => {
    const { dependencies } = fixture();
    dependencies.readLocalSnapshot.mockRejectedValue(new Error("absent"));
    await expect(runEditorialCatalogImport(parseEditorialCatalogImportArgs(args), dependencies)).rejects.toThrow("absent");
    expect(dependencies.readRemoteSnapshot).not.toHaveBeenCalled();
    expect(dependencies.publish).not.toHaveBeenCalled();
  });
  it("checks the immutable remote snapshot and publishes exactly the authored registry", async () => {
    const { dependencies, document, snapshot } = fixture();
    const before = structuredClone(snapshot);
    const result = await runEditorialCatalogImport(parseEditorialCatalogImportArgs([...args, "--publish"]), dependencies);
    expect(result).toMatchObject({ published: true, editorialRevision, hash: editorialCatalogHash(document) });
    expect(dependencies.readLocalSnapshot).not.toHaveBeenCalled();
    expect(dependencies.readRemoteSnapshot).toHaveBeenCalledWith(revision);
    expect(dependencies.publish).toHaveBeenCalledTimes(1);
    expect(dependencies.publish).toHaveBeenCalledWith(revision, document);
    expect(snapshot).toEqual(before);
  });
  it("does not use an explicit local snapshot as publication authority", async () => {
    const { dependencies } = fixture();
    dependencies.readRemoteSnapshot.mockResolvedValue({ snapshot: { rows: [] }, hash: arsenalHash({ rows: [] }) });
    await expect(runEditorialCatalogImport(parseEditorialCatalogImportArgs([...args, "--snapshot", "local.json", "--publish"]), dependencies))
      .rejects.toThrow("editorial_source_identity_mismatch");
    expect(dependencies.publish).not.toHaveBeenCalled();
  });
  it("refuses publication when the snapshot differs from the server manifest", async () => {
    const { dependencies, snapshot } = fixture();
    dependencies.readRemoteSnapshot.mockResolvedValue({ snapshot, hash: "0".repeat(64) });
    await expect(runEditorialCatalogImport(parseEditorialCatalogImportArgs([...args, "--publish"]), dependencies))
      .rejects.toThrow("editorial_remote_snapshot_hash_mismatch");
    expect(dependencies.publish).not.toHaveBeenCalled();
  });
  it("rejects a publication response attached to another catalog revision", async () => {
    const { dependencies, document } = fixture();
    dependencies.publish.mockResolvedValue({ version: 1, catalogRevision: "99", revision: editorialRevision,
      hash: editorialCatalogHash(document), document });
    await expect(runEditorialCatalogImport(parseEditorialCatalogImportArgs([...args, "--publish"]), dependencies))
      .rejects.toThrow("editorial_publication_identity_mismatch");
  });
});

describe("editorial source integrity", () => {
  it("checks envelope revision and integrity", () => {
    const { envelope, snapshot } = fixture();
    expect(parseEditorialSnapshotEnvelope(envelope, revision)).toEqual(snapshot);
    expect(() => parseEditorialSnapshotEnvelope(envelope, "2")).toThrow("revision_mismatch");
    expect(() => parseEditorialSnapshotEnvelope({ ...envelope, hash: "0".repeat(64) }, revision)).toThrow("hash_mismatch");
    expect(() => parseEditorialSnapshotEnvelope({ ...envelope, snapshot: null }, revision)).toThrow("snapshot_invalid");
  });
  it("rejects mismatched immutable source hashes", () => {
    const { document, snapshot } = fixture();
    document.designs[0].sourceHash = "f".repeat(64);
    expect(() => validateEditorialCatalogSources(document, snapshot)).toThrow("source_identity_mismatch");
  });
  it("rejects inconsistent rows and duplicate identities", () => {
    const { document, snapshot } = fixture();
    snapshot.rows.push(structuredClone(snapshot.rows[0]));
    expect(() => validateEditorialCatalogSources(document, snapshot)).toThrow("duplicate_source");
    snapshot.rows.pop();
    snapshot.rows[0].design_components.definition_hash = "f".repeat(64);
    expect(() => validateEditorialCatalogSources(document, snapshot)).toThrow("snapshot_identity_mismatch");
  });
  it("rejects variants, non-design cards and archived sources", () => {
    const { document, snapshot } = fixture();
    const card = compactComponentCard(fixture().definition);
    snapshot.rows[0].card = card;
    card.completeDesign!.designGuidance = { version: 1, summary: "A variant", motifs: [], preserve: [], contentRules: [],
      mediaRules: [], knownLimitations: [], carouselVariant: { version: 1, role: "development", sourceId, sourceHash: card.hash } };
    expect(() => validateEditorialCatalogSources(document, snapshot)).toThrow("source_not_original_design");
    delete card.completeDesign;
    expect(() => validateEditorialCatalogSources(document, snapshot)).toThrow("source_not_original_design");
    snapshot.rows[0].card = compactComponentCard(fixture().definition);
    snapshot.rows[0].design_components.status = "archived";
    expect(() => validateEditorialCatalogSources(document, snapshot)).toThrow("source_unavailable");
  });
  it("allows draft sources and keeps homonymous designs separate", () => {
    const { document, snapshot, definition } = fixture();
    const other = createComponentDefinition({ ...definition, id: "10000000-0000-4000-8000-000000000002" });
    snapshot.rows[0].design_components.status = "draft";
    snapshot.rows.push({ component_id: other.id, definition_hash: other.hash, card: compactComponentCard(other),
      design_components: { status: "approved", definition_hash: other.hash, source: other.source } });
    document.designs.push({ ...document.designs[0], sourceId: other.id, sourceHash: other.hash });
    expect(validateEditorialCatalogSources(document, snapshot).designs).toHaveLength(2);
  });
});

describe("authored editorial seed", () => {
  const seed = editorialCatalogDocumentSchema.parse(seedJson);
  it("declares reusable semantic intentions and all 29 independent sources", () => {
    expect(seed.designs).toHaveLength(29);
    expect(seed.intents.length).toBeGreaterThan(1);
    expect(seed.intents.length).toBeLessThan(seed.designs.length);
    expect(new Set(seed.designs.map(d => d.sourceId)).size).toBe(29);
    expect(new Set(seed.designs.flatMap(d => d.intentIds))).toEqual(new Set(seed.intents.map(i => i.id)));
    expect(seed.designs.some(d => d.intentIds.length > 1)).toBe(true);
  });
  it("keeps criticism distinct from comparison and describes scoped prohibitions", () => {
    const definitions = new Map(seed.intents.map(i => [i.id, i.description]));
    expect(definitions.get("analisar_pontos_negativos")).toContain("não exige comparação");
    expect(definitions.get("comparar_alternativas")).toContain("sem comparar");
    expect(seed.designs.find(d => d.sourceId === "f49daa11-9ba1-4313-8e14-6097bb187757")?.intentIds)
      .toEqual(["comparar_alternativas", "esclarecer_equivoco"]);
    expect(seed.designs.find(d => d.sourceId === "a8562b71-e1e1-4bfa-8cdd-28194a40b6f1")?.intentIds)
      .not.toContain("comparar_alternativas");
  });
  it("does not promise unavailable image slots or fabricated metrics", () => {
    const poster = seed.designs.find(d => d.sourceId === "b5e7822f-8163-437f-81e7-7fea73cbe87d")!;
    expect(poster.intentIds).not.toContain("apresentar_com_imagem");
    expect(poster.rationale).toContain("não oferece slot de mídia");
    expect(seed.intents.find(i => i.id === "destacar_dado")?.description).toContain("não autoriza criar uma estatística");
  });
  const packageRoot = path.resolve("artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9");
  it.skipIf(!existsSync(path.join(packageRoot, "manifest.json")))("matches every source ID/hash to the actual local r9 package", () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "manifest.json"), "utf8"));
    const rows = JSON.parse(readFileSync(path.join(packageRoot, "catalog-rows.json"), "utf8"));
    expect(arsenalHash(rows)).toBe(manifest.snapshotHash);
    expect(validateEditorialCatalogSources(seed, { rows }).designs).toHaveLength(29);
    const origins = new Map(manifest.rows.map((r: { componentId: string; componentHash: string }) => [r.componentId, r.componentHash]));
    for (const design of seed.designs) expect(origins.get(design.sourceId)).toBe(design.sourceHash);
    expect(origins.size).toBe(seed.designs.length);
  });
});
