import { setTimeout as wait } from "node:timers/promises";
import { getDb } from "./db";
import { MAX_MEDIA_BYTES } from "./mareMediaFiles";

const origin = () =>
  new URL(process.env.MARE_PROCESSOR_ORIGIN || "http://127.0.0.1:18745").origin;
const nowPlus = (ms: number) => new Date(Date.now() + ms).toISOString();
const bucket = "postspark-mare";
type SpeechJob = {
  id: string;
  actor: string;
  asset_id: string;
  state: string;
  lease: string;
  created_at: string;
  processor_token: string | null;
  mask_key: string | null;
  options: {
    start: number;
    end: number;
    language: string;
    speech: boolean;
    mask: boolean;
  };
};
async function remote(path: string, init: RequestInit = {}) {
  return fetch(origin() + path, {
    ...init,
    headers: { Origin: origin(), ...init.headers },
    redirect: "error",
    signal: AbortSignal.timeout(35_000),
  });
}
async function heartbeat() {
  const available = await remote("/")
    .then(async r => r.ok && (await r.text()).includes('name="mare-speech"'))
    .catch(() => false);
  const res = await getDb()
    .from("mare_speech_health")
    .upsert({ id: true, ready: available, seen_at: nowPlus(0) });
  if (res.error) throw Error("Falha ao registrar a disponibilidade da fala.");
}
async function update(
  job: SpeechJob,
  values: Record<string, unknown>,
  release = true
) {
  const res = await getDb()
    .from("mare_speech_jobs")
    .update({
      ...values,
      ...(release ? { lease: null, lease_until: null } : {}),
    })
    .eq("id", job.id)
    .eq("lease", job.lease)
    .eq("state", job.state)
    .select("id");
  if (res.error) throw Error("Falha ao persistir a análise.");
  return Boolean(res.data?.length);
}
async function cancel(token: string) {
  const res = await remote("/api/speech/" + token, { method: "DELETE" });
  if (!res.ok && res.status !== 404 && res.status !== 410)
    throw Error("Falha ao liberar a análise.");
}
const maskKey = (job: SpeechJob) =>
  "analysis/" + job.actor + "/" + job.id + "/mask";
async function expire(job: SpeechJob, age: number) {
  if (job.processor_token) await cancel(job.processor_token);
  const db = getDb(),
    stored = await db.storage.from(bucket).remove([maskKey(job)]);
  if (stored.error) throw Error("Falha ao liberar a máscara.");
  if (age > 7 * 86400_000) {
    const deleted = await db
      .from("mare_speech_jobs")
      .delete()
      .eq("id", job.id)
      .eq("lease", job.lease);
    if (deleted.error) throw Error("Falha ao expirar a análise.");
  } else {
    await update(job, {
      processor_token: null,
      mask_key: null,
      response: null,
      next_check: new Date(
        Date.parse(job.created_at) + 7 * 86400_000 + 1000
      ).toISOString(),
    });
  }
}
async function execute(job: SpeechJob) {
  const age = Date.now() - Date.parse(job.created_at),
    db = getDb();
  if (job.state === "cancelled" || age >= 25 * 60_000) return expire(job, age);
  const failure = async (message: string, refused = false) => {
    await update(job, {
      state: refused ? "refused" : "failed",
      response: { state: "failed", message },
      next_check: nowPlus(25 * 60_000),
    });
  };
  if (age > 5 * 60_000 || job.state === "dispatching") {
    if (job.processor_token) await cancel(job.processor_token);
    return failure("O tempo de processamento expirou.", !job.processor_token);
  }
  const res = await db
    .from("mare_assets")
    .select("kind,actor,workspace_id,object_key")
    .eq("id", job.asset_id)
    .maybeSingle();
  if (res.error) throw Error("Não foi possível ler o registro de mídia.");
  const asset = res.data;
  let allowed = asset?.kind === "video" && asset.actor === job.actor;
  if (asset?.workspace_id) {
    const role = await db.rpc("mare_workspace_role", {
      p_workspace: asset.workspace_id,
      p_actor: job.actor,
    });
    if (role.error) throw Error("Não foi possível validar permissão.");
    allowed = asset.kind === "video" && ["owner", "editor"].includes(role.data);
  }
  if (!asset || !allowed) {
    if (job.processor_token) await cancel(job.processor_token);
    return failure("Sem acesso ao vídeo.", true);
  }
  if (job.state === "reserved") {
    const stored = await db.storage.from(bucket).download(asset.object_key);
    if (!stored.data || stored.error)
      throw Error("Não foi possível carregar o vídeo.");
    if (!(await update(job, { state: "dispatching" }, false))) return;
    job.state = "dispatching";
    const options = job.options,
      result = await remote("/api/speech", {
        method: "POST",
        body: stored.data,
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Mare-Start": String(options.start),
          "X-Mare-End": String(options.end),
          "X-Mare-Language": options.language,
          "X-Mare-Speech": options.speech ? "1" : "0",
          "X-Mare-Mask": options.mask ? "1" : "0",
        },
      });
    if (result.status === 429) {
      await update(job, { state: "reserved", next_check: nowPlus(3000) });
      return;
    }
    if (!result.ok) return failure("O processador recusou a análise.", true);
    const { job: token } = await result.json();
    if (typeof token !== "string" || !/^[a-f0-9]{40}$/.test(token))
      return failure("Resposta inválida do processador.");
    let saved = false;
    try {
      saved = await update(job, {
        state: "running",
        processor_token: token,
        next_check: nowPlus(500),
      });
    } finally {
      if (!saved) await cancel(token);
    }
    return;
  }
  if (job.state !== "running" || !job.processor_token)
    return failure("Estado da análise inválido.");
  const path = "/api/speech/" + job.processor_token,
    result = await remote(path);
  if (result.status === 410)
    return failure("O resultado expirou no processador.");
  if (!result.ok) throw Error("Não foi possível consultar a análise.");
  const output = await result.json();
  if (output.state === "failed")
    return failure("Não foi possível concluir a análise deste trecho.");
  if (output.state !== "ready") {
    await update(job, {
      response: {
        state: "running",
        phase: output.phase,
        progress: output.progress,
      },
      next_check: nowPlus(1000),
    });
    return;
  }
  let key = null;
  if (output.result?.matte && !output.result.matte.message) {
    const mask = await remote(path + "/mask");
    if (
      !mask.ok ||
      !Number(mask.headers.get("content-length")) ||
      Number(mask.headers.get("content-length")) > MAX_MEDIA_BYTES
    )
      return failure("Máscara indisponível.");
    key = maskKey(job);
    const stored = await db.storage
      .from(bucket)
      .upload(key, await mask.blob(), {
        upsert: true,
        contentType: "application/x-mare-mask",
      });
    if (stored.error) throw Error("Não foi possível guardar a máscara.");
  }
  await update(job, {
    state: "ready",
    response: output,
    mask_key: key,
    next_check: nowPlus(25 * 60_000),
  });
}
export async function processMareSpeech() {
  const { data, error } = await getDb().rpc("mare_claim_speech");
  if (error) throw Error("Fila de fala indisponível.");
  const job = data?.[0] as SpeechJob | undefined;
  if (!job) return false;
  try {
    await execute(job);
  } catch {
    await update(job, { next_check: nowPlus(3500) });
  }
  return true;
}
export async function runMareSpeech(stopped: () => boolean) {
  let nextHealth = 0;
  while (!stopped()) {
    try {
      if (Date.now() >= nextHealth) {
        await heartbeat();
        nextHealth = Date.now() + 30000;
      }
      if (!(await processMareSpeech())) await wait(700);
    } catch {
      console.error("Falha na fila de análise de fala.");
      await wait(3500);
    }
  }
}
