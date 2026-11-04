import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { generationReleasePostgresFixture } from "../ai/workflows/generationReleasePostgres.fixture";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard } from "@shared/componentAssembly";
import { arsenalCanonicalJson } from "@shared/arsenalContent";
import { canonicalizeEditorialCatalogDocument, editorialCatalogHash, frozenEditorialCatalogSchema, type EditorialCatalogDocument } from "@shared/editorialIntent";

let pg: PGlite;
const [first, second] = completeDesignTestDefinitions().map(compactComponentCard);
const variantId = randomUUID();
const variant = { ...second, id: variantId, completeDesign: { ...second.completeDesign, designGuidance: { carouselVariant: { sourceId: first.id, sourceHash: first.hash } } } };
let release: string, otherRelease: string;
const document: EditorialCatalogDocument = { version: 1,
  intents: [
    { id: "summary", label: "Síntese 🧩", description: "Concluir \"uma ideia\" com clareza.\nSem detalhes novos." },
    { id: "comparison", label: "Comparar", description: "Contrapor alternativas." },
  ],
  designs: [
    { sourceId: second.id, sourceHash: second.hash, intentIds: ["summary", "comparison"], rationale: "Áreas de leitura com ênfases distintas." },
    { sourceId: first.id, sourceHash: first.hash, intentIds: ["comparison"], rationale: "Título e apoio no mesmo desenho." },
  ],
};
const sql = "SELECT postspark.editorial_catalog_publish($1::bigint,$2::jsonb,$3) AS value";
async function value<T = any>(sql: string, params: unknown[] = []): Promise<T> { return (await pg.query<{ value: T }>(sql, params)).rows[0]?.value; }
async function publish(doc = document, revision = release, hash = editorialCatalogHash(doc)) {
  return value(sql, [revision, JSON.stringify(doc), hash]);
}
async function rejected(sql: string, params: unknown[], message: string | RegExp) {
  await pg.exec("SAVEPOINT expected_failure");
  try { await expect(pg.query(sql, params)).rejects.toThrow(message); }
  finally { await pg.exec("ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure"); }
}

beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  await pg.exec(readFileSync(new URL("../../drizzle/0055_editorial_catalog.sql", import.meta.url), "utf8"));
  const rows = [first, second, variant].map(card => ({ component_id: card.id, definition_hash: card.hash, card }));
  release = await value("INSERT INTO postspark.catalog_revisions(source_revision,snapshot,summary,content_hash) VALUES(100,$1::jsonb,'{}',$2) RETURNING revision::text AS value", [JSON.stringify({ rows }), "a".repeat(64)]);
  otherRelease = await value("INSERT INTO postspark.catalog_revisions(source_revision,snapshot,summary,content_hash) VALUES(101,$1::jsonb,'{}',$2) RETURNING revision::text AS value", [JSON.stringify({ rows: [{ component_id: first.id, definition_hash: "b".repeat(64), card: { ...first, hash: "b".repeat(64) } }] }), "b".repeat(64)]);
}, 30_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => { await pg.exec("BEGIN"); });
afterEach(async () => { await pg.exec("ROLLBACK"); });

describe("editorial catalog / PostgreSQL", () => {
  it("publishes atomically, canonicalizes identically to TypeScript and leaves design releases unchanged", async () => {
    const before = await value("SELECT jsonb_build_object('releases',(SELECT jsonb_agg(to_jsonb(r)) FROM postspark.catalog_revisions r),'state',(SELECT to_jsonb(s) FROM postspark.catalog_state s)) AS value");
    expect(await value("SELECT postspark.editorial_catalog_head($1) AS value", [release])).toBeNull();
    await pg.exec("SET ROLE service_role");
    const published = frozenEditorialCatalogSchema.parse(await publish());
    expect(published.document).toEqual(canonicalizeEditorialCatalogDocument(document));
    expect(published.hash).toBe(editorialCatalogHash(document));
    expect(await value("SELECT postspark.editorial_catalog_head($1) AS value", [release])).toEqual({ revision: published.revision, hash: published.hash });
    await pg.exec("RESET ROLE");
    expect(await value("SELECT postspark.editorial_canonical_json($1::jsonb) AS value", [JSON.stringify(published.document)]))
      .toBe(arsenalCanonicalJson(published.document));
    expect(await value("SELECT jsonb_build_object('releases',(SELECT jsonb_agg(to_jsonb(r)) FROM postspark.catalog_revisions r),'state',(SELECT to_jsonb(s) FROM postspark.catalog_state s)) AS value")).toEqual(before);
  });

  it("reuses identical content, retains old revisions and supports returning to an earlier annotation", async () => {
    const initial = await publish();
    const reordered = { ...document, intents: [...document.intents].reverse(), designs: [...document.designs].reverse() };
    expect((await publish(reordered)).revision).toBe(initial.revision);
    const updated = { ...document, designs: [{ ...document.designs[0], rationale: "Outra anotação editorial." }] };
    const later = await publish(updated);
    expect(later.revision).not.toBe(initial.revision);
    expect(await value("SELECT count(*)::int AS value FROM postspark.editorial_catalog_revisions")).toBe(2);
    expect(await value("SELECT document AS value FROM postspark.editorial_catalog_revisions WHERE id=$1", [initial.revision])).toEqual(initial.document);
    expect((await publish()).revision).toBe(initial.revision);
    expect(await value("SELECT postspark.editorial_catalog_head($1) AS value", [release])).toEqual({ revision: initial.revision, hash: initial.hash });
  });

  it("rejects hash, identities, duplicate and unknown intents without partially changing the pointer", async () => {
    const initial = await publish();
    const invalidCases = [
      [{ ...document, intents: [...document.intents, document.intents[0]] }, "editorial_catalog_duplicate_intent"],
      [{ ...document, designs: [...document.designs, document.designs[0]] }, "editorial_catalog_duplicate_design"],
      [{ ...document, designs: [{ ...document.designs[0], intentIds: ["missing"] }] }, "editorial_catalog_unknown_intent"],
      [{ ...document, designs: [{ ...document.designs[0], intentIds: ["summary", "summary"] }] }, "editorial_catalog_duplicate_design_intent"],
      [{ ...document, designs: [{ ...document.designs[0], sourceHash: "c".repeat(64) }] }, "editorial_catalog_source_mismatch"],
      [{ ...document, designs: [{ ...document.designs[0], sourceId: variantId }] }, "editorial_catalog_source_mismatch"],
      [{ ...document, unexpected: true }, "editorial_catalog_document_invalid"],
    ] as const;
    for (const [invalid, error] of invalidCases) await rejected(sql, [release, JSON.stringify(invalid), "d".repeat(64)], error);
    await rejected(sql, [release, JSON.stringify(document), "d".repeat(64)], "editorial_catalog_hash_mismatch");
    await rejected(sql, [otherRelease, JSON.stringify(document), editorialCatalogHash(document)], "editorial_catalog_source_mismatch");
    await rejected(sql, [9999, JSON.stringify(document), editorialCatalogHash(document)], "editorial_catalog_revision_missing");
    expect(await value("SELECT count(*)::int AS value FROM postspark.editorial_catalog_revisions")).toBe(1);
    expect(await value("SELECT postspark.editorial_catalog_head($1) AS value", [release])).toEqual({ revision: initial.revision, hash: initial.hash });
  });

  it("accepts an explicitly empty annotation and enforces UTF-16 string bounds", async () => {
    const empty = { version: 1 as const, intents: [], designs: [] };
    expect((await publish(empty)).document).toEqual(empty);
    const invalid = { ...document, intents: [{ ...document.intents[0], label: "🧩".repeat(61) }, document.intents[1]] };
    await rejected(sql, [release, JSON.stringify(invalid), "a".repeat(64)], "editorial_catalog_document_invalid");
    for (const invalid of [
      { ...document, intents: [{ ...document.intents[0], label: "" }, document.intents[1]] },
      { ...document, intents: [{ ...document.intents[0], description: "" }, document.intents[1]] },
      { ...document, designs: [{ ...document.designs[0], rationale: "" }] },
    ]) await rejected(sql, [release, JSON.stringify(invalid), "a".repeat(64)], "editorial_catalog_document_invalid");
    expect(await value("SELECT postspark.editorial_utf16_length('') AS value")).toBe(0);
    expect(await value("SELECT postspark.editorial_utf16_length($1) AS value", ["x🧩\n"])).toBe("x🧩\n".length);
  });

  it("keeps revision rows immutable and prevents a head from crossing design-release identity", async () => {
    const initial = await publish();
    await rejected("UPDATE postspark.editorial_catalog_revisions SET document='{}' WHERE id=$1", [initial.revision], "editorial_catalog_revision_immutable");
    await rejected("DELETE FROM postspark.editorial_catalog_revisions WHERE id=$1", [initial.revision], "editorial_catalog_revision_immutable");
    await rejected("INSERT INTO postspark.editorial_catalog_heads VALUES($1,$2)", [otherRelease, initial.revision], /foreign key/);
  });

  it("exposes only service reads and the validated publication RPC, with RLS as defense in depth", async () => {
    await publish();
    expect(await value("SELECT has_function_privilege('authenticated','postspark.editorial_catalog_publish(bigint,jsonb,text)','EXECUTE') AS value")).toBe(false);
    expect(await value("SELECT has_function_privilege('anon','postspark.editorial_catalog_head(bigint)','EXECUTE') AS value")).toBe(false);
    await pg.exec("SET ROLE service_role");
    await rejected("INSERT INTO postspark.editorial_catalog_revisions(catalog_revision,hash,document) VALUES($1,$2,'{}')", [release, "c".repeat(64)], /permission denied/);
    expect(await value("SELECT count(*)::int AS value FROM postspark.editorial_catalog_revisions")).toBe(1);
    await pg.exec("RESET ROLE; GRANT SELECT ON postspark.editorial_catalog_revisions, postspark.editorial_catalog_heads TO authenticated; SET ROLE authenticated");
    expect(await value("SELECT count(*)::int AS value FROM postspark.editorial_catalog_revisions")).toBe(0);
    expect(await value("SELECT count(*)::int AS value FROM postspark.editorial_catalog_heads")).toBe(0);
    await rejected(sql, [release, JSON.stringify(document), editorialCatalogHash(document)], /permission denied/);
    await pg.exec("RESET ROLE");
  });
});
