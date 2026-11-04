import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  readSnapshotFile,
  overlayCatalogs,
  verifyJourneyCatalogAlignment,
} from "./catalogAlignment";

const files = [
  "artifacts/verification/unified-generation-matrix-2026-11-01/operator/catalog-baseline.json",
  "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r8/catalog-rows.json",
  "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/catalog-rows.json",
];
describe("real frozen catalog overlay, offline without model/provider calls", () => {
  it.skipIf(files.some(file => !existsSync(file)))(
    "accepts baseline229 + R8 + R9 as428 immutable rows, with the same29 effective candidates, and rejects meaningful drift",
    async () => {
      const [baseline, previous, revisedPackage] = await Promise.all(
        files.map(readSnapshotFile)
      );
      expect(baseline.rows).toHaveLength(229);
      expect(previous.rows).toHaveLength(185);
      expect(revisedPackage.rows).toHaveLength(185);
      const overlay = overlayCatalogs(baseline, previous, revisedPackage);
      expect(overlay.rows).toHaveLength(428);
      const result = await verifyJourneyCatalogAlignment({
        remote: overlay,
        overlay,
        revisedPackage,
      });
      expect(result.revisedSubset).toBe(185);
      expect(result.checkedDefinitions).toBe(428);
      expect(result.cases.map(c => [c.caseId, c.candidates])).toEqual([
        ["serious-implicit", 29],
        ["five-items", 29],
      ]);
      const sourceId = revisedPackage.rows.find(r =>
        (r.card as any).roles.includes("static")
      )!.component_id;
      const change = (mutate: (row: any) => void) => ({
        rows: overlay.rows.map(row => {
          if (row.component_id !== sourceId) return row;
          const copy = structuredClone(row);
          mutate(copy);
          return copy;
        }),
      });
      await expect(
        verifyJourneyCatalogAlignment({
          remote: change(r => {
            r.card.label += " drift";
          }),
          overlay,
          revisedPackage,
        })
      ).rejects.toThrow("complete_overlay_mismatch");
      await expect(
        verifyJourneyCatalogAlignment({
          remote: change(r => {
            r.definition.label += " drift";
          }),
          overlay,
          revisedPackage,
        })
      ).rejects.toThrow(/component_hash_mismatch|definition_mismatch/);
      await expect(
        verifyJourneyCatalogAlignment({
          remote: change(r => {
            r.design_components.status = "archived";
          }),
          overlay,
          revisedPackage,
        })
      ).rejects.toThrow("effective_repertoires_differ");
      const historicalArchived = {
        rows: overlay.rows.map(row =>
          revisedPackage.rows.some(r => r.component_id === row.component_id)
            ? row
            : {
                ...row,
                design_components: {
                  ...row.design_components,
                  status: "archived",
                },
              }
        ),
      };
      await expect(
        verifyJourneyCatalogAlignment({
          remote: historicalArchived,
          overlay,
          revisedPackage,
        })
      ).resolves.toMatchObject({ remoteRows: 428, revisedSubset: 185 });
    },
    30000
  );
});
