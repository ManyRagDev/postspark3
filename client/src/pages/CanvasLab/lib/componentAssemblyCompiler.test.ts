import {beforeAll,afterAll,describe,expect,it,vi} from 'vitest';
import {createCanvas} from '@napi-rs/canvas';
import {arsenalHash} from '@shared/arsenalContent';
import type {AssemblyVariationBundleV1} from '@shared/componentAssembly';
import {readArsenalComposition} from '@shared/designArsenal';
import {createArsenalFixtureComposition} from './arsenalFixture';
import {compileComponentAssembly} from './arsenalGenerationCompiler';
import {materializeCatalogVariations} from '../../StudioApp/lib/studioGeneration';
import {normalizeCanvasModel} from './saveAdapter';
vi.mock('./arsenalAssets',()=>({ensureArsenalFont:vi.fn(async()=>{}),ensureArsenalCompositionFonts:vi.fn(async()=>{})}));
const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
beforeAll(()=>Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>createCanvas(20,20)}}));
afterAll(()=>{if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');});
function bundle(count:number):AssemblyVariationBundleV1 {
  const c=createArsenalFixtureComposition();
  const mediaId=c.elements.find(e=>e.kind==='media')!.id;
  const base={...c.base,mediaSlots:[{id:mediaId,label:'Foto principal',function:'exemplo',prompt:'Objeto sobre mesa',deferred:true,policy:'cover' as const}]};
  // The historical fixture has a white CTA on yellow; this candidate explicitly fixes that contrast.
  const cta=base.instances.find(i=>i.id==='cta-texto')!;
  const piece={...c.pieces[cta.pieceHash],fill:'#111111'};
  const pieceHash=arsenalHash(piece);
  c.pieces={...c.pieces,[pieceHash]:piece};
  base.instances=base.instances.map(i=>i.id===cta.id?{...i,pieceHash}:i);
  const traceId=crypto.randomUUID(),runId=crypto.randomUUID(),planHash=arsenalHash({count});
  const componentAssembly={version:1 as const,planHash,componentIds:[crypto.randomUUID()],componentHashes:[arsenalHash({pieces:c.pieces,variant:base})],sourceHashes:[c.origin.variantHash],experimental:true};
  return {schemaVersion:1,traceId,runId,slot:0,planHash,direction:{label:'Papel e janela',palette:{background:'#FAFAFA',text:'#111111',accent:'#FF6600'},typographyComponentId:null},caption:'Legenda da sequência',hashtags:['design'],slides:Array.from({length:count},(_,index)=>({
    id:`slide-${index+1}`,role:count===1?'static':index===0?'cover':index===count-1?'closing':'development',density:index===0?'expressive':'quiet',
    bundle:{schemaVersion:2,traceId,runId,slot:0,content:c.content,userContentHash:c.userContentHash,targetAspectRatio:base.aspectRatio,selection:'llm',candidates:[{...c.origin,componentAssembly,variant:base,variantHash:arsenalHash(base)}],pieces:c.pieces,assets:c.assets},
  }))};
}
describe('component assembly compilation and replay',()=>{
  it.each([2,5,10])('preserves every pinned slide for %i-slide carousels and caption after reopening',async count=>{
    const input=bundle(count);const result=await compileComponentAssembly(input,{deadline:performance.now()+15000,assetDeadline:performance.now()+8000});
    expect(result.slides.map(s=>s.id)).toEqual(input.slides.map(s=>s.id));
    expect(result.slides.map(s=>s.assemblyRole)).toEqual(input.slides.map(s=>s.role));
    expect(result.slides.map(s=>s.assemblyDensity)).toEqual(input.slides.map(s=>s.density));
    expect(result.caption).toBe(input.caption);expect(result.hashtags).toEqual(input.hashtags);
    expect(result.componentCompilationReports).toHaveLength(count);
    expect(result.componentCompilationReports!.every(({report}) => report.status === "applied" || report.status === "adapted"), JSON.stringify(result.componentCompilationReports)).toBe(true);
    expect(result.slides.every(s => s.composition!.elements.some(e => e.mediaSlot?.deferred))).toBe(true);
    for(const slide of result.slides)expect(readArsenalComposition(slide.composition).userContentHash).toBe(input.slides[0].bundle.userContentHash);
    const reopened=normalizeCanvasModel(JSON.parse(JSON.stringify(result)));
    expect(reopened.slides.map(s=>s.composition)).toEqual(result.slides.map(s=>s.composition));
    expect(reopened.componentAssembly).toEqual(result.componentAssembly);
    expect(reopened.componentCompilationReports).toEqual(result.componentCompilationReports);
  });
  it('uses the pinned component bundle through the common Studio adapter and reports once',async()=>{
    const input=bundle(2);const report=vi.fn();
    const posts=await materializeCatalogVariations([{componentAssemblyV1:input,headline:'projection only',imagePrompt:'Direção geral'}],'briefing',undefined,0,report);
    expect(posts[0].slides).toHaveLength(2);expect(posts[0].imagePrompt).toBe('Direção geral');
    expect(report).toHaveBeenCalledTimes(1);expect(report.mock.calls[0][1]).toBe(input.slot);
    expect(posts[0].slides[0].composition).toBeTruthy();
  });
});

it('preserves a complete scene when a client deadline would otherwise replace it with editorial fallback',async()=>{
  const input=bundle(1),candidate=input.slides[0].bundle.candidates[0];
  candidate.componentAssembly!.completeDesign={family:'calibrated-test',baselineVerified:true};
  const result=await compileComponentAssembly(input,{deadline:performance.now()-1,assetDeadline:performance.now()-1});
  const composition=readArsenalComposition(result.slides[0].composition);
  expect(composition.origin.candidateId).toBe(candidate.candidateId);
  expect(composition.origin.componentAssembly?.completeDesign?.family).toBe('calibrated-test');
  expect(composition.userContentHash).toBe(input.slides[0].bundle.userContentHash);
  expect(result.componentCompilationReports![0].report.status).toBe('needs_adjustment');
  expect(composition.issues).toContain('deadline');
  expect(normalizeCanvasModel(JSON.parse(JSON.stringify(result))).slides[0].composition?.origin.componentAssembly?.completeDesign?.family).toBe('calibrated-test');
});
