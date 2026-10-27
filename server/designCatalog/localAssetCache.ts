import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { ENV } from "../_core/env";
import { arsenalHash } from "@shared/arsenalContent";
const pending = new Map<string, Promise<Buffer>>();
/** Called only after the selected component's immutable manifest has been validated. */
export async function cachedAssetBytes(
  hash: string,
  download: () => Promise<Buffer>,
  signal?: AbortSignal
) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("asset_hash_invalid");
  signal?.throwIfAborted();
  const key = `${arsenalHash(ENV.supabaseUrl)}-${hash}`;
  let promise = pending.get(key);
  if (!promise) {
    promise = (async () => {
      const dir = join(process.cwd(), ".postspark-local", "catalog", "assets"),
        file = join(dir, key);
      const valid = (bytes: Buffer) =>
        bytes.length <= 8 * 1024 * 1024 &&
        createHash("sha256").update(bytes).digest("hex") === hash;
      try {
        const bytes = await readFile(file);
        if (valid(bytes)) return bytes;
      } catch {}
      const bytes = await download();
      if (!valid(bytes)) throw new Error("asset_integrity_mismatch");
      try {
        await mkdir(dir, { recursive: true, mode: 0o700 });
        const tmp = `${file}.${randomUUID()}.tmp`;
        await writeFile(tmp, bytes, { mode: 0o600 });
        await rename(tmp, file);
      } catch {
        console.warn("[catalog] Asset utilizado sem cache de disco.");
      }
      return bytes;
    })();
    pending.set(key, promise);
    void promise
      .finally(() => {
        if (pending.get(key) === promise) pending.delete(key);
      })
      .catch(() => {});
  }
  const result = await promise;
  signal?.throwIfAborted();
  return result;
}
