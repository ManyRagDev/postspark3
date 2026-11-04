import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { arsenalHash } from "../../../shared/arsenalContent";
import {
  componentCardV1Schema,
  componentDefinitionV1Schema,
} from "../../../shared/componentAssembly";
import { resolveDesignFamilyRepertoires } from "../../../shared/designRepertoire";
import { describeDesignFamilyRepertoire } from "../../../shared/compactDesignProfile";
import { reconcileCatalogCoverage } from "../../designCatalog/catalogCoverage";
import {
  validateCatalogSnapshot,
  type CatalogRow,
  type CatalogSnapshot,
} from "../../designCatalog/versionedCatalog";
import { catalogCardContentHash } from "./sharedBudget";
import { generationMatrixCorpus } from "./corpus";

export async function readSnapshotFile(path: string): Promise<CatalogSnapshot> {
  const raw = JSON.parse(await readFile(path, "utf8"));
  return Array.isArray(raw) ? { rows: raw } : (raw.snapshot ?? raw);
}
export async function describeSnapshotFile(path: string) {
  return {
    path: resolve(path),
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    cardContentHash: catalogCardContentHash(
      (await readSnapshotFile(path)).rows
    ),
  };
}
/** Immutable identities may recur in later packages, but their payloads may not change. */
export function overlayCatalogs(
  ...snapshots: CatalogSnapshot[]
): CatalogSnapshot {
  const rows = new Map<string, CatalogRow>();
  for (const snapshot of snapshots)
    for (const row of snapshot.rows) {
      const prior = rows.get(row.component_id);
      if (
        prior &&
        (prior.definition_hash !== row.definition_hash ||
          arsenalHash(prior.card) !== arsenalHash(row.card) ||
          (prior.definition &&
            row.definition &&
            arsenalHash(prior.definition) !== arsenalHash(row.definition)))
      )
        throw new Error("catalog_overlay_immutable_identity_changed");
      rows.set(row.component_id, row);
    }
  return validateCatalogSnapshot(
    {
      rows: Array.from(rows.values()).sort((a, b) =>
        a.component_id.localeCompare(b.component_id)
      ),
    },
    true
  );
}
function effectiveRepertoires(snapshot: CatalogSnapshot) {
  const cards = snapshot.rows.map(row => componentCardV1Schema.parse(row.card));
  const inventory = {
    registered: snapshot.rows.map((row, i) => ({
      id: row.component_id,
      definition_hash: row.definition_hash,
      status: row.design_components.status,
      aspect_ratios: cards[i].aspectRatios,
      roles: cards[i].roles,
      source: row.design_components.source,
      design: cards[i].completeDesign!,
    })),
    indexed: snapshot.rows,
  };
  return generationMatrixCorpus
    .filter(c => c.id === "serious-implicit" || c.id === "five-items")
    .map(c => {
      const count = c.mode === "static" ? 1 : 5;
      const covered = reconcileCatalogCoverage(
        {
          aspectRatio: "4:5",
          postMode: c.mode,
          slideCount: count,
          text: c.content,
          experimental: true,
        },
        inventory
      );
      if (covered.coverage.issues.length)
        throw new Error("catalog_alignment_coverage_invalid");
      const repertoires = resolveDesignFamilyRepertoires(covered.cards, {
        slideCount: count,
        contentMode: "compose",
        instructions: c.content,
      });
      return {
        caseId: c.id,
        slideCount: count,
        candidates: repertoires.map(r => ({
          sourceId: r.sourceId,
          sourceHash: r.sourceHash,
          candidateId: r.defaultOffer.offerId,
          signature: r.signature,
          profileHash: arsenalHash(describeDesignFamilyRepertoire(r)),
          variants: r.slides.map(s => s.variants.map(v => [v.id, v.hash])),
        })),
      };
    });
}
/** Mechanical eligibility/identity proof; does not claim editorial quality. */
export async function verifyJourneyCatalogAlignment(input: {
  remote: CatalogSnapshot;
  overlay: CatalogSnapshot;
  revisedPackage: CatalogSnapshot;
  hydrate?: (id: string, hash: string) => Promise<unknown>;
}) {
  validateCatalogSnapshot(input.overlay, true);
  validateCatalogSnapshot(input.revisedPackage, true);
  validateCatalogSnapshot(input.remote);
  const index = new Map(input.remote.rows.map(row => [row.component_id, row]));
  if (
    index.size !== input.remote.rows.length ||
    index.size !== input.overlay.rows.length ||
    catalogCardContentHash(input.remote.rows) !==
      catalogCardContentHash(input.overlay.rows)
  )
    throw new Error("catalog_alignment_complete_overlay_mismatch");
  const expected = new Map(
    input.overlay.rows.map(row => [row.component_id, row])
  );
  for (const row of input.revisedPackage.rows) {
    const own = expected.get(row.component_id);
    if (
      !own ||
      own.definition_hash !== row.definition_hash ||
      arsenalHash(own.card) !== arsenalHash(row.card) ||
      arsenalHash(own.definition) !== arsenalHash(row.definition)
    )
      throw new Error("catalog_alignment_revised_subset_mismatch");
  }
  for (const row of input.overlay.rows) {
    const actual = index.get(row.component_id)!;
    const definition = componentDefinitionV1Schema.parse(
      actual.definition ??
        (await input.hydrate?.(actual.component_id, actual.definition_hash))
    );
    if (
      arsenalHash(definition) !==
      arsenalHash(componentDefinitionV1Schema.parse(row.definition))
    )
      throw new Error("catalog_alignment_definition_mismatch");
    validateCatalogSnapshot(
      {
        rows: [
          { ...actual, definition, assets: actual.assets ?? definition.assets },
        ],
      },
      true
    );
  }
  const effective = effectiveRepertoires(input.remote),
    fromOverlay = effectiveRepertoires(input.overlay),
    fromPackage = effectiveRepertoires(input.revisedPackage);
  if (
    arsenalHash(effective) !== arsenalHash(fromOverlay) ||
    arsenalHash(effective) !== arsenalHash(fromPackage)
  )
    throw new Error("catalog_alignment_effective_repertoires_differ");
  return {
    version: 1,
    remoteRows: input.remote.rows.length,
    revisedSubset: input.revisedPackage.rows.length,
    historicalRows: input.remote.rows.length - input.revisedPackage.rows.length,
    fullCardHash: catalogCardContentHash(input.remote.rows),
    checkedDefinitions: input.overlay.rows.length,
    cases: effective.map(c => ({
      caseId: c.caseId,
      slideCount: c.slideCount,
      candidates: c.candidates.length,
      effectiveHash: arsenalHash(c.candidates),
    })),
    evidence: "actual_coverage_repertoire_profile_functions_no_model_calls",
  };
}
