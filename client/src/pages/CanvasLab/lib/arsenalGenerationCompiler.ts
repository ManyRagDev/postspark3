import { assemblyVariationBundleV1Schema, type AssemblyVariationBundleV1 } from "@shared/componentAssembly";
import { buildArsenalFallback } from "./arsenalFallback";
import {
  catalogBundleV2Schema,
  readArsenalComposition,
  type ArsenalComposition,
  type CatalogBundleV2,
  type PinnedCandidateV2,
} from "@shared/designArsenal";
import {
  arsenalHash,
  readContentSource,
  contentListItems,
  projectContentHeadline,
} from "@shared/arsenalContent";
import {
  arsenalCompatibility,
  type ArsenalCompilationReport,
  type ArsenalOffer,
} from "@shared/arsenalGeneration";
import {
  INITIAL_POST,
  resolveLegibleTextColor,
  type CanvasPostModel,
  type CanvasPostProvenance,
} from "../components/types";
import {
  putArsenalComposition,
  resolveArsenalComposition,
} from "./arsenalComposition";
import { ensureArsenalFont } from "./arsenalAssets";
import type { DesignContent } from "@shared/arsenalContent";

/** Preview uses the official compiler and Stage, never the source demonstration copy. */
export async function previewArsenalOffer(
  offer: ArsenalOffer,
  content: DesignContent
): Promise<CanvasPostModel> {
  await Promise.all(offer.assets.filter(a => a.family).map(ensureArsenalFont));
  const bundle: CatalogBundleV2 = {
    schemaVersion: 2,
    traceId: "admin-preview",
    runId: "admin-preview",
    slot: 0,
    content,
    userContentHash: arsenalHash(content),
    targetAspectRatio: offer.candidate.variant.aspectRatio,
    selection: "llm",
    candidates: [offer.candidate],
    pieces: offer.pieces,
    assets: offer.assets,
  };
  let c = readArsenalComposition(
    resolveArsenalComposition(composition(bundle, offer.candidate))
  );
  // Curatorial preview follows the same explicit normal/adapt policies as generation.
  // This never runs during typing and never changes the canonical content.
  if (c.issues.length)
    c = readArsenalComposition(
      resolveArsenalComposition(composition(bundle, offer.candidate), true)
    );
  return putArsenalComposition(
    {
      ...structuredClone(INITIAL_POST),
      id: crypto.randomUUID(),
      modelVersion: 2,
      aspectRatio: c.effectiveAspectRatio,
      familyName: offer.name,
      slides: [
        {
          id: crypto.randomUUID(),
          step: "",
          headline: projectContentHeadline(content),
          subtext: "",
        },
      ],
      currentSlideIndex: 0,
      showBadge: false,
      showStep: false,
    },
    c
  );
}

export async function applyArsenalFormatVariant(
  post: CanvasPostModel,
  offer: ArsenalOffer
): Promise<CanvasPostModel> {
  const previous = post.slides[post.currentSlideIndex]?.composition;
  if (
    !previous ||
    previous.origin.versionId !== offer.candidate.versionId ||
    previous.origin.definitionHash !== offer.candidate.definitionHash
  )
    throw new Error("Troca exige variante da mesma versão");
  await Promise.all(offer.assets.filter(a => a.family).map(ensureArsenalFont));
  const { variant: base, ...origin } = offer.candidate;
  const visualKeys = new Set([
    "fill",
    "stroke",
    "strokeWidth",
    "cornerRadius",
    "fontFamily",
    "fontAssetId",
    "fontWeight",
    "fontSize",
    "align",
    "lineHeight",
    "letterSpacing",
    "opacity",
  ]);
  const validIds = new Set([...base.instances, ...base.groups].map(i => i.id));
  const mapping = new Map<string, string>();
  for (const binding of base.bindings) {
    const old =
      previous.base.bindings.find(b => b.id === binding.id) ??
      previous.base.bindings
        .filter(b => b.source === binding.source)
        .filter((_, i, all) => all.length === 1)[0];
    binding.targetIds.forEach((id, index) => {
      if (old?.targetIds[index]) mapping.set(old.targetIds[index], id);
      if (binding.kind === "list")
        for (const item of contentListItems(previous.content, binding.source))
          validIds.add(`${id}~${arsenalHash(item.id).slice(0, 16)}`);
    });
  }
  const mapId = (id: string) => {
    const [root, suffix] = id.split("~"),
      next = mapping.get(root) ?? root;
    return suffix ? next + "~" + suffix : next;
  };
  const overrides = Object.fromEntries(
    Object.entries(previous.overrides)
      .map(([id, values]) => [
        mapId(id),
        Object.fromEntries(
          Object.entries(values).filter(([key]) => visualKeys.has(key))
        ),
      ])
      .filter(([id]) => validIds.has(id as string))
  );
  const richText = Object.fromEntries(
    Object.entries(previous.richText)
      .map(([id, value]) => [mapId(id), value])
      .filter(([id]) => validIds.has(id as string))
  );
  const media = Object.fromEntries(
    base.bindings
      .filter(b => b.kind === "media")
      .map(b => {
        const old = previous.base.bindings.find(
          old => old.id === b.id && old.kind === "media"
        );
        return [
          b.targetIds[0],
          previous.media[old?.targetIds[0] ?? b.targetIds[0]],
        ];
      })
      .filter(([, value]) => value)
  );
  // Preserve assets referenced by manual font overrides, not temporary URLs.
  const assets = Array.from(
    new Map([...offer.assets, ...previous.assets].map(a => [a.id, a])).values()
  );
  const next: ArsenalComposition = {
    ...previous,
    origin,
    base,
    pieces: { ...previous.pieces, ...offer.pieces },
    assets,
    overrides,
    richText,
    media,
    ...(previous.mediaSlotPrompts ? { mediaSlotPrompts: Object.fromEntries(Object.entries(previous.mediaSlotPrompts).map(([id, prompt]) => [mapId(id), prompt]).filter(([id]) => validIds.has(id))) } : {}),
    elements: [],
    groups: base.groups,
    relations: base.relations,
    layoutOrigin: "catalog-variant",
    sourceVariantKey: base.variantKey,
    effectiveAspectRatio: base.aspectRatio,
    projection: { scale: 1, x: 0, y: 0 },
    artboard: { ...base.artboard, background: previous.artboard.background },
  };
  return putArsenalComposition(
    { ...post, aspectRatio: base.aspectRatio },
    readArsenalComposition(resolveArsenalComposition(next))
  );
}

export function composition(
  bundle: CatalogBundleV2,
  candidate: PinnedCandidateV2
): ArsenalComposition {
  const { variant: base, ...origin } = candidate;
  return {
    version: 2,
    origin,
    base,
    pieces: bundle.pieces,
    assets: bundle.assets,
    content: bundle.content,
    userContentHash: bundle.userContentHash,
    generatedContentHash: bundle.userContentHash,
    contentRevision: 0,
    elements: [],
    groups: base.groups,
    relations: base.relations,
    overrides: {},
    richText: {},
    media: {},
    seed: 0,
    state: "needs_adjustment",
    issues: [],
    layoutOrigin: "catalog-variant",
    sourceVariantKey: base.variantKey,
    effectiveAspectRatio: base.aspectRatio,
    projection: { scale: 1, x: 0, y: 0 },
    artboard: base.artboard,
  };
}

/** Ordinary editorial fallback uses the same editable document, retaining EVERY content field. */
function fallback(
  bundle: CatalogBundleV2,
  palette: { background: string; text: string; accent: string }
): ArsenalComposition {
  const { base, pieces } = buildArsenalFallback(
    bundle.content,
    bundle.targetAspectRatio,
    palette,
    { slot: bundle.slot }
  );
  const versionId = "00000000-0000-4000-8000-000000000001";
  const candidate: PinnedCandidateV2 = {
    candidateId: `${versionId}:${base.variantKey}`,
    blueprintId: versionId,
    versionId,
    version: 1,
    definitionHash: arsenalHash(base),
    variantKey: base.variantKey,
    variantHash: arsenalHash(base),
    compilerVersion: base.compilerVersion,
    variant: base,
  };
  return readArsenalComposition(
    resolveArsenalComposition(
      composition({ ...bundle, pieces, assets: [] }, candidate)
    )
  );
}

export async function compileArsenalGeneration(
  value: CatalogBundleV2,
  options: {
    deadline: number;
    assetDeadline: number;
    provenance?: CanvasPostProvenance;
    background?: string;
    text?: string;
    accent?: string;
  }
): Promise<CanvasPostModel> {
  const bundle = catalogBundleV2Schema.parse(value),
    start = performance.now();
  const background = /^#[a-f\d]{6}$/i.test(options.background ?? "")
    ? options.background!
    : "#F5F3EE";
  const palette = {
    background,
    text: /^#[a-f\d]{6}$/i.test(options.text ?? "")
      ? options.text!
      : resolveLegibleTextColor(background),
    accent: options.accent ?? "#111111",
  };
  const report: ArsenalCompilationReport = {
    traceId: bundle.traceId,
    runId: bundle.runId,
    slot: bundle.slot,
    materializationId: crypto.randomUUID(),
    userContentHash: bundle.userContentHash,
    selectedCandidateId: null,
    status: "fallback",
    durationMs: 0,
    attempts: [],
  };
  // Shared cached font tasks: rejection/timeout affects only dependent candidates.
  const tasks = new Map(
    bundle.assets
      .filter(a => a.family)
      .map(asset => [
        asset.id,
        Promise.resolve()
          .then(() => ensureArsenalFont(asset))
          .then(
            () => null,
            () => "font_unavailable"
          ),
      ])
  );
  const waitAssets = async (candidate: PinnedCandidateV2) => {
    const remaining = options.assetDeadline - performance.now();
    if (remaining <= 0) return ["deadline"];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.all(
          candidate.variant.assetIds.map(
            id => tasks.get(id) ?? Promise.resolve("asset_unavailable")
          )
        ).then(reasons => reasons.filter((r): r is string => r !== null)),
        new Promise<string[]>(resolve => {
          timer = setTimeout(() => resolve(["deadline"]), remaining);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  let resolved: ArsenalComposition | undefined;
  for (const policy of ["normal", "adapt"] as const) {
    for (const candidate of bundle.candidates) {
      const attemptStart = performance.now();
      let reasons = arsenalCompatibility(
        candidate,
        bundle.content,
        bundle.targetAspectRatio
      );
      if (performance.now() >= options.deadline - 2000) reasons = ["deadline"];
      if (!reasons.length) reasons = await waitAssets(candidate);
      if (!reasons.length) {
        try {
          const compiled = readArsenalComposition(
            resolveArsenalComposition(
              candidate.componentAssembly?.completeDesign ? composition(bundle,candidate) : applyArsenalBrandPolicy(composition(bundle, candidate), palette),
              policy === "adapt"
            )
          );
          if (compiled.userContentHash !== bundle.userContentHash)
            throw new Error("content_hash_mismatch");
          reasons = compiled.issues;
          if (!reasons.length && performance.now() < options.deadline - 2000) {
            resolved = compiled;
            report.selectedCandidateId = candidate.candidateId;
            report.status =
              compiled.state === "adapted" ? "adapted" : "applied";
          } else if (!reasons.length) reasons = ["deadline"];
        } catch {
          reasons = ["invalid_composition"];
        }
      }
      report.attempts.push({
        candidateId: candidate.candidateId,
        policy,
        reasons: reasons.slice(0, 16).map(s => s.slice(0, 160)),
        durationMs: Math.round(performance.now() - attemptStart),
      });
      if (resolved || reasons.includes("deadline")) break;
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    if (resolved || performance.now() >= options.deadline - 2000) break;
  }
  if (!resolved && bundle.candidates[0]?.componentAssembly?.completeDesign) {
    // Keep the selected calibrated scene and every content field visible for editing.
    // A failed font/geometry/deadline check must never replace a whole design.
    resolved = readArsenalComposition(resolveArsenalComposition(composition(bundle,bundle.candidates[0])));
    resolved.state = "needs_adjustment";
    resolved.issues = Array.from(new Set([...resolved.issues,...report.attempts.flatMap(a=>a.reasons)]));
    report.selectedCandidateId=bundle.candidates[0].candidateId;
    report.status="needs_adjustment";
  }
  if (!resolved) {
    resolved = fallback(bundle, palette);
    if (resolved.state === "needs_adjustment")
      report.status = "needs_adjustment";
  }
  report.durationMs = Math.round(performance.now() - start);
  const post = putArsenalComposition(
    {
      ...structuredClone(INITIAL_POST),
      id: crypto.randomUUID(),
      modelVersion: 2,
      provenance: options.provenance,
      aspectRatio: resolved.effectiveAspectRatio,
      familyId: "editorial-poster",
      familyName: report.selectedCandidateId
        ? bundle.candidates.find(c=>c.candidateId===report.selectedCandidateId)?.assembly?.label ?? "Arsenal"
        : bundle.slot === 1
          ? "Editorial (Centrado)"
          : bundle.slot === 2
            ? "Editorial (Destaque)"
            : "Editorial",
      palette: { ...palette, background: resolved.artboard.background },
      callToAction: String(readContentSource(bundle.content, "callToAction")),
      hashtags: bundle.content.hashtags,
      slides: [
        {
          id: crypto.randomUUID(),
          step: "",
          headline: projectContentHeadline(bundle.content),
          subtext: "",
        },
      ],
      currentSlideIndex: 0,
      showBadge: false,
      showStep: false,
    },
    resolved
  );
  return { ...post, arsenalCompilation: report };
}

export function applyArsenalBrandPolicy(
  c: ArsenalComposition,
  palette: { background: string; text: string; accent: string }
): ArsenalComposition {
  const policy = c.base.brandPolicy;
  if (!policy) return c;
  const colors = { ...palette, surface: palette.background };
  const overrides = { ...c.overrides };
  for (const [id, role] of Object.entries(policy.colors))
    overrides[id] = { ...overrides[id], fill: colors[role] };
  for (const [id, role] of Object.entries(policy.strokes ?? {}))
    overrides[id] = { ...overrides[id], stroke: colors[role] };
  return {
    ...c,
    overrides,
    artboard: {
      ...c.artboard,
      background:
        policy.background === "background"
          ? palette.background
          : c.artboard.background,
    },
  };
}


/** Compile every pinned slide through the same renderer; history never fetches the catalog again. */
export async function compileComponentAssembly(
  value: AssemblyVariationBundleV1,
  options: Parameters<typeof compileArsenalGeneration>[1]
): Promise<CanvasPostModel> {
  const bundle = assemblyVariationBundleV1Schema.parse(value);
  const posts = await Promise.all(bundle.slides.map(slide => compileArsenalGeneration(slide.bundle, {
    ...options,
    background: bundle.direction.palette.background,
    text: bundle.direction.palette.text,
    accent: bundle.direction.palette.accent,
  })));
  const cover = posts[0];
  return {
    ...cover,
    id: crypto.randomUUID(),
    caption: bundle.caption,
    hashtags: bundle.hashtags,
    familyName: bundle.direction.label,
    currentSlideIndex: 0,
    slides: posts.map((post, index) => ({
      ...post.slides[0],
      id: bundle.slides[index].id,
      assemblyRole: bundle.slides[index].role,
      assemblyDensity: bundle.slides[index].density,
      step: posts.length > 1 ? `${String(index + 1).padStart(2, '0')} // ${bundle.slides[index].role === 'cover' ? 'CAPA' : bundle.slides[index].role === 'closing' ? 'ENCERRAMENTO' : 'CONTEÚDO'}` : '',
      imagePrompt: post.slides[0].composition?.elements.find(e => e.mediaSlot)?.mediaSlot?.prompt ?? '',
    })),
    arsenalCompilation: undefined,
    componentAssembly: { schemaVersion: bundle.schemaVersion, traceId: bundle.traceId, runId: bundle.runId, slot: bundle.slot, planHash: bundle.planHash, direction: bundle.direction },
    componentCompilationReports: posts.flatMap((post, index) => post.arsenalCompilation ? [{ slideId: bundle.slides[index].id, report: post.arsenalCompilation }] : []),
  };
}
