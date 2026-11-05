import { describe,it,expect } from 'vitest';
import { neutralSourceText, requestedIntentAffinity, familyDistance, familyTie } from '@shared/familyNeutrality';
import { compactComponentCard,createComponentDefinition,assemblyIdentity } from '@shared/componentAssembly';
import { completeDesignTestDefinitions } from '@shared/completeDesignGeneration.fixture';
import { buildFamilySelectionCandidates, familyAssessmentProfile } from '@shared/designFamilySelection';
import { resolveDesignFamilyRepertoires } from '@shared/designRepertoire';
import { retrieveFamilyCandidates } from './familyRetrieval';
import { authorFamilyCarouselVariant } from './familyCarouselRepertoire';
import { repertoireMeetsMedia } from '@shared/generationPlan';
import { searchDocuments,buildSearchIndex } from './familySearchIndex';
import type { GenerationIntent } from '@shared/generationPlan';

const source=completeDesignTestDefinitions()[0];
const cards=Array.from({length:82},(_,i)=>compactComponentCard(createComponentDefinition({...source,id:assemblyIdentity(['neutral',i]),completeDesign:{...source.completeDesign!,family:`entry-${i}`}})));
const families=(c:typeof cards)=>buildFamilySelectionCandidates(resolveDesignFamilyRepertoires(c,{slideCount:1,contentMode:'compose'}),null,true);
const intent:GenerationIntent={version:1,objective:'Apresente uma mensagem breve',tone:{description:'claro',origin:'explicit',rationale:'pedido'},adaptation:'controlled',requirements:[],content:[{id:'idea',meaning:'mensagem',requirementIds:[],sourceIds:[]}],editorial:{version:1,signals:[]}};
const engine:any={metadata:{fingerprint:'a'.repeat(64),dimensions:384},embed:async(texts:string[])=>({vectors:texts.map(()=>Array.from({length:384},(_,i)=>i?0:1)),inputs:texts.map(()=>({tokenCount:1,usedTokens:1,truncated:false}))})};
describe('family neutrality policy',()=>{
 it('ignores aliases, praise, free tags, font counts and spare text capacity in the canonical search document',()=>{
  const root=cards[0], changed={...root,label:'Premium superior melhor dez vezes',description:'Mais assets e mais fontes',fontFamilies:['A','B','C'],fields:[...root.fields,...root.fields.map(f=>({...f,source:`extra-${f.source}`}))],visualTraits:{version:1 as const,sourceKey:'free',languages:['graphic' as const],treatments:['premium','luxury','photo']}};
  expect(neutralSourceText(changed,null)).toBe(neutralSourceText(root,null));
 });
 it('normalizes editorial affinity by the request and gives unrelated annotations no advantage',()=>{
  const requested=new Set(['compare']),suggested=new Set(['explain']);
  expect(requestedIntentAffinity(['compare'],requested,suggested)).toBe(.8);
  expect(requestedIntentAffinity(['compare','compare','unrelated','other'],requested,suggested)).toBe(.8);
  expect(requestedIntentAffinity(['compare','explain'],requested,suggested)).toBe(1);
 });
 it('uses one categorical value per diversity axis and stable family ties',()=>{
  const a={organization:'single',density:'sparse',typography:'serif',imageRole:'none'};
  expect(familyDistance(a,{...a,typography:'sans'})).toBe(.25);
  expect(familyTie('same-request','same-family')).toBe(familyTie('same-request','same-family'));
 });
 it('withholds spare text, media, page and variant capacity from the judge',()=>{
  const neutral=families(cards)[0].profile;
  const inflated=structuredClone(neutral);
  inflated.structure.textBlocks.max+=12;
  inflated.availability.functions.push('unused_variant');
  inflated.availability.roles.push('extra_pages');
  expect(familyAssessmentProfile(inflated)).toEqual(familyAssessmentProfile(neutral));
 });
 it('retains one candidacy after duplicating and reordering child definitions',async()=>{
  const development=compactComponentCard(authorFamilyCarouselVariant(source,'development','compose','reading'));
  const closing=compactComponentCard(authorFamilyCarouselVariant(source,'closing','compose','synthesis'));
  const root=compactComponentCard(source);
  const materialize=(items:typeof cards)=>buildFamilySelectionCandidates(resolveDesignFamilyRepertoires(items,{slideCount:3,contentMode:'compose'}),null,true);
  const duplicate={...development,id:assemblyIdentity([development.id,'equivalent-variant']),hash:familyTie('equivalent-variant',development.hash)};
  const first=materialize([root,development,closing]),second=materialize([closing,duplicate,development,root]);
  expect(first).toHaveLength(1);expect(second).toHaveLength(1);
  expect(familyAssessmentProfile(first[0].profile)).toEqual(familyAssessmentProfile(second[0].profile));
  const needed={policy:'required' as const,required:true,purpose:'editorial-photo' as const,reason:'Photograph requested',slotTargets:1};
  const plain=first[0].repertoires[0];
  expect(repertoireMeetsMedia(plain,needed)).toBe(false);
  const photographic=structuredClone(plain);
  photographic.slides[0].variants[0].mediaSlots=[{id:'photo',label:'Foto',function:'primary',prompt:'Foto',deferred:true}];
  expect(repertoireMeetsMedia(photographic,needed)).toBe(true);
 });
 it('retains exactly the same family order when irrelevant metadata, capacities and card order change',async()=>{
  const index=await buildSearchIndex(searchDocuments(cards,null,2),engine);
  const a=await retrieveFamilyCandidates({families:families(cards),intent,catalog:null,neutrality:{version:1,seed:'fixed'},semantic:{engine,index}});
  const changed=cards.map(c=>({...c,label:'Mais assets e variantes',description:'melhor',fields:[...c.fields,...c.fields.map(f=>({...f,source:`extra-${f.source}`}))]})).reverse();
  const b=await retrieveFamilyCandidates({families:families(changed),intent,catalog:null,neutrality:{version:1,seed:'fixed'},semantic:{engine,index}});
  const order=(r:typeof a,f:ReturnType<typeof families>)=>[...r.initialIds,...r.additionalIds].map(id=>f.find(x=>x.id===id)!.family);
  expect(order(a,families(cards))).toEqual(order(b,families(changed)));
  expect(a.initialIds).toHaveLength(24);expect(a.additionalIds).toHaveLength(12);
 });
});
