import type { PostVariation } from "@shared/postspark";
import { getDb } from "../db";
import { traceCatalog } from "./trace";
import { ASSEMBLY_KIT_HASH } from "../../shared/assemblyPilot";
import { catalogBundleV2Schema } from "../../shared/designArsenal";
import bundled from "../../shared/arsenalBundledAssets.json";
import { assemblyVariationBundleV1Schema } from "../../shared/componentAssembly";
import { completeDesignVariationV1Schema } from "../../shared/completeDesignGeneration";
import { arsenalHash } from "../../shared/arsenalContent";

/** Functional generation state, not optional diagnostic content. No new run or debit. */
export async function persistArsenalOutput(
  runId: string,
  actorId: string,
  output: PostVariation[],
  budget = { remainingMs: 2000 }
): Promise<void> {
  if (output.some(v => v.completeDesignV1 && !v.componentAssemblyV1))
    throw new Error("Manifesto de assets do design completo ausente");
  if (output.some(v => v.componentAssemblyV1)) {
    const bundles = output.map(v =>
      assemblyVariationBundleV1Schema.parse(v.componentAssemblyV1)
    );
    const completeOutput = output.some(v => v.completeDesignV1);
    if (completeOutput)
      for (const [i, v] of Array.from(output.entries())) {
        const complete = completeDesignVariationV1Schema.parse(
            v.completeDesignV1
          ),
          manifest = bundles[i];
        if (
          complete.runId !== runId ||
          complete.traceId !== runId ||
          complete.slot !== i ||
          complete.slides.length !== manifest.slides.length
        )
          throw new Error("Identidade do design completo divergente");
        for (const [index, slide] of Array.from(complete.slides.entries())) {
          const { base, origin, pieces, assets, content, userContentHash } =
              slide.composition,
            b = manifest.slides[index].bundle;
          const { variant, ...identity } = b.candidates[0];
          if (
            slide.id !== manifest.slides[index].id ||
            slide.role !== manifest.slides[index].role ||
            arsenalHash({
              origin,
              base,
              pieces,
              assets,
              content,
              userContentHash,
            }) !==
              arsenalHash({
                origin: identity,
                base: variant,
                pieces: b.pieces,
                assets: b.assets,
                content: b.content,
                userContentHash: b.userContentHash,
              })
          )
            throw new Error(
              "Manifesto de assets diverge da composição entregue"
            );
        }
      }
    if (
      bundles.some(
        (b, i) => b.runId !== runId || b.traceId !== runId || b.slot !== i
      )
    )
      throw new Error("Identidade da montagem divergente");
    const experimental = bundles
      .flatMap(b => b.slides)
      .every(s =>
        s.bundle.candidates.every(
          c => c.componentAssembly?.experimental === true
        )
      );
    const saved = await getDb()
      .rpc("design_component_deliver_v1", {
        p_run: runId,
        p_actor: actorId,
        p_output: output,
        p_experimental: experimental,
      })
      .abortSignal(AbortSignal.timeout(Math.max(2000, budget.remainingMs)));
    if (saved.error) {
      const reasons: Record<string, string> = {
        "Owned completed run required": "owned_run_required",
        "Assembly run mismatch": "assembly_run_mismatch",
        "Slide run mismatch": "slide_run_mismatch",
        "Assembly plan mismatch": "assembly_plan_mismatch",
        "Component provenance required": "component_provenance_required",
        "Component not eligible": "component_ineligible",
        "Components require catalog assets": "catalog_assets_required",
        "Slide asset not granted": "slide_asset_not_granted",
      };
      await traceCatalog(
        runId,
        actorId,
        completeOutput ? "complete_design.delivery" : "component.delivery",
        "failed",
        {
          source: "server",
          code: String(saved.error.code ?? "unavailable"),
          reason: reasons[saved.error.message] ?? "delivery_unavailable",
        },
        "component-delivery:v1"
      );
      throw new Error(
        "Não foi possível salvar a montagem e autorizar seus assets.",
        { cause: saved.error }
      );
    }
    await traceCatalog(
      runId,
      actorId,
      completeOutput ? "complete_design.delivery" : "component.delivery",
      "completed",
      {
        source: "server",
        experimental,
        slideCount: bundles.reduce((n, b) => n + b.slides.length, 0),
        planHashes: bundles.map(b => b.planHash),
        functionalOutputPersisted: true,
        grantsDelivered: true,
      },
      "component-delivery:v1"
    );
    return;
  }
  if (!output.some(v => v.catalogSelectionV2)) return;
  // Experimental assemblies are generated documents, not published catalogue versions.
  // Persist their pinned bundles independently of optional diagnostic storage. Only
  // known bundled fonts may use this path; private catalogue assets still require grants.
  const assemblies = output.flatMap(
    v => v.catalogSelectionV2?.candidates ?? []
  );
  if (
    assemblies.length &&
    assemblies.every(c => c.assembly?.kitHash === ASSEMBLY_KIT_HASH)
  ) {
    const bundles = output.flatMap(v =>
      v.catalogSelectionV2
        ? [catalogBundleV2Schema.parse(v.catalogSelectionV2)]
        : []
    );
    for (const b of bundles)
      for (const a of b.assets) {
        const known = (bundled as Record<string, any>)[a.id];
        if (
          a.kind !== "bundled" ||
          !known ||
          ["sha256", "bytes", "family", "weight", "mimeType"].some(
            k => known[k] !== (a as any)[k]
          )
        )
          throw new Error("Asset do piloto não autorizado");
      }
    const saved = await getDb()
      .from("generation_runs")
      .update({ output_snapshot: output })
      .eq("id", runId)
      .eq("user_uuid", actorId)
      .eq("status", "completed")
      .select("id")
      .single()
      .abortSignal(AbortSignal.timeout(Math.max(1, budget.remainingMs)));
    if (saved.error || !saved.data)
      throw new Error(
        "Não foi possível salvar a composição experimental desta geração."
      );
    await traceCatalog(
      runId,
      actorId,
      "assembly.delivery",
      "completed",
      {
        source: "server",
        experimental: true,
        kitHash: ASSEMBLY_KIT_HASH,
        candidateCount: assemblies.length,
        bundledAssets: true,
        functionalOutputPersisted: true,
      },
      "assembly-delivery:v1"
    );
    return;
  }
  const identities = output.flatMap(
    v =>
      v.catalogSelectionV2?.candidates.map(
        ({ variant, ...identity }) => identity
      ) ?? []
  );
  const assetIds = Array.from(
    new Set(
      output.flatMap(v => v.catalogSelectionV2?.assets.map(a => a.id) ?? [])
    )
  );
  const start = Date.now();
  const { error } =
    budget.remainingMs <= 0
      ? { error: new Error("catalog_budget_exhausted") }
      : await getDb()
          .rpc("design_catalog_deliver_v2", {
            p_run: runId,
            p_actor: actorId,
            p_output: output,
          })
          .abortSignal(AbortSignal.timeout(Math.max(1, budget.remainingMs)));
  budget.remainingMs = Math.max(0, budget.remainingMs - (Date.now() - start));
  if (error) {
    // Preserve canonical copy; unavailable grants must never strand the post's fonts.
    for (const v of output)
      if (v.catalogSelectionV2) {
        v.catalogSelectionV2 = {
          ...v.catalogSelectionV2,
          candidates: [],
          pieces: {},
          assets: [],
          selection: "none",
        };
      }
    const fallback = await getDb()
      .from("generation_runs")
      .update({ output_snapshot: output })
      .eq("id", runId)
      .eq("user_uuid", actorId)
      .eq("status", "completed")
      .select("id")
      .single()
      .abortSignal(AbortSignal.timeout(2000));
    if (!fallback.error && fallback.data) {
      // The run has already been written: persist the reason in its catalogue trace too.
      await traceCatalog(
        runId,
        actorId,
        "catalog.assets",
        "fallback",
        {
          reason: "catalog_unavailable",
          source: "server",
          runId,
          candidates: identities,
          assetIds,
          functionalOutputPersisted: true,
          grantsDelivered: false,
        },
        "delivery:v2"
      );
      return;
    }
    throw new Error(
      "Não foi possível salvar a composição desta geração. Tente novamente."
    );
  }
  await traceCatalog(
    runId,
    actorId,
    "catalog.assets",
    "completed",
    {
      source: "server",
      runId,
      candidates: identities,
      assetIds,
      functionalOutputPersisted: true,
      grantsDelivered: true,
    },
    "delivery:v2"
  );
}
