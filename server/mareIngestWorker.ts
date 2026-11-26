import { pathToFileURL } from "node:url";
import { setTimeout as wait } from "node:timers/promises";
import { getDb } from "./db";
import {
  cleanupMareUploads,
  finishMareUpload,
  type MareUpload,
} from "./mareRoutes";
import { runMareSpeech } from "./mareSpeechWorker";
import { MareError } from "./mareMediaFiles";

export async function processMareUpload() {
  const db = getDb(),
    claimed = await db.rpc("mare_claim_upload");
  if (claimed.error) throw new Error("Fila de ingestão indisponível.");
  const item = claimed.data?.[0] as MareUpload | undefined;
  if (!item) return false;
  try {
    await finishMareUpload(item);
  } catch (e) {
    const terminal =
      (e instanceof MareError && e.status < 500) || item.attempts >= 3;
    const reason =
      e instanceof MareError ? e.message : "Falha ao preparar a mídia.";
    const result = await db
      .from("mare_uploads")
      .update({
        phase: terminal ? "failed" : "queued",
        reason,
        lease: null,
        lease_until: null,
      })
      .eq("id", item.id)
      .eq("lease", item.lease)
      .is("asset_id", null);
    if (result.error) throw new Error("Falha ao registrar processamento.");
  }
  return true;
}

async function main() {
  let stopping = false,
    nextCleanup = 0;
  process.once("SIGTERM", () => {
    stopping = true;
  });
  process.once("SIGINT", () => {
    stopping = true;
  });
  const speech =
    process.env.POSTSPARK_MARE_SPEECH === "true"
      ? runMareSpeech(() => stopping)
      : Promise.resolve();
  while (!stopping) {
    try {
      if (Date.now() >= nextCleanup) {
        const count = await cleanupMareUploads();
        nextCleanup = Date.now() + (count === 10 ? 500 : 60000);
      }
      if (!(await processMareUpload())) await wait(1500);
    } catch {
      console.error("Ingestão Maré indisponível. Retomando em cinco segundos.");
      await wait(5000);
    }
  }
  await speech;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main();
