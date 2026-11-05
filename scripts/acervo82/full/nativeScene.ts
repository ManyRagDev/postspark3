import { assemblyIdentity, materializeAssemblySlide, compositionFromAssemblyBundle, type AssemblyPlanV1, type ComponentDefinitionV1 } from '../../../shared/componentAssembly';
import type { ComponentPackage } from '../../../harness/componentArsenal/extract';
import { resolveArsenalGeometry, type ArsenalTextMeasurer } from '../../../shared/arsenalGeometry';
import type { VariableContent } from '../../../shared/variableContent';
import { readArsenalComposition } from '../../../shared/designArsenal';

export function sampleContent(p:ComponentPackage):VariableContent {
  return p.authorship.nativeSample ?? {
    schemaVersion:3,
    blocks:p.authorship.units.map((u,i) => u.kind==='list'
      ? {id:`sample-${i}`,type:'list',items:(u.sampleItems??[]).map((text,index)=>({id:`item-${index}`,text}))}
      : {id:`sample-${i}`,type:'text',role:u.role,text:u.sampleText}),
    caption:'Amostra técnica de autoria. Os textos originais são exemplos, sem valor factual.',hashtags:[],
  };
}
export function nativeScene(p:ComponentPackage,definition:ComponentDefinitionV1,measure:ArsenalTextMeasurer,content=sampleContent(p),allowReduction=false) {
  const role=definition.completeDesign?.designGuidance?.carouselVariant?.role??'static';
  const plan:AssemblyPlanV1={schemaVersion:1,postMode:'static',aspectRatio:'4:5',variations:[{
    id:'local-review',direction:{label:definition.label,palette:{background:definition.fragment.artboard.background,text:'#111111',accent:'#5740B4'},typographyComponentId:null},
    caption:content.caption,hashtags:content.hashtags,slides:[{id:'local-slide',role,density:definition.densities[0],content,components:[{id:definition.id,hash:definition.hash}],mediaPrompts:[]}],
  }]};
  const bundle=materializeAssemblySlide(plan,0,0,[definition],{traceId:assemblyIdentity([definition.id,'review-trace']),runId:assemblyIdentity([definition.id,'review-run']),experimental:true});
  return readArsenalComposition(resolveArsenalGeometry(compositionFromAssemblyBundle(bundle),{measureText:measure,allowReduction}));
}
