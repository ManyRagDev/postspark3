import {
  arsenalSearchHitSchema,
  ARSENAL_CAPABILITIES,
  type ArsenalSearchHit,
} from "@shared/arsenalCatalog";
import { DESCRIPTOR_VERSION } from "@shared/designDescriptors";
import {
  STRUCTURAL_L1_METRIC_VERSION,
  STRUCTURAL_L1_METRIC_HASH,
} from "@shared/designDescriptorMetric";
import { getDb } from "../db";
import { recordGenerationEvent } from "../ai/generationTrace";
import { canSelectArsenalV2, readArsenalMode } from "./arsenalMode";
import {
  ARSENAL_QUERY_PROFILES,
  mergeArsenalNeighbors,
} from "./arsenalQueryProfiles";

export type ArsenalAvailability = {
  mode: ReturnType<typeof readArsenalMode>;
  reason:
    | "ready"
    | "disabled"
    | "client_contract_unsupported"
    | "unsupported_post_mode"
    | "brand_contract_pending"
    | "catalog_not_installed"
    | "catalog_unavailable"
    | "no_eligible_candidate";
  candidateCount: number;
  durationMs: number;
};
export async function retrieveArsenalForGeneration(input: {
  clientSupportsV2?: boolean;
  role?: string | null;
  postMode: string;
  text: string;
  brandLocked: boolean;
  aspectRatio?: string;
  profile?: {
    variable?: boolean;
    present?: string[];
    available?: string[];
    items?: number;
    intentions?: string[];
    font?: string;
    fonts?: string[];
  };
}) {
  const mode = readArsenalMode(),
    start = Date.now(),
    signal = AbortSignal.timeout(2000);
  let algorithm = "metadata-v2-no-anchor",
    fallbackReason = "no_applicable_anchor";
  let eligibleIds: string[] = [];
  const finish = (
    reason: ArsenalAvailability["reason"],
    offers: ArsenalSearchHit[] = []
  ) => {
    const durationMs = Date.now() - start;
    recordGenerationEvent({
      stage: "catalog.retrieve",
      status: reason === "ready" ? "completed" : "fallback",
      detail: "Recuperação Arsenal V2",
      data: {
        pipeline: "arsenal-v2",
        mode,
        reason,
        fallbackReason,
        algorithm,
        profileVersion: ARSENAL_QUERY_PROFILES.version,
        metricVersion: STRUCTURAL_L1_METRIC_VERSION,
        metricHash: STRUCTURAL_L1_METRIC_HASH,
        candidateCount: offers.length,
        eligibleIds,
        offered: offers.map(({ card, distance, ...identity }) => identity),
        brandRequired: input.brandLocked,
        fontRequired: Boolean(
          input.profile?.font || input.profile?.fonts?.length
        ),
        durationMs,
        source: "server",
      },
    });
    return {
      offers,
      availability: { mode, reason, candidateCount: offers.length, durationMs },
    };
  };
  if (!canSelectArsenalV2(input.role ?? undefined, mode))
    return finish("disabled");
  if (!input.clientSupportsV2) return finish("client_contract_unsupported");
  if (input.postMode !== "static") return finish("unsupported_post_mode");
  try {
    const terms = Array.from(
      new Set(
        input.text
          .toLocaleLowerCase("pt-BR")
          .split(/[^a-zà-ÿ0-9]+/)
          .filter(t => t.length > 3)
      )
    ).slice(0, 40);
    const profile = {
      present: ["headline"],
      available: [
        "headline",
        "body",
        "eyebrow",
        "label",
        "sectionLabel",
        "callToAction",
      ],
      ...input.profile,
      fonts: input.profile?.font?.trim()
        ? [input.profile.font.trim()]
        : (input.profile?.fonts ?? []),
      brand: input.brandLocked,
    };
    const intentions =
      input.profile?.intentions ??
      (/\b(lista|itens|passos|dicas)\b/i.test(input.text)
        ? ["list"]
        : ["headline-body"]);
    const rules = ARSENAL_QUERY_PROFILES.profiles
      .filter(p => p.intentions.some(i => intentions.includes(i)))
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const anchors = rules.flatMap(p => p.anchors).slice(0, 3),
      vectors: string[] = [];
    if (anchors.length) {
      const r = await getDb()
        .from("design_catalog_search_documents")
        .select(
          "version_id,variant_key,definition_hash,variant_hash,projected,design_catalog_versions!inner(status)"
        )
        .in("version_id", Array.from(new Set(anchors.map(a => a.versionId))))
        .eq("descriptor_version", DESCRIPTOR_VERSION)
        .eq("metric_version", STRUCTURAL_L1_METRIC_VERSION)
        .eq("metric_hash", STRUCTURAL_L1_METRIC_HASH)
        .eq("design_catalog_versions.status", "approved")
        .abortSignal(signal);
      if (r.error) throw r.error;
      for (const a of anchors) {
        const row = r.data?.find(
          (row: any) =>
            row.version_id === a.versionId &&
            row.variant_key === a.variantKey &&
            row.definition_hash === a.definitionHash &&
            row.variant_hash === a.variantHash
        );
        if (row) vectors.push(row.projected);
      }
    }
    if (vectors.length) {
      algorithm = "sql-exact-l1-pgvector-v1";
      fallbackReason = "";
    } else if (anchors.length) fallbackReason = "anchor_unavailable";
    const queries = vectors.length ? vectors : [null];
    const results = await Promise.all(
      queries.map(p_anchor =>
        getDb()
          .rpc("design_catalog_search_v2", {
            p_anchor,
            p_aspect: input.aspectRatio ?? null,
            p_capabilities: ARSENAL_CAPABILITIES,
            p_has_media: false,
            p_profile: profile,
            p_descriptor: DESCRIPTOR_VERSION,
            p_metric: STRUCTURAL_L1_METRIC_VERSION,
            p_metric_hash: STRUCTURAL_L1_METRIC_HASH,
            p_limit: 20,
            p_terms: terms,
          })
          .abortSignal(signal)
      )
    );
    const error = results.find(r => r.error)?.error;
    if (error)
      return finish(
        ["42P01", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(
          error.code
        )
          ? "catalog_not_installed"
          : "catalog_unavailable"
      );
    const lists = results.map(r =>
      (r.data ?? [])
        .filter(
          (row: any) =>
            input.aspectRatio === "5:6" || row.card?.aspectRatio !== "5:6"
        )
        .map((row: any) =>
          arsenalSearchHitSchema.parse({
            candidateId: `${row.version_id}:${row.variant_key}`,
            versionId: row.version_id,
            blueprintId: row.blueprint_id,
            version: row.version,
            variantKey: row.variant_key,
            definitionHash: row.definition_hash,
            variantHash: row.variant_hash,
            distance: row.distance,
            card: row.card,
          })
        )
    );
    eligibleIds = Array.from(new Set(lists.flat().map(c => c.candidateId)));
    // No full definition scan and no arbitrary catalogue page ceiling. SQL filters/ranks compact documents.
    const offers = mergeArsenalNeighbors(lists);
    return finish(
      offers.length
        ? "ready"
        : input.brandLocked || profile.fonts.length
          ? "brand_contract_pending"
          : "no_eligible_candidate",
      offers
    );
  } catch {
    return finish("catalog_unavailable");
  }
}
