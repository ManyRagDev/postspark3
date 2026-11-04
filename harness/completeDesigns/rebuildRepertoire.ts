/** Offline only. New immutable definitions/packages; no publication, DB, network or model calls. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  compactComponentCard,
  componentDefinitionV1Schema,
  type ComponentDefinitionV1,
} from "../../shared/componentAssembly";
import { arsenalHash } from "../../shared/arsenalContent";
import { rebuildCatalogRepresentation } from "../componentArsenal/catalogRepresentation";
import { authorFamilyCarouselRepertoire } from "../../server/designCatalog/familyCarouselRepertoire";
import { resolveDesignFamilyRepertoires } from "../../shared/designRepertoire";
import { describeDesignFamilyRepertoire } from "../../shared/compactDesignProfile";
import type { ComponentPackage } from "../componentArsenal/extract";

const argument = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return path.resolve(i < 0 ? fallback : process.argv[i + 1]);
};
const audit = argument(
  "--audit",
  "artifacts/verification/catalog-conception-2026-11-01/representation/static-catalog-audit.json"
);
const packageRoot = argument(
  "--packages",
  "artifacts/complete-designs/whole-catalog-final-2026-10-06-r2"
);
const cache = argument("--cache", ".postspark-local/catalog/definitions");
const output = argument(
  "--output",
  "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3"
);
const previousIndex = process.argv.indexOf("--previous");
const previousRoot =
  previousIndex < 0 ? undefined : path.resolve(process.argv[previousIndex + 1]);
const previousDefinitions = new Map<string, ComponentDefinitionV1>();
if (previousRoot) {
  const previous = JSON.parse(
    await fs.readFile(path.join(previousRoot, "manifest.json"), "utf8")
  );
  for (const row of previous.rows)
    previousDefinitions.set(
      row.sourceId,
      componentDefinitionV1Schema.parse(
        JSON.parse(
          await fs.readFile(
            path.join(previousRoot, "definitions", `${row.componentId}.json`),
            "utf8"
          )
        )
      )
    );
}
await fs.mkdir(output, { recursive: false });
for (const directory of ["packages", "assets", "definitions", "profiles"])
  await fs.mkdir(path.join(output, directory));
const evidence: Array<{
  sourceId: string;
  hash: string;
  family: string;
  card: any;
}> = JSON.parse(await fs.readFile(audit, "utf8"));
const packages: ComponentPackage[] = [];
for (const file of await fs.readdir(path.join(packageRoot, "packages")))
  if (file.endsWith(".json"))
    packages.push(
      JSON.parse(
        await fs.readFile(path.join(packageRoot, "packages", file), "utf8")
      )
    );
const definitions = new Map<string, ComponentDefinitionV1>();
for (const pkg of packages)
  for (const d of pkg.components) definitions.set(`${d.id}:${d.hash}`, d);
for (const file of await fs.readdir(cache))
  if (file.endsWith(".json")) {
    const entry = JSON.parse(await fs.readFile(path.join(cache, file), "utf8"));
    if (entry.row?.definition)
      definitions.set(
        `${entry.row.definition.id}:${entry.row.definition.hash}`,
        entry.row.definition
      );
  }
const rows: any[] = [],
  catalogRows: any[] = [],
  allDefinitions: ComponentDefinitionV1[] = [];
for (const current of evidence) {
  const source = definitions.get(`${current.sourceId}:${current.hash}`);
  if (!source)
    throw new Error(`Current frozen definition missing: ${current.sourceId}`);
  const pkg =
    packages.find(p => p.components.some(d => d.id === source.id)) ??
    packages.find(
      p =>
        p.source.referenceId ===
        (source.source.kind === "recipe"
          ? source.source.referenceId
          : source.completeDesign?.family)
    );
  if (!pkg) throw new Error(`Source package missing: ${current.sourceId}`);
  const before = arsenalHash(source);
  const rebuilt = rebuildCatalogRepresentation(
    componentDefinitionV1Schema.parse(source),
    pkg,
    previousDefinitions.get(source.id)
  );
  const variants = authorFamilyCarouselRepertoire(rebuilt.definition);
  const components = [rebuilt.definition, ...variants];
  const filename = `packages/${rebuilt.definition.id}.json`;
  await fs.writeFile(
    path.join(output, filename),
    JSON.stringify(
      {
        ...pkg,
        components,
        authorship: {
          ...pkg.authorship,
          version: "component-native-semantics-v3",
          units: rebuilt.units,
        },
      },
      null,
      2
    )
  );
  for (const d of components) {
    componentDefinitionV1Schema.parse(d);
    await fs.writeFile(
      path.join(output, "definitions", `${d.id}.json`),
      JSON.stringify(d, null, 2)
    );
    catalogRows.push({
      component_id: d.id,
      definition_hash: d.hash,
      card: compactComponentCard(d),
      assets: d.assets,
      design_components: {
        id: d.id,
        definition_hash: d.hash,
        status: "draft",
        source: d.source,
      },
      definition: d,
    });
    allDefinitions.push(d);
  }
  for (const asset of source.assets) {
    let bytes: Buffer | undefined;
    for (const directory of [
      path.join(packageRoot, "assets"),
      "artifacts/complete-designs/recovered-catalog-2026-10-09-r4/assets",
      ".postspark-local/catalog/assets",
    ]) {
      try {
        bytes = await fs.readFile(path.join(directory, asset.sha256));
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    if (!bytes) throw new Error(`Missing local asset: ${asset.id}`);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
      throw new Error(`Asset hash mismatch: ${asset.id}`);
    await fs.writeFile(path.join(output, "assets", asset.sha256), bytes);
  }
  if (arsenalHash(source) !== before) throw new Error("Source was mutated");
  rows.push({
    sourceId: source.id,
    sourceHash: source.hash,
    componentId: rebuilt.definition.id,
    componentHash: rebuilt.definition.hash,
    family: source.completeDesign!.family,
    package: filename,
    variantIds: variants.map(v => v.id),
    nativeListFields: rebuilt.units
      .filter(u => u.kind === "list")
      .map(u => ({ source: u.source, cardinality: u.cardinality })),
    assetHashes: source.assets.map(a => a.sha256),
    status: "draft",
    review: "pending_local_render",
  });
}
const cards = allDefinitions.map(compactComponentCard);
const repertoire = resolveDesignFamilyRepertoires(cards, {
  slideCount: 5,
  contentMode: "compose",
});
for (const family of repertoire)
  await fs.writeFile(
    path.join(output, "profiles", `${family.sourceId}.json`),
    JSON.stringify(describeDesignFamilyRepertoire(family), null, 2)
  );
await fs.writeFile(
  path.join(output, "catalog-rows.json"),
  JSON.stringify(catalogRows, null, 2)
);
const manifest = {
  format: "postspark.catalog-repertoire",
  version: 3,
  basedOnAudit: audit,
  ...(previousRoot ? { previousPackage: previousRoot } : {}),
  auditHash: createHash("sha256")
    .update(await fs.readFile(audit))
    .digest("hex"),
  rows,
  definitions: cards.length,
  familyCandidates: repertoire.length,
  snapshotHash: arsenalHash(catalogRows),
  published: false,
  preservedOriginals: true,
  contentModes: ["compose", "literal"],
  limitations: [
    "Offline native geometry authorship is not an online generation test.",
    "New records are drafts. Inspect local renders and publish through the catalog publication path; never overwrite original definitions.",
  ],
};
await fs.writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(manifest, null, 2)
);
console.log(
  JSON.stringify({
    output,
    sources: rows.length,
    definitions: cards.length,
    familyCandidates: repertoire.length,
    published: false,
  })
);
