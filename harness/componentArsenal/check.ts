import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";
import { readCorpus,readSource,sha256 } from "./inventory";
import { authorRecipe } from "./authoring";
import { fragmentContentText,arsenalCompositionSchema } from "../../shared/designArsenal";
import { componentDefinitionV1Schema,componentHash } from "../../shared/componentAssembly";
import { arsenalHash } from "../../shared/arsenalContent";
import { layoutRichText } from "../../client/src/pages/CanvasLab/lib/richTextLayout";
import { installNativeSurface } from "../designBatch/native";
import { buildDraftPreview,buildSemanticPreview } from "./preview";
import type { ComponentPackage } from "./extract";

const output=path.resolve(process.argv[2]??"artifacts/component-arsenal/revision-7-cta"),records=await readCorpus();
assert.equal(records.filter(r=>r.category!=="editor-extension").length,87);assert.equal(records.filter(r=>r.category==="editor-extension").length,6);assert.equal(new Set(records.map(r=>r.fileHash)).size,93);
installNativeSurface();
const checks:Array<Record<string,unknown>>=[];
for(const r of records){
  const {recipe}=await readSource(r),units=authorRecipe(r,recipe);
  assert.equal(new Set(units.flatMap(u=>u.layerIds)).size,units.flatMap(u=>u.layerIds).length);
  for(const unit of units)for(const text of ["Uma ideia curta.","  Uma mensagem com espaços,\nlinhas e palavras inteiras.  ",unit.sampleText]){
    assert.equal(unit.layerIds.map((_,index)=>fragmentContentText(text,{index,count:unit.layerIds.length,unit:"words",weights:unit.weights})).join(""),text);
  }
  const p:ComponentPackage=JSON.parse(await fs.readFile(path.join(output,"packages",`${r.fileHash}.json`),"utf8"));
  assert.equal(arsenalHash(p.sourceSnapshot.recipe),p.source.recipeHash);
  for(const c of p.components){
    assert.equal(componentHash(c),c.hash);componentDefinitionV1Schema.parse(c);
    const used=new Set(Object.values(c.pieces).map(piece=>piece.fontAssetId).filter(Boolean));
    assert.equal(c.assets.length,used.size);assert.ok(c.assets.every(a=>used.has(a.id)));
    if(c.kind==="content"){
      if(c.roles.includes("list"))assert.ok(c.fragment.bindings.some(b=>b.kind==="list"));
      if(c.roles.includes("comparison"))assert.ok(c.fragment.bindings.some(b=>b.source.startsWith("block:comparison:")));
      if(c.densities.includes("quiet"))assert.ok(c.fragment.bindings.some(b=>b.source==="block:callToAction:0:text"),`CTA canônico ausente:${c.id}`);
      if(c.densities.includes("quiet")&&!c.fragment.bindings.some(b=>b.kind==="list"||b.source.startsWith("block:comparison:")))assert.ok(c.fragment.bindings.some(b=>b.source==="block:body:0:text"),`Corpo canônico ausente:${c.id}`);
    }
  }
  for(const a of p.assetFiles){const bytes=await fs.readFile(path.join(output,a.relativePath));assert.equal(sha256(bytes),a.manifest.sha256);assert.ok(GlobalFonts.register(bytes,a.manifest.family!));}
  for(const adaptation of p.authorship.formatAdaptations??[]){
    const c=p.components.find(c=>c.id===adaptation.componentId)!,source=p.components.find(c=>c.id===adaptation.sourceComponentId)!;
    assert.equal(c.fragment.aspectRatio,"4:5");assert.equal(source.fragment.aspectRatio,"5:6");
    assert.equal(arsenalHash(c.pieces),arsenalHash(source.pieces));assert.equal(arsenalHash(c.fragment.relations),arsenalHash(source.fragment.relations));
    if(c.kind!=="content"||p.authorship.semanticSamples?.some(s=>s.componentId===c.id))continue;
    try{
      const mode=c.fragment.variantKey.includes("-quiet")?"quiet":"original",{composition}=buildDraftPreview(p,mode,layoutRichText,{},c.id);
      assert.equal(arsenalHash(arsenalCompositionSchema.parse(JSON.parse(JSON.stringify(composition)))),arsenalHash(composition));
      checks.push({id:r.id,mode:`portrait4x5-${mode}`,status:"compiled",state:composition.state,issues:composition.issues,componentId:c.id});
    }catch(e){checks.push({id:r.id,mode:"portrait4x5",status:"preview-blocked",reason:e instanceof Error?e.message:String(e)})}
  }
  if(r.destination!=="composition"){checks.push({id:r.id,destination:r.destination,status:"retained-special-source"});continue}
  for(const mode of ["original","quiet"] as const){
    try{
      const {composition}=buildDraftPreview(p,mode,layoutRichText);
      if(mode==="quiet")assert.ok(composition.elements.some(e=>composition.base.bindings.find(b=>b.id===e.bindingId)?.source==="block:callToAction:0:text"&&!!e.text?.trim()));
      const roundtrip=arsenalCompositionSchema.parse(JSON.parse(JSON.stringify(composition)));
      assert.equal(arsenalHash(roundtrip),arsenalHash(composition));
      checks.push({id:r.id,mode,status:"compiled",state:composition.state,issues:composition.issues,elements:composition.elements.length});
    }catch(e){checks.push({id:r.id,mode,status:"preview-blocked",reason:e instanceof Error?e.message:String(e)});}
  }
  for(const sample of p.authorship.semanticSamples??[])for(const scenario of ["short","medium","long","literal"] as const){
    try{
      const {composition,content}=buildSemanticPreview(p,sample.componentId,layoutRichText,scenario);
      const roundtrip=arsenalCompositionSchema.parse(JSON.parse(JSON.stringify(composition)));assert.equal(arsenalHash(roundtrip),arsenalHash(composition));
      for(const block of content.blocks){
        if(block.type==="list")for(const item of block.items)assert.equal(composition.elements.find(e=>e.itemId===item.id)?.text,item.text);
        if(block.type==="comparison")for(const side of ["left","right"] as const)assert.equal(composition.elements.find(e=>composition.base.bindings.find(b=>b.id===e.bindingId)?.source===`block:comparison:0:${side}.text`)?.text,block[side].text);
      }
      checks.push({id:r.id,mode:`${sample.mode}-${sample.presentation}`,scenario,status:"compiled",state:composition.state,issues:composition.issues,componentId:sample.componentId});
    }catch(e){checks.push({id:r.id,mode:`${sample.mode}-${sample.presentation}`,scenario,status:"preview-blocked",reason:e instanceof Error?e.message:String(e)})}
  }
}
const report={format:"postspark.component-arsenal.check",schemaVersion:1,sourceCount:records.length,componentSchemas:"passed",sourceHashes:"passed",literalFragmentCoverage:"passed",assetHashes:"passed",roundtrip:"passed-for-materialized-previews",geometryEngine:"official-shared-solver-with-native-measurement",browserVisualVerification:"pending",checks,
  previewBlocked:checks.filter(c=>c.status==="preview-blocked").length,needsAdjustment:checks.filter(c=>c.state==="needs_adjustment").length};
await fs.writeFile(path.join(output,"checks.json"),JSON.stringify(report,null,2)+"\n");
const blocked=checks.filter(c=>c.status==="preview-blocked"||c.state==="needs_adjustment");
await fs.writeFile(path.join(output,"TECHNICAL_REVIEW.md"),`# Impedimentos técnicos por receita\n\nCada registro abaixo é um destino verificável pendente de autoria/revisão. Preparação não equivale a aprovação; nenhum original é descartado ou considerado elegível por ter uma adaptação limpa.\n\n${blocked.map(c=>`- **${c.id} · ${c.mode}** — ${(c.issues as string[]??[]).join("; ")||c.reason}. Snapshot original preservado; componente draft; confirmar geometria real, composição adaptada, fundo/mídia e cores antes de publicar.`).join("\n")}\n\nComparação oficial em browser pendente. Fotos de origem são apenas ilustrações: contraste sobre fotografia não é provado pelo slot vazio.\n`);
console.log(JSON.stringify({recipes:records.length,checks:checks.length,previewBlocked:report.previewBlocked,needsAdjustment:report.needsAdjustment}));
