// Create a successor catalog from a frozen export. Never mutate the source revision.
import { consolidateParagraphs } from "./consolidateParagraphs";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assemblyIdentity, componentDefinitionV1Schema, createComponentDefinition,
  type ComponentDefinitionV1,
} from "../../shared/componentAssembly";
import { arsenalHash } from "../../shared/arsenalContent";
import { auditDesignTextCohesion } from "../../shared/designTextCohesion";

const [input, output] = process.argv.slice(2);
assert(input && output, "Informe o arquivo da revisão congelada e um novo diretório de saída.");
const archive = JSON.parse(await readFile(input, "utf8"));
const originals: ComponentDefinitionV1[] = archive.definitions.map((d: unknown) => componentDefinitionV1Schema.parse(d));
const variant = (d: ComponentDefinitionV1) => d.completeDesign?.designGuidance?.carouselVariant;
const replacements = new Map<string, ComponentDefinitionV1>();
const rows = [];
assert(originals.length && new Set(originals.map(d => d.id)).size === originals.length);

for (const old of originals.sort((a, b) => Number(!!variant(a)) - Number(!!variant(b)))) {
  const d = structuredClone(old);
  const v = variant(d);
  if (v) {
    const base = replacements.get(v.sourceId);
    assert(base && originals.find(c => c.id === v.sourceId)?.hash === v.sourceHash, "Base de carrossel divergente");
    v.sourceId = base.id;
    v.sourceHash = base.hash;
  }
  const groups = consolidateParagraphs(d);
  const changed = groups.length > 0 || variant(old)?.sourceHash !== v?.sourceHash;
  if (changed) {
    d.completeDesign!.authorshipRevision = (old.completeDesign!.authorshipRevision ?? 1) + 1;
    d.id = assemblyIdentity(["acervo82-text-cohesion", old.hash, arsenalHash(d)]);
  }
  const next = createComponentDefinition(d);
  assert(!auditDesignTextCohesion(next).some(f => f.action === "consolidate"));
  replacements.set(old.id, next);
  rows.push({ family: d.completeDesign!.family, oldId: old.id, oldHash: old.hash, id: next.id, hash: next.hash, groups });
}
await mkdir(output);
await mkdir(join(output, "definitions"));
for (const next of replacements.values())
  await writeFile(join(output, "definitions", next.id + ".json"), JSON.stringify(next) + "\n");
await writeFile(join(output, "migration.json"), JSON.stringify({ sourceRevision: archive.revision, rows }, null, 2) + "\n");
console.log(JSON.stringify({ definitions: rows.length, changed: rows.filter(r => r.oldHash !== r.hash).length, merged: rows.flatMap(r => r.groups).length }));
