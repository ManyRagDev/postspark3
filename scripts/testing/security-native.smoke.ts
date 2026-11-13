/** Offline dependency smoke; no dotenv or application bootstrap.
 * Run: node --import tsx scripts/testing/security-native.smoke.ts
 * Uses only existing local model files; never downloads a model.
 */
import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
let blockedNetworkAttempts = 0;
const deny = () => { blockedNetworkAttempts++; throw new Error("NATIVE_SMOKE_NETWORK_BLOCKED"); };
for (const name of ["node:http", "node:https"]) {
  const module = require(name);
  module.request = deny; module.get = deny;
}
const net = require("node:net");
net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny;
require("node:tls").connect = deny;
globalThis.fetch = async () => deny();
syncBuiltinESMExports();
const timeout = setTimeout(() => {
  console.error(JSON.stringify({ ok: false, reason: "native_smoke_timeout", blockedNetworkAttempts }));
  process.exit(1);
}, 120_000);
timeout.unref();

const checks: string[] = [];
const versions: Record<string, string> = {};
const started = performance.now();
let localInference: Record<string, unknown> = { status: "not-run" };
try {
  const transformerEntry = require.resolve("@huggingface/transformers");
  const transformerRequire = createRequire(transformerEntry);
  const transformerPackage = JSON.parse(await readFile(join(dirname(transformerEntry), "..", "package.json"), "utf8"));
  versions.transformers = transformerPackage.version;
  assert.equal(versions.transformers, "3.8.1");
  // Resolve the exact transitive copy used by Transformers, not an unrelated root install.
  const sharp = transformerRequire("sharp");
  versions.sharp = sharp.versions.sharp;
  versions.vips = sharp.versions.vips;
  assert.equal(versions.sharp, "0.35.5");
  const pixels = Buffer.from(Array.from({ length: 16 }, (_, i) => [i % 2 ? 0 : 255, 32, i % 2 ? 255 : 0, 255]).flat());
  const png = await sharp(pixels, { raw: { width: 4, height: 4, channels: 4 } }).png().toBuffer();
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const decoded = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 4); assert.equal(decoded.info.height, 4);
  assert.deepEqual(decoded.data, pixels);
  const resized = await sharp(png).resize(2, 3, { fit: "fill", kernel: "nearest" }).png().toBuffer();
  const metadata = await sharp(resized).metadata();
  assert.equal(metadata.width, 2); assert.equal(metadata.height, 3); assert.equal(metadata.format, "png");
  await assert.rejects(sharp(Buffer.from("bounded-invalid-image")).png().toBuffer());
  checks.push("transitive-sharp-version", "raw-to-png-real-bytes", "png-decode-pixel-roundtrip", "resize-to-png", "invalid-image-rejected");

  const transformers = await import("@huggingface/transformers");
  transformers.env.allowRemoteModels = false;
  transformers.env.allowLocalModels = true;
  transformers.env.useBrowserCache = false;
  const image = await transformers.RawImage.fromBlob(new Blob([new Uint8Array(png)], { type: "image/png" }));
  assert.equal(image.width, 4); assert.equal(image.height, 4); assert.equal(image.channels, 4);
  assert.deepEqual(Buffer.from(image.data), pixels);
  const small = await image.resize(2, 3, { resample: 0 });
  assert.equal(small.width, 2); assert.equal(small.height, 3); assert.equal(small.data.length, 24);
  checks.push("transformers-import", "rawimage-png-decode", "rawimage-resize-sharp-compatibility");

  const ort = transformerRequire("onnxruntime-node");
  versions.onnxruntimeNode = transformerRequire("onnxruntime-node/package.json").version;
  assert.equal(typeof ort.InferenceSession.create, "function");
  const nativeTensor = new ort.Tensor("float32", Float32Array.from([1, 2]), [1, 2]);
  assert.deepEqual(nativeTensor.dims, [1, 2]);
  nativeTensor.dispose();
  checks.push("onnxruntime-node-import-and-tensor");

  const webRequire = createRequire(transformerRequire.resolve("onnxruntime-web"));
  const protobuf = webRequire("protobufjs");
  versions.protobufjs = webRequire("protobufjs/package.json").version;
  assert.equal(versions.protobufjs, "7.6.5");
  const Fixture = protobuf.parse('syntax = "proto3"; message Fixture { string label = 1; repeated float values = 2; }').root.lookupType("Fixture");
  const payload = { label: "local-smoke", values: [0.25, 0.5, 1] };
  assert.equal(Fixture.verify(payload), null);
  const encoded = Fixture.encode(Fixture.create(payload)).finish();
  const roundtrip = Fixture.toObject(Fixture.decode(encoded));
  assert.deepEqual(roundtrip, payload);
  checks.push("onnxruntime-web-transitive-protobuf-version", "protobuf-binary-roundtrip");

  const candidates = [".postspark-local/design-retrieval/model", ".postspark-local/editorial-affinity/minilm", ".postspark-local/editorial-affinity/e5"];
  let modelPath: string | undefined;
  for (const candidate of candidates) {
    const directory = resolve(candidate);
    const complete = await Promise.all(["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"].map(file => access(join(directory, file)).then(() => true, () => false)));
    if (complete.every(Boolean)) { modelPath = directory; break; }
  }
  if (!modelPath) {
    localInference = { status: "skipped", reason: "no-complete-local-model-in-known-directories", nativeSessionExecuted: false };
  } else {
    const tokenizer = await transformers.AutoTokenizer.from_pretrained(modelPath, { local_files_only: true });
    const inputs = tokenizer("query: criação visual simples", { padding: false, truncation: true, max_length: 16 });
    assert(inputs.input_ids.dims[1] > 0 && inputs.input_ids.dims[1] <= 16);
    const model = await transformers.AutoModel.from_pretrained(modelPath, {
      local_files_only: true, dtype: "q8", device: "cpu",
      session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
    });
    let outputs: Record<string, any> = {};
    try {
      outputs = await model(inputs);
      const tensor = outputs.last_hidden_state;
      assert(tensor, "Local model must produce last_hidden_state");
      assert.equal(tensor.dims[0], 1);
      assert.equal(tensor.dims[1], inputs.input_ids.dims[1]);
      assert(tensor.dims[2] > 0 && tensor.data.length > 0);
      assert(Array.from(tensor.data as Float32Array).every(Number.isFinite));
      localInference = { status: "passed", modelDirectory: modelPath, nativeSessionExecuted: true, device: "cpu", dtype: "q8", maxTokens: 16, outputDimensions: tensor.dims };
      checks.push("local-tokenizer", "local-onnx-cpu-session", "finite-hidden-state");
    } finally {
      for (const tensor of new Set([...Object.values(inputs), ...Object.values(outputs)])) tensor?.dispose?.();
      await model.dispose();
    }
  }
  assert.equal(blockedNetworkAttempts, 0, "Dependencies attempted a forbidden network call");
  console.log(JSON.stringify({ ok: true, scope: "offline-dependency-smoke", versions, checks, localInference, networkPolicy: "JS HTTP/TLS/socket/fetch blocked; remote models disabled; local_files_only", blockedNetworkAttempts, durationMs: Math.round(performance.now() - started), productionValidated: false }, null, 2));
} finally {
  clearTimeout(timeout);
}
