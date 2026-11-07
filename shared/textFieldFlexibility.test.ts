import {describe,it,expect}from'vitest';
import {compactTextFieldFlexibility,textFontFlexibility,largestFittingTextFont}from'./textFieldFlexibility';
import {completeDesignTestDefinitions}from'./completeDesignGeneration.fixture';
import {completeDesignFields,instantiateCompleteDesign}from'./completeDesignGeneration';
import {createComponentDefinition}from'./componentAssembly';
import {arsenalHash}from'./arsenalContent';
import {readArsenalComposition,arsenalRelationSchema}from'./designArsenal';
import {resolveArsenalGeometry,type ArsenalTextMeasurer}from'./arsenalGeometry';
const measure:ArsenalTextMeasurer=input=>{const natural=input.text.length*(input.fontSize*.55+(input.letterSpacing??0)),count=Math.max(1,Math.ceil((natural-1e-8)/input.width));return{height:count*input.fontSize*(input.lineHeight??1),lines:Array.from({length:count},(_,i)=>({width:Math.min(input.width,Math.max(0,natural-i*input.width))})),runs:[]};};
function fixture(){const d=completeDesignTestDefinitions()[0],instance=d.fragment.instances.find(i=>i.id==='support')!;const piece={...d.pieces[instance.pieceHash],fontSize:68.39050131926122,lineHeight:1,letterSpacing:6.839050131926122};instance.pieceHash=arsenalHash(piece);d.pieces[instance.pieceHash]=piece;instance.width=736.9668601583114;instance.height=68.39050131926122;d.fragment.relations=[{id:'fit-support',version:1,enabled:true,kind:'textFit',inputs:[],outputs:[{targetId:'support',properties:['x','width','height','fontSize']}],parameters:{anchor:'left',maxWidth:instance.width,maxHeight:instance.height+2,minFontSize:44.453825857519796}}];return createComponentDefinition(d);}
function scene(text='Tarefas repetitivas drenam sua energia.'){const definition=fixture();return instantiateCompleteDesign({definition,values:[{fieldId:'field-0',value:'NEXO'},{fieldId:'field-1',value:text}],mediaPrompts:[],runId:'11111111-1111-4111-8111-111111111111',slot:0,slide:0,planHash:'a'.repeat(64),experimental:true});}
const body=(c:ReturnType<typeof scene>)=>c.elements.find(e=>e.id==='support')!;
const solve=(c:ReturnType<typeof scene>,version?:1)=>resolveArsenalGeometry(c,{measureText:measure,allowReduction:true,adaptiveTextFit:true,textFlexibilityVersion:version});
describe('opt-in local text flexibility',()=>{
 it('derives half-size display range while preserving small authored minima and group scale',()=>{
  expect(textFontFlexibility({preferredFontSize:68.39,authoredMinFontSize:44.45,artboardWidth:1080})).toEqual({min:34.195,preferred:68.39,max:68.39});
  expect(textFontFlexibility({preferredFontSize:34.2,authoredMinFontSize:22.23,artboardWidth:1080}).min).toBe(22.23);
  expect(textFontFlexibility({preferredFontSize:68.39,authoredMinFontSize:44.45,artboardWidth:1080,worldScale:.5}).min).toBe(44.45);
 });
 it('uses the largest measured fit inside the interval and reports an impossible minimum',()=>{
  expect(largestFittingTextFont({min:20,preferred:40,max:40},font=>font<=31.256).fontSize).toBeCloseTo(31.256,5);
  expect(largestFittingTextFont({min:20,preferred:40,max:40},()=>false)).toEqual({fontSize:20,fits:false});
 });
 it('fits two lines at half display size without changing copy or boxes; historical policy still fails',()=>{
  const input=scene(),legacy=solve(input),fresh=solve(input,1);
  expect(body(legacy).fontSize).toBeCloseTo(44.4538,3);
  expect(legacy.issues.some(issue=>issue==='overflow:support')).toBe(true);
  expect(body(fresh).fontSize).toBeCloseTo(34.19525,5);
  expect(fresh.issues.filter(issue=>issue.startsWith('overflow'))).toEqual([]);
  expect(body(fresh)).toMatchObject({x:body(legacy).x,y:body(legacy).y,width:body(legacy).width,text:body(legacy).text});
  expect(fresh.base).toEqual(input.base);expect(fresh.content).toEqual(input.content);expect(fresh.pieces).toEqual(input.pieces);
  const stored=readArsenalComposition(JSON.parse(JSON.stringify(fresh)));
  expect(resolveArsenalGeometry(stored,{measureText:measure,allowReduction:false}).elements).toEqual(fresh.elements);
  expect(solve(stored,1).elements).toEqual(fresh.elements);
 });
 it('restores short text up to its authored preferred size, never beyond by default',()=>{
  const source=scene('Nexo'),fresh=solve(source,1);expect(body(fresh).fontSize).toBeCloseTo(68.390501,5);
  expect(fresh.overrides.support.fontSize).toBe(body(fresh).fontSize);
 });
 it('retains manual font and geometry overrides, rotation, rich text and all unrelated style',()=>{
  const source=scene('Texto breve');source.overrides.support={fontSize:31,width:700,rotation:15};
  source.richText.support=[{text:'Texto ',bold:true},{text:'breve',color:'#FF0000'}];
  const fresh=solve(source,1);expect(fresh.overrides.support).toEqual(source.overrides.support);
  expect(body(fresh)).toMatchObject({fontSize:31,width:700,rotation:15});expect(fresh.richText).toEqual(source.richText);
 });
 it('honors an explicit author range, including a declared larger maximum',()=>{
  const source=scene('Nexo');if(source.relations[0].kind!=='textFit')throw Error();
  source.relations[0].parameters.flexibility={version:1,minFontSize:30,preferredFontSize:70,maxFontSize:80};
  // More vertical space is explicitly authored in this separate control.
  source.base.instances.find(i=>i.id==='support')!.height=100;source.relations[0].parameters.maxHeight=100;
  source.base.relations=structuredClone(source.relations);source.origin.variantHash=arsenalHash(source.base);
  const fresh=solve(source,1);expect(body(fresh).fontSize).toBe(80);expect(fresh.overrides.support.fontSize).toBe(80);
  expect(resolveArsenalGeometry(readArsenalComposition(JSON.parse(JSON.stringify(fresh))),{measureText:measure}).elements).toEqual(fresh.elements);
 });
 it('leaves an oversized text defective at its lower bound, without elastic escape',()=>{
  const source=scene('X'.repeat(200)),fresh=solve(source,1);expect(body(fresh).fontSize).toBeCloseTo(34.19525,5);
  expect(fresh.issues.some(issue=>issue.startsWith('overflow'))).toBe(true);expect(fresh.content).toEqual(source.content);
 });
 it('projects advisory optional ranges from the same actual interval without geometry payload',()=>{
  const d=fixture(),field=completeDesignFields(d)[1],projected=compactTextFieldFlexibility(d,field)!;
  expect(projected).toMatchObject({optional:true,advisory:true,scope:'field',characters:{min:0},lines:{min:0,max:2}});
  expect(projected.characters.max).toBeGreaterThan(39);expect(projected).not.toHaveProperty('fontSize');
  expect(compactTextFieldFlexibility(d,{...field,kind:'list'})).toMatchObject({scope:'item'});
 });
 it('measures the audited width even when an old relation permits a wider box',()=>{
  const input=scene();if(input.relations[0].kind!=='textFit')throw Error();
  input.relations[0].parameters.maxWidth=1500;input.base.relations=structuredClone(input.relations);input.origin.variantHash=arsenalHash(input.base);
  const fresh=solve(input,1);expect(body(fresh).width).toBe(input.base.instances.find(instance=>instance.id==='support')!.width);
  expect(body(fresh).fontSize).toBeCloseTo(34.19525,5);expect(fresh.issues.filter(issue=>issue.startsWith('overflow'))).toEqual([]);
 });
 it('keeps empty optional fields hidden through repeated resolution',()=>{
  const fresh=solve(scene(''),1);expect(fresh.overrides.support).toBeUndefined();expect(body(fresh).opacity).toBe(0);
  expect(body(solve(fresh,1)).opacity).toBe(0);
 });
 it('rejects ambiguous partial authored intervals',()=>{
  const relation=fixture().fragment.relations[0];expect(arsenalRelationSchema.safeParse({...relation,parameters:{...relation.parameters,flexibility:{version:1,maxFontSize:30}}}).success).toBe(false);
 });
 it('rejects inverted explicitly authored intervals',()=>{
  const relation=fixture().fragment.relations[0];expect(arsenalRelationSchema.safeParse({...relation,parameters:{...relation.parameters,flexibility:{version:1,minFontSize:40,maxFontSize:20}}}).success).toBe(false);
 });
});
