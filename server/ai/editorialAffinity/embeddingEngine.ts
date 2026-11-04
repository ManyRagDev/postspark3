import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";

export interface EmbeddingEngineConfig {
  /** Directory provisioned and hash-verified by the bundle loader. Never a hub ID. */
  modelPath: string;
  modelId: string;
  revision: string;
  artifactHash: string;
  dimensions: number;
  maxTokens: number;
  dtype: "q8" | "fp32";
  queryPrefix?: string;
  referencePrefix?: string;
  /** Waiting calls, in addition to the one executing. */
  maxPending?: number;
  /** CPU threads per session. Explicit to avoid competing for every host core. */
  threads?: number;
}

export interface EmbeddingMetadata {
  version: 1;
  modelId: string;
  revision: string;
  artifactHash: string;
  dimensions: number;
  maxTokens: number;
  dtype: "q8" | "fp32";
  queryPrefix: string;
  referencePrefix: string;
  normalization: "nfc_trim_v1";
  pooling: "attention_mean_l2_v1";
  fingerprint: string;
}

export type EmbeddingErrorCode =
  | "invalid_config"
  | "invalid_input"
  | "empty_input"
  | "input_too_long"
  | "token_limit"
  | "unavailable"
  | "invalid_output"
  | "busy"
  | "aborted"
  | "disposed";

export class EmbeddingEngineError extends Error {
  constructor(
    readonly code: EmbeddingErrorCode,
    readonly inputIndex?: number
  ) {
    super(`editorial_embedding_${code}`);
    this.name = "EmbeddingEngineError";
  }
}

export interface EmbeddingInputEvidence {
  /** Includes any model prefix and special tokens. */
  tokenCount: number;
  usedTokens: number;
  truncated: boolean;
}

export interface EmbeddingResult {
  vectors: Float32Array[];
  inputs: EmbeddingInputEvidence[];
  metadata: Readonly<EmbeddingMetadata>;
  /** Includes waiting, lazy loading, tokenization, inference and pooling. */
  latencyMs: number;
}

export interface EmbeddingOptions {
  kind: "query" | "reference";
  /** Default rejects rather than silently dropping a decisive instruction. */
  overflow?: "reject" | "truncate";
  signal?: AbortSignal;
}

export interface EmbeddingEngine {
  readonly metadata: Readonly<EmbeddingMetadata>;
  embed(
    texts: readonly string[],
    options: EmbeddingOptions
  ): Promise<EmbeddingResult>;
  /** Waits for admitted native inference before freeing the session. Idempotent. */
  dispose(): Promise<void>;
}

interface TensorView {
  dims: readonly number[];
  data: ArrayLike<number | bigint>;
}

/** Small injectable boundary: tests can exercise pooling/lifecycle without a model download. */
export interface EmbeddingBackend {
  countTokens(text: string): number;
  infer(
    text: string,
    maxTokens: number
  ): Promise<{
    hiddenState: TensorView;
    attentionMask: TensorView;
    release(): void;
  }>;
  dispose(): Promise<void>;
}

export type EmbeddingBackendLoader = (
  config: Readonly<EmbeddingEngineConfig>
) => Promise<EmbeddingBackend>;

const MAX_INPUT_CHARACTERS = 24_000;
const MAX_BATCH_INPUTS = 256;

function assertConfig(config: EmbeddingEngineConfig) {
  if (
    !isAbsolute(config.modelPath) ||
    !config.modelId?.trim() ||
    !config.revision?.trim() ||
    !/^[a-f\d]{64}$/i.test(config.artifactHash) ||
    !Number.isInteger(config.dimensions) ||
    config.dimensions < 1 ||
    config.dimensions > 4096 ||
    !Number.isInteger(config.maxTokens) ||
    config.maxTokens < 4 ||
    config.maxTokens > 8192 ||
    !["q8", "fp32"].includes(config.dtype) ||
    !Number.isInteger(config.maxPending ?? 2) ||
    (config.maxPending ?? 2) < 0 ||
    (config.maxPending ?? 2) > 16 ||
    !Number.isInteger(config.threads ?? 1) ||
    (config.threads ?? 1) < 1 ||
    (config.threads ?? 1) > 16 ||
    (config.queryPrefix?.length ?? 0) > 256 ||
    (config.referencePrefix?.length ?? 0) > 256
  )
    throw new EmbeddingEngineError("invalid_config");
}

function embeddingMetadata(
  config: EmbeddingEngineConfig
): Readonly<EmbeddingMetadata> {
  const basis = {
    version: 1 as const,
    modelId: config.modelId,
    revision: config.revision,
    artifactHash: config.artifactHash.toLowerCase(),
    dimensions: config.dimensions,
    maxTokens: config.maxTokens,
    dtype: config.dtype,
    queryPrefix: config.queryPrefix ?? "",
    referencePrefix: config.referencePrefix ?? "",
    normalization: "nfc_trim_v1" as const,
    pooling: "attention_mean_l2_v1" as const,
  };
  return Object.freeze({
    ...basis,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(basis))
      .digest("hex"),
  });
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new EmbeddingEngineError("aborted");
}

function poolAndNormalize(
  hidden: TensorView,
  mask: TensorView,
  dimensions: number
) {
  const [batch, tokens, width] = hidden.dims;
  if (
    hidden.dims.length !== 3 ||
    batch !== 1 ||
    !Number.isInteger(tokens) ||
    tokens < 1 ||
    width !== dimensions ||
    hidden.data.length !== tokens * dimensions ||
    mask.dims.length !== 2 ||
    mask.dims[0] !== 1 ||
    mask.dims[1] !== tokens ||
    mask.data.length !== tokens
  )
    throw new EmbeddingEngineError("invalid_output");
  const sums = new Float64Array(dimensions);
  let count = 0;
  for (let t = 0; t < tokens; t++) {
    const weight = Number(mask.data[t]);
    if (weight !== 0 && weight !== 1)
      throw new EmbeddingEngineError("invalid_output");
    if (!weight) continue;
    count++;
    for (let d = 0; d < dimensions; d++) {
      const value = Number(hidden.data[t * dimensions + d]);
      if (!Number.isFinite(value))
        throw new EmbeddingEngineError("invalid_output");
      sums[d] += value;
    }
  }
  if (!count) throw new EmbeddingEngineError("invalid_output");
  let normSquared = 0;
  for (let d = 0; d < dimensions; d++) {
    sums[d] /= count;
    normSquared += sums[d] * sums[d];
  }
  if (!Number.isFinite(normSquared) || normSquared <= 1e-24)
    throw new EmbeddingEngineError("invalid_output");
  const norm = Math.sqrt(normSquared);
  const vector = new Float32Array(dimensions);
  for (let d = 0; d < dimensions; d++) vector[d] = sums[d] / norm;
  return { vector, usedTokens: count };
}

/**
 * Local CPU model, lazy-loaded once per engine. No requests are detached on timeout:
 * abort discards the result, but the native operation remains serialized until it ends.
 * The bundle loader owns process-level reuse and artifact hash verification.
 */
export function createEmbeddingEngine(
  suppliedConfig: EmbeddingEngineConfig,
  load: EmbeddingBackendLoader = loadLocalEmbeddingBackend
): EmbeddingEngine {
  assertConfig(suppliedConfig);
  const config = Object.freeze({ ...suppliedConfig });
  const metadata = embeddingMetadata(config);
  let backend: Promise<EmbeddingBackend> | undefined;
  let tail = Promise.resolve();
  let admitted = 0;
  let disposed = false;
  let disposal: Promise<void> | undefined;

  return {
    metadata,
    async embed(texts, options) {
      const started = performance.now();
      if (disposed) throw new EmbeddingEngineError("disposed");
      checkAborted(options.signal);
      if (
        !Array.isArray(texts) ||
        !texts.length ||
        texts.length > MAX_BATCH_INPUTS ||
        !["query", "reference"].includes(options.kind) ||
        !["reject", "truncate"].includes(options.overflow ?? "reject")
      )
        throw new EmbeddingEngineError("invalid_input");
      const normalized = texts.map((text, inputIndex) => {
        if (typeof text !== "string")
          throw new EmbeddingEngineError("invalid_input", inputIndex);
        if (text.length > MAX_INPUT_CHARACTERS)
          throw new EmbeddingEngineError("input_too_long", inputIndex);
        const value = text.normalize("NFC").trim();
        if (!value) throw new EmbeddingEngineError("empty_input", inputIndex);
        return `${options.kind === "query" ? metadata.queryPrefix : metadata.referencePrefix}${value}`;
      });
      if (admitted >= 1 + (config.maxPending ?? 2))
        throw new EmbeddingEngineError("busy");
      admitted++;
      const previous = tail;
      let releaseQueue!: () => void;
      tail = new Promise<void>(resolve => {
        releaseQueue = resolve;
      });
      try {
        await previous;
        checkAborted(options.signal);
        backend ??= load(config).catch(() => {
          throw new EmbeddingEngineError("unavailable");
        });
        const engine = await backend;
        checkAborted(options.signal);
        // Validate the complete batch before admitting its first inference.
        const counts = normalized.map((text, inputIndex) => {
          const tokenCount = engine.countTokens(text);
          if (!Number.isInteger(tokenCount) || tokenCount < 1)
            throw new EmbeddingEngineError("invalid_output", inputIndex);
          if (tokenCount > config.maxTokens && options.overflow !== "truncate")
            throw new EmbeddingEngineError("token_limit", inputIndex);
          return tokenCount;
        });
        const vectors: Float32Array[] = [];
        const inputs: EmbeddingInputEvidence[] = [];
        for (const [index, text] of Array.from(normalized.entries())) {
          checkAborted(options.signal);
          const output = await engine.infer(text, config.maxTokens);
          try {
            checkAborted(options.signal);
            const { vector, usedTokens } = poolAndNormalize(
              output.hiddenState,
              output.attentionMask,
              config.dimensions
            );
            if (usedTokens !== Math.min(counts[index], config.maxTokens))
              throw new EmbeddingEngineError("invalid_output", index);
            vectors.push(vector);
            inputs.push({
              tokenCount: counts[index],
              usedTokens,
              truncated: counts[index] > usedTokens,
            });
          } finally {
            output.release();
          }
        }
        return {
          vectors,
          inputs,
          metadata,
          latencyMs: performance.now() - started,
        };
      } catch (error) {
        if (error instanceof EmbeddingEngineError) throw error;
        // Provider exceptions can contain raw input or local paths; expose only a stable code.
        throw new EmbeddingEngineError("unavailable");
      } finally {
        admitted--;
        releaseQueue();
      }
    },
    dispose() {
      if (!disposal) {
        disposed = true;
        disposal = (async () => {
          await tail;
          if (backend) {
            const loaded = await backend.catch(() => null);
            if (loaded) await loaded.dispose();
          }
        })();
      }
      return disposal;
    },
  };
}

/** AutoModel is used directly: v3.8.1 FeatureExtractionPipeline ignores max_length. */
async function loadLocalEmbeddingBackend(
  config: Readonly<EmbeddingEngineConfig>
): Promise<EmbeddingBackend> {
  if (!(await stat(config.modelPath)).isDirectory())
    throw new EmbeddingEngineError("unavailable");
  const { AutoTokenizer, AutoModel, env } = await import(
    "@huggingface/transformers"
  );
  // Defense in depth. Each loader also receives local_files_only, so a missing file
  // cannot fall through to the Hub even if another library user changes env later.
  env.allowRemoteModels = false;
  const localOptions = { local_files_only: true };
  const tokenizer = await AutoTokenizer.from_pretrained(
    config.modelPath,
    localOptions
  );
  const tokenizerLimit = Number(tokenizer.model_max_length);
  if (Number.isFinite(tokenizerLimit) && tokenizerLimit < config.maxTokens)
    throw new EmbeddingEngineError("invalid_config");
  const model = await AutoModel.from_pretrained(config.modelPath, {
    ...localOptions,
    dtype: config.dtype,
    device: "cpu",
    session_options: {
      intraOpNumThreads: config.threads ?? 1,
      interOpNumThreads: 1,
    },
  });
  type DisposableTensor = TensorView & { dispose?: () => void };
  const releaseTensors = (values: unknown[]) => {
    for (const tensor of Array.from(new Set(values))) {
      if (tensor && typeof (tensor as DisposableTensor).dispose === "function")
        (tensor as DisposableTensor).dispose!();
    }
  };
  return {
    countTokens: text =>
      tokenizer.encode(text, { add_special_tokens: true }).length,
    async infer(text, maxTokens) {
      const inputs = tokenizer(text, {
        padding: false,
        truncation: true,
        max_length: maxTokens,
      });
      let outputs: Record<string, unknown> = {};
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        releaseTensors([...Object.values(inputs), ...Object.values(outputs)]);
      };
      try {
        outputs = await model(inputs);
        const hiddenState =
          outputs.last_hidden_state ?? outputs.token_embeddings;
        if (!hiddenState || !inputs.attention_mask)
          throw new EmbeddingEngineError("invalid_output");
        return {
          hiddenState: hiddenState as DisposableTensor,
          attentionMask: inputs.attention_mask as DisposableTensor,
          release,
        };
      } catch (error) {
        release();
        throw error;
      }
    },
    dispose: async () => {
      await model.dispose();
    },
  };
}
