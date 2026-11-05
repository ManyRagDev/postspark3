import { arsenalHash } from '../../../shared/arsenalContent';
import type { ComponentDefinitionV1 } from '../../../shared/componentAssembly';
import type { ComponentPackage } from '../../../harness/componentArsenal/extract';
import type { VariableContent } from '../../../shared/variableContent';
import { sampleContent } from './nativeScene';

type Binding=ComponentDefinitionV1['fragment']['bindings'][number];
const comparisons:Record<string,string[]>={'R9-03':['field-4','field-5','field-7','field-8'],'CON-05':['field-6','field-7','field-11','field-12']};
const metrics:Record<string,string[]>={'R9-20':['field-3','field-1'],'CON-01':['field-15','field-13']};
/** Typed fields only where the reference has independently addressable regions. */
export function authorNativeSemantics(code:string,p:ComponentPackage,d:ComponentDefinitionV1) {
  if(!comparisons[code]&&!metrics[code]&&code!=='R9-21')return;
  const consumed=new Set<string>(), extra:VariableContent['blocks']=[], relation=d.completeDesign!.designGuidance!;
  const take=(field:string)=>{
    const unit=p.authorship.units.find(u=>u.fields.includes(field));
    const binding=d.fragment.bindings.find(b=>b.source===unit?.source);
    if(!unit||!binding)throw new Error(`missing_native_semantic_field:${code}:${field}`);
    consumed.add(unit.source);return {unit,binding};
  };
  if(comparisons[code]) {
    const [ll,lt,rl,rt]=comparisons[code].map(take);
    const fields=[[ll,'left.label'],[lt,'left.text'],[rl,'right.label'],[rt,'right.text']] as const;
    for(const [part,key]of fields){part.binding.source=`block:comparison:0:${key}`;part.binding.label=`Comparação · ${key}`;part.binding.required=key.endsWith('.text');}
    extra.push({id:'native-comparison',type:'comparison',left:{label:ll.unit.sampleText,text:lt.unit.sampleText},right:{label:rl.unit.sampleText,text:rt.unit.sampleText}});
    relation.fieldRelationships=[{kind:'contrast',sources:fields.map(([part])=>part.binding.source),label:'Duas regiões opostas da composição'}];
  }
  if(metrics[code]){
    const [value,label]=metrics[code].map(take);
    for(const [part,key]of [[value,'value'],[label,'label']] as const){part.binding.source=`block:metric:0:${key}`;part.binding.label=`Dado · ${key}`;part.binding.required=key==='value';}
    extra.push({id:'native-metric',type:'metric',value:value.unit.sampleText,label:label.unit.sampleText,sourceSpanIds:['showcase-example']});
  }
  if(code==='R9-21'){
    const items=['field-5','field-8','field-11'].map(take),markers=['field-4','field-7','field-10'].map(take);
    const targets=items.map(({binding})=>{if(binding.targetIds.length!==1)throw new Error('native_mosaic_item_not_independent');return binding.targetIds[0];});
    const first=items[0].binding, remove=new Set([...items.slice(1),...markers].map(x=>x.binding.id));
    d.fragment.bindings=d.fragment.bindings.filter(b=>!remove.has(b.id));
    Object.assign(first,{source:'block:list:0:items',kind:'list',label:'Etapas independentes',required:true,targetIds:targets,cardinality:{min:3,max:3},listMode:'native-slots'} satisfies Partial<Binding>);
    for(const {unit,binding} of markers)for(const id of binding.targetIds){const i=d.fragment.instances.find(i=>i.id===id)!;const piece={...d.pieces[i.pieceHash],fixedText:unit.sampleText,fixedTextRole:'ornament' as const};const h=arsenalHash(piece);d.pieces[h]=piece;i.pieceHash=h;}
    extra.push({id:'native-list',type:'list',items:items.map(({unit},i)=>({id:`item-${i}`,text:unit.sampleText}))});
    relation.fieldRelationships=[{kind:'independent_items',sources:[first.source],label:'Três linhas em cartões independentes'}];
  }
  const retained=p.authorship.units.filter(u=>!consumed.has(u.source));
  const ordinals=new Map<string,number>();
  for(const u of retained){const parts=u.source.split(':'),role=parts[1],i=ordinals.get(role)??0;ordinals.set(role,i+1);const old=u.source;u.source=`block:${role}:${i}:${parts[3]}` as typeof u.source;
    const binding=d.fragment.bindings.find(b=>b.source===old);if(binding)binding.source=u.source;
  }
  p.authorship.units=retained;
  const sample=sampleContent(p);p.authorship.nativeSample={...sample,blocks:[...sample.blocks,...extra]};
}
