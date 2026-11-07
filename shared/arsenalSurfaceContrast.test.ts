import { describe, expect, it } from "vitest";
import { arsenalHash } from "./arsenalContent";
import type { ArsenalComposition } from "./designArsenal";
import { correctArsenalSurfaceContrast } from "./arsenalSurfaceContrast";
function fixture() {
 const element = (id:string,kind:string,x:number,y:number,width:number,height:number,zIndex:number,fill:string,opacity=1) => ({id,kind,x,y,width,height,zIndex,fill,opacity,parentId:null,rotation:0,cornerRadius:0,strokeWidth:0,fontWeight:400,fontSize:14.6087,text:kind==="text"?id:""});
 const elements:any[]=[element("photo","media",0,0,1080,1350,0,"#FFFFFF"),{...element("panel","rect",39.6196,983.1522,1000.7609,335.0543,1,"#12211E",.91),cornerRadius:23.4783},
 {...element("title","text",57.2283,1007.6087,953.8043,99.3962,2,"#000000"),fontSize:94.663},
 ...Array.from({length:8},(_,i)=>element(`body-${i}`,"text",58.6957,1125+i*16.5815,936.1956,16.5078,3+i,"#000000"))];
 return {version:2,artboard:{width:1080,height:1350,background:"#1B2926"},elements,groups:[],overrides:{},base:{instances:elements.map(e=>({id:e.id,pieceHash:e.id}))},pieces:Object.fromEntries(elements.map(e=>[e.id,e]))} as unknown as ArsenalComposition;
}
describe("bounded contrast on composited surfaces",()=>{
 it("corrects title and all eight body fragments without changing layout, text or original input",()=>{
  const source=fixture(),hash=arsenalHash(source);const {composition,corrections}=correctArsenalSurfaceContrast(source);
  expect(corrections).toHaveLength(9);expect(corrections.map(c=>c.elementId)).toEqual(["title",...Array.from({length:8},(_,i)=>`body-${i}`)]);
  expect(arsenalHash(source)).toBe(hash);
  for(const fix of corrections){expect(fix.beforeMaximum).toBeLessThan(fix.threshold);expect(fix.afterMinimum).toBeGreaterThanOrEqual(fix.threshold);expect(fix.surfaceIds).toEqual(["panel"]);expect(fix.after).toBe("#FFFFFF");
   const original=source.elements.find(e=>e.id===fix.elementId)!;expect(composition.elements.find(e=>e.id===fix.elementId)).toEqual({...original,fill:"#FFFFFF"});expect(composition.overrides[fix.elementId]).toEqual({fill:"#FFFFFF"});}
 });
 it("is idempotent across serialized replay",()=>{const first=correctArsenalSurfaceContrast(fixture()).composition;const restored=JSON.parse(JSON.stringify(first));const second=correctArsenalSurfaceContrast(restored);expect(second.corrections).toEqual([]);expect(second.composition).toEqual(first);});
 it("keeps black text on a light panel",()=>{const source=fixture();source.elements[1].fill="#FFFFFF";expect(correctArsenalSurfaceContrast(source).corrections).toEqual([]);});
 it("does not decide contrast from an unprotected or faintly covered photograph",()=>{const source=fixture();source.elements[1].opacity=.1;expect(correctArsenalSurfaceContrast(source).corrections).toEqual([]);source.elements[1].opacity=0;expect(correctArsenalSurfaceContrast(source).corrections).toEqual([]);});
 it("requires complete panel coverage, including rounded corners",()=>{const source=fixture();source.elements[1].width=300;expect(correctArsenalSurfaceContrast(source).corrections).toEqual([]);});
 it("preserves outlined and individually styled text",()=>{const source=fixture();for(const e of source.elements.filter(e=>e.kind==="text"))e.strokeWidth=3;expect(correctArsenalSurfaceContrast(source).corrections).toEqual([]);for(const e of source.elements.filter(e=>e.kind==="text")){e.strokeWidth=0;e.richText=[{text:e.text,fill:"#FF0000"}];}expect(correctArsenalSurfaceContrast(source).corrections).toEqual([]);});
 it("refuses proof for an occluding foreground or rotated scene",()=>{const source=fixture();source.elements[1].zIndex=20;expect(correctArsenalSurfaceContrast(source).corrections).toEqual([]);source.elements[1].zIndex=1;source.elements[1].rotation=15;expect(correctArsenalSurfaceContrast(source).corrections).toEqual([]);});
 it("preserves authored light colors that already meet the bound",()=>{const source=fixture();for(const e of source.elements.filter(e=>e.kind==="text"))e.fill="#F4EBD9";expect(correctArsenalSurfaceContrast(source).corrections).toEqual([]);});
});
