import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  engineForManifest,
  rankEditorialProfiles,
  validateBundle,
  verifyModelFiles,
} from "./bundle";
import {
  affinityBundleSchema,
  affinityHash,
  modelManifestSchema,
  type EditorialAffinityBundle,
  type EditorialModelManifest,
} from "./contracts";
import {
  EDITORIAL_CATALOG_PROFILES_VERSION,
  type EditorialCatalogProfile,
} from "./catalogProfiles";

const model: EditorialModelManifest = {
  version: 1,
  modelId: "test/editorial-local",
  revision: "a".repeat(40),
  dimensions: 2,
  maxTokens: 128,
  dtype: "q8",
  queryPrefix: "query: ",
  referencePrefix: "passage: ",
  files: Object.fromEntries(
    [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "onnx/model_quantized.onnx",
    ].map(file => [file, "b".repeat(64)])
  ),
};

const profiles: EditorialCatalogProfile[] = ["a", "b"].map(id => ({
  id: `source-${id}`,
  familyId: "same-family-name",
  evidence: {
    sourceId: `source-${id}`,
    sourceHash: `${id}`.repeat(64),
    sourcePath: `offline/source-${id}.json`,
    components: [{ id: `source-${id}`, hash: `${id}`.repeat(64) }],
    composition: "Independent reference fixture; no real model quality claim.",
  },
  references: [1, 2, 3].map(n => ({
    id: `reference-${n}`,
    text: `Editorial example ${id}-${n}`,
    dimension: "structure" as const,
    evidenceComponentIds: [`source-${id}`],
  })),
}));

function seal(
  bundle: Omit<EditorialAffinityBundle, "hash"> | EditorialAffinityBundle
): EditorialAffinityBundle {
  const { hash: _hash, ...basis } = bundle as EditorialAffinityBundle;
  return { ...basis, hash: affinityHash(basis) };
}

function fixture() {
  // Creating metadata is lazy and never loads, downloads or invokes a model.
  const engine = engineForManifest("/tmp/postspark-unloaded-test-model", model);
  const bundle = seal({
    version: 1,
    scoringVersion: 1,
    model,
    embeddingFingerprint: engine.metadata.fingerprint,
    profilesHash: affinityHash({
      version: EDITORIAL_CATALOG_PROFILES_VERSION,
      profiles,
    }),
    references: [
      { profileId: "source-a", referenceId: "reference-1", vector: [1, 0] },
      { profileId: "source-a", referenceId: "reference-2", vector: [0.6, 0.8] },
      { profileId: "source-a", referenceId: "reference-3", vector: [-1, 0] },
      { profileId: "source-b", referenceId: "reference-1", vector: [1, 0] },
      { profileId: "source-b", referenceId: "reference-2", vector: [0.8, 0.6] },
      { profileId: "source-b", referenceId: "reference-3", vector: [0, -1] },
    ],
  });
  return { engine, bundle };
}

describe("editorial affinity bundle integrity", () => {
  it("accepts a sealed complete bundle and rejects payload changes without resealing", () => {
    const { bundle, engine } = fixture();
    expect(affinityBundleSchema.safeParse(bundle).success).toBe(true);
    expect(() => validateBundle(bundle, engine, profiles)).not.toThrow();
    const changed = structuredClone(bundle);
    changed.references[0].vector = [0, 1];
    expect(() => validateBundle(changed, engine, profiles)).toThrow(
      "invalid_artifact"
    );
  });

  it("rejects a resealed bundle compiled from another profile revision", () => {
    const { bundle, engine } = fixture();
    const revised = structuredClone(profiles);
    revised[0].references[0].text = "A revised editorial interpretation";
    expect(() => validateBundle(bundle, engine, revised)).toThrow(
      "invalid_artifact"
    );
    expect(() =>
      validateBundle(
        seal({ ...bundle, profilesHash: "f".repeat(64) }),
        engine,
        profiles
      )
    ).toThrow("invalid_artifact");
  });

  it.each([
    ["model ID", { modelId: "test/other-model" }],
    ["revision", { revision: "c".repeat(40) }],
    ["dimensions", { dimensions: 3 }],
    ["token limit", { maxTokens: 256 }],
    ["dtype", { dtype: "fp32" as const }],
    ["query prefix", { queryPrefix: "different: " }],
    ["reference prefix", { referencePrefix: "different: " }],
    [
      "artifact bytes",
      { files: { ...model.files, "tokenizer.json": "e".repeat(64) } },
    ],
  ])("rejects vectors when the engine changes %s", (_name, change) => {
    const { bundle } = fixture();
    const otherEngine = engineForManifest(
      "/tmp/postspark-unloaded-test-model",
      { ...model, ...change }
    );
    expect(() => validateBundle(bundle, otherEngine, profiles)).toThrow(
      "invalid_artifact"
    );
  });

  it("rejects unsupported schema versions and nonfinite data at the load boundary", () => {
    const { bundle } = fixture();
    expect(
      affinityBundleSchema.safeParse({ ...bundle, version: 2 }).success
    ).toBe(false);
    expect(
      affinityBundleSchema.safeParse({ ...bundle, scoringVersion: 2 }).success
    ).toBe(false);
    expect(
      modelManifestSchema.safeParse({ ...model, version: 2 }).success
    ).toBe(false);
    expect(
      modelManifestSchema.safeParse({ ...model, revision: "main" }).success
    ).toBe(false);
    const bad = structuredClone(bundle);
    bad.references[0].vector[0] = Number.NaN;
    expect(affinityBundleSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects missing, duplicate and foreign references even after resealing", () => {
    const { bundle, engine } = fixture();
    for (const references of [
      bundle.references.slice(1),
      [...bundle.references, bundle.references[0]],
      bundle.references.map((r, i) =>
        i === 0 ? { ...r, referenceId: "foreign" } : r
      ),
      bundle.references.map((r, i) =>
        i === 0 ? { ...r, profileId: "foreign" } : r
      ),
    ]) {
      expect(() =>
        validateBundle(seal({ ...bundle, references }), engine, profiles)
      ).toThrow("invalid_artifact");
    }
  });

  it.each([
    ["wrong width", [1, 0, 0]],
    ["empty", []],
    ["zero norm", [0, 0]],
    ["non-unit norm", [1, 1]],
    ["nonfinite", [Number.POSITIVE_INFINITY, 0]],
  ])("rejects a %s reference vector even after resealing", (_name, vector) => {
    const { bundle, engine } = fixture();
    const changed = structuredClone(bundle);
    changed.references[0].vector = vector;
    expect(() => validateBundle(seal(changed), engine, profiles)).toThrow(
      "invalid_artifact"
    );
  });
});

describe("editorial affinity scoring", () => {
  it("ranks homonymous sources independently and takes the mean of their strongest two cosines", () => {
    const { bundle, engine } = fixture();
    validateBundle(bundle, engine, profiles);
    const scores = rankEditorialProfiles(
      Float32Array.from([1, 0]),
      bundle,
      profiles
    );
    expect(scores.map(s => s.profileId)).toEqual(["source-b", "source-a"]);
    expect(scores.map(s => s.familyId)).toEqual([
      "same-family-name",
      "same-family-name",
    ]);
    expect(scores[0].score).toBeCloseTo(0.9);
    expect(scores[1].score).toBeCloseTo(0.8);
    expect(scores[1].references.map(r => r.score)).toEqual([1, 0.6, -1]);
    expect(scores.reduce((sum, s) => sum + s.score, 0)).toBeCloseTo(1.7);
    expect(scores[0]).not.toHaveProperty("probability");
  });

  it("uses the actual evidence subset, without padding absent variants or renormalizing across candidates", () => {
    const { bundle } = fixture();
    const onlyCover = {
      ...profiles[0],
      references: [profiles[0].references[2]],
    };
    const scores = rankEditorialProfiles(Float32Array.from([1, 0]), bundle, [
      onlyCover,
    ]);
    expect(scores).toHaveLength(1);
    expect(scores[0].score).toBe(-1);
    expect(scores[0].references.map(r => r.id)).toEqual(["reference-3"]);
    expect(
      rankEditorialProfiles(Float32Array.from([1, 0]), bundle, [
        { ...onlyCover, references: [] },
      ])
    ).toEqual([]);
  });

  it("breaks exact ties by source identity independent of input order", () => {
    const { bundle } = fixture();
    const identical = seal({
      ...bundle,
      references: bundle.references.map(r => ({ ...r, vector: [1, 0] })),
    });
    expect(
      rankEditorialProfiles(
        Float32Array.from([1, 0]),
        identical,
        [...profiles].reverse()
      ).map(s => s.profileId)
    ).toEqual(["source-a", "source-b"]);
  });

  it.each([
    [0, 0],
    [1, 1],
    [1, 0, 0],
    [Number.NaN, 0],
  ])("rejects invalid query vectors %j", (...values) => {
    const { bundle } = fixture();
    expect(() =>
      rankEditorialProfiles(Float32Array.from(values), bundle, profiles)
    ).toThrow("invalid_output");
  });

  it("rejects requested evidence that was not compiled", () => {
    const { bundle } = fixture();
    const unknown = {
      ...profiles[0],
      references: [{ ...profiles[0].references[0], id: "missing" }],
    };
    expect(() =>
      rankEditorialProfiles(Float32Array.from([1, 0]), bundle, [unknown])
    ).toThrow("invalid_artifact");
  });
});

describe("model file provenance", () => {
  it("checks local bytes, required files and traversal paths without loading a model", async () => {
    const directory = await mkdtemp(join(tmpdir(), "postspark-affinity-test-"));
    try {
      await mkdir(join(directory, "onnx"));
      const files: Record<string, string> = {};
      for (const file of Object.keys(model.files)) {
        const bytes = Buffer.from(`fixture for ${file}`);
        await writeFile(join(directory, file), bytes);
        files[file] = createHash("sha256").update(bytes).digest("hex");
      }
      const fixtureManifest = { ...model, files };
      await expect(
        verifyModelFiles(directory, fixtureManifest)
      ).resolves.toBeUndefined();
      await writeFile(join(directory, "tokenizer.json"), "changed");
      await expect(
        verifyModelFiles(directory, fixtureManifest)
      ).rejects.toThrow("invalid_artifact");
      const { "tokenizer.json": _tokenizer, ...incomplete } = files;
      await expect(
        verifyModelFiles(directory, { ...model, files: incomplete })
      ).rejects.toThrow("invalid_artifact");
      await expect(
        verifyModelFiles(directory, {
          ...model,
          files: { "../outside": "f".repeat(64), ...files },
        })
      ).rejects.toThrow("invalid_artifact");
      await expect(
        verifyModelFiles(directory, {
          ...model,
          files: { "/tmp/outside": "f".repeat(64), ...files },
        })
      ).rejects.toThrow("invalid_artifact");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
