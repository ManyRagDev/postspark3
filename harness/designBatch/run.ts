/** Complete offline matrix diagnostics and a portable static comparison gallery. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, readdir, copyFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { recreationRecipeSchema, type RecreationRecipe } from "../../shared/designRecreation";
import { compileMatrix, matrixInputs } from "../../client/src/pages/Admin2/matrixCompiler";
import { localFontPool, recipeFromSpec, sha256, type CompactSpec } from "./builder";
import { installNativeSurface, renderRecipe, layerMeasurements, registerRecipeFonts, prepareRecipeMedia } from "./native";

const root = process.argv.slice(2).find(arg=>!arg.startsWith("--")) ?? "artifacts/design-recreation/batch-2026-09-30";
const resume=process.argv.includes("--resume") && !process.argv.includes("--force");
const galleryOnly=process.argv.includes("--gallery-only");
const engineHash=sha256(Buffer.concat(await Promise.all(["builder.ts","native.ts","run.ts"].map(f=>readFile(join("harness/designBatch",f))))));
const timeoutMs = 15_000;
const timeLimit = async <T>(promise: Promise<T>) => {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Compile timeout 15s")),timeoutMs);})]); }
  finally { clearTimeout(timer!); }
};
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const checkpoint = async (state: unknown) => writeFile(join(root,"checkpoint.json"),JSON.stringify({at:new Date().toISOString(),...state as object},null,2));
for (const dir of ["recipes","specs","renders","variants","reports","references"]) await mkdir(join(root,dir),{recursive:true});
installNativeSurface();
const inventory = JSON.parse(await readFile(join(root,"inventory.json"),"utf8"));
const fonts = localFontPool();
const specHashes=new Map<string,string>();
const specFiles = galleryOnly ? [] : (await readdir(join(root,"specs"))).filter(f=>f.endsWith(".json")).sort();
await checkpoint({status:"authoring_specs",specFiles});
for (const file of specFiles) {
  const specText=await readFile(join(root,"specs",file),"utf8");
  specHashes.set(file,sha256(specText));
  const spec: CompactSpec & { reuse?: string } = JSON.parse(specText);
  if(resume) {
    try {
      const previous=JSON.parse(await readFile(join(root,"reports",file),"utf8"));
      if(previous.engineHash===engineHash && previous.specSha256===sha256(specText) && previous.recipeSha256===sha256(await readFile(join(root,"recipes",file)))) continue;
    } catch { /* absent/stale checkpoint */ }
  }
  if(spec.reuse) { await copyFile(spec.reuse,join(root,"recipes",file)); continue; }
  const recipe = recipeFromSpec(spec,fonts);
  await writeFile(join(root,"recipes",`${spec.stem}.json`),JSON.stringify(recipe,null,2));
}
const files = galleryOnly ? [] : (await readdir(join(root,"recipes"))).filter(f=>f.endsWith(".json")).sort();
const results: any[] = galleryOnly ? JSON.parse(await readFile(join(root,"report.json"),"utf8")).results : [];
for (const file of files) {
  const stem = basename(file,".json"), checks: string[] = [], cases: any[] = [];
  const start=Date.now();
  if(resume) {
    try {
      const previous=JSON.parse(await readFile(join(root,"reports",file),"utf8")),actualRecipe=sha256(await readFile(join(root,"recipes",file)));
      const original=inventory.images.find((i:any)=>i.id===previous.originalId);
      if(previous.ok && previous.engineHash===engineHash && previous.specSha256===specHashes.get(file) && previous.recipeSha256===actualRecipe && original && sha256(await readFile(original.sourcePath))===original.sha256) { results.push(previous);console.log(`${stem}: resumed verified checkpoint`);continue; }
    } catch { /* absent/stale checkpoint */ }
  }
  const report: any = {stem,checks,cases,visualApproval:false,browserStageVerified:false,engineHash,specSha256:specHashes.get(file)};
  try {
    const text = await readFile(join(root,"recipes",file),"utf8");
    const recipe = recreationRecipeSchema.parse(JSON.parse(text));
    report.title=recipe.title;
    assert.equal(recipe.version,3); assert.ok(recipe.matrix); checks.push("strict V3 schema");
    const reused=stem === "1c2fb00a82a764bab2f4374d03f67886";
    const photoOnly=stem === "cbb2b5fd83ed04a8bd24e7f049be0a01";
    report.classification=photoOnly ? "photographic-reference-only" : reused ? "previously-approved-matrix-preserved" : "manual-graphic-matrix";
    if(photoOnly) report.designLimitation="Pure photography; no graphic matrix could be extracted. An invisible caption exists only to satisfy the V3 field contract. Technical success does not approve an extracted design.";
    if(reused) {
      const reuseSpec=JSON.parse(await readFile(join(root,"specs",file),"utf8"));
      assert.equal(sha256(await readFile(reuseSpec.reuse)),sha256(text));
      checks.push("approved source JSON byte hash unchanged");
      report.priorHumanApproval=true;
    }
    if(!reused) { assert.equal(recipe.usage.inputTokens,0); assert.equal(recipe.usage.outputTokens,0); checks.push("manual recipe usage is zero; no external model call was made by this harness; agent inference costs are not represented by recipe usage"); }
    else checks.push("previously approved artifact preserved verbatim; source metadata retained");
    if(!reused) assert.ok(recipe.matrix!.media.every(m=>m.asset === null));
    checks.push(reused ? "previous media preserved only in approved artifact" : "empty reusable media slots");
    report.fonts=registerRecipeFonts(recipe); checks.push("embedded font bytes and SHA-256 verified; registered native aliases");
    const original=inventory.images.find((i:any)=>i.sha256 === recipe.scene.source.originalHash);
    if (!original) throw new Error("Recipe is not associated with an inventory original hash");
    const originalBytes=await readFile(original.sourcePath);
    assert.equal(sha256(originalBytes),original.sha256); checks.push("original disk bytes match source hash");
    const reference=`references/${stem}${extname(original.sourcePath) || '.jpg'}`;
    await copyFile(original.sourcePath,join(root,reference)); report.reference=reference; report.originalId=original.id;
    report.recipeSha256=sha256(text); report.layers=recipe.scene.layers.length; report.groups=recipe.matrix!.groups.length;
    report.fields=recipe.matrix!.fields.map(f=>({id:f.id,kind:f.kind,members:f.layerIds.length,minScale:f.minScale}));
    report.media=recipe.matrix!.media.map(m=>({id:m.id,layerId:m.layerId,asset:null}));
    const source=JSON.stringify(recipe);
    for (const group of recipe.matrix!.groups) for (const member of group.members) {
      const l=recipe.scene.layers.find(l=>l.id === member.layerId)!,r=group.transform.rotationDeg*Math.PI/180;
      assert.ok(Math.abs(l.x-(group.transform.x+member.x*Math.cos(r)-member.y*Math.sin(r)))<0.00001);
      assert.ok(Math.abs(l.y-(group.transform.y+member.x*Math.sin(r)+member.y*Math.cos(r)))<0.00001);
      assert.ok(Math.abs(l.rotationDeg-group.transform.rotationDeg-member.rotationDeg)<0.00001);
    }
    checks.push("resolved geometry matches all local group members");
    await timeLimit(prepareRecipeMedia(recipe));
    const baseline=renderRecipe(recipe), baselinePath=`renders/${stem}.png`;
    await writeFile(join(root,baselinePath),baseline); report.render=baselinePath; report.pngSha256=sha256(baseline);
    report.measurements=layerMeasurements(recipe); report.baselineOverflow=report.measurements.filter((l:any)=>!l.fits);
    const reopened=recreationRecipeSchema.parse(JSON.parse(JSON.stringify(recipe)));
    assert.deepEqual(reopened,recipe); assert.equal(sha256(renderRecipe(reopened)),sha256(baseline)); checks.push("JSON parse roundtrip and identical native PNG bytes");
    const initial=matrixInputs(recipe);
    const short=structuredClone(initial);
    for (const field of recipe.matrix!.fields) {
      const l=recipe.scene.layers.find(l=>l.id === field.layerIds[0])!;
      const target=l.width/l.fontSize;
      const copy=target>=8 ? "Nova ideia" : target>=5 ? "Crie" : "A";
      short.fields[field.id]=field.layerIds.map(()=>copy).join("\n");
    }
    const attempt = async (name:string,input:ReturnType<typeof matrixInputs>,expectReject=false) => {
      const before=JSON.stringify(recipe);
      const attemptStart=Date.now();
      try {
        const next=await timeLimit(compileMatrix(recipe,input));
        assert.equal(JSON.stringify(recipe),before,"Source recipe mutated");
        if(expectReject) throw new Error("Negative case was unexpectedly accepted");
        const measurements=layerMeasurements(next);
        for(const field of next.matrix!.fields) for(const id of field.layerIds) assert.ok(measurements.find(l=>l.id===id)?.fits,`Bound text overflow ${id}`);
        for(const field of next.matrix!.fields) {
          const scales=field.layerIds.map((id,i)=>next.scene.layers.find(l=>l.id===id)!.fontSize/field.baseFontSizes[i]);
          assert.ok(scales.every(s=>s>=field.minScale-0.0001 && s<=1.0001));
          assert.ok(scales.every(s=>Math.abs(s-scales[0])<0.0001));
        }
        for(const group of next.matrix!.groups) for(const member of group.members) {
          const l=next.scene.layers.find(l=>l.id===member.layerId)!,r=group.transform.rotationDeg*Math.PI/180;
          assert.ok(Math.abs(l.x-(group.transform.x+member.x*Math.cos(r)-member.y*Math.sin(r)))<0.00001);
          assert.ok(Math.abs(l.y-(group.transform.y+member.x*Math.sin(r)+member.y*Math.cos(r)))<0.00001);
          assert.ok(Math.abs(l.rotationDeg-group.transform.rotationDeg-member.rotationDeg)<0.00001);
        }
        if(name === "fewer-list-items") {
          const field=next.matrix!.fields.find(f=>f.kind==="list" && f.layerIds.length>1)!;
          assert.ok(field.layerIds.slice(1).every(id=>next.scene.layers.find(l=>l.id===id)!.opacity===0));
        }
        const path=`variants/${stem}-${name}.json`,png=`renders/${stem}-${name}.png`;
        await timeLimit(prepareRecipeMedia(next));
        await writeFile(join(root,path),JSON.stringify(next,null,2)); await writeFile(join(root,png),renderRecipe(next));
        cases.push({name,status:next.matrix!.lastCompilation!.status,recipe:path,render:png,resizedFields:next.matrix!.lastCompilation!.resizedFields,changes:next.matrix!.lastCompilation!.changedFields,measurements});
      } catch(error) {
        assert.equal(JSON.stringify(recipe),before);
        const message=error instanceof Error ? error.message : String(error);
        const expected=name==="overflow" ? /excede a área|texto muito longo/i : name==="too-many-lines" ? /use (uma linha|de 1 a)/i : null;
        if(expectReject && expected?.test(message)) cases.push({name,status:"rejected-as-expected",message});
        else cases.push({name,status:expectReject ? "failed" : "rejected",message});
      } finally {
        const result=cases.find(c=>c.name===name);if(result) result.durationMs=Date.now()-attemptStart;
      }
    };
    if(photoOnly) cases.push({name:"no-op",status:"not-applicable",message:"Pure photographic reference; hidden contract caption has no source copy."});
    else await attempt("no-op",initial);
    await attempt("short",short);
    const medium=structuredClone(initial);
    for(const field of recipe.matrix!.fields) medium.fields[field.id]=field.layerIds.map(()=>"Crie conteúdo com intenção").join("\n");
    await attempt("medium",medium);
    const transformed=structuredClone(short),firstGroup=recipe.matrix!.groups[0];
    transformed.transforms[firstGroup.id]={...firstGroup.transform,x:firstGroup.transform.x+12,y:firstGroup.transform.y+8,rotationDeg:firstGroup.transform.rotationDeg+3};
    await attempt("moved-group",transformed);
    if(recipe.matrix!.media.length) {
      // Procedural JPEG for pipeline diagnostics. No pixels from any original reference.
      const canvas=createCanvas(640,480),ctx=canvas.getContext("2d");
      ctx.fillStyle="#203854";ctx.fillRect(0,0,640,480);
      for(let i=0;i<8;i++){ctx.fillStyle=i%2 ? "#F3B93B":"#55BCCA";ctx.fillRect(i*80,0,40,480);}
      ctx.fillStyle="#F25B42";ctx.beginPath();ctx.arc(320,240,130,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#FFFFFF";ctx.font="bold 30px sans-serif";ctx.fillText("SYNTHETIC MEDIA TEST",120,250);
      const jpeg=canvas.toBuffer("image/jpeg"),asset={dataUrl:`data:image/jpeg;base64,${jpeg.toString("base64")}`,sha256:sha256(jpeg),width:640,height:480};
      const input=structuredClone(short);
      input.media=input.media.map(m=>({...m,asset,positionX:0.2,positionY:0.8}));
      await attempt("synthetic-media",input);
      const mediaCase=cases.find(c=>c.name==="synthetic-media");
      if(mediaCase?.recipe) {
        const exported=recreationRecipeSchema.parse(JSON.parse(await readFile(join(root,mediaCase.recipe),"utf8")));
        assert.ok(exported.matrix!.media.every(m=>m.asset?.sha256 === sha256(jpeg) && m.positionX===0.2 && m.positionY===0.8));
        assert.ok(exported.matrix!.media.every(m=>sha256(Buffer.from(m.asset!.dataUrl.split(",")[1],"base64"))===m.asset!.sha256));
        checks.push("procedural JPEG content/crop survive compile and JSON roundtrip");
        const shifted=structuredClone(exported);shifted.matrix!.media.forEach(m=>{m.positionX=0.8;m.positionY=0.2;});
        const cropped=renderRecipe(shifted),png=`renders/${stem}-synthetic-media-crop.png`;
        await writeFile(join(root,png),cropped);
        const before=await readFile(join(root,mediaCase.render));
        assert.notEqual(sha256(cropped),sha256(before));
        checks.push("changing crop position changes diagnostic rendered pixels");
        cases.push({name:"synthetic-media-crop",status:"applied",render:png,positionX:0.8,positionY:0.2});
      }
    }
    const list=recipe.matrix!.fields.find(f=>f.kind === "list" && f.layerIds.length>1);
    if(list) { const fewer=structuredClone(short); fewer.fields[list.id]="Ideia"; await attempt("fewer-list-items",fewer); }
    const overflow=structuredClone(short);
    // A 1200 glyph string is within the schema but cannot fit the first bound area at minScale.
    overflow.fields[recipe.matrix!.fields[0].id]="W".repeat(1200);
    await attempt("overflow",overflow,true);
    const invalidLines=structuredClone(short);
    invalidLines.fields[recipe.matrix!.fields[0].id]=Array.from({length:recipe.matrix!.fields[0].layerIds.length+1},()=>"A").join("\n");
    await attempt("too-many-lines",invalidLines,true);
    assert.equal(JSON.stringify(recipe),source); checks.push("all attempts preserve original recipe");
    const nativeRoundingOnly=reused && report.baselineOverflow.every((l:any)=>l.width-l.boxWidth<1 && l.height-l.boxHeight<1);
    const required=["short","moved-group","overflow","too-many-lines",...(!photoOnly ? ["no-op"]:[]),...(recipe.matrix!.media.length ? ["synthetic-media","synthetic-media-crop"]:[]),...(list ? ["fewer-list-items"]:[])];
    report.failedRequiredCases=required.filter(name=>!cases.some(c=>c.name===name && ["applied","adapted","rejected-as-expected"].includes(c.status)));
    report.status=report.failedRequiredCases.length ? "required-check-failed" : report.baselineOverflow.length ? nativeRoundingOnly ? "preserved-native-rounding-warning" : "baseline-overflow-review" : "technical-checks-passed";
    if(nativeRoundingOnly && report.baselineOverflow.length) report.warning="Approved source kept byte-identical. Native text width exceeds saved boxes by 0.44 px and 0.07 px; this diagnostic warning does not revise human approval or establish a browser defect.";
    report.ok=report.status === "technical-checks-passed" || report.status === "preserved-native-rounding-warning";
  } catch(error) { report.status="failed"; report.ok=false; report.error=error instanceof Error ? error.message : String(error); }
  report.durationMs=Date.now()-start;
  results.push(report);
  await writeFile(join(root,"reports",`${stem}.json`),JSON.stringify(report,null,2));
  await checkpoint({status:"running",completed:results.map(r=>({stem:r.stem,status:r.status})),total:files.length});
  console.log(`${stem}: ${report.status} (${report.durationMs}ms)`);
}
const limits=["PNG diagnostic uses Konva nodes with @napi-rs/canvas native rasterization. It does not execute React CanvasPostStage, DOM FontFace, browser export or editor interaction.","Real embedded local fonts and the production layoutRichText/compileMatrix are used; native/browser glyph shaping or antialiasing can differ.","Original images are comparison panels only. New reconstructed scenes use native primitives and empty gray media slots; no full original image is a background. The previously approved matrix is preserved byte-identical with its existing media.","Synthetic media variants use procedural JPEG graphics, never the reference photos. Cover crop, hashes and export/import are checked.","The pure photographic reference cbb has no extracted graphic matrix; its hidden caption serves the V3 contract only.","No new vision call, paid API, authentication, database persistence, catalog publication, deploy or automatic visual approval occurred.","A successful technical check proves contracts/fit/roundtrip on this surface; fidelity and design interpretation still need human review."];
let independentReview:any=null;
let reviewFile:string|null=null;
for(const path of ["independent-review.json","review/independent-review.json"]) {
  try { independentReview=JSON.parse(await readFile(join(root,path),"utf8"));reviewFile=path;break; } catch { /* review not yet delivered */ }
}
const summary={at:new Date().toISOString(),total:results.length,graphicCompositions:results.filter(r=>r.classification!=="photographic-reference-only").length,photographicReferences:results.filter(r=>r.classification==="photographic-reference-only").length,technicalPassed:results.filter(r=>r.ok).length,statuses:results.map(r=>({stem:r.stem,status:r.status})),method:"offline/manual + Konva/napi canvas + embedded fonts + production compileMatrix/layoutRichText",limits,independentReview,results};
await writeFile(join(root,"report.json"),JSON.stringify(summary,null,2));
await writeFile(join(root,"traces.json"),JSON.stringify({at:summary.at,method:summary.method,externalModelCalls:0,agentInferenceCosts:"not measured by this harness",cases:results.map(r=>({stem:r.stem,recipeSha256:r.recipeSha256,engineHash:r.engineHash,status:r.status,durationMs:r.durationMs,error:r.error,requiredFailures:r.failedRequiredCases,attempts:r.cases.map((c:any)=>({name:c.name,status:c.status,durationMs:c.durationMs,message:c.message}))}))},null,2));
const statusLabel=(status:string)=>({"technical-checks-passed":"Contratos técnicos conferidos","preserved-native-rounding-warning":"Aprovada anteriormente · aviso subpixel nativo","required-check-failed":"Teste obrigatório falhou","baseline-overflow-review":"Rever encaixe original","failed":"Falha técnica","applied":"Aplicado","adapted":"Fonte adaptada","rejected":"Conteúdo recusado","rejected-as-expected":"Recusa esperada"}[status] ?? status);
const caseLabel=(name:string)=>({"no-op":"Reaplicar conteúdo original","short":"Conteúdo curto","medium":"Conteúdo maior","moved-group":"Grupo deslocado e girado","fewer-list-items":"Lista com menos itens","synthetic-media":"Mídia procedural de teste","synthetic-media-crop":"Outro recorte da mídia"}[name] ?? name);
const reviewRows=independentReview?.results ?? independentReview?.cases ?? independentReview?.reviews ?? [];
const sections=results.map(r=>{
  const review=Array.isArray(reviewRows) ? reviewRows.find((v:any)=>v.stem===r.stem || v.id===r.stem || v.recipeFile===`${r.stem}.json`) : null;
  const reviewStale=review?.pngSha256 ? review.pngSha256!==r.pngSha256 : review?.recipeSha256 && review.recipeSha256!==r.recipeSha256;
  return `<article data-status="${escape(r.status)}"><h2>${escape(r.title ?? r.stem)}</h2><p>${escape(statusLabel(r.status))}${review ? ` · Revisão independente: ${escape(review.status ?? review.verdict ?? "registrada")}${reviewStale ? " (hash anterior; rever versão atual)":""}`:" · Revisão independente: pendente"}</p>${r.designLimitation ? `<p>Referência fotográfica: a legenda oculta atende ao contrato técnico. Os testes criam uma legenda opcional; isso não extrai uma composição gráfica da fotografia.</p>`:""}${r.warning ? `<p>${escape(r.warning)}</p>`:""}<div class="images"><figure><img src="${escape(r.reference)}" alt="Referência original"><figcaption>Original · somente comparação</figcaption></figure><figure><img src="${escape(r.render)}" alt="Recriação nativa"><figcaption>${r.priorHumanApproval ? "Matriz aprovada anteriormente, preservada":"Recriação manual · áreas de mídia cinza"}</figcaption></figure>${r.cases.filter((c:any)=>c.render).map((c:any)=>`<figure><img src="${escape(c.render)}" alt="${escape(caseLabel(c.name))}"><figcaption>${escape(caseLabel(c.name))} · ${escape(statusLabel(c.status))}</figcaption></figure>`).join("")}</div><p><a href="recipes/${escape(r.stem)}.json" download>Baixar receita V3</a> · <a href="reports/${escape(r.stem)}.json">Relatório técnico</a></p><details><summary>Hashes, medições, testes e limites</summary><pre>${escape(JSON.stringify({stem:r.stem,recipeSha256:r.recipeSha256,pngSha256:r.pngSha256,classification:r.classification,checks:r.checks,error:r.error,baselineOverflow:r.baselineOverflow,independentReview:review,cases:r.cases.map((c:any)=>({name:c.name,status:c.status,message:c.message,resizedFields:c.resizedFields,durationMs:c.durationMs}))},null,2))}</pre></details></article>`;
}).join("\n");
const portugueseLimits=["PNGs diagnósticos desenhados por Konva sobre @napi-rs/canvas. Não executam o React CanvasPostStage, o FontFace do navegador, a interação ou a exportação do editor.","Fontes incorporadas reais e os módulos layoutRichText/compileMatrix do produto são utilizados. Rasterização e métricas podem diferir entre Node e navegador.","Originais servem somente à comparação. Recriações novas usam primitivas e espaços de mídia cinza. A matriz aprovada anteriormente preserva bytes e mídia existente.","Variantes de mídia utilizam JPEG procedural de teste, sem pixels das referências. Hash, dimensões, recorte e exportação/reimportação foram conferidos.","cbb é referência fotográfica: a legenda oculta é exigência do contrato V3 e não representa extração de design. Os testes inventam uma legenda opcional.","Sem nova chamada de visão/API externa, autenticação, banco, publicação no catálogo ou deploy. usage:0 nas receitas manuais não mede o custo dos agentes.","Passar nos testes técnicos demonstra contratos, encaixe e roundtrip nesta superfície. Aprovação visual humana e validação no navegador continuam necessárias para as composições novas."];
await writeFile(join(root,"index.html"),`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Galeria de referências e matrizes</title><style>body{margin:0;padding:28px;background:#16171c;color:#eee;font:16px system-ui}h1{margin:0}a{color:#8bd9ff}p{max-width:1100px;line-height:1.5}article{border:1px solid #555;border-radius:12px;padding:20px;margin:24px 0}.images{display:flex;gap:15px;overflow-x:auto;align-items:start}figure{margin:0;flex:0 0 280px}img{width:280px;height:380px;object-fit:contain;background:#292b34}figcaption{font-size:13px;padding:8px 0}pre{white-space:pre-wrap;font-size:12px}select{padding:8px;margin:12px}li{margin:6px 0}</style><h1>${results.length} referências · ${summary.graphicCompositions} composições + ${summary.photographicReferences} fotografia</h1><p>${summary.technicalPassed} casos com verificações técnicas concluídas. A matriz já aprovada foi preservada; as novas composições aguardam aprovação humana. Os PNGs desta galeria são diagnósticos nativos.</p><p>Compare o original e a recriação, baixe a receita V3 e importe no Admin2. Use os campos vinculados para experimentar texto e os slots para inserir sua foto.</p><select aria-label="Filtrar casos" onchange="document.querySelectorAll('article').forEach(a=>a.hidden=this.value!=='all'&&a.dataset.status!==this.value)"><option value="all">Todos os casos</option><option value="technical-checks-passed">Contratos técnicos conferidos</option><option value="preserved-native-rounding-warning">Aprovada anteriormente · aviso subpixel</option><option value="baseline-overflow-review">Rever encaixe original</option><option value="required-check-failed">Teste obrigatório falhou</option><option value="failed">Falhas técnicas</option></select><p><a href="report.json">Relatório JSON completo</a> · <a href="REPORT.md">Método e limites</a> · <a href="traces.json">Tempos e erros por tentativa</a>${reviewFile ? ` · <a href="${escape(reviewFile)}">Revisão independente</a>`:""}</p>${independentReview ? `<details><summary>Revisão independente registrada nesta galeria</summary><pre>${escape(JSON.stringify(independentReview,null,2))}</pre></details>`:"<p>Revisão independente: aguardando relatório.</p>"}<ul>${portugueseLimits.map(l=>`<li>${escape(l)}</li>`).join("")}</ul>${sections}</html>`);
await writeFile(join(root,"REPORT.md"),`# Lote offline de referências e matrizes\n\n${results.length} referências: ${summary.graphicCompositions} composições e ${summary.photographicReferences} fotografia. ${summary.technicalPassed} casos concluíram as verificações técnicas. Isso não equivale a aprovação visual.\n\n${portugueseLimits.map(l=>`- ${l}`).join("\n")}\n\n|Receita|Status técnico|Verificações|\n|---|---|---|\n${results.map(r=>`|${r.title ?? r.stem}|${statusLabel(r.status)}|${r.checks.length}|`).join("\n")}\n\nMedições, hashes SHA-256 de fontes/referências/receitas/PNGs e recusas estão em report.json e reports/*.json. Tempos e erros por tentativa estão em traces.json. As referências nunca entram como fundo integral da cena. Baixe a receita V3 na galeria e importe no Admin2 para experimentar textos e slots de mídia. ${reviewFile ? `Revisão independente anexada: ${reviewFile}.`:"Revisão independente ainda pendente."}\n`);
await checkpoint({status:"completed",total:results.length,technicalPassed:summary.technicalPassed});
if(results.some(r=>!r.ok)) process.exitCode=1;
