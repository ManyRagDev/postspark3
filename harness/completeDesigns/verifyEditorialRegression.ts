/** Live, local-only editorial regression. No Supabase calls, import, publication or media persistence. */
import "dotenv/config";
import { mkdir, readFile, readdir, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  componentDefinitionV1Schema,
  compactComponentCard,
  type ComponentDefinitionV1,
} from "../../shared/componentAssembly";
import { defaultStudioPreferences } from "../../shared/studioPreferences";
import { orchestratedGenerationInputSchema } from "../../shared/generationRequest";
import { arsenalHash } from "../../shared/arsenalContent";
import type { ArsenalAsset } from "../../shared/designArsenal";
import { prepareOrchestratedGeneration } from "../../server/ai/workflows/generationPreparation";
import { executeProposalWorkflow } from "../../server/ai/workflows/proposalGraph";
import {
  renderReviewScenes,
  closeReviewRenderer,
  assertReviewRendererAvailable,
} from "../../server/ai/workflows/proposalRenderer";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";
import { invokeLLM } from "../../server/_core/llm";
import {
  runWithGenerationTrace,
  type GenerationTrace,
} from "../../server/ai/generationTrace";
import {
  journalResultWithTrace,
  readJournalResult,
} from "../../server/ai/workflows/generationJournalTrace";

const catalogRoot = resolve(
  process.argv[2] ??
    "artifacts/complete-designs/recovered-catalog-2026-10-09-r3"
);
const outputRoot = resolve(
  process.argv[3] ?? "artifacts/verification/editorial-regression-2026-10-09-r3"
);
const resumeExisting = process.argv.includes("--resume-existing");
const slotArgument = process.argv.find(arg => arg.startsWith("--slot="));
const onlySlot = slotArgument ? Number(slotArgument.split("=")[1]) : undefined;
const allowFirstReview = process.argv.includes("--allow-first-review");
const allowPolicyUpgradeReview = process.argv.includes("--allow-policy-upgrade-review");
const allowReasonedReview = process.argv.includes("--allow-reasoned-review");
const allowModelComparison = process.argv.includes("--allow-model-comparison");
const comparisonModel = "google/gemini-3.1-pro-preview";
if (onlySlot !== undefined && ![0, 1, 2].includes(onlySlot))
  throw new Error("invalid_slot");
if (allowFirstReview && (!resumeExisting || onlySlot === undefined))
  throw new Error("first_review_requires_single_slot_resume");
if (allowPolicyUpgradeReview && (!resumeExisting || onlySlot === undefined || allowFirstReview))
  throw new Error("policy_upgrade_requires_single_slot_resume");
const requested = process.argv.slice(4).filter(arg => !arg.startsWith("--"));
const cases = requested.length ? requested : ["cafeteria", "bizuminer"];
if (cases.some(name => !["cafeteria", "bizuminer"].includes(name)))
  throw new Error("unknown_regression_case");
if (allowPolicyUpgradeReview && (cases.length !== 1 || cases[0] !== "bizuminer"))
  throw new Error("policy_upgrade_authorized_only_for_bizuminer");
if (allowReasonedReview && (!resumeExisting || onlySlot !== 2 || allowFirstReview ||
    allowPolicyUpgradeReview || cases.length !== 1 || cases[0] !== "bizuminer"))
  throw new Error("reasoned_review_authorized_only_for_single_bizuminer_slot2_resume");
if (allowModelComparison && (!resumeExisting || onlySlot !== 2 || allowFirstReview ||
    allowPolicyUpgradeReview || allowReasonedReview || cases.length !== 1 || cases[0] !== "bizuminer" ||
    process.env.OPENROUTER_PROPOSAL_REVIEW_MODEL !== comparisonModel))
  throw new Error("model_comparison_authorized_only_for_single_bizuminer_slot2_pro_resume");
const definitions: ComponentDefinitionV1[] = [];
const localAssets = new Map<string, string>();
for (const file of (await readdir(join(catalogRoot, "packages"))).filter(name =>
  name.endsWith(".json")
)) {
  const pkg = JSON.parse(
    await readFile(join(catalogRoot, "packages", file), "utf8")
  );
  definitions.push(
    ...pkg.components.map((entry: unknown) =>
      componentDefinitionV1Schema.parse(entry)
    )
  );
  for (const file of pkg.assetFiles ?? [])
    localAssets.set(file.manifest.id, resolve(catalogRoot, file.relativePath));
}
const loadAssetBytes = async (asset: ArsenalAsset, signal?: AbortSignal) => {
  signal?.throwIfAborted();
  const path = localAssets.get(asset.id);
  if (!path) throw new Error(`regression_local_asset_missing:${asset.id}`);
  const bytes = await readFile(path, { signal });
  if (
    bytes.length !== asset.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256
  )
    throw new Error(`regression_local_asset_hash_mismatch:${asset.id}`);
  return bytes;
};
const persist = async (path: string, value: unknown) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n");
  await rename(temporary, path);
};
await mkdir(outputRoot, { recursive: true });
await assertReviewRendererAvailable();
try {
  for (const name of cases) {
    const output = join(outputRoot, name);
    await mkdir(join(output, "operations"), { recursive: true });
    const original = JSON.parse(
      await readFile(
        resolve(
          `artifacts/verification/selection-copy-2026-10-09/${name}.json`
        ),
        "utf8"
      )
    );
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: "00000000-0000-4000-8000-000000000001",
      inputType: "text",
      content: original.prompt,
      platform: "instagram",
      postMode: original.mode,
      slideCount: original.slideCount,
      aspectRatio: original.aspectRatio,
      formatIntentConfirmed: true,
      includeDraftDesigns: original.includeDraftDesigns,
      creationMode: "ideation",
      idempotencyKey: `local-${name}-r3`,
    });
    const eligible = definitions.filter(
      definition =>
        definition.completeDesign?.baselineVerified &&
        definition.aspectRatios.includes(input.aspectRatio)
    );
    const fingerprint = arsenalHash({
      input,
      catalog: eligible
        .map(definition => ({ id: definition.id, hash: definition.hash }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
    const manifestPath = join(output, "MANIFEST.json");
    let manifest: any;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
    if (manifest && manifest.fingerprint !== fingerprint)
      throw new Error("regression_input_or_catalog_changed_use_new_output");
    manifest ??= {
      fingerprint,
      runId: randomUUID(),
      prompt: original.prompt,
      input,
      catalogRoot,
      createdAt: new Date().toISOString(),
      databaseWrites: 0,
      publications: 0,
      networkScope: "OpenRouter only; no remote media creation",
      eligibleDesigns: eligible.length,
      eligibleFamilies: new Set(eligible.map(d => d.completeDesign!.family))
        .size,
    };
    await persist(manifestPath, manifest);
    const deadlineMs = Date.now() + 10 * 60_000;
    const trace: GenerationTrace = {
      id: manifest.runId,
      userUuid: input.ownerId,
      inputType: input.inputType,
      inputContent: input.content,
      platform: input.platform,
      postMode: input.postMode,
      creationMode: input.creationMode,
      requestedModel: input.model ?? "default",
      startedAt: Date.now(),
      calls: [],
      events: [],
    };
    const journal =
      (prefix: string) =>
      async <T>(key: string, work: () => Promise<T>): Promise<T> => {
        const operationKey = `${prefix}${key}`,
          path = join(
            output,
            "operations",
            `${createHash("sha256").update(operationKey).digest("hex")}.json`
          );
        let existing: any;
        try {
          existing = JSON.parse(await readFile(path, "utf8"));
        } catch (error: any) {
          if (error.code !== "ENOENT") throw error;
        }
        if (existing?.state === "completed")
          return readJournalResult<T>(existing.result);
        if (existing)
          throw new Error(
            `regression_operation_not_replayable:${operationKey}:${existing.state}`
          );
        const firstReviewPrefix = `proposal-${onlySlot}:review:initial:`;
        if (
          resumeExisting &&
          !/^proposal-\d+:(?:review_correction:|review:recheck:)/.test(
            operationKey
          )
        ) {
          const previous = await Promise.all(
            (await readdir(join(output, "operations")))
              .filter(file => file.endsWith(".json"))
              .map(async file =>
                JSON.parse(
                  await readFile(join(output, "operations", file), "utf8")
                )
              )
          );
          const previousReviews = previous.filter(operation =>
            operation.operationKey.startsWith(firstReviewPrefix)
          );
          const upgradingLegacyReview = allowPolicyUpgradeReview &&
            operationKey.startsWith(firstReviewPrefix) && previousReviews.length > 0 &&
            previousReviews.every(operation => {
              if (operation.state !== "completed") return false;
              const result = readJournalResult<any>(operation.result);
              const content = result?.choices?.[0]?.message?.content;
              if (typeof content !== "string") return false;
              try {
                return JSON.parse(content).factCoverage === undefined;
              } catch { return false; }
            });
          let upgradingReasonedReview = false;
          if (allowReasonedReview && operationKey.startsWith(firstReviewPrefix)) {
            const admission = JSON.parse(await readFile(join(output, "REASONED_REVIEW_ADMISSION.json"), "utf8"));
            const keys = previousReviews.map(operation => operation.operationKey).sort();
            upgradingReasonedReview = admission.fingerprint === fingerprint &&
              admission.slot === onlySlot && admission.contract === "proposal-review-v2-fact-coverage-reasoned" &&
              keys.length > 0 && JSON.stringify(keys) === JSON.stringify(admission.predecessorKeys) &&
              previousReviews.every(operation => operation.state === "completed") &&
              !keys.includes(operationKey);
          }
          let comparingReviewModel = false;
          if (allowModelComparison && operationKey.startsWith(firstReviewPrefix)) {
            const admission = JSON.parse(await readFile(join(output, "MODEL_COMPARISON_ADMISSION.json"), "utf8"));
            const keys = previousReviews.map(operation => operation.operationKey).sort();
            comparingReviewModel = admission.fingerprint === fingerprint && admission.slot === onlySlot &&
              admission.model === comparisonModel &&
              keys.length > 0 && JSON.stringify(keys) === JSON.stringify(admission.predecessorKeys) &&
              previousReviews.every(operation => operation.state === "completed") && !keys.includes(operationKey);
          }
          if (
            !(
              comparingReviewModel || upgradingReasonedReview || upgradingLegacyReview || (allowFirstReview &&
              operationKey.startsWith(firstReviewPrefix) &&
              previousReviews.length === 0)
            )
          )
            throw new Error(
              `regression_resume_disallows_new_operation:${operationKey}`
            );
        }
        const child: GenerationTrace = { ...trace, calls: [], events: [] };
        await writeFile(
          path,
          JSON.stringify({
            operationKey,
            state: "started",
            startedAt: new Date().toISOString(),
          }),
          { flag: "wx" }
        );
        try {
          const result = await runWithGenerationTrace(child, work);
          await persist(path, {
            operationKey,
            state: "completed",
            result: journalResultWithTrace(result, child),
            trace: child,
            completedAt: new Date().toISOString(),
          });
          return result;
        } catch (error) {
          await persist(path, {
            operationKey,
            state: "uncertain",
            error: error instanceof Error ? error.message : "failed",
            trace: child,
          });
          throw error;
        }
      };
    try {
      const result = await runWithGenerationTrace(trace, async () => {
        const prepared = await prepareOrchestratedGeneration(
          input,
          input.ownerId,
          true,
          deadlineMs,
          {
            operation: journal("prepare:"),
            loadContext: async () => input.content,
            preferences: async () => ({
              ...defaultStudioPreferences,
              enabled: false,
            }),
            recentSelections: async () => [],
            retrieve: async () => eligible.map(compactComponentCard),
            hydrate: async ids =>
              ids.map(id => {
                const definition = eligible.find(d => d.id === id);
                if (!definition) throw new Error("selected_definition_missing");
                return definition;
              }),
            generate: params =>
              invokeLLM({
                ...params,
                disableFallback: true,
                maxTransportAttempts: 1,
                disableStructuredRepair: true,
              }),
          }
        );
        await persist(join(output, "PREPARED.json"), prepared);
        const proposals = await Promise.all(
          prepared.selectedDefinitions.map(
            async (selectedDefinitions, slot) => {
              if (onlySlot !== undefined && slot !== onlySlot) {
                const previous = JSON.parse(
                  await readFile(join(output, "REPORT.json"), "utf8")
                );
                return previous.proposals.find(
                  (proposal: any) => proposal.slot === slot
                );
              }
              const nativeMedia = selectedDefinitions.flatMap(
                d => d.fragment.mediaSlots ?? []
              );
              if (nativeMedia.length)
                return {
                  slot,
                  status: "not_executed",
                  reason:
                    "Selected native media requires genuine image generation and private persistence, which this local-only run excludes.",
                  selectedDesigns: selectedDefinitions.map(d => ({
                    id: d.id,
                    label: d.label,
                    family: d.completeDesign!.family,
                  })),
                  nativeMedia,
                };
              let renderRound = 0;
              const proposal = await executeProposalWorkflow(
                {
                  requestId: manifest.runId,
                  runId: manifest.runId,
                  proposalId: `local-${name}-${slot}`,
                  slot,
                  selectedDefinitions,
                  selectionReason: prepared.selectionReasons[slot],
                  experimental: true,
                  prompt: input.content,
                  contextContent: prepared.contextContent,
                  visualPreference: prepared.visualPreference,
                  imageObligation:
                    prepared.perProposalImageObligations?.[slot] ??
                    prepared.imageObligation,
                  creationMode: input.creationMode,
                  platform: input.platform,
                  postMode: input.postMode,
                  deadlineMs,
                },
                {
                  actor: input.ownerId,
                  generateText: params =>
                    invokeLLM({
                      ...params,
                      disableFallback: true,
                      maxTransportAttempts: 1,
                      disableStructuredRepair: true,
                    }),
                  createTextMeasurer: (assets, _loader, signal) =>
                    createComponentTextMeasurer(assets, loadAssetBytes, signal),
                  recoveryOperationKeys: async () => {
                    const operations = await Promise.all(
                      (await readdir(join(output, "operations")))
                        .filter(file => file.endsWith(".json"))
                        .map(async file =>
                          JSON.parse(
                            await readFile(
                              join(output, "operations", file),
                              "utf8"
                            )
                          )
                        )
                    );
                    return operations
                      .map(operation => operation.operationKey)
                      .filter(
                        key =>
                          key.startsWith(`proposal-${slot}:copy_recovery`) ||
                          key.startsWith(`proposal-${slot}:review_correction:`)
                      )
                      .map(key => key.slice(`proposal-${slot}:`.length));
                  },
                  executeOperation: (params, work) =>
                    journal(`proposal-${slot}:`)(params.operationKey, work),
                  checkpoint: async (stage, data) => {
                    await writeFile(
                      join(output, `proposal-${slot}-checkpoints.jsonl`),
                      JSON.stringify({
                        at: new Date().toISOString(),
                        stage,
                        data,
                      }) + "\n",
                      { flag: "a" }
                    );
                  },
                  renderReviewScenes: async renderInput => {
                    const round = renderRound++;
                    const scenes = await renderReviewScenes({
                      ...renderInput,
                      loadAssetBytes,
                    });
                    await mkdir(
                      join(output, `proposal-${slot}-render-${round}`),
                      { recursive: true }
                    );
                    for (const scene of scenes)
                      await writeFile(
                        join(
                          output,
                          `proposal-${slot}-render-${round}`,
                          `slide-${scene.slideIndex}.png`
                        ),
                        Buffer.from(scene.dataUri.split(",")[1], "base64")
                      );
                    await persist(
                      join(
                        output,
                        `proposal-${slot}-render-${round}`,
                        "SCENES.json"
                      ),
                      scenes.map(({ dataUri, ...scene }) => ({
                        ...scene,
                        sha256: createHash("sha256")
                          .update(Buffer.from(dataUri.split(",")[1], "base64"))
                          .digest("hex"),
                      }))
                    );
                    return scenes;
                  },
                }
              );
              await persist(join(output, `proposal-${slot}.json`), proposal);
              return proposal;
            }
          )
        );
        return {
          prepared: {
            families: prepared.selectedDefinitions.map(
              ds => ds[0].completeDesign!.family
            ),
            reasons: prepared.selectionReasons,
            imageObligation: prepared.imageObligation,
          },
          proposals,
        };
      });
      await persist(join(output, "REPORT.json"), {
        ...manifest,
        ...result,
        finishedAt: new Date().toISOString(),
        events: trace.events,
        limitations: [
          "Local catalogue baseline eligibility is used; no remote publication/access-control admission or billing is exercised.",
          "Native generated-image proposals are explicitly not executed. Immutable raster assets are genuine local catalogue bytes.",
        ],
      });
      console.log(
        JSON.stringify({
          case: name,
          families: result.prepared.families,
          proposals: result.proposals.map((p: any) => ({
            slot: p.slot,
            status: p.status,
            reason: p.errorReason ?? p.reason,
            findings: p.findings,
          })),
          output,
        })
      );
    } catch (error) {
      await persist(join(output, "REPORT.json"), {
        ...manifest,
        error: error instanceof Error ? error.message : "failed",
        finishedAt: new Date().toISOString(),
        events: trace.events,
      });
      console.log(
        JSON.stringify({
          case: name,
          error: error instanceof Error ? error.message : "failed",
          output,
        })
      );
      process.exitCode = 1;
    }
  }
} finally {
  await closeReviewRenderer();
}
