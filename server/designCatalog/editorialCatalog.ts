import {
  canonicalizeEditorialCatalogDocument,
  editorialCatalogHash,
  frozenEditorialCatalogSchema,
  type EditorialCatalogDocument,
  type FrozenEditorialCatalog,
} from "@shared/editorialIntent";
import { getDb } from "../db";
import { ENV } from "../_core/env";

type EditorialHead = { revision: string; hash: string };
export interface EditorialCatalogPersistence {
  readHead(catalogRevision: string): Promise<EditorialHead | null>;
  readRevision(catalogRevision: string, revision: string): Promise<unknown>;
  publish(catalogRevision: string, document: EditorialCatalogDocument, hash: string): Promise<unknown>;
}

const validateCatalogRevision = (value: string) => {
  if (!/^[1-9]\d*$/.test(value) || BigInt(value) > BigInt("9223372036854775807"))
    throw new Error("editorial_catalog_revision_invalid");
};

/** Only the pointer expires; document identity is immutable. Returned data is
 * cloned by the schema parser so a caller cannot mutate a shared cache entry. */
export function createEditorialCatalogStore(
  persistence: EditorialCatalogPersistence,
  options: { now?: () => number; ttlMs?: number; maxDocuments?: number; maxHeads?: number } = {}
) {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 30_000;
  const maxDocuments = options.maxDocuments ?? 32;
  const maxHeads = options.maxHeads ?? 128;
  if (!Number.isFinite(ttlMs) || ttlMs < 0 || !Number.isInteger(maxDocuments) || maxDocuments < 1 ||
    !Number.isInteger(maxHeads) || maxHeads < 1)
    throw new Error("editorial_catalog_cache_invalid");
  const heads = new Map<string, { head: EditorialHead | null; expiresAt: number }>();
  const documents = new Map<string, EditorialCatalogDocument>();
  const inflight = new Map<string, Promise<FrozenEditorialCatalog | null>>();
  const epochs = new Map<string, symbol>();
  const touch = <T>(map: Map<string, T>, key: string, value: T, limit: number) => {
    map.delete(key);
    map.set(key, value);
    while (map.size > limit) map.delete(map.keys().next().value!);
  };
  const invalidate = (revision: string) => {
    heads.delete(revision);
    inflight.delete(revision);
    touch(epochs, revision, Symbol(revision), maxHeads);
  };
  const freeze = (catalogRevision: string, revision: string, hash: string, document: EditorialCatalogDocument) =>
    frozenEditorialCatalogSchema.parse({ version: 1, catalogRevision, revision, hash, document });
  const read = (catalogRevision: string): Promise<FrozenEditorialCatalog | null> => {
    validateCatalogRevision(catalogRevision);
    const pending = inflight.get(catalogRevision);
    if (pending) return pending.then(value => value ? frozenEditorialCatalogSchema.parse(value) : null);
    const epoch = epochs.get(catalogRevision) ?? Symbol(catalogRevision);
    touch(epochs, catalogRevision, epoch, maxHeads);
    const work = (async () => {
      const cachedHead = heads.get(catalogRevision);
      const fresh = cachedHead && cachedHead.expiresAt > now();
      const head = fresh ? cachedHead.head : await persistence.readHead(catalogRevision);
      if (head !== null && (!head || typeof head !== "object" || !/^[a-f\d]{64}$/.test(head.hash) || !/^[a-f\d-]{36}$/i.test(head.revision)))
        throw new Error("editorial_catalog_head_invalid");
      if (!head) {
        if (epochs.get(catalogRevision) === epoch)
          touch(heads, catalogRevision, { head: null, expiresAt: fresh ? cachedHead.expiresAt : now() + ttlMs }, maxHeads);
        return null;
      }
      let document = documents.get(head.hash);
      if (!document) {
        const stored = frozenEditorialCatalogSchema.parse(await persistence.readRevision(catalogRevision, head.revision));
        if (stored.catalogRevision !== catalogRevision || stored.revision !== head.revision || stored.hash !== head.hash)
          throw new Error("editorial_catalog_identity_mismatch");
        document = canonicalizeEditorialCatalogDocument(stored.document);
        touch(documents, head.hash, document, maxDocuments);
      } else touch(documents, head.hash, document, maxDocuments);
      const result = freeze(catalogRevision, head.revision, head.hash, document);
      // Cache only a fully validated read; publication racing this read owns the newer pointer.
      if (epochs.get(catalogRevision) === epoch)
        touch(heads, catalogRevision, { head, expiresAt: fresh ? cachedHead.expiresAt : now() + ttlMs }, maxHeads);
      return result;
    })();
    inflight.set(catalogRevision, work);
    void work.finally(() => {
      if (inflight.get(catalogRevision) === work) inflight.delete(catalogRevision);
      if (!inflight.has(catalogRevision) && !heads.has(catalogRevision)) epochs.delete(catalogRevision);
    }).catch(() => {});
    return work.then(value => value ? frozenEditorialCatalogSchema.parse(value) : null);
  };
  return {
    read,
    async publish(catalogRevision: string, value: EditorialCatalogDocument): Promise<FrozenEditorialCatalog> {
      validateCatalogRevision(catalogRevision);
      const document = canonicalizeEditorialCatalogDocument(value);
      const hash = editorialCatalogHash(document);
      invalidate(catalogRevision);
      try {
        const stored = frozenEditorialCatalogSchema.parse(await persistence.publish(catalogRevision, document, hash));
        if (stored.catalogRevision !== catalogRevision || stored.hash !== hash)
          throw new Error("editorial_catalog_identity_mismatch");
        touch(documents, hash, document, maxDocuments);
        return stored;
      } finally {
        // Also invalidate on an uncertain response: the transaction may have committed.
        invalidate(catalogRevision);
      }
    },
  };
}

const persistence: EditorialCatalogPersistence = {
  async readHead(catalogRevision) {
    const { data, error } = await getDb().rpc("editorial_catalog_head", { p_catalog_revision: catalogRevision })
      .abortSignal(AbortSignal.timeout(8_000));
    if (error) throw error;
    return data;
  },
  async readRevision(catalogRevision, revision) {
    const { data, error } = await getDb().from("editorial_catalog_revisions")
      .select("id,hash,document").eq("catalog_revision", catalogRevision).eq("id", revision)
      .abortSignal(AbortSignal.timeout(8_000)).single();
    if (error) throw error;
    return { version: 1, catalogRevision, revision: data.id, hash: data.hash, document: data.document };
  },
  async publish(catalogRevision, document, hash) {
    const { data, error } = await getDb().rpc("editorial_catalog_publish", {
      p_catalog_revision: catalogRevision, p_document: document, p_hash: hash,
    }).abortSignal(AbortSignal.timeout(15_000));
    if (error) throw error;
    return data;
  },
};
const store = createEditorialCatalogStore(persistence);
export const readEditorialCatalog = (catalogRevision: string) => store.read(catalogRevision);
export const publishEditorialCatalog = async (catalogRevision: string, document: EditorialCatalogDocument) => {
  const result = await store.publish(catalogRevision, document);
  if (ENV.designRetrievalDirectory) {
    const { prepareCatalogSearchIndex } = await import("./familySearchIndex");
    await prepareCatalogSearchIndex(catalogRevision);
  }
  return result;
};
