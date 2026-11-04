// Explicit build-time download only. Application inference never contacts the hub.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export const editorialModelCandidates = {
  minilm: {
    modelId: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    revision: "2c4055b12046f11709e9df2c122e59ffbdc2f900",
    dimensions: 384,
    maxTokens: 128,
    dtype: "q8",
    queryPrefix: "",
    referencePrefix: "",
  },
  e5: {
    modelId: "Xenova/multilingual-e5-small",
    revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
    dimensions: 384,
    maxTokens: 512,
    dtype: "q8",
    queryPrefix: "query: ",
    referencePrefix: "query: ",
  },
};
const fileNames = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "onnx/model_quantized.onnx",
];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export async function provisionEditorialModel(candidate, directory) {
  const model = editorialModelCandidates[candidate];
  if (!model) throw new Error("Use minilm or e5");
  const target = resolve(directory);
  await mkdir(join(target, "onnx"), { recursive: true });
  const files = {};
  let previous;
  try {
    previous = JSON.parse(
      await readFile(join(target, "manifest.json"), "utf8")
    );
  } catch {
    /* Fresh install. */
  }
  for (const name of fileNames) {
    const path = join(target, name);
    let bytes;
    if (
      previous?.modelId === model.modelId &&
      previous?.revision === model.revision
    ) {
      try {
        const existing = await readFile(path);
        if (sha256(existing) === previous.files?.[name]) bytes = existing;
      } catch {
        /* Download missing file. */
      }
    }
    if (!bytes) {
      const response = await fetch(
        `https://huggingface.co/${model.modelId}/resolve/${model.revision}/${name}`,
        {
          signal: AbortSignal.timeout(300_000),
        }
      );
      if (!response.ok)
        throw new Error(
          `Model download failed: ${name} HTTP ${response.status}`
        );
      bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(`${path}.partial`, bytes);
      await rename(`${path}.partial`, path);
    }
    files[name] = sha256(bytes);
    console.info(`${candidate}: ${name} (${bytes.byteLength} bytes)`);
  }
  const manifest = { version: 1, ...model, files };
  await writeFile(
    join(target, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );
  return manifest;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const candidate = process.argv[2] ?? "minilm";
  await provisionEditorialModel(
    candidate,
    process.argv[3] ?? `.postspark-local/editorial-affinity/${candidate}`
  );
}
