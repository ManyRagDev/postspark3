// Assemble an offline successor from complete, reviewed families. Keep unrelated hashes intact.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {readFrozenCatalog} from '../../../server/designCatalog/importFrozenCatalog';
import {arsenalHash} from '../../../shared/arsenalContent';
import {compactComponentCard, componentDefinitionV1Schema, type ComponentDefinitionV1} from '../../../shared/componentAssembly';
import {assertDesignTextCohesion} from '../../../shared/designTextCohesion';

const [previous, build, out] = process.argv.slice(2);
assert(previous && build && out, 'Informe o catálogo congelado, o build de autoria e uma nova pasta para o pacote.');
const old = await readFrozenCatalog(previous);
const inventory = JSON.parse(await readFile(join(build, 'inventory.json'), 'utf8'));
assert(inventory.rows.length > 0 && inventory.rows.length === inventory.sourceCount);
const grouped = new Map<string, ComponentDefinitionV1[]>();
for (const d of old.definitions) {
  const family = d.completeDesign!.family;
  grouped.set(family, [...grouped.get(family) ?? [], d]);
}
const revision = (d: ComponentDefinitionV1) => d.completeDesign!.authorshipRevision ?? 0;
const variant = (d: ComponentDefinitionV1) => d.completeDesign!.designGuidance?.carouselVariant;
const roleKey = (d: ComponentDefinitionV1) => {
  const v = variant(d);
  if (!v) return d.roles.slice().sort().join('/');
  return [v.role, v.version === 3 ? v.function : '', v.version >= 2 && 'contentMode' in v ? v.contentMode : ''].join('/');
};
const changed = new Set<string>();
const provenance = [];
for (const row of inventory.rows) {
  const former = grouped.get(row.id);
  assert(former && !changed.has(row.id) && row.state === 'technically_rendered' && !row.blocking.length);
  const pkg = JSON.parse(await readFile(join(build, 'packages', row.id + '.json'), 'utf8'));
  const defs: ComponentDefinitionV1[] = pkg.components.map((d: unknown) => componentDefinitionV1Schema.parse(d));
  assert.deepEqual(defs.map(d=>[d.id,d.hash]), row.definitions.map((d:{id:string;hash:string})=>[d.id,d.hash]));
  const root = defs.find(d=>!variant(d))!;
  assert(root && root.hash === row.definitionHash && root.id === row.definitionId);
  assert(revision(root) > Math.max(...former.map(revision)), 'Revisão de autoria anterior ou ambígua: ' + row.id);
  assert.deepEqual(defs.map(roleKey).sort(),former.map(roleKey).sort());
  for (const d of defs) {
    assert(d.completeDesign!.family === row.id && revision(d) === revision(root) && d.completeDesign!.baselineVerified);
    assertDesignTextCohesion(d);
    const v = variant(d);
    assert(!v || v.sourceId === root.id && v.sourceHash === root.hash);
  }
  provenance.push({family:row.id, sourceImageHash:row.sourceHash, previous:former.map(d=>d.hash), next:defs.map(d=>d.hash)});
  changed.add(row.id);
  grouped.set(row.id, defs);
}
await mkdir(out);
await mkdir(join(out,'definitions'));
await mkdir(join(out,'assets'));
const files:Record<string,{bytes:number;sha256:string}> = {};
async function put(name:string,bytes:Buffer) {
  files[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  await writeFile(join(out,name),bytes);
}
const json = (value:unknown) => Buffer.from(JSON.stringify(value)+'\n');
const includedAssets = new Set<string>();
const rows = [];
for (const [family,defs] of grouped) for(const d of defs) {
  await put('definitions/'+d.id+'.json',json(d));
  rows.push({card:compactComponentCard(d),component_id:d.id,definition_hash:d.hash});
  for (const a of d.assets) {
    if (includedAssets.has(a.sha256)) continue;
    const bytes = await readFile(join(changed.has(family)?build:previous,'assets',a.sha256));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);
    await put('assets/'+a.sha256,bytes);
    includedAssets.add(a.sha256);
  }
}
const catalogHash = arsenalHash({rows});
await put('snapshot.json',json({hash:catalogHash,snapshot:{rows}}));
await put('registry.json',json({entries:Array.from(grouped,([family,defs])=>({family,definitions:defs.map(d=>({id:d.id,hash:d.hash}))}))}));
await put('provenance.json',json({parentHash:old.sourceHash,families:provenance}));
await writeFile(join(out,'manifest.json'),json({catalogHash,definitions:rows.length,assets:includedAssets.size,activationApproved:false,files}));
const verified = await readFrozenCatalog(out,catalogHash);
console.log(JSON.stringify({catalogHash,definitions:verified.definitions.length,families:verified.families,replaced:changed.size}));
