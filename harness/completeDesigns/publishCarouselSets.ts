import {withCatalogPublication} from "../../server/designCatalog/versionedCatalog";
import { hydrateCompleteDesignComponents } from "../../server/designCatalog/completeDesignStore";
/** Explicit operator workflow. It is never called by generation or by the build. */
import { readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  componentDefinitionV1Schema,
  componentHash,
} from "../../shared/componentAssembly";
import { arsenalHash } from "../../shared/arsenalContent";
import { ENV } from "../../server/_core/env";
import { getDb } from "../../server/db";
import {
  prepareComponentDraft,
  recordAgentComponentReview,
  publishComponent,
} from "../../server/designCatalog/componentStore";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const publicationPreflightSchema = z
  .object({
    projectRef: z.string().min(1),
    schema: z.literal("postspark"),
    actorId: z.string().uuid(),
    admissionPaused: z.literal(true),
    activeRequestIds: z.array(z.string().uuid()).length(0),
    immutableDefinitionsConfirmed: z.literal(true),
    humanReviewPrecedenceConfirmed: z.literal(true),
    publicationGateConfirmed: z.literal(true),
    readersCodeVersion: z.string().min(1),
    workerCodeVersion: z.string().min(1),
    inspectedAt: z.number().finite(),
  })
  .strict();
export type CarouselPublicationPreflight = z.infer<
  typeof publicationPreflightSchema
>;
const rowSchema = z
  .object({
    sourceId: z.string().uuid(),
    sourceHash: hash,
    id: z.string().uuid(),
    hash,
    role: z.enum(["development", "closing"]),
    contentMode: z.enum(["compose", "literal"]),
    png: z.string(),
    pngHash: hash,
    document: z.string(),
    briefing: z.unknown(),
    briefingHash: hash,
    blocking: z.array(z.string()).length(0),
    desiredStatus: z.enum(["draft", "approved"]),
    review: z
      .object({
        decision: z.literal("approved"),
        source: z.literal("agent_visual_review"),
        reviewer: z.string().min(1),
        scope: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();
export async function publishCuratedCarouselSets(input: {
  root: string;
  manifest: unknown;
  confirmedProjectRef: string;
  preflight: () => Promise<CarouselPublicationPreflight>;
}) {
  const preflight = publicationPreflightSchema.parse(await input.preflight());
  let configuredHost: string;
  try { configuredHost=new URL(ENV.supabaseUrl).hostname; } catch { throw new Error("carousel_publication_context_unconfirmed"); }
  if (
    preflight.projectRef !== input.confirmedProjectRef ||
    configuredHost !==
      `${preflight.projectRef}.supabase.co` ||
    preflight.workerCodeVersion !== preflight.readersCodeVersion ||
    Date.now() - preflight.inspectedAt > 5 * 60_000
  )
    throw new Error("carousel_publication_context_unconfirmed");
  const manifest = z
    .object({ version: z.literal(2), rows: z.array(z.unknown()) })
    .passthrough()
    .parse(input.manifest);
  const rows = manifest.rows
    .filter(row =>
      ["development", "closing"].includes(
        (row as { role?: string })?.role ?? ""
      )
    )
    .map(row => rowSchema.parse(row));
  if(!rows.length) throw new Error("carousel_manifest_empty");
  if (new Set(rows.map(r => r.id)).size !== rows.length)
    throw new Error("carousel_publication_duplicate_id");
  const within = (name: string) => {
    const file = resolve(input.root, name),
      local = relative(resolve(input.root), file);
    if (isAbsolute(local) || local.startsWith(".."))
      throw new Error("carousel_manifest_path_escape");
    return file;
  };
  const documents = await Promise.all(
    rows.map(async row => {
      const definition = componentDefinitionV1Schema.parse(
        JSON.parse(await readFile(within(row.document), "utf8"))
      );
      const png = await readFile(within(row.png));
      const variant =
        definition.completeDesign?.designGuidance?.carouselVariant;
      if (
        definition.id !== row.id ||
        definition.hash !== row.hash ||
        componentHash(definition) !== row.hash ||
        variant?.version !== 2 ||
        variant.sourceId !== row.sourceId ||
        variant.sourceHash !== row.sourceHash ||
        variant.role !== row.role ||
        variant.contentMode !== row.contentMode ||
        createHash("sha256").update(png).digest("hex") !== row.pngHash ||
        arsenalHash(row.briefing) !== row.briefingHash
      )
        throw new Error("carousel_manifest_identity_mismatch");
      return definition;
    })
  );
  const sourceIds = [...new Set(rows.map(r => r.sourceId))],
    db = getDb();
  const [sources, active] = await Promise.all([
    db
      .from("design_components")
      .select("id,definition_hash,status")
      .in("id", sourceIds),
    db
      .from("generation_v5_requests")
      .select("id")
      .in("status", ["queued", "running"]),
  ]);
  if (
    sources.error ||
    active.error ||
    active.data?.length ||
    rows.some(
      row =>
        !sources.data?.some(
          (s: { id: string; definition_hash: string; status: string }) =>
            s.id === row.sourceId &&
            s.definition_hash === row.sourceHash &&
            s.status !== "archived" &&
            (row.desiredStatus !== "approved" || s.status === "approved")
        )
    )
  )
    throw new Error("carousel_publication_source_or_drain_changed");
  const before = await db
    .from("design_components")
    .select("id,definition_hash,status")
    .in(
      "id",
      rows.map(r => r.id)
    );
  if (before.error) throw before.error;
  // Existing divergent documents and archived children are never resurrected.
  if (
    before.data?.some(
      (stored: { id: string; definition_hash: string; status: string }) =>
        stored.status === "archived" ||
        rows.find(r => r.id === stored.id)?.hash !== stored.definition_hash
    )
  )
    throw new Error("carousel_existing_document_divergent");
  return withCatalogPublication(async()=>{
  for (const [i, row] of rows.entries()) {
    await prepareComponentDraft(documents[i], preflight.actorId);
    const evidence = await db
      .from("design_component_evidence")
      .select("id")
      .eq("component_id", row.id)
      .eq("definition_hash", row.hash)
      .eq("kind", "agent_visual")
      .eq("png_hash", row.pngHash)
      .eq("briefing_hash", row.briefingHash)
      .eq("decision", "approved")
      .limit(1);
    if (evidence.error) throw evidence.error;
    if (!evidence.data?.length)
      await recordAgentComponentReview(
        {
          id: row.id,
          hash: row.hash,
          pngHash: row.pngHash,
          briefingHash: row.briefingHash,
          decision: "approved",
          reviewer: row.review.reviewer,
          notes: row.review.scope,
        },
        preflight.actorId
      );
    if (row.desiredStatus === "approved")
      await publishComponent(row.id, "approved");
  }
  const after = await db
    .from("design_components")
    .select("id,definition_hash,status")
    .in(
      "id",
      rows.map(r => r.id)
    );
  if (
    after.error ||
    after.data?.length !== rows.length ||
    rows.some(
      row =>
        !after.data?.some(
          (s: { id: string; definition_hash: string; status: string }) =>
            s.id === row.id &&
            s.definition_hash === row.hash &&
            (s.status === row.desiredStatus ||
              (row.desiredStatus === "draft" && s.status === "approved"))
        )
    )
  )
    throw new Error("carousel_publication_readback_failed");
  await hydrateCompleteDesignComponents(rows.map(r=>r.id),true);
  const index=await db.from("design_component_search_documents").select("component_id,definition_hash,card").in("component_id",rows.map(r=>r.id));
  if(index.error || rows.some(row=>!index.data?.some((stored:{component_id:string;definition_hash:string;card:{id:string;hash:string}})=>stored.component_id===row.id&&stored.definition_hash===row.hash&&stored.card.id===row.id&&stored.card.hash===row.hash)))throw new Error("carousel_publication_index_readback_failed");
  return {
    projectRef: preflight.projectRef,
    schema: preflight.schema,
    actorId: preflight.actorId,
    before: before.data,
    after: after.data,
    migrationsApplied: 0,
    postsModified: 0,
  };
  });
}
