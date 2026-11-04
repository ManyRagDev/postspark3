/** Offline-only compilation and measurement; never invokes a remote model API.
 * Usage: node --import tsx scripts/editorialAffinity.ts compile <model-directory>
 *        node --import tsx scripts/editorialAffinity.ts evaluate <model-directory> <output.json>
 *        node --import tsx scripts/editorialAffinity.ts inspect <model-directory> "prompt"
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { cpus, arch, platform, totalmem } from "node:os";
import { z } from "zod";
import {
  engineForManifest,
  loadAffinityBundle,
  profilesHash,
  rankEditorialProfiles,
  readModelManifest,
  validateBundle,
  verifyModelFiles,
} from "../server/ai/editorialAffinity/bundle";
import {
  affinityBundleSchema,
  affinityHash,
} from "../server/ai/editorialAffinity/contracts";
import { editorialCatalogProfiles } from "../server/ai/editorialAffinity/catalogProfiles";
import { EmbeddingEngineError } from "../server/ai/editorialAffinity/embeddingEngine";

const fixturePath = fileURLToPath(
  new URL(
    "../server/ai/editorialAffinity/fixtures/editorial-affinity-cases.json",
    import.meta.url
  )
);
const fixtureSchema = z.object({
  version: z.literal(1),
  purpose: z.string(),
  labelStatus: z.string(),
  notes: z.array(z.string()),
  cases: z
    .array(
      z.object({
        id: z.string().min(1),
        prompt: z.string(),
        tags: z.array(z.string()),
        contrastGroup: z.string().optional(),
        expected: z.object({
          signal: z.enum(["rankable", "insufficient"]),
          preferredFamilyIds: z.array(z.string()),
          acceptableFamilyIds: z.array(z.string()),
          disfavoredFamilyIds: z.array(z.string()),
        }),
      })
    )
    .min(1),
});
type EvaluationCase = z.infer<typeof fixtureSchema>["cases"][number];
type RankedProfile = ReturnType<typeof rankEditorialProfiles>[number];
type MeasuredCase = EvaluationCase & {
  status: "scored" | "rejected";
  reason: string | null;
  tokenCount: number | null;
  usedTokens: number | null;
  truncated: boolean;
  latencyMs: number;
  ranking: RankedProfile[];
  uniqueFamilyRanking: string[];
};

async function writeJsonAtomically(destination: string, value: unknown) {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}
const unique = (values: string[]) => Array.from(new Set(values));
const containsAny = (actual: string[], expected: string[]) =>
  actual.some(value => expected.includes(value));
function recall(actual: string[], expected: string[]) {
  const relevant = unique(expected);
  return relevant.length
    ? actual.filter(value => relevant.includes(value)).length / relevant.length
    : null;
}
function retrievalMetrics(
  cases: MeasuredCase[],
  expectedFor: (item: MeasuredCase) => string[]
) {
  // Rejected rankable cases remain in the denominator: rejection is not a retrieval success.
  const evaluated = cases.filter(
    item => item.expected.signal === "rankable" && expectedFor(item).length
  );
  const at = (k: number) => ({
    hitRate: average(
      evaluated.map(item =>
        Number(
          containsAny(item.uniqueFamilyRanking.slice(0, k), expectedFor(item))
        )
      )
    ),
    macroRecall: average(
      evaluated.map(
        item => recall(item.uniqueFamilyRanking.slice(0, k), expectedFor(item))!
      )
    ),
  });
  return { cases: evaluated.length, at3: at(3), at5: at(5) };
}

function contrastMetrics(cases: MeasuredCase[]) {
  const groups = unique(
    cases.flatMap(item => (item.contrastGroup ? [item.contrastGroup] : []))
  );
  const meanFamilyScore = (item: MeasuredCase, families: string[]) =>
    average(
      families.flatMap(family => {
        const scores = item.ranking
          .filter(profile => profile.familyId === family)
          .map(profile => profile.score);
        return scores.length ? [Math.max(...scores)] : [];
      })
    );
  return groups.map(group => {
    const members = cases.filter(item => item.contrastGroup === group);
    const pairs: Array<Record<string, unknown>> = [];
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const left = members[a],
          right = members[b];
        const leftTop3 = left.uniqueFamilyRanking.slice(0, 3),
          rightTop3 = right.uniqueFamilyRanking.slice(0, 3);
        const union = unique([...leftTop3, ...rightTop3]);
        const overlap = leftTop3.filter(family =>
          rightTop3.includes(family)
        ).length;
        const aLabels = left.expected.preferredFamilyIds,
          bLabels = right.expected.preferredFamilyIds;
        const disjointLabels =
          aLabels.length > 0 &&
          bLabels.length > 0 &&
          !containsAny(aLabels, bLabels);
        const aa = meanFamilyScore(left, aLabels),
          ab = meanFamilyScore(left, bLabels);
        const bb = meanFamilyScore(right, bLabels),
          ba = meanFamilyScore(right, aLabels);
        const measuredContrast =
          disjointLabels &&
          aa !== null &&
          ab !== null &&
          bb !== null &&
          ba !== null;
        pairs.push({
          caseIds: [left.id, right.id],
          top3Jaccard: union.length ? overlap / union.length : null,
          top1Changed:
            left.uniqueFamilyRanking.length && right.uniqueFamilyRanking.length
              ? left.uniqueFamilyRanking[0] !== right.uniqueFamilyRanking[0]
              : null,
          distinctPreferredLabels: disjointLabels,
          // Descriptive contrast only; not a pass threshold or a calibrated probability.
          ownLabelMargins: measuredContrast ? [aa! - ab!, bb! - ba!] : null,
          bothPreferOwnLabels: measuredContrast ? aa! > ab! && bb! > ba! : null,
        });
      }
    }
    return { group, caseIds: members.map(item => item.id), pairs };
  });
}

export async function compileEditorialAffinity(directory: string) {
  directory = resolve(directory);
  const started = performance.now();
  const model = await readModelManifest(directory);
  await verifyModelFiles(directory, model);
  const verifiedMs = performance.now() - started;
  const engine = engineForManifest(directory, model);
  try {
    const sources = editorialCatalogProfiles.flatMap(profile =>
      profile.references.map(reference => ({
        profileId: profile.id,
        referenceId: reference.id,
        text: reference.text,
      }))
    );
    const references: Array<{
      profileId: string;
      referenceId: string;
      vector: number[];
    }> = [];
    for (let offset = 0; offset < sources.length; offset += 64) {
      const batch = sources.slice(offset, offset + 64);
      const result = await engine.embed(
        batch.map(source => source.text),
        { kind: "reference", overflow: "reject" }
      );
      references.push(
        ...batch.map((source, index) => ({
          profileId: source.profileId,
          referenceId: source.referenceId,
          vector: Array.from(result.vectors[index]),
        }))
      );
    }
    const basis = {
      version: 1 as const,
      scoringVersion: 1 as const,
      model,
      embeddingFingerprint: engine.metadata.fingerprint,
      profilesHash: profilesHash(),
      references,
    };
    const bundle = affinityBundleSchema.parse({
      ...basis,
      hash: affinityHash(basis),
    });
    validateBundle(bundle, engine);
    const destination = join(directory, "affinity.json");
    await writeJsonAtomically(destination, bundle);
    return {
      destination,
      modelId: model.modelId,
      profiles: editorialCatalogProfiles.length,
      references: references.length,
      hash: bundle.hash,
      profilesHash: bundle.profilesHash,
      modelVerificationMs: verifiedMs,
      totalMs: performance.now() - started,
    };
  } finally {
    await engine.dispose();
  }
}

export async function evaluateEditorialAffinity(
  directory: string,
  outputPath: string
) {
  const fixture = fixtureSchema.parse(
    JSON.parse(await readFile(fixturePath, "utf8"))
  );
  const knownFamilies = new Set(
    editorialCatalogProfiles.map(profile => profile.familyId)
  );
  if (
    new Set(fixture.cases.map(item => item.id)).size !== fixture.cases.length ||
    fixture.cases.some(item =>
      [
        ...item.expected.preferredFamilyIds,
        ...item.expected.acceptableFamilyIds,
        ...item.expected.disfavoredFamilyIds,
      ].some(family => !knownFamilies.has(family))
    )
  )
    throw new Error("editorial_affinity_invalid_fixture_identity");
  const rssBefore = process.memoryUsage().rss;
  let sampledPeakRss = rssBefore;
  const sampleMemory = () => {
    sampledPeakRss = Math.max(sampledPeakRss, process.memoryUsage().rss);
  };
  const sampling = setInterval(sampleMemory, 20);
  const loadStarted = performance.now();
  const loaded = await loadAffinityBundle(resolve(directory)).catch(error => {
    clearInterval(sampling);
    throw error;
  });
  const artifactVerificationMs = performance.now() - loadStarted;
  const { bundle, engine } = loaded;
  try {
    // This first operation includes lazy native session loading and a real inference.
    // It is deliberately excluded from the warm-case distribution.
    const initializationStarted = performance.now();
    await engine.embed(["Apresente uma ideia com clareza."], {
      kind: "query",
      overflow: "reject",
    });
    const modelInitializationAndWarmupMs =
      performance.now() - initializationStarted;
    sampleMemory();
    const cases: MeasuredCase[] = [];
    for (const item of fixture.cases) {
      const started = performance.now();
      try {
        const result = await engine.embed([item.prompt], {
          kind: "query",
          overflow: "reject",
        });
        const ranking = rankEditorialProfiles(
          result.vectors[0],
          bundle,
          editorialCatalogProfiles
        );
        cases.push({
          ...item,
          status: "scored",
          reason: null,
          tokenCount: result.inputs[0].tokenCount,
          usedTokens: result.inputs[0].usedTokens,
          truncated: result.inputs[0].truncated,
          latencyMs: performance.now() - started,
          ranking,
          uniqueFamilyRanking: unique(ranking.map(profile => profile.familyId)),
        });
      } catch (error) {
        cases.push({
          ...item,
          status: "rejected",
          reason:
            error instanceof EmbeddingEngineError
              ? error.code
              : "invalid_output",
          tokenCount: null,
          usedTokens: null,
          truncated: false,
          latencyMs: performance.now() - started,
          ranking: [],
          uniqueFamilyRanking: [],
        });
      }
      sampleMemory();
    }
    let tokenLimitProbe: { rejected: boolean; reason: string | null };
    try {
      await engine.embed(
        ["Quero explicar uma ideia em detalhes. ".repeat(300)],
        { kind: "query", overflow: "reject" }
      );
      tokenLimitProbe = { rejected: false, reason: null };
    } catch (error) {
      tokenLimitProbe = {
        rejected: true,
        reason:
          error instanceof EmbeddingEngineError ? error.code : "unavailable",
      };
    }
    const rankable = cases.filter(item => item.expected.signal === "rankable");
    const disfavoredLabeled = rankable.filter(
      item => item.expected.disfavoredFamilyIds.length
    );
    const disfavoredTop1Count = disfavoredLabeled.filter(item =>
      containsAny(
        item.uniqueFamilyRanking.slice(0, 1),
        item.expected.disfavoredFamilyIds
      )
    ).length;
    const insufficient = cases.filter(
      item => item.expected.signal === "insufficient"
    );
    const successfulLatencies = cases
      .filter(item => item.status === "scored")
      .map(item => item.latencyMs);
    const allLatencies = cases.map(item => item.latencyMs);
    sampleMemory();
    const report = {
      version: 1,
      measuredAt: new Date().toISOString(),
      labelStatus: fixture.labelStatus,
      automaticProductionApproval: false,
      scope: "local_encoder_and_editorial_retrieval_only",
      environment: {
        node: process.version,
        platform: platform(),
        architecture: arch(),
        cpu: cpus()[0]?.model,
        logicalCpus: cpus().length,
        totalMemoryBytes: totalmem(),
        inferenceThreads: 1,
      },
      notes: [
        ...fixture.notes,
        "Scores are cosine similarities, not calibrated probabilities. No OOD detector or semantic confidence threshold is evaluated.",
        "Retrieval metrics use unique family IDs because labels are at family level; the full ranking retains all 29 repertoire identities.",
        "A hit means at least one expected family occurs in top K. Macro recall averages the fraction of expected families retrieved per case.",
        "Unjudged families are not assumed incorrect. Rejected rankable cases remain in retrieval denominators.",
        "Initialization includes native session loading and one warmup inference. Warm latency includes tokenization, inference, pooling and ranking, with no embedding cache.",
        "Peak RSS is sampled process RSS, not an exact peak or isolated model allocation. No render, generation, persisted application journey or editorial human review is established by this report.",
      ],
      model: bundle.model,
      embeddingFingerprint: bundle.embeddingFingerprint,
      bundleHash: bundle.hash,
      profilesHash: bundle.profilesHash,
      fixtureHash: affinityHash(fixture),
      totals: {
        cases: cases.length,
        rankable: rankable.length,
        expectedInsufficient: insufficient.length,
        scored: cases.filter(item => item.status === "scored").length,
        rejected: cases.filter(item => item.status === "rejected").length,
        tokenRejected: cases.filter(item => item.reason === "token_limit")
          .length,
      },
      retrieval: {
        topKUnit: "unique_family",
        preferred: retrievalMetrics(
          cases,
          item => item.expected.preferredFamilyIds
        ),
        preferredOrAcceptable: retrievalMetrics(cases, item =>
          unique([
            ...item.expected.preferredFamilyIds,
            ...item.expected.acceptableFamilyIds,
          ])
        ),
        disfavoredTop1: {
          labeledCases: disfavoredLabeled.length,
          count: disfavoredTop1Count,
          rate: disfavoredLabeled.length
            ? disfavoredTop1Count / disfavoredLabeled.length
            : null,
        },
      },
      insufficientInputs: {
        cases: insufficient.length,
        scored: insufficient.filter(item => item.status === "scored").length,
        rejected: insufficient.filter(item => item.status === "rejected")
          .length,
        note: "Raw retrieval scores for insufficient inputs do not establish suitability or successful OOD rejection.",
      },
      tokenLimitProbe,
      timings: {
        artifactVerificationMs,
        modelInitializationAndWarmupMs,
        warmScored: {
          count: successfulLatencies.length,
          meanMs: average(successfulLatencies),
          p50Ms: percentile(successfulLatencies, 0.5),
          p95Ms: percentile(successfulLatencies, 0.95),
          maxMs: successfulLatencies.length
            ? Math.max(...successfulLatencies)
            : null,
        },
        warmAll: {
          count: allLatencies.length,
          p50Ms: percentile(allLatencies, 0.5),
          p95Ms: percentile(allLatencies, 0.95),
        },
      },
      memory: {
        rssBeforeBytes: rssBefore,
        rssAfterBytes: process.memoryUsage().rss,
        sampledPeakRssBytes: sampledPeakRss,
      },
      contrasts: contrastMetrics(cases),
      cases,
    };
    await writeJsonAtomically(resolve(outputPath), report);
    return {
      destination: resolve(outputPath),
      labelStatus: report.labelStatus,
      automaticProductionApproval: false,
      modelId: bundle.model.modelId,
      totals: report.totals,
      retrieval: report.retrieval,
      timings: report.timings,
      tokenLimitProbe,
      memory: report.memory,
    };
  } finally {
    clearInterval(sampling);
    await engine.dispose();
  }
}

async function inspect(directory: string, prompt: string) {
  const { bundle, engine } = await loadAffinityBundle(resolve(directory));
  try {
    const result = await engine.embed([prompt], {
      kind: "query",
      overflow: "reject",
    });
    return {
      modelId: bundle.model.modelId,
      input: result.inputs[0],
      latencyMs: result.latencyMs,
      scoreMeaning: "cosine_similarity_not_probability",
      ranking: rankEditorialProfiles(
        result.vectors[0],
        bundle,
        editorialCatalogProfiles
      ).slice(0, 5),
    };
  } finally {
    await engine.dispose();
  }
}

async function main() {
  const [command, directory, argument] = process.argv.slice(2);
  if (
    !directory ||
    !["compile", "evaluate", "inspect"].includes(command) ||
    (command !== "compile" && !argument)
  )
    throw new Error(
      "Usage: editorialAffinity.ts compile <model-dir> | evaluate <model-dir> <output.json> | inspect <model-dir> <prompt>"
    );
  const result =
    command === "compile"
      ? await compileEditorialAffinity(directory)
      : command === "evaluate"
        ? await evaluateEditorialAffinity(directory, argument)
        : await inspect(directory, argument);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "editorial_affinity_failed"}\n`
    );
    process.exitCode = 1;
  });
}
