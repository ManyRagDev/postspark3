// Imported only by the opt-in UI. The worker, WASM and weights are loaded on inference.
let worker,
  busy = false,
  idleTimer;
export function canInfer() {
  if (
    !globalThis.isSecureContext ||
    !globalThis.Worker ||
    !navigator.storage?.getDirectory ||
    !globalThis.WebAssembly
  )
    return false;
  try {
    new WebAssembly.Memory({ address: "i64", initial: 1n });
    return true;
  } catch {
    return false;
  }
}

function release() {
  clearTimeout(idleTimer);
  worker?.terminate();
  worker = undefined;
}

export async function inferMotion({
  system,
  prompt,
  grammar,
  signal,
  onProgress,
}) {
  if (!canInfer())
    throw new Error(
      "A inferência local precisa de um navegador com WebAssembly Memory64 e armazenamento privado."
    );
  signal?.throwIfAborted();
  if (busy) throw new Error("Aguarde a geração em andamento.");
  if (![system, prompt, grammar].every(v => typeof v === "string" && v.trim()))
    throw new Error("Pedido de geração incompleto.");
  if (!worker)
    worker = new Worker(
      new URL("./local-inference-worker.js", import.meta.url),
      { type: "module" }
    );
  clearTimeout(idleTimer);
  busy = true;
  try {
    return await new Promise((resolve, reject) => {
      const abort = () => {
        release();
        reject(new DOMException("Geração cancelada.", "AbortError"));
      };
      const clean = () => signal?.removeEventListener("abort", onAbort);
      const onAbort = () => {
        clean();
        abort();
      };
      worker.onmessage = ({ data }) => {
        if (data.status === "progress") {
          onProgress?.(data.message);
          return;
        }
        clean();
        if (data.status === "done") resolve(data.text);
        else {
          release();
          reject(
            new Error(
              data.message || "O modelo não conseguiu concluir o pedido."
            )
          );
        }
      };
      worker.onerror = event => {
        clean();
        release();
        reject(new Error(event.message || "O runtime local não pôde iniciar."));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      worker.postMessage({ system, prompt, grammar });
    });
  } finally {
    busy = false;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      // Free model memory after a short editing session; verified weights remain in the local cache.
      idleTimer = setTimeout(release, 120000);
    }
  }
}
