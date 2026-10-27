import { arsenalHash } from "@shared/arsenalContent";
// IndexedDB is optional: private mode, quota errors and corrupt records fall back to a read.
export type BrowserCatalog = {
  revision: string;
  formatVersion: 1;
  scope: string;
  ownerId: string;
  hash: string;
  rows: unknown[];
};
const database = "postspark-catalog-v1";
const active = new Map<string, Promise<BrowserCatalog>>();
let epoch = 0;
const memory = new Map<string, BrowserCatalog>();
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(database, 1);
    r.onblocked = () => reject(new Error("catalog_cache_blocked"));
    r.onupgradeneeded = () => r.result.createObjectStore("snapshots");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("snapshots", mode),
        r = run(tx.objectStore("snapshots"));
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function clearCatalogCache() {
  epoch++;
  active.clear();
  memory.clear();
  try {
    await transaction("readwrite", s => s.clear());
  } catch {}
}
export async function cachedCatalog(
  project: string,
  owner: string,
  scope: string,
  revision: string,
  download: () => Promise<BrowserCatalog>
): Promise<BrowserCatalog> {
  const key = JSON.stringify([project, 1, owner, scope, revision]);
  if (active.has(key)) return active.get(key)!;
  const generation = epoch;
  const sessionEpoch = () => {
    try {
      return localStorage.getItem("postspark.session-epoch") ?? "";
    } catch {
      return "";
    }
  };
  const initialSession = sessionEpoch();
  const current = () =>
    generation === epoch && initialSession === sessionEpoch();
  const valid = (r: any): r is BrowserCatalog =>
    r?.revision === revision &&
    r.formatVersion === 1 &&
    r.ownerId === owner &&
    r.scope === scope &&
    Array.isArray(r.rows) &&
    r.hash === arsenalHash(r.rows);
  const cachedMemory = memory.get(key);
  if (valid(cachedMemory)) return cachedMemory;
  const work = async () => {
    try {
      const cached = await transaction("readonly", s => s.get(key));
      if (!current()) throw new Error("catalog_session_changed");
      if (valid(cached)) return cached;
    } catch {}
    const value = await download();
    if (!valid(value)) throw new Error("catalog_cache_scope_mismatch");
    if (!current()) throw new Error("catalog_session_changed");
    try {
      await transaction("readwrite", s => {
        if (!current()) throw new Error("catalog_session_changed");
        return s.put(value, key);
      });
    } catch {
      console.warn("[catalog] Cache do navegador indisponível.");
    }
    if (!current()) throw new Error("catalog_session_changed");
    memory.set(key, value);
    if (memory.size > 3) memory.delete(memory.keys().next().value!);
    return value;
  };
  const task: Promise<BrowserCatalog> = (async () =>
    navigator.locks
      ? await navigator.locks.request(`postspark.catalog:${key}`, work)
      : await work())();
  active.set(key, task);
  try {
    return await task;
  } finally {
    if (active.get(key) === task) active.delete(key);
  }
}
