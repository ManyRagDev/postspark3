import { randomUUID } from "node:crypto";
import {
  arsenalDefinitionSchema,
  arsenalImportSchema,
  describeArsenalVariant,
  compactArsenalCard,
  ARSENAL_REVIEW_POLICY,
  type ArsenalImport,
  ARSENAL_CAPABILITIES,
} from "@shared/arsenalCatalog";
import { arsenalHash } from "@shared/arsenalContent";
import {
  arsenalOfferSchema,
  type ArsenalOffer,
} from "@shared/arsenalGeneration";
import {
  type PinnedCandidateV2,
} from "@shared/designArsenal";
import { DESCRIPTOR_VERSION } from "@shared/designDescriptors";
import {
  projectStructuralL1,
  STRUCTURAL_L1_METRIC_VERSION,
  STRUCTURAL_L1_METRIC_HASH,
} from "@shared/designDescriptorMetric";
import { getDb } from "../db";
import { traceCatalog } from "./trace";

export async function getArsenalVersion(id: string, signal?: AbortSignal) {
  const result = await getDb()
    .from("design_catalog_versions")
    .select("*")
    .eq("id", id)
    .single()
    .abortSignal(signal ?? AbortSignal.timeout(8000));
  if (result.error) throw result.error;
  const definition = arsenalDefinitionSchema.parse(result.data.definition);
  if (arsenalHash(definition) !== result.data.content_hash)
    throw new Error("Hash da definição divergente");
  return { ...result.data, definition };
}
export async function prepareArsenalDraft(value: ArsenalImport, actor: string) {
  const p = arsenalImportSchema.parse(value),
    db = getDb(),
    traceId = randomUUID(),
    definitionHash = arsenalHash(p.definition);
  const assets = p.definition.assets;
  if (assets.some(a => a.kind !== "catalog"))
    throw new Error(
      "Novos imports usam assets catalog verificados; bundled é reservado ao piloto M1"
    );
  if (assets.length) {
    const a = await db
      .from("design_catalog_assets")
      .select("id,manifest")
      .in(
        "id",
        assets.map(a => a.id)
      );
    if (
      a.error ||
      assets.some(
        x =>
          !a.data?.some(
            (r: { id: string; manifest: unknown }) =>
              r.id === x.id && arsenalHash(r.manifest) === arsenalHash(x)
          )
      )
    )
      throw new Error("Envie e verifique os assets antes de criar o draft");
  }
  const r = await db.rpc("design_catalog_create", {
    p_id: randomUUID(),
    p_blueprint_id: p.blueprintId,
    p_hash: definitionHash,
    p_definition: p.definition,
    p_pieces: Object.entries(p.pieces).map(([hash, definition]) => ({
      key: hash,
      hash,
      definition,
    })),
    p_actor: actor,
    p_trace: traceId,
  });
  if (r.error) throw r.error;
  const entry = await getArsenalVersion(r.data);
  if (entry.status !== "draft") return { entry, traceId, idempotent: true };
  const stored = await hydrateArsenalCandidates(
    p.definition.variants.map(v => `${entry.id}:${v.variantKey}`),
    AbortSignal.timeout(8000),
    false
  );
  if (stored.length !== p.definition.variants.length)
    throw new Error("Vínculos persistidos de peças incompletos");
  for (const asset of assets) {
    const l = await db
      .from("design_catalog_version_assets")
      .upsert(
        { version_id: entry.id, asset_id: asset.id },
        { onConflict: "version_id,asset_id", ignoreDuplicates: true }
      );
    if (l.error) throw l.error;
  }
  for (const variant of p.definition.variants) {
    if (
      variant.capabilities.some(
        c => !(ARSENAL_CAPABILITIES as readonly string[]).includes(c)
      )
    )
      throw new Error("Capacidade não reconhecida");
    const descriptor = describeArsenalVariant(variant, p.pieces),
      variantHash = arsenalHash(variant);
    const row = {
      version_id: entry.id,
      variant_key: variant.variantKey,
      definition_hash: definitionHash,
      variant_hash: variantHash,
      descriptor_version: DESCRIPTOR_VERSION,
      metric_version: STRUCTURAL_L1_METRIC_VERSION,
      metric_hash: STRUCTURAL_L1_METRIC_HASH,
      projected: JSON.stringify(projectStructuralL1(descriptor.structure)),
      descriptor,
      card: compactArsenalCard(p.definition, variant),
    };
    const i = await db
      .from("design_catalog_search_documents")
      .upsert(row, {
        onConflict: "version_id,variant_key,descriptor_version,metric_version",
        ignoreDuplicates: true,
      });
    if (i.error) throw i.error;
    // A client preview is NOT this server attestation. No aesthetic approval here.
    const previous = await db
      .from("design_catalog_evidence")
      .select("id")
      .eq("version_id", entry.id)
      .eq("variant_key", variant.variantKey)
      .eq("variant_hash", variantHash)
      .eq("kind", "technical")
      .eq("source", "server")
      .contains("metrics", { metricHash: STRUCTURAL_L1_METRIC_HASH })
      .limit(1);
    if (previous.error) throw previous.error;
    if (!previous.data?.length) {
      const e = await db
        .from("design_catalog_evidence")
        .insert({
          version_id: entry.id,
          variant_key: variant.variantKey,
          definition_hash: definitionHash,
          variant_hash: variantHash,
          policy_version: ARSENAL_REVIEW_POLICY,
          kind: "technical",
          decision: "verified",
          source: "server",
          actor_id: actor,
          recipe_hash: p.definition.provenance.sourceRecipeHash,
          metrics: {
            metricHash: STRUCTURAL_L1_METRIC_HASH,
            graphVerified: true,
            piecesVerified: true,
            assetsVerified: true,
            compilerVersion: variant.compilerVersion,
            algorithm: "sql-exact-l1-sum-v1",
            variant,
            descriptor,
            card: row.card,
            projected: projectStructuralL1(descriptor.structure),
          },
        });
      if (e.error && e.error.code !== "23505") throw e.error;
    }
    await traceCatalog(
      traceId,
      actor,
      "catalog.index",
      "completed",
      {
        versionId: entry.id,
        variantKey: variant.variantKey,
        variantHash,
        definitionHash,
        metricVersion: STRUCTURAL_L1_METRIC_VERSION,
        source: "server",
      },
      `index:${entry.id}:${variant.variantKey}`
    );
  }
  await traceCatalog(
    traceId,
    actor,
    "catalog.import",
    "completed",
    {
      versionId: entry.id,
      definitionHash,
      variantCount: p.definition.variants.length,
      assetCount: assets.length,
      source: "server",
    },
    `import:${entry.id}`
  );
  return { entry, traceId, idempotent: false };
}
export async function hydrateArsenalCandidates(
  ids: string[],
  signal: AbortSignal,
  approvedOnly = true
): Promise<ArsenalOffer[]> {
  if (!ids.length) return [];
  const db = getDb(),
    versionIds = Array.from(new Set(ids.map(id => id.split(":")[0])));
  let versions = db
    .from("design_catalog_versions")
    .select("id,blueprint_id,version,content_hash,definition")
    .in("id", versionIds);
  if (approvedOnly) versions = versions.eq("status", "approved");
  const [v, p] = await Promise.all([
    versions.abortSignal(signal),
    db
      .from("design_catalog_version_pieces")
      .select("version_id,piece_id,design_catalog_pieces!inner(definition)")
      .in("version_id", versionIds)
      .abortSignal(signal),
  ]);
  if (v.error || p.error)
    throw new Error("Catálogo indisponível para materializar os candidatos");
  const offers: ArsenalOffer[] = [];
  for (const row of v.data ?? []) {
    const d = arsenalDefinitionSchema.parse(row.definition);
    if (arsenalHash(d) !== row.content_hash)
      throw new Error("Hash da definição divergente");
    const pieces = Object.fromEntries(
      (p.data ?? [])
        .filter((l: any) => l.version_id === row.id)
        .map((l: any) => [
          l.piece_id,
          (Array.isArray(l.design_catalog_pieces)
            ? l.design_catalog_pieces[0]
            : l.design_catalog_pieces
          ).definition,
        ])
    );
    for (const variant of d.variants) {
      const candidateId = `${row.id}:${variant.variantKey}`;
      if (!ids.includes(candidateId)) continue;
      for (const i of variant.instances)
        if (
          !pieces[i.pieceHash] ||
          arsenalHash(pieces[i.pieceHash]) !== i.pieceHash
        )
          throw new Error("Peça ausente ou divergente");
      const candidate: PinnedCandidateV2 = {
        candidateId,
        versionId: row.id,
        blueprintId: row.blueprint_id,
        version: row.version,
        definitionHash: row.content_hash,
        variantKey: variant.variantKey,
        variantHash: arsenalHash(variant),
        compilerVersion: variant.compilerVersion,
        variant,
      };
      offers.push(
        arsenalOfferSchema.parse({
          candidate,
          name: d.name,
          description: d.description,
          pieces,
          assets: d.assets.filter(a => variant.assetIds.includes(a.id)),
        })
      );
    }
  }
  return ids.flatMap(id => offers.filter(o => o.candidate.candidateId === id));
}
export async function reviewArsenalVariant(
  input: {
    versionId: string;
    variantKey: string;
    variantHash: string;
    definitionHash: string;
    pngHash: string;
    briefingHash: string;
    decision: "approved" | "rejected";
    notes: string;
  },
  actor: string
) {
  const entry = await getArsenalVersion(input.versionId),
    variant = entry.definition.variants.find(
      (v: ArsenalImport["definition"]["variants"][number]) =>
        v.variantKey === input.variantKey
    );
  if (
    entry.content_hash !== input.definitionHash ||
    !variant ||
    arsenalHash(variant) !== input.variantHash
  )
    throw new Error("Prévia não corresponde à variante armazenada");
  const e = await getDb()
    .from("design_catalog_evidence")
    .insert({
      version_id: entry.id,
      variant_key: input.variantKey,
      definition_hash: input.definitionHash,
      variant_hash: input.variantHash,
      policy_version: ARSENAL_REVIEW_POLICY,
      kind: "human",
      source: "admin_review",
      decision: input.decision,
      actor_id: actor,
      png_hash: input.pngHash,
      briefing_hash: input.briefingHash,
      metrics: { notes: input.notes, previewSource: "client_report" },
      reviewed_at: new Date().toISOString(),
    });
  if (e.error) throw e.error;
}
export async function publishArsenalVersion(
  id: string,
  actor: string,
  status: "approved" | "archived" = "approved"
) {
  await getArsenalVersion(id);
  const traceId = randomUUID(),
    r = await getDb().rpc("design_catalog_status", {
      p_id: id,
      p_status: status,
      p_actor: actor,
      p_trace: traceId,
    });
  if (r.error) throw r.error;
  return { traceId };
}
