import {describe,it,expect} from 'vitest';
import {componentAssemblyFixture} from './componentAssembly.fixture';
import {createComponentDefinition,materializeAssemblySlide,type AssemblyPlanV1} from './componentAssembly';
import {validateCompleteDesignSelection} from './completeDesigns';
const whole=()=>createComponentDefinition({...componentAssemblyFixture()[0],completeDesign:{family:'paper',baselineVerified:true}});
function plan():AssemblyPlanV1{
 const c=whole();
 return {schemaVersion:1,postMode:'carousel',aspectRatio:'4:5',variations:[0,1,2].map(slot=>({id:`v${slot}`,direction:{label:'Paper',palette:{background:'#AB1234',text:'#345678',accent:'#123ABC'},typographyComponentId:null},caption:'',hashtags:[],slides:[0,1].map(index=>({id:`s${index}`,role:index===0?'cover':'closing',density:'balanced',content:{schemaVersion:3,blocks:[{id:'title',type:'text',role:'headline',text:'Uma ideia clara'}],caption:'',hashtags:[]},components:[{id:c.id,hash:c.hash}],mediaPrompts:[]}))}))};
}
describe('finite whole design selection',()=>{
 it('rejects a donor, an independent fragment and a geometry override',()=>{
  const p=plan(),c=whole(),donor=createComponentDefinition({...componentAssemblyFixture()[0],id:crypto.randomUUID(),kind:'typography'});
  p.variations[0].direction.typographyComponentId=donor.id;
  p.variations[0].slides[0].components.push({id:donor.id,hash:donor.hash});
  p.variations[0].slides[1].components[0].placement={x:0,y:0,width:.5,height:.5};
  expect(validateCompleteDesignSelection(p,[c,donor])).toEqual(expect.arrayContaining(['complete_design_typography_donor:0','complete_design_required:0/0','complete_design_native_geometry:0/1']));
  expect(()=>materializeAssemblySlide(p,0,0,[c,donor],{runId:'test',traceId:'test'})).toThrow('complete_design_must_remain_whole');
 });
 it('requires the same curated family throughout a carousel',()=>{
  const c=whole(),other=createComponentDefinition({...c,id:crypto.randomUUID(),completeDesign:{family:'other'}}),p=plan();
  p.variations[1].slides[1].components=[{id:other.id,hash:other.hash}];
  expect(validateCompleteDesignSelection(p,[c,other])).toContain('complete_design_carousel_family:1');
 });
 it('pins the complete identity and preserves colors/fonts even if a direction requests replacements',()=>{
  const c=whole(),p=plan();
  const bundle=materializeAssemblySlide(p,0,0,[c],{runId:'test',traceId:'test',brandPalette:p.variations[0].direction.palette,brandFonts:{heading:'Arial'}});
  expect(bundle.candidates[0].componentAssembly?.completeDesign).toEqual(c.completeDesign);
  expect(bundle.candidates[0].variant.artboard.background).toBe(c.fragment.artboard.background);
  const source=Object.values(c.pieces).filter(p=>p.kind==='text').map(p=>[p.fill,p.fontFamily,p.fontWeight]);
  const rendered=Object.values(bundle.pieces).filter(p=>p.kind==='text').map(p=>[p.fill,p.fontFamily,p.fontWeight]);
  expect(rendered).toEqual(source);
 });
});
