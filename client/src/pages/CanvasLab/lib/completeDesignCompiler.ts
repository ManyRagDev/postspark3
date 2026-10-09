import {
  completeDesignVariationV1Schema,
  completeDesignProvenanceSchema,
  type CompleteDesignVariationV1,
} from "@shared/completeDesignGeneration";
import { readArsenalComposition } from "@shared/designArsenal";
import { projectContentHeadline, arsenalHash } from "@shared/arsenalContent";
import {
  INITIAL_POST,
  OFFICIAL_FAMILIES_META,
  type CanvasPostModel,
  type CanvasPostProvenance,
  type VisualFamilyId,
} from "../components/types";
import { putArsenalComposition } from "./arsenalComposition";
import { ensureArsenalFont } from "./arsenalAssets";

/** Paint the server-resolved scene. No normal/adapt loop, family substitution,
 * geometry reconstruction or editorial fallback is allowed in this path. */
export async function compileCompleteDesign(
  value: CompleteDesignVariationV1,
  options: { provenance?: CanvasPostProvenance; assetDeadline: number }
): Promise<CanvasPostModel> {
  const bundle = completeDesignVariationV1Schema.parse(value),
    start = performance.now();
  const scenes = bundle.slides.map(s => readArsenalComposition(s.composition));
  const assets = Array.from(
    new Map(
      scenes.flatMap(c => c.assets.filter(a => a.family)).map(a => [a.id, a])
    ).values()
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (performance.now() >= options.assetDeadline) throw new Error("deadline");
    await Promise.race([
      Promise.all(assets.map(ensureArsenalFont)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("deadline")),
          options.assetDeadline - performance.now()
        );
      }),
    ]);
  } catch {
    throw Object.assign(
      new Error(
        "Não foi possível carregar as fontes da composição escolhida. Tente novamente."
      ),
      {
        data: {
          generationFailure: {
            generationRunId: bundle.runId,
            reason: "unknown",
            retryable: true,
            userMessage:
              "Não foi possível carregar as fontes da composição escolhida. Tente novamente.",
          },
        },
      }
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
  const stablePostId =
    bundle.runId && typeof bundle.slot === "number"
      ? `cd-${bundle.runId}-${bundle.slot}`
      : crypto.randomUUID();
  const posts = scenes.map((scene, i) =>
    putArsenalComposition(
      {
        ...structuredClone(INITIAL_POST),
        id: stablePostId,
        modelVersion: 2,
        provenance: options.provenance,
        familyId:
          bundle.family in OFFICIAL_FAMILIES_META
            ? (bundle.family as VisualFamilyId)
            : "editorial-poster",
        familyName: bundle.name,
        aspectRatio: scene.effectiveAspectRatio,
        palette: {
          ...INITIAL_POST.palette,
          background: scene.artboard.background,
        },
        showBadge: false,
        showStep: false,
        currentSlideIndex: 0,
        slides: [
          {
            id: bundle.slides[i].id,
            step: "",
            headline: projectContentHeadline(scene.content),
            subtext: "",
          },
        ],
      },
      scene
    )
  );
  return {
    ...posts[0],
    caption: bundle.caption,
    hashtags: bundle.hashtags,
    completeDesign: completeDesignProvenanceSchema.parse({
      schemaVersion: bundle.schemaVersion,
      pipeline: bundle.pipeline,
      traceId: bundle.traceId,
      runId: bundle.runId,
      slot: bundle.slot,
      name: bundle.name,
      reason: bundle.reason,
      family: bundle.family,
      visualPreference: bundle.visualPreference,
    }),
    slides: posts.map((p, i) => ({
      ...p.slides[0],
      id: bundle.slides[i].id,
      assemblyRole: bundle.slides[i].role,
      imagePrompt: scenes[i].base.mediaSlots?.[0]?.prompt ?? "",
    })),
    componentCompilationReports: scenes.map((c, i) => ({
      slideId: bundle.slides[i].id,
      report: {
        traceId: bundle.traceId,
        runId: bundle.runId,
        slot: bundle.slot,
        materializationId: crypto.randomUUID(),
        userContentHash: arsenalHash(c.content),
        selectedCandidateId: c.origin.candidateId,
        status: "applied" as const,
        durationMs: Math.round(performance.now() - start),
        attempts: [
          {
            candidateId: c.origin.candidateId,
            policy: "normal" as const,
            reasons: [],
            durationMs: Math.round(performance.now() - start),
          },
        ],
      },
    })),
  };
}
