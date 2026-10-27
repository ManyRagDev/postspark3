import { describe,it,expect,vi } from 'vitest';
import { materializeAssemblyPlan } from '../../shared/componentAssembly';
import { componentAssemblyFixture,componentAssemblyPlanFixture } from '../../shared/componentAssembly.fixture';
import { effectiveStudioPreferences,defaultStudioPreferences } from '../../shared/studioPreferences';
const state=vi.hoisted(()=>({owner:'',writes:[] as any[],run:null as any}));
vi.mock('../db',()=>({
 getGenerationRunById:vi.fn(async(_id:string,owner:string)=>{state.owner=owner;return state.run;}),
 getDb:()=>({from:(table:string)=>{expect(table).toBe('studio_preferences');return {upsert:async(value:unknown)=>{state.writes.push(value);return {error:null};}};}}),
}));
import { assemblyBrandPalette } from '../ai/assemblyBrandPalette';
import { preferDeliveredDirection } from './studioPreferences';
import { executeProposalWorkflow } from '../ai/workflows/proposalGraph';
import { completeDesignTestDefinitions } from '../../shared/completeDesignGeneration.fixture';
// These tests cover ownership/feedback for an already reviewed delivery.
vi.mock('../ai/workflows/proposalReview',()=>({reviewProposal:async()=>({policyVersion:1,round:'initial',inputHash:'a'.repeat(64),status:'passed',reviewedSlides:[0],findings:[],limitation:''})}));
describe('explicit studio preferences',()=>{
 it('accepts an owned complete design from a partial run by its slot rather than array position',async()=>{
  const owner='00000000-0000-4000-8000-000000000001',runId='00000000-0000-4000-8000-000000000002';
  const prefs={enabled:true,language:'graphic' as const,intensity:'expressive' as const};
  const result=await executeProposalWorkflow({requestId:runId,runId,proposalId:'p-1',slot:1,prompt:'Café',selectedDefinition:completeDesignTestDefinitions()[0],visualPreference:prefs},{actor:owner,measureText:()=>({height:20,lines:[{width:100}],runs:[]}),generateText:async()=>({choices:[{message:{content:JSON.stringify({caption:'Café',editorialPlan:{version:1,mode:'compose',centralMessage:'Apresentar café',facts:[{id:'cafe',sourceQuote:'Café',meaning:'Tema fornecido'}],protectedEntities:[],slides:[{slideIndex:0,purpose:'Apresentar café',factIds:['cafe']}]},hashtags:[],slides:[{values:[{fieldId:'field-0',value:'Café'},{fieldId:'field-1',value:'Hoje'}],mediaPrompts:[]}]})}}]}) as any});
  if(result.status!=='ready')throw new Error(result.errorReason);
  state.writes=[];
  state.run={status:'partial',output_snapshot:[{completeDesignV1:result.bundle}]};
  expect(await preferDeliveredDirection(owner,runId,1)).toEqual(prefs);
  expect(state.owner).toBe(owner);
  expect(state.writes[0].owner_id).toBe(owner);
  state.run=null;state.writes=[];
 });
 it('preserves fresh style instructions and rejects feedback without an owned completed delivery',async()=>{
  const prefs={enabled:true,language:'organic' as const,intensity:'expressive' as const};
  expect(effectiveStudioPreferences(prefs,'Explique compostagem')).toEqual(prefs);
  expect(effectiveStudioPreferences(prefs,'Use um visual minimalista')).toEqual(defaultStudioPreferences);
  expect(effectiveStudioPreferences(prefs,'Use a família glass')).toEqual(defaultStudioPreferences);
  expect(effectiveStudioPreferences(prefs,'Quero uma arte gráfica contida')).toEqual(defaultStudioPreferences);
  expect(assemblyBrandPalette({brandColors:['#123','#ff7700'],adaptationMode:'strict'})).toEqual({background:'#112233',text:'#FFFFFF',accent:'#FF7700'});
  expect(assemblyBrandPalette({brandColors:['#123'],adaptationMode:'adaptive'})).toEqual({background:'#FFFFFF',text:'#000000',accent:'#112233'});

  await expect(preferDeliveredDirection('owner-b','run-a',0)).rejects.toThrow('Direção entregue');
  expect(state.owner).toBe('owner-b');expect(state.writes).toEqual([]);
  state.run={status:'completed',output_snapshot:[{componentAssemblyV1:{runId:'run-a',slot:0}}]};
  await expect(preferDeliveredDirection('owner-b','run-a',0)).rejects.toThrow('Direção entregue');
  expect(state.writes).toEqual([]);
  const runId='a20b3bc0-2c41-4080-8b29-fb257b61b7a0',plan=componentAssemblyPlanFixture(2);
  plan.variations[0].direction.intent={language:'graphic',hierarchy:'headline',recurringComponentIds:[],mediaRole:'subject',rhythm:plan.variations[0].slides.map((s,i)=>({slideId:s.id,density:s.density,emphasis:i===0?'hero':'closing'}))};
  const bundle=materializeAssemblyPlan(plan,componentAssemblyFixture(),{traceId:runId,runId,experimental:true});
  state.run={status:'completed',output_snapshot:bundle.variations.map(v=>({componentAssemblyV1:v}))};
  expect(await preferDeliveredDirection('owner-b',runId,0)).toEqual({enabled:true,language:'graphic',intensity:'expressive'});
  expect(state.writes[0].owner_id).toBe('owner-b');
 });
});
