import { Wllama } from "./vendor/wllama/wllama.js";
import { sha256 } from "./vendor/wllama/sha256.js";

const MODEL_URL =
  "https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/a5f758267d6599f03006d1e909676f2e2671fb0f/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf";
import { HASH, BYTES } from "./model-cache.js";
let llm;
const report = message => self.postMessage({ status: "progress", message });
async function modelFile() {
  // OPFS commits a replacement at close. A failed or interrupted stream leaves
  // the last complete file available and an unfinished first download empty.
  const root = await navigator.storage.getDirectory();
  const models = await root.getDirectoryHandle("mare-ia-modelos", {
    create: true,
  });
  const handle = await models.getFileHandle(HASH + ".gguf", { create: true });
  const found = await handle.getFile();
  if (found.size === BYTES) return found;
  report("Baixando o modelo · 0 de 398 MB");
  const response = await fetch(MODEL_URL, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok || !response.body)
    throw new Error("Falha no download do Qwen (" + response.status + ").");
  const hash = sha256.create();
  let bytes = 0,
    last = 0;
  const checked = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        bytes += chunk.length;
        if (bytes > BYTES)
          throw new Error("Tamanho inesperado ao baixar o modelo.");
        hash.update(chunk);
        const mb = Math.floor(bytes / 1000000);
        if (mb !== last) {
          last = mb;
          report("Baixando o modelo · " + mb + " de 398 MB");
        }
        controller.enqueue(chunk);
      },
      flush() {
        const hex = Array.from(hash.digest(), n =>
          n.toString(16).padStart(2, "0")
        ).join("");
        if (bytes !== BYTES || hex !== HASH)
          throw new Error(
            "O download do modelo ficou incompleto ou corrompido."
          );
      },
    })
  );
  const writer = await handle.createWritable();
  await checked.pipeTo(writer);
  const saved = await handle.getFile();
  if (saved.size !== BYTES)
    throw new Error(
      "O navegador não guardou o modelo. Confira o espaço disponível."
    );
  return saved;
}

async function run({ system, prompt, grammar }) {
  if (!llm) {
    report("Procurando o modelo no dispositivo…");
    const file = await modelFile();
    report("Carregando o modelo na memória…");
    llm = new Wllama(
      { default: new URL("./vendor/wllama/wllama.wasm", import.meta.url).href },
      {
        suppressNativeLog: true,
        allowOffline: true,
        logger: { debug() {}, log() {}, warn() {}, error() {} },
      }
    );
    await llm.loadModel([file], {
      n_threads: 1,
      n_gpu_layers: 0,
      n_ctx: 3072,
      n_batch: 256,
      n_ubatch: 128,
      warmup: false,
      seed: 42,
    });
  }
  report("Interpretando o pedido neste dispositivo…");
  const result = await llm.createChatCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    grammar,
    temperature: 0,
    max_tokens: 320,
    stream: false,
    cache_prompt: true,
  });
  const choice = result.choices?.[0];
  if (!choice?.message?.content || choice.finish_reason === "length")
    throw new Error(
      "O modelo não completou o plano. Tente uma instrução mais curta."
    );
  return choice.message.content;
}
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ status: "done", text: await run(data) });
  } catch (error) {
    self.postMessage({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
