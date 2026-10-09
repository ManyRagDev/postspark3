import { recreationRecipeSchema, type RecreationRecipe } from "@shared/designRecreation";

export type RecreationRecord = { id: string; recipe: RecreationRecipe; reference: string | null; savedAt: string };
export type RecreationSummary = { id: string; title: string; savedAt: string; model: string };
const STORE = "recipes";

function openArchive(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("postspark-admin2", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Feche outras abas do laboratório para abrir o arquivo local."));
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openArchive();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? request.error);
      tx.onabort = () => reject(tx.error ?? new Error("Operação interrompida."));
    });
  } finally { db.close(); }
}

export async function saveRecreation(record: RecreationRecord): Promise<void> {
  recreationRecipeSchema.parse(record.recipe);
  await transaction("readwrite", store => store.put(record));
}

export async function getRecreation(id: string): Promise<RecreationRecord> {
  const record = await transaction<RecreationRecord | undefined>("readonly", store => store.get(id));
  if (!record) throw new Error("Receita não encontrada neste navegador.");
  return { ...record, recipe: recreationRecipeSchema.parse(record.recipe) };
}

export async function listRecreations(): Promise<RecreationSummary[]> {
  const db = await openArchive();
  try {
    return await new Promise((resolve, reject) => {
      const summaries: RecreationSummary[] = [];
      const tx = db.transaction(STORE, "readonly");
      const cursor = tx.objectStore(STORE).openCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) return;
        const record = cursor.result.value as RecreationRecord;
        summaries.push({ id: record.id, title: record.recipe.title, savedAt: record.savedAt, model: record.recipe.model });
        cursor.result.continue();
      };
      tx.oncomplete = () => resolve(summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
