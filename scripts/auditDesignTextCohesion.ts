/** Read the published catalog or a build's definitions directory and emit one JSON report. */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  componentDefinitionV1Schema,
  type ComponentDefinitionV1,
} from "../shared/componentAssembly";
import { auditDesignTextCohesion } from "../shared/designTextCohesion";

const [input, ...extra] = process.argv.slice(2);
if (!input || extra.length)
  throw Error(
    "Use designs:audit-text --active ou designs:audit-text <diretório de definições>."
  );
let revision: string | undefined;
const definitions: ComponentDefinitionV1[] = [];
if (input === "--active") {
  const { readCatalogManifest, readCatalogSnapshot, readCatalogDefinition } =
    await import("../server/designCatalog/versionedCatalog");
  const manifest = await readCatalogManifest();
  revision = String(manifest.revision);
  const snapshot = await readCatalogSnapshot(revision);
  for (const row of snapshot.rows) {
    if (
      row.design_components.status === "archived" ||
      !(row.card as { completeDesign?: unknown }).completeDesign
    )
      continue;
    definitions.push(
      await readCatalogDefinition(
        revision,
        row.component_id,
        row.definition_hash
      )
    );
  }
  if (String((await readCatalogManifest()).revision) !== revision)
    throw Error("A revisão ativa mudou durante a auditoria.");
} else {
  for (const name of (await readdir(input))
    .filter(name => name.endsWith(".json"))
    .sort()) {
    const d = componentDefinitionV1Schema.parse(
      JSON.parse(await readFile(join(input, name), "utf8"))
    );
    if (d.completeDesign) definitions.push(d);
  }
}
if (!definitions.length)
  throw Error("Nenhuma definição de design completo encontrada.");
const designs = definitions
  .map(d => ({
    family: d.completeDesign!.family,
    id: d.id,
    hash: d.hash,
    label: d.label,
    textFields: d.fragment.bindings.filter(b => b.kind === "text").length,
    textBoxes: d.fragment.instances.filter(
      i => d.pieces[i.pieceHash].kind === "text"
    ).length,
    findings: auditDesignTextCohesion(d),
  }))
  .sort((a, b) => a.family.localeCompare(b.family) || a.id.localeCompare(b.id));
const findings = designs.flatMap(d => d.findings);
console.log(
  JSON.stringify(
    {
      revision,
      summary: {
        families: new Set(designs.map(d => d.family)).size,
        definitions: designs.length,
        textBoxes: designs.reduce((sum, d) => sum + d.textBoxes, 0),
        textFields: designs.reduce((sum, d) => sum + d.textFields, 0),
        consolidate: findings.filter(f => f.action === "consolidate").length,
        inspect: findings.filter(f => f.action === "inspect").length,
        preserve: findings.filter(f => f.action === "preserve").length,
      },
      designs,
    },
    null,
    2
  )
);
