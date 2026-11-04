/** Offline read-back through the same eligibility/projection/materialization APIs as generation. */
import fs from "node:fs/promises";
import path from "node:path";
import { arsenalHash } from "../../shared/arsenalContent";
import {
  compactComponentCard,
  componentDefinitionV1Schema,
} from "../../shared/componentAssembly";
import {
  resolveDesignFamilyRepertoires,
  materializeDesignFamilyOffer,
} from "../../shared/designRepertoire";
import { describeDesignFamilyRepertoire } from "../../shared/compactDesignProfile";
import { filterCompleteDesignRows } from "../../server/designCatalog/completeDesignStore";

const root = path.resolve(process.argv[2]),
  baseline = path.resolve(process.argv[3]);
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "manifest.json"), "utf8")
);
const rows = JSON.parse(
  await fs.readFile(path.join(root, "catalog-rows.json"), "utf8")
);
const cached = JSON.parse(await fs.readFile(baseline, "utf8"));
const previousIndex = process.argv.indexOf("--previous");
const previousRows =
  previousIndex < 0
    ? []
    : JSON.parse(
        await fs.readFile(
          path.join(
            path.resolve(process.argv[previousIndex + 1]),
            "catalog-rows.json"
          ),
          "utf8"
        )
      );
const overlay = new Map<string, any>();
for (const row of [...cached.snapshot.rows, ...previousRows, ...rows]) {
  const previous = overlay.get(row.component_id);
  if (previous && previous.definition_hash !== row.definition_hash)
    throw Error(`Immutable ID changed: ${row.component_id}`);
  overlay.set(row.component_id, row);
}
for (const row of rows) {
  const d = componentDefinitionV1Schema.parse(row.definition);
  if (arsenalHash(compactComponentCard(d)) !== arsenalHash(row.card))
    throw Error(`Card divergence: ${d.id}`);
}
let sequences = 0;
for (const count of [1, 3, 5, 10])
  for (const contentMode of ["compose", "literal"] as const) {
    const cards = filterCompleteDesignRows(Array.from(overlay.values()), {
      aspectRatio: "4:5",
      postMode: count === 1 ? "static" : "carousel",
      slideCount: count,
      text: "",
      experimental: true,
    });
    const families = resolveDesignFamilyRepertoires(cards, {
      slideCount: count,
      contentMode,
    });
    if (
      families.length !== manifest.familyCandidates ||
      families.some(
        f => !manifest.rows.some((r: any) => r.componentId === f.sourceId)
      )
    )
      throw Error("Catalog overlay mismatch");
    for (const family of families) {
      materializeDesignFamilyOffer(
        family,
        family.slides.map((s, i) => s.variants[i % s.variants.length].id)
      );
      sequences++;
      if (count === 5 && contentMode === "compose")
        await fs.writeFile(
          path.join(root, "profiles", `${family.sourceId}.json`),
          JSON.stringify(describeDesignFamilyRepertoire(family), null, 2)
        );
    }
  }
const report = {
  sources: manifest.rows.length,
  definitions: rows.length,
  overlayVerified: true,
  originalSnapshotRevision: cached.revision,
  baselineHash: arsenalHash(cached.snapshot),
  ...(previousRows.length
    ? {
        previousPackageHash: arsenalHash(previousRows),
        previousDefinitions: previousRows.length,
      }
    : {}),
  materializedSequences: sequences,
  counts: [1, 3, 5, 10],
  contentModes: ["compose", "literal"],
  newDraftsOnly: true,
  remoteCalls: 0,
};
await fs.writeFile(
  path.join(root, "local-readback.json"),
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report));
