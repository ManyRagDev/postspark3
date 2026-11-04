import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  affinityBundleSchema,
  affinityHash,
  modelManifestSchema,
  type EditorialAffinityBundle,
  type EditorialModelManifest,
} from "./contracts";
import { createEmbeddingEngine, type EmbeddingEngine } from "./embeddingEngine";
import {
  editorialCatalogProfiles,
  EDITORIAL_CATALOG_PROFILES_VERSION,
  type EditorialCatalogProfile,
} from "./catalogProfiles";

export const profilesHash = () =>
  affinityHash({
    version: EDITORIAL_CATALOG_PROFILES_VERSION,
    profiles: editorialCatalogProfiles,
  });
export function engineForManifest(
  directory: string,
  manifest: EditorialModelManifest
) {
  return createEmbeddingEngine({
    ...manifest,
    modelPath: resolve(directory),
    artifactHash: affinityHash(manifest),
    threads: 1,
    maxPending: 0,
  });
}

export async function verifyModelFiles(
  directory: string,
  manifest: EditorialModelManifest
) {
  const required = [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    `onnx/model${manifest.dtype === "q8" ? "_quantized" : ""}.onnx`,
  ];
  if (required.some(file => !manifest.files[file]))
    throw new Error("invalid_artifact");
  for (const [file, expected] of Object.entries(manifest.files)) {
    if (
      isAbsolute(file) ||
      file.split(/[\\/]/).some(part => part === ".." || !part)
    )
      throw new Error("invalid_artifact");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(join(directory, file)))
      hash.update(chunk);
    if (hash.digest("hex") !== expected) throw new Error("invalid_artifact");
  }
}

export async function readModelManifest(directory: string) {
  return modelManifestSchema.parse(
    JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"))
  );
}

export function validateBundle(
  bundle: EditorialAffinityBundle,
  engine: EmbeddingEngine,
  profiles: readonly EditorialCatalogProfile[] = editorialCatalogProfiles
) {
  const { hash, ...basis } = bundle;
  const expectedProfilesHash = affinityHash({
    version: EDITORIAL_CATALOG_PROFILES_VERSION,
    profiles,
  });
  if (
    hash !== affinityHash(basis) ||
    bundle.profilesHash !== expectedProfilesHash ||
    bundle.embeddingFingerprint !== engine.metadata.fingerprint
  )
    throw new Error("invalid_artifact");
  const expected = new Set(
    profiles.flatMap(p => p.references.map(r => `${p.id}/${r.id}`))
  );
  const seen = new Set<string>();
  for (const reference of bundle.references) {
    const key = `${reference.profileId}/${reference.referenceId}`;
    const norm = Math.hypot(...reference.vector);
    if (
      !expected.has(key) ||
      seen.has(key) ||
      reference.vector.length !== engine.metadata.dimensions ||
      !Number.isFinite(norm) ||
      Math.abs(norm - 1) > 0.001
    )
      throw new Error("invalid_artifact");
    seen.add(key);
  }
  if (seen.size !== expected.size) throw new Error("invalid_artifact");
}

export async function loadAffinityBundle(directory: string) {
  if (!isAbsolute(directory)) throw new Error("invalid_artifact");
  const bundle = affinityBundleSchema.parse(
    JSON.parse(await readFile(join(directory, "affinity.json"), "utf8"))
  );
  const manifest = await readModelManifest(directory);
  if (affinityHash(manifest) !== affinityHash(bundle.model))
    throw new Error("invalid_artifact");
  const engine = engineForManifest(directory, manifest);
  validateBundle(bundle, engine);
  await verifyModelFiles(directory, manifest);
  return { bundle, engine };
}

/** Several editorial uses can fit the same repertoire. Keep their evidence;
 * the mean of the two strongest matches is a similarity, never a probability. */
export function rankEditorialProfiles(
  vector: Float32Array,
  bundle: EditorialAffinityBundle,
  profiles: readonly EditorialCatalogProfile[]
) {
  if (
    vector.length !== bundle.model.dimensions ||
    vector.some(v => !Number.isFinite(v)) ||
    Math.abs(Math.hypot(...Array.from(vector)) - 1) > 0.001
  )
    throw new Error("invalid_output");
  const vectors = new Map(
    bundle.references.map(r => [`${r.profileId}/${r.referenceId}`, r.vector])
  );
  return profiles
    .filter(p => p.references.length)
    .map(profile => {
      const references = profile.references
        .map(reference => {
          const target = vectors.get(`${profile.id}/${reference.id}`);
          if (!target) throw new Error("invalid_artifact");
          let dot = 0;
          for (let i = 0; i < vector.length; i++) dot += vector[i] * target[i];
          return {
            id: reference.id,
            dimension: reference.dimension,
            score: Math.max(-1, Math.min(1, dot)),
          };
        })
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      const strongest = references.slice(0, 2);
      return {
        profileId: profile.id,
        familyId: profile.familyId,
        sourceHash: profile.evidence.sourceHash,
        score:
          strongest.reduce((sum, r) => sum + r.score, 0) / strongest.length,
        references,
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.profileId.localeCompare(b.profileId)
    );
}
