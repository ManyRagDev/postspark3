import { beforeEach, describe, expect, it, vi } from 'vitest';
import { componentAssemblyFixture } from '../../shared/componentAssembly.fixture';
import { compactComponentCard } from '../../shared/componentAssembly';
const state=vi.hoisted(()=>({calls:[] as any[],wrongHash:false,fromCalls:0,prepared:[] as any[],rows:null as null|{ranked:any[];quiet:any[]},roleRows:null as null|Record<string,{ranked:any[];quiet:any[]}>}));
vi.mock('../db',()=>({getDb:()=>({from:(table:string)=>{
 if(table!=='design_component_search_documents')throw new Error(`unexpected table hydration: ${table}`);
 state.fromCalls++;
 let selected='';
 const query={select:(columns:string)=>{selected=columns;if(!['component_id,definition_hash,visual_traits','component_id,definition_hash,card,design_components!inner(status,source_key)'].includes(columns))throw new Error(`unexpected metadata columns: ${columns}`);return query;},in:(column:string)=>{if(!['component_id','design_components.status'].includes(column))throw new Error(`unexpected metadata filter: ${column}`);return query;},eq:()=>query,contains:()=>query,order:()=>query,limit:(n:number)=>{expect(n).toBe(5);return query;},abortSignal:async()=>({error:null,data:selected.includes('!inner')?state.prepared:[]})};
 return query;
 },rpc:(name:string,args:any)=>{state.calls.push({name,args});const definition=componentAssemblyFixture()[0],card=compactComponentCard(definition),roleRows=state.roleRows?.[args.p_roles[0]];return {abortSignal:async()=>({error:null,data:args.p_kind==='content'?(roleRows?(args.p_density==='quiet'?roleRows.quiet:roleRows.ranked):state.rows?(args.p_density==='quiet'?state.rows.quiet:state.rows.ranked):[{component_id:definition.id,definition_hash:state.wrongHash?'f'.repeat(64):definition.hash,card}]):[]})};}})}));
import { componentQueryDescriptor, retrieveComponentCardsForGeneration, describeComponent } from './componentStore';
const input={aspectRatio:'4:5',postMode:'carousel' as const,text:'Compare os dois métodos e apresente uma lista de dicas para praticar',slideCount:5,experimental:true};
beforeEach(()=>{state.calls=[];state.wrongHash=false;state.fromCalls=0;state.prepared=[];state.rows=null;state.roleRows=null;});
describe('exact component retrieval by slide function',()=>{
 it('uses normalized48-dimensional geometry and changes desired density by role',()=>{
  const cover=componentQueryDescriptor(input,'content','cover'),closing=componentQueryDescriptor(input,'content','closing');
  expect(cover.structure).toHaveLength(48);
  expect(cover.structure.every(n=>Number.isFinite(n)&&n>=0&&n<=1)).toBe(true);
  expect(cover.structure).not.toEqual(closing.structure);
  expect(componentQueryDescriptor({...input,text:'Crie algo expressivo e ousado'},'content','cover').basis.expressive).toBe(true);
  expect(componentQueryDescriptor({...input,text:'Expressivo, mas minimalista e sóbrio'},'content','cover').basis.expressive).toBe(false);
  expect(componentQueryDescriptor({...input,text:'Conteúdo já interpretado',styleText:'Visual ousado e vibrante'},'content','cover').basis.expressive).toBe(true);
  expect(describeComponent(componentAssemblyFixture()[0]).structure).toHaveLength(48);
 });
 it('limits each role to five, deduplicates offers and hydrates no unused definitions',async()=>{
  const cards=await retrieveComponentCardsForGeneration(input);
  expect(cards).toHaveLength(1);expect(state.fromCalls).toBe(2);
  const content=state.calls.filter(c=>c.args.p_kind==='content');
  expect(content.map(c=>`${c.args.p_roles[0]}:${c.args.p_density??'ranked'}`).sort()).toEqual(['cover:ranked','cover:expressive','cover:quiet','development:ranked','development:expressive','closing:ranked','closing:expressive','list:ranked','comparison:ranked','example:ranked','example:expressive'].sort());
  expect(content.filter(c=>c.args.p_density==='quiet').map(c=>c.args.p_roles[0])).toEqual(['cover']);
  expect(state.calls.every(c=>c.name==='design_component_search_v4'&&c.args.p_limit===5&&c.args.p_aspect==='4:5')).toBe(true);
 });
 it('reserves at most one quiet origin and prefers diverse sources within five static offers',async()=>{
  const base=compactComponentCard(componentAssemblyFixture()[0]);
  const row=(n:number,source:string,quiet:boolean)=>{
    const id=`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=String(n).repeat(64).slice(0,64);
    return {component_id:id,definition_hash:hash,source_key:source,card:{...base,id,hash,densities:[quiet?'quiet':'balanced']}};
  };
  const expressive=row(2,'window',false);expressive.card.densities=['expressive'];
  state.rows={ranked:[row(1,'paper',false),expressive,row(3,'type',false),row(4,'glass',false),row(5,'classic',false)],
    quiet:[row(6,'paper',true),row(7,'window',true),row(8,'other',true)]};
  const cards=await retrieveComponentCardsForGeneration({...input,postMode:'static',slideCount:1,text:'Crie um visual minimalista'});
  expect(cards).toHaveLength(5);
  expect(cards.filter(c=>c.densities.includes('quiet'))).toHaveLength(1);
  expect(cards.map(c=>c.id)).toEqual([1,2,3,4,8].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`));
  state.fromCalls=0;
  const authored=await retrieveComponentCardsForGeneration({...input,postMode:'static',slideCount:1,text:'Crie um post sobre café'});
  expect(authored[0].id).toBe(expressive.component_id);
  expect(state.fromCalls).toBe(2);
 });
 it('preserves repeated-source cards when they provide different authored slide roles',async()=>{
  const base=compactComponentCard(componentAssemblyFixture()[0]);
  const row=(n:number,source:string,density:'quiet'|'balanced',role:'cover'|'development'|'closing')=>{
    const id=`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=String(n).repeat(64).slice(0,64);
    return {component_id:id,definition_hash:hash,source_key:source,card:{...base,id,hash,roles:[role],densities:[density]}};
  };
  state.roleRows={
    cover:{ranked:[row(1,'paper','balanced','cover')],quiet:[row(2,'paper','quiet','cover')]},
    development:{ranked:[row(5,'paper','quiet','development'),row(6,'dev-two','quiet','development'),row(7,'dev-three','quiet','development')],quiet:[]},
    closing:{ranked:[row(3,'paper','quiet','closing'),row(4,'closing-two','quiet','closing'),row(8,'closing-three','quiet','closing')],quiet:[]},
    example:{ranked:[],quiet:[]},
  };
  const cards=await retrieveComponentCardsForGeneration(input);
  const retained=new Map(cards.map(card=>[card.id,card]));
  expect([...retained.keys()]).toEqual(expect.arrayContaining([1,3,4,5,6,7,8].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`)));
  expect(retained.get('00000000-0000-4000-8000-000000000003')?.roles).toEqual(['closing']);
  expect(retained.get('00000000-0000-4000-8000-000000000005')?.roles).toEqual(['development']);
 });
 it('filters the typography shortlist by verified brand family before offering cards',async()=>{
  await retrieveComponentCardsForGeneration({...input,brandFonts:['Inter']});
  expect(state.calls.find(c=>c.args.p_kind==='typography').args.p_fonts).toEqual(['Inter']);
  expect(state.calls.filter(c=>c.args.p_kind!=='typography').every(c=>c.args.p_fonts===null)).toBe(true);
 });

 it('offers prepared assembly covers within the same five-card budget while retaining a quiet alternative',async()=>{
  const base=compactComponentCard(componentAssemblyFixture()[0]);
  const row=(n:number)=>{const id=`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=String(n).repeat(64).slice(0,64);return {component_id:id,definition_hash:hash,source_key:`source-${n}`,card:{...base,id,hash,densities:['expressive']}};};
  state.rows={ranked:[1,2,3,4,5].map(row),quiet:[{...row(9),card:{...row(9).card,densities:['quiet']}}]};
  state.prepared=[6,7,8].map(n=>({...row(n),design_components:{source_key:`source-${n}`}}));
  const cards=await retrieveComponentCardsForGeneration({...input,postMode:'static',text:'Um post sobre café'});
  expect(cards.map(c=>c.id)).toEqual([6,7,8,1,9].map(n=>row(n).component_id));
  state.fromCalls=0;
  await retrieveComponentCardsForGeneration({...input,postMode:'static',text:'Minimalista e sóbrio'});
  expect(state.fromCalls).toBe(1);
 });
 it('rejects stale index hashes before presenting any offer to the model',async()=>{
  state.wrongHash=true;await expect(retrieveComponentCardsForGeneration(input)).rejects.toThrow('Índice de componentes divergente');
 });
});
