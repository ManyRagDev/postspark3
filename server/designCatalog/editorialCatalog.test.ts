import { describe, expect, it, vi } from "vitest";
import { editorialCatalogHash, type EditorialCatalogDocument, type FrozenEditorialCatalog } from "@shared/editorialIntent";
import { createEditorialCatalogStore, readEditorialCatalog, publishEditorialCatalog, type EditorialCatalogPersistence } from "./editorialCatalog";

const adapter = vi.hoisted(() => ({ db: null as any }));
vi.mock("../db", () => ({ getDb: () => {
  if (!adapter.db) throw new Error("Unit tests must use explicit persistence");
  return adapter.db;
} }));
const sourceId = "11111111-1111-4111-8111-111111111111";
const revisionA = "22222222-2222-4222-8222-222222222222";
const revisionB = "33333333-3333-4333-8333-333333333333";
const document: EditorialCatalogDocument = { version: 1, intents: [{ id: "comparison", label: "Comparar", description: "Contrapor alternativas." }], designs: [
  { sourceId, sourceHash: "a".repeat(64), intentIds: ["comparison"], rationale: "Duas áreas contrapostas." },
] };
const frozen = (value = document, revision = revisionA, catalogRevision = "1"): FrozenEditorialCatalog => ({
  version: 1, revision, catalogRevision, document: value, hash: editorialCatalogHash(value),
});
function persistence(value = frozen()): EditorialCatalogPersistence {
  return {
    readHead: vi.fn(async () => ({ revision: value.revision, hash: value.hash })),
    readRevision: vi.fn(async () => value),
    publish: vi.fn(async (catalogRevision, document) => frozen(document, revisionB, catalogRevision)),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe("editorial catalog cache", () => {
  it("deduplicates reads, refreshes only the pointer after 30 seconds and protects cached data from callers", async () => {
    let now = 100;
    const db = persistence();
    const store = createEditorialCatalogStore(db, { now: () => now });
    const [first, second] = await Promise.all([store.read("1"), store.read("1")]);
    expect(first).toEqual(second);
    first!.document.intents[0].label = "changed by a consumer";
    expect(second!.document.intents[0].label).toBe("Comparar");
    expect((await store.read("1"))!.document.intents[0].label).toBe("Comparar");
    expect(db.readHead).toHaveBeenCalledTimes(1);
    expect(db.readRevision).toHaveBeenCalledTimes(1);
    now += 30_000;
    await store.read("1");
    expect(db.readHead).toHaveBeenCalledTimes(2);
    expect(db.readRevision).toHaveBeenCalledTimes(1);
  });

  it("caches an absent annotation only for the pointer TTL, without reading a document", async () => {
    let now = 0;
    const db = persistence();
    vi.mocked(db.readHead).mockResolvedValue(null);
    const store = createEditorialCatalogStore(db, { now: () => now });
    expect(await store.read("1")).toBeNull();
    expect(await store.read("1")).toBeNull();
    // Steady reads must not extend the negative-cache lifetime indefinitely.
    for (const timestamp of [5_000, 15_000, 29_999]) {
      now = timestamp;
      expect(await store.read("1")).toBeNull();
    }
    expect(db.readRevision).not.toHaveBeenCalled();
    expect(db.readHead).toHaveBeenCalledTimes(1);
    now = 30_000;
    vi.mocked(db.readHead).mockResolvedValue({ revision: revisionA, hash: editorialCatalogHash(document) });
    expect(await store.read("1")).toEqual(frozen());
  });

  it("does not cache failed reads, malformed heads or corrupted immutable documents", async () => {
    const db = persistence();
    vi.mocked(db.readHead).mockRejectedValueOnce(new Error("database unavailable"));
    const store = createEditorialCatalogStore(db);
    await expect(store.read("1")).rejects.toThrow("database unavailable");
    vi.mocked(db.readHead).mockResolvedValueOnce(undefined as any);
    await expect(store.read("1")).rejects.toThrow("editorial_catalog_head_invalid");
    vi.mocked(db.readRevision).mockResolvedValueOnce({ ...frozen(), hash: "b".repeat(64) });
    await expect(store.read("1")).rejects.toThrow();
    expect(await store.read("1")).toEqual(frozen());
    expect(db.readHead).toHaveBeenCalledTimes(4);
    expect(db.readRevision).toHaveBeenCalledTimes(2);
  });

  it("checks the catalog and editorial identities even when a document hash is valid", async () => {
    const db = persistence();
    vi.mocked(db.readRevision).mockResolvedValueOnce(frozen(document, revisionA, "2"));
    const store = createEditorialCatalogStore(db);
    await expect(store.read("1")).rejects.toThrow("editorial_catalog_identity_mismatch");
    expect(await store.read("1")).toEqual(frozen());
  });

  it("publishes canonical data and invalidates a cached absence immediately", async () => {
    const db = persistence();
    vi.mocked(db.readHead).mockResolvedValueOnce(null);
    const store = createEditorialCatalogStore(db);
    expect(await store.read("1")).toBeNull();
    const value: EditorialCatalogDocument = { ...document, intents: [
      { id: "summary", label: "Síntese", description: "Concluir uma ideia." }, ...document.intents,
    ], designs: [{ ...document.designs[0], intentIds: ["summary", "comparison"] }] };
    const published = await store.publish("1", value);
    expect(published.document.intents.map(i => i.id)).toEqual(["comparison", "summary"]);
    expect(published.document.designs[0].intentIds).toEqual(["comparison", "summary"]);
    expect(db.publish).toHaveBeenCalledWith("1", published.document, editorialCatalogHash(value));
    vi.mocked(db.readHead).mockResolvedValue({ revision: revisionB, hash: published.hash });
    expect(await store.read("1")).toEqual(published);
    expect(db.readRevision).not.toHaveBeenCalled();
  });

  it("does not allow an older in-flight read to restore a pointer invalidated by publication", async () => {
    const oldHead = deferred<{ revision: string; hash: string }>();
    const db = persistence();
    vi.mocked(db.readHead).mockImplementationOnce(() => oldHead.promise);
    const store = createEditorialCatalogStore(db);
    const oldRead = store.read("1");
    const updated: EditorialCatalogDocument = { ...document, intents: [{ ...document.intents[0], label: "Comparação revisada" }] };
    const published = await store.publish("1", updated);
    oldHead.resolve({ revision: revisionA, hash: editorialCatalogHash(document) });
    expect((await oldRead)!.revision).toBe(revisionA);
    vi.mocked(db.readHead).mockResolvedValue({ revision: revisionB, hash: published.hash });
    expect(await store.read("1")).toEqual(published);
    expect(db.readHead).toHaveBeenCalledTimes(2);
  });

  it("invalidates even an uncertain publication result instead of caching the previous head", async () => {
    const db = persistence();
    const store = createEditorialCatalogStore(db);
    await store.read("1");
    vi.mocked(db.publish).mockRejectedValueOnce(new Error("connection interrupted after write"));
    await expect(store.publish("1", document)).rejects.toThrow("connection interrupted");
    await store.read("1");
    expect(db.readHead).toHaveBeenCalledTimes(2);
  });

  it("bounds both pointer and immutable-document caches", async () => {
    const first = frozen();
    const second = frozen({ ...document, intents: [{ ...document.intents[0], label: "Outro" }] }, revisionB, "2");
    const db = persistence();
    vi.mocked(db.readHead).mockImplementation(async revision => {
      const value = revision === "1" ? first : second;
      return { revision: value.revision, hash: value.hash };
    });
    vi.mocked(db.readRevision).mockImplementation(async revision => revision === "1" ? first : second);
    const store = createEditorialCatalogStore(db, { maxHeads: 1, maxDocuments: 1 });
    await store.read("1"); await store.read("2"); await store.read("1");
    expect(db.readHead).toHaveBeenCalledTimes(3);
    expect(db.readRevision).toHaveBeenCalledTimes(3);
  });

  it("rejects invalid revisions and duplicate editorial definitions before any database call", async () => {
    const db = persistence(), store = createEditorialCatalogStore(db);
    expect(() => store.read("0")).toThrow("editorial_catalog_revision_invalid");
    expect(() => store.read("9223372036854775808")).toThrow("editorial_catalog_revision_invalid");
    await expect(store.publish("1", { ...document, intents: [...document.intents, ...document.intents] })).rejects.toThrow();
    expect(db.readHead).not.toHaveBeenCalled(); expect(db.publish).not.toHaveBeenCalled();
  });

  it("bounds every Supabase transport with an abort signal and queries the exact bigint revision as text", async () => {
    const catalogRevision = "9007199254740993";
    const signals: AbortSignal[] = [], filters: Array<[string, string]> = [];
    const calls: Array<{ name: string; args: unknown }> = [];
    const query = {
      select: () => query,
      eq: (column: string, value: string) => { filters.push([column, value]); return query; },
      abortSignal: (signal: AbortSignal) => { signals.push(signal); return query; },
      single: async () => ({ data: { id: revisionA, hash: editorialCatalogHash(document), document }, error: null }),
    };
    adapter.db = {
      from: (table: string) => { expect(table).toBe("editorial_catalog_revisions"); return query; },
      rpc: (name: string, args: unknown) => {
        calls.push({ name, args });
        return { abortSignal: async (signal: AbortSignal) => {
          signals.push(signal);
          return { data: name === "editorial_catalog_head" ? { revision: revisionA, hash: editorialCatalogHash(document) }
            : frozen(document, revisionB, catalogRevision), error: null };
        } };
      },
    };
    try {
      expect((await readEditorialCatalog(catalogRevision))!.catalogRevision).toBe(catalogRevision);
      await publishEditorialCatalog(catalogRevision, document);
      expect(filters).toEqual([["catalog_revision", catalogRevision], ["id", revisionA]]);
      expect(calls[0]).toEqual({ name: "editorial_catalog_head", args: { p_catalog_revision: catalogRevision } });
      expect(calls[1].name).toBe("editorial_catalog_publish");
      expect(signals).toHaveLength(3);
      expect(signals.every(signal => signal instanceof AbortSignal && !signal.aborted)).toBe(true);
    } finally { adapter.db = null; }
  });
});
