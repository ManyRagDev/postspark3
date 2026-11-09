/** Deterministic offline authorship of the frozen 82 sources. Never publishes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {create as createFont} from 'fontkit';
import {createCanvas,loadImage,GlobalFonts} from '@napi-rs/canvas';
import {arsenalHash} from '../../../shared/arsenalContent';
import {isStandaloneDirectionalGlyph} from '../../../shared/nativeGlyphProjection';
import {recipeFromSpec,type CompactSpec} from '../../../harness/designBatch/builder';
import {recreationRecipeSchema,type RecreationRecipe} from '../../../shared/designRecreation';
import {REFERENCES,type Unit} from '../../../harness/componentArsenal/authoring';
import {extractRecipeComponents,type ComponentPackage} from '../../../harness/componentArsenal/extract';
import {restoreVisualAssets} from '../../../harness/completeDesigns/restoreVisualAssets';
import {assemblyIdentity,createComponentDefinition} from '../../../shared/componentAssembly';
import {arsenalPieceSchema,type ArsenalTextFragment,type PieceDefinitionV2} from '../../../shared/designArsenal';
import {verifyArsenalAsset} from '../../../server/designCatalog/arsenalAssets';
import {createComponentTextMeasurer} from '../../../server/ai/componentTextMeasurer';
import {nativeScene} from './nativeScene';
import {closeCssDecoration,paintCssDecoration} from './cssDecoration';
import {authorNativeSemantics} from './semantics';
import {resolveArsenalGeometry} from '../../../shared/arsenalGeometry';
import {partitionArsenalReadinessIssues} from '../../../shared/arsenalReadiness';
import {renderReviewScenes,closeReviewRenderer} from '../../../server/ai/workflows/proposalRenderer';
import {authorFamilyCarouselVariant} from '../../../server/designCatalog/familyCarouselRepertoire';
import type {ReferenceFontAsset} from '../../../shared/referenceReconstruction';

const output=path.resolve(process.argv[2]??'artifacts/acervo82/full/build-01');
const only=new Set((process.env.ACERVO82_AUTHOR_ONLY??'').split(',').filter(Boolean));
const registry=JSON.parse(await fs.readFile('designs/acervo82/authored/registry.json','utf8'));
const roster=JSON.parse(await fs.readFile('designs/acervo82/manifest.json','utf8'));
const nativeAdaptations=JSON.parse(await fs.readFile('designs/acervo82/authored/composition-adaptations.json','utf8'));
const geometry=JSON.parse(await fs.readFile('designs/acervo82/authored/html-geometry.json','utf8'));
const fontManifest=JSON.parse(await fs.readFile('designs/acervo82/authored/font-manifest.json','utf8'));
const sha256=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const fontPool=new Map<string,ReferenceFontAsset>();
const fontKitPool=new Map<string,any>();
for(const f of fontManifest){const bytes=await fs.readFile(path.join('designs/acervo82/authored/fonts',f.file));if(sha256(bytes)!==f.sha256)throw Error('font integrity mismatch');fontKitPool.set(`${f.family}:${f.weight}`,createFont(bytes));fontPool.set(`${f.family}:${f.weight}`,{family:f.family,weight:f.weight,sha256:f.sha256,sourceUrl:f.sourceUrl??null,mimeType:f.mimeType,dataUrl:`data:${f.mimeType};base64,${bytes.toString('base64')}`,license:f.license});}
for(const f of fontManifest)GlobalFonts.register(await fs.readFile(path.join("designs/acervo82/authored/fonts",f.file)),f.family);
const entries=registry.entries.filter((e:any)=>!only.size||only.has(e.code));
await fs.mkdir(output,{recursive:false});for(const d of ['packages','definitions','assets','renders','references','recipes'])await fs.mkdir(path.join(output,d));
const rows:any[]=[];
const px=(s:any)=>parseFloat(String(s))||0;
// Fixed labels retain their original line. Body fields and the Risograph
// headline reflow as one region, so a replacement cannot wrap twice.
const continuousConceptFields: Readonly<Record<string,readonly number[]>> = {
 'CON-02':[8], 'CON-05':[7,12], 'CON-08':[9],
 'CON-17':[6,7,10], 'CON-23':[7],
};
const compactConceptLabels: Readonly<Record<string,readonly number[]>> = {
 'CON-05':[6,11], 'CON-12':[16], 'CON-18':[4], 'CON-21':[2], 'CON-29':[7],
};
const conceptTitleScale: Readonly<Record<string,Readonly<Record<number,number>>>> = {
 'CON-21':{5:.92}, 'CON-23':{7:.88},
};
function rgba(value:string):[number,number,number,number]{
 const nums=(value.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)??[]).map(Number);
 if(/^#[a-f\d]{3}$/i.test(value))value='#'+value.slice(1).split('').map(c=>c+c).join('');
 if(value.startsWith('#'))return [parseInt(value.slice(1,3),16),parseInt(value.slice(3,5),16),parseInt(value.slice(5,7),16),1];
 if(value.startsWith('okl')){let [L,a,b]=nums;if(value.startsWith('oklch')){const h=b*Math.PI/180;b=a*Math.sin(h);a=a*Math.cos(h);}const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;const gamma=(x:number)=>Math.round(255*Math.max(0,Math.min(1,x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055)));return [gamma(4.0767416621*l-3.3077115913*m+.2309699292*s),gamma(-1.2684380046*l+2.6097574011*m-.3413193965*s),gamma(-.0041960863*l-.7034186147*m+1.707614701*s),nums[3]??1];}
 return [nums[0]??0,nums[1]??0,nums[2]??0,nums[3]??1];
}
const hex=(v:string)=>'#'+rgba(v).slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const palette=(s:string)=>Array.from(s.matchAll(/(?:rgba?\([^)]*\)|okl(?:ab|ch)\([^)]*\)|#[a-f\d]{3,8}|transparent)/gi)).map(m=>m[0]==='transparent'?'rgba(0,0,0,0)':m[0]);
function angle(g:any,e:any):number {const seen=new Set();let a=0;while(e&&!seen.has(e.id)){seen.add(e.id);const n=(e.style.transform.match(/matrix\(([^)]+)\)/)?.[1]??'').split(',').map(Number);if(n.length===6)a+=Math.atan2(n[1],n[0])*180/Math.PI;a+=px(e.style.rotate);e=g.boxes[e.parent];}return a;}
function boxGeometry(g:any,e:any){const rotation=angle(g,e),r=rotation*Math.PI/180,scale=1080/g.box.width,C=Math.abs(Math.cos(r)),S=Math.abs(Math.sin(r)),den=C*C-S*S,w=(Math.abs(den)>.01?(C*e.box.width-S*e.box.height)/den:(e.width||e.box.width))*scale,h=(Math.abs(den)>.01?(C*e.box.height-S*e.box.width)/den:(e.height||e.box.height))*scale,cx=(e.box.x+e.box.width/2)*scale,cy=(e.box.y+e.box.height/2)*scale;return{x:cx-Math.cos(r)*w/2+Math.sin(r)*h/2,y:cy-Math.sin(r)*w/2-Math.cos(r)*h/2,width:w,height:h,rotationDeg:rotation};}
function normalizeRecipe(recipe:RecreationRecipe){const sx=1080/recipe.scene.source.widthPx,sy=1350/recipe.scene.source.heightPx;
 for(const l of recipe.scene.layers){l.x*=sx;l.y*=sy;l.width*=sx;l.height*=sy;l.fontSize*=sx;l.strokeWidth*=sx;l.letterSpacing*=sx;l.points=l.points.map((n,i)=>n*(i%2?sy:sx));if(l.extrusion){l.extrusion.offsetX*=sx;l.extrusion.offsetY*=sy;}}
 for(const g of recipe.matrix!.groups){g.transform.x*=sx;g.transform.y*=sy;for(const m of g.members){m.x*=sx;m.y*=sy;}}
 for(const s of recipe.adaptation?.layerStyles??[])s.cornerRadiusPx*=sx;
 recipe.scene.source.widthPx=1080;recipe.scene.source.heightPx=1350;return recipe;
}
const css=(v:string)=>{const [r,g,b,a]=rgba(v);return `rgba(${r},${g},${b},${a})`;};
function nativeOutline(e:any,b:any,scale:number):number[]|null {
 const clip=e.style.clipPath;if(clip.startsWith('polygon(')){return clip.slice(8,-1).split(',').flatMap((s:string)=>s.trim().split(/\s+/).map((n:string,i:number)=>n.endsWith('%')?px(n)/100*(i?b.height:b.width):px(n)*scale));}
 const corners=['TopLeft','TopRight','BottomRight','BottomLeft'].map(key=>{
  const [x,y=x]=e.style[`border${key}Radius`].split(' ');
  const r=(v:string,size:number)=>v.endsWith('%')?size*px(v)/100:px(v)*scale;
  return {x:r(x,b.width),y:r(y,b.height)};
 });
 if(!corners.some(r=>r.x&&r.y))return null;
 const [a,c,d,f]=corners;
 const factor=Math.min(1,b.width/Math.max(1,a.x+c.x,d.x+f.x),b.height/Math.max(1,a.y+f.y,c.y+d.y));
 const points:number[]=[];corners.forEach((r,i)=>{const rx=r.x*factor,ry=r.y*factor,cx=i===0||i===3?rx:b.width-rx,cy=i<2?ry:b.height-ry,start=(-180+i*90)*Math.PI/180;for(let j=0;j<=12;j++){const t=start+j/12*Math.PI/2;points.push(cx+rx*Math.cos(t),cy+ry*Math.sin(t));}});return points;

}
async function clipDecoration(bytes:Buffer,box:ReturnType<typeof boxGeometry>) {
 const x=Math.max(0,box.x),y=Math.max(0,box.y);
 const width=Math.min(1080,box.x+box.width)-x,height=Math.min(1350,box.y+box.height)-y;
 if(width<=0||height<=0)return null;
 if(x===box.x&&y===box.y&&width===box.width&&height===box.height)return {bytes,box};
 const image=await loadImage(bytes),sx=image.width/box.width,sy=image.height/box.height;
 const canvas=createCanvas(Math.max(1,Math.round(width*sx)),Math.max(1,Math.round(height*sy)));
 canvas.getContext('2d').drawImage(image,(x-box.x)*sx,(y-box.y)*sy,width*sx,height*sy,0,0,canvas.width,canvas.height);
 return {bytes:canvas.toBuffer('image/png'),box:{...box,x,y,width,height}};
}
async function fromHtml(entry:any,g:any){
 const scale=1080/g.box.width, root=g.boxes[0];
 const concept=entry.code.startsWith('CON-');
 const spec:CompactSpec={stem:entry.id,title:`${entry.code} · ${entry.name}`,width:1080,height:1350,background:hex(root.style.backgroundColor),layers:[],groups:[],authorship:{recipeId:`${entry.id}-native-v1`,createdAt:'2026-11-05T00:00:00.000Z'},notes:['Geometria medida do HTML arquivado com fontes verificadas; referência visual: showcase consolidado.']};
 const addGroup=(id:string)=>{if(!spec.groups.some(g=>g.id===id))spec.groups.push({id,label:id,transform:{x:0,y:0,rotationDeg:0}});};
 const decorations:Array<{id:string,bytes:Buffer,box:any,z:number,opacity:number,replacementPoints?:number[]}>=[];
 const paint=new Map<string,number>(), visualStyles=new Map<string,Partial<PieceDefinitionV2>>();
 for(const e of g.boxes){paint.set(`surface-${e.id}`,e.paint);for(const side of ['Top','Right','Bottom','Left'])paint.set(`border-${e.id}-${side}`,e.paint+.1);const s=e.style,b=boxGeometry(g,e),fill=rgba(s.backgroundColor),outline=nativeOutline(e,b,scale),rounded=px(s.borderTopLeftRadius)>0,uniformBorder=['Right','Bottom','Left'].every(side=>s[`border${side}Width`]===s.borderTopWidth);
  const blurredColor=concept&&fill[3]>0&&px(s.filter.match(/blur\(([\d.]+)px\)/)?.[1])>0;
  if(fill[3]&&e.id!==0&&!blurredColor)spec.layers.push({id:`surface-${e.id}`,kind:outline?'polygon':'rect',...b,...(outline?{points:outline}:{}),fill:hex(s.backgroundColor),opacity:fill[3]*e.opacity,cornerRadiusPx:Math.min(b.width/2,b.height/2,px(s.borderTopLeftRadius)*scale),...(uniformBorder&&(outline||rounded)?{strokeColor:hex(s.borderTopColor),strokeWidth:px(s.borderTopWidth)*scale}:{})});
  if(e.id!==0&&!fill[3]&&outline&&uniformBorder&&px(s.borderTopWidth)){spec.layers.push({id:`border-${e.id}-Top`,kind:'line',...b,points:[...outline,outline[0],outline[1]],fill:hex(s.borderTopColor),strokeColor:hex(s.borderTopColor),strokeWidth:px(s.borderTopWidth)*scale,opacity:rgba(s.borderTopColor)[3]*e.opacity});}
  const sides=[['Top',0,0,b.width,0],['Right',b.width,0,b.width,b.height],['Bottom',0,b.height,b.width,b.height],['Left',0,0,0,b.height]] as const;
  if(e.id!==0&&!(uniformBorder&&(outline||fill[3]&&rounded)))for(const [side,x1,y1,x2,y2]of sides){const width=px(s[`border${side}Width`]);if(width)spec.layers.push({id:`border-${e.id}-${side}`,kind:'line',x:b.x,y:b.y,width:b.width,height:b.height,rotationDeg:b.rotationDeg,points:[x1,y1,x2,y2],fill:hex(s.borderTopColor),strokeColor:hex(s.borderTopColor),strokeWidth:width*scale,opacity:rgba(s.borderTopColor)[3]});}
  if(concept){
   if(s.mixBlendMode==='multiply')visualStyles.set(`surface-${e.id}`,{blendMode:'multiply'});
   if((e.classes??'').split(/\s+/).includes('border-dashed')){
    for(const l of spec.layers.filter(l=>l.strokeWidth&&(
     l.id===`surface-${e.id}`||l.id.startsWith(`border-${e.id}-`)))) {
     const strokeWidth=l.strokeWidth??0;
     visualStyles.set(l.id,{...visualStyles.get(l.id),strokeDash:[strokeWidth*3,strokeWidth*2]});
    }
   }
  }
  if((blurredColor||s.backgroundImage!=='none')&&s.backgroundClip!=='text'){
   // CSS blur paints beyond the box. Include the halo up to the artboard edge.
   const halo=b.rotationDeg===0 ? 3*px(s.filter.match(/blur\(([\d.]+)px\)/)?.[1]) : 0;
   const padding={
    left:Math.max(0,Math.min(halo,b.x/scale)),
    top:Math.max(0,Math.min(halo,b.y/scale)),
    right:Math.max(0,Math.min(halo,(1080-b.x-b.width)/scale)),
    bottom:Math.max(0,Math.min(halo,(1350-b.y-b.height)/scale)),
   };
   const decorationStyle={...s,backgroundColor:blurredColor?s.backgroundColor:undefined};
   if(entry.code==='CON-23'&&e.id===11)decorationStyle.backgroundPosition='0 0, 0 8px, 8px -8px, -8px 0';
   const bytes=await paintCssDecoration(decorationStyle,b.width/scale,b.height/scale,padding);
   const replacementPoints=entry.code==='CON-17'&&e.id===2 ? outline??undefined : undefined;
   const box={...b,x:b.x-padding.left*scale,y:b.y-padding.top*scale,
    width:b.width+(padding.left+padding.right)*scale,height:b.height+(padding.top+padding.bottom)*scale};
   const clipped=blurredColor?await clipDecoration(bytes,box):{bytes,box};
   if(clipped)decorations.push({id:`texture-${e.id}`,...clipped,z:e.paint+.2,opacity:e.opacity,replacementPoints});
  }
 }
 const units:Unit[]=[];
 let headlineSeen=false;

 for(const block of g.textBlocks.filter((b:any)=>!(entry.code==='CON-08'&&b.id===8))){
  const group=`field-${block.id}`;addGroup(group);const e=g.boxes[block.id],base=boxGeometry(g,e),bs=block.style;
  if(bs.writingMode==='vertical-rl'){base.x+=base.width;[base.width,base.height]=[base.height,base.width];base.rotationDeg+=90;}
  const pl=px(bs.paddingLeft)*scale,pr=px(bs.paddingRight)*scale,pt=px(bs.paddingTop)*scale,pb=px(bs.paddingBottom)*scale;
  const width=Math.max(1,base.width-pl-pr),height=Math.max(1,base.height-pt-pb),r=base.rotationDeg*Math.PI/180;
  const ornament=isStandaloneDirectionalGlyph(block.runs.map((run:any)=>run.text??'').join(''));
  const maxSize=Math.max(...block.runs.map((t:any)=>px(t.style.fontSize)));
  let role:Unit['role']=/^H[1-4]$/.test(block.tag)||(!headlineSeen&&maxSize>=24)?'headline':(maxSize>=14||block.tag==='P'&&block.runs.map((t:any)=>t.text).join('').trim().length>=24)?'body':block.runs.some((t:any)=>/➔|→|DESLIZE|SWIPE|AVANÇAR|PRÓXIMO|ENTRAR|APLICAR|CONHEÇA/i.test(t.text))?'callToAction':'label';
  if(role==='headline'&&!ornament)headlineSeen=true;
  const compactLabel=compactConceptLabels[entry.code]?.includes(block.id);
  const footer=concept&&block.runs.length===1&&!ornament&&/[➔→]/u.test(block.runs[0].text);
  const keepLabelTogether=compactLabel||footer;
  const fontScale=compactLabel ? .86 : footer ? .94 : conceptTitleScale[entry.code]?.[block.id]??1;
  const lines:any[][]=[[]];let used=0;
  for(const run of block.runs){if(run.spacer){if(lines.at(-1)!.length)lines.push([]);lines.at(-1)!.push({spacer:run.spacer*scale});lines.push([]);used=0;continue;}const style=run.style;let family=style.fontFamily.split(',')[0].replace(/["']/g,'').trim();if(!Array.from(fontPool.values()).some(f=>f.family===family))family='Inter';let weight=px(style.fontWeight)||400;if(family==='Space Grotesk')weight=Math.min(700,weight);if(family==='Syne')weight=Math.min(800,weight);const font=fontPool.get(`${family}:${weight}`)??Array.from(fontPool.values()).filter(f=>f.family===family).sort((a,b)=>Math.abs(a.weight-weight)-Math.abs(b.weight-weight))[0];fontPool.set(`${family}:${weight}`,{...font,weight});
   const size=px(style.fontSize)*scale*fontScale;let value=run===block.runs.at(-1)?run.text.trimEnd():run.text;if(style.textTransform==='uppercase')value=value.toLocaleUpperCase('pt-BR');
   let face=fontKitPool.get(`${family}:${weight}`)??createFont(Buffer.from(font.dataUrl!.split(',')[1],'base64'));if(face.variationAxes?.wght)face=face.getVariation({wght:weight});const measure=(token:string)=>face.layout(token).positions.reduce((n:number,p:any)=>n+p.xAdvance,0)/face.unitsPerEm*size;
   for(let token of value.match(/\n|[^\S\n]*[^\s]+[^\S\n]*/g)??[]){if(token==='\n'){if(lines.at(-1)!.length&&!keepLabelTogether){lines.push([]);used=0;}continue;}if(!used)token=token.trimStart();const advance=measure(token)+token.length*px(style.letterSpacing)*scale;if(!keepLabelTogether&&height>(px(bs.lineHeight)||px(bs.fontSize)*1.15)*scale*1.3&&used+advance>width+2&&lines.at(-1)!.length){lines.push([]);used=0;token=token.trimStart();}const w=measure(token)+token.length*px(style.letterSpacing)*scale;lines.at(-1)!.push({text:token,width:w,size,weight,family,style});used+=w;}
  }
  let y=pt,index=0;
  for(const line of lines.filter(l=>l.length)){if(line[0].spacer){y+=line[0].spacer;continue;}const lineHeight=Math.max(...line.map(t=>(px(t.style.lineHeight)||px(t.style.fontSize)*1.15)*scale));const total=line.reduce((n,t)=>n+t.width,0);let x=pl+(bs.textAlign==='center'?(width-total)/2:bs.textAlign==='right'?width-total:0);
   const chunks:any[]=[];for(const token of line){const last=chunks.at(-1);if(last&&last.family===token.family&&last.weight===token.weight&&last.style.color===token.style.color&&last.size===token.size){last.text+=token.text;last.width+=token.width;}else chunks.push({...token});}
   // Keep inline emphasis inside one editable line; bounding boxes no longer
   // overlap merely because neighboring colors differ.
   const sameFamily=chunks.every(t=>t.family===chunks[0].family);
   const display=sameFamily?[{...chunks[0],text:chunks.map(t=>t.text).join(''),width:total,chunks}]:chunks.map(t=>({...t,chunks:[t]}));
   for(const t of display){const id=`text-${block.id}-${index++}`,text=t.text.trim();if(text){
    const stroke=px(t.style.webkitTextStrokeWidth)*scale,gradient=t.style.backgroundClip==='text'?palette(t.style.backgroundImage):[],shadow=t.style.textShadow!=='none'?t.style.textShadow.match(/(rgba?\([^)]*\))\s+([\d.-]+)px\s+([\d.-]+)px/):null;
    spec.layers.push({id,kind:'text',x:base.x+x*Math.cos(r)-y*Math.sin(r),y:base.y+x*Math.sin(r)+y*Math.cos(r),width:Math.max(1,t.width+3),height:lineHeight+2,rotationDeg:base.rotationDeg,text,fontFamily:t.family,fontWeight:t.weight,fontSize:t.size,lineHeight:Math.min(3,Math.max(.5,lineHeight/t.size)),letterSpacing:px(t.style.letterSpacing)*scale,fill:gradient[1]?hex(gradient[1]):stroke&&rgba(t.style.color)[3]===0?spec.background:hex(t.style.color),...(stroke?{strokeColor:hex(t.style.webkitTextStrokeColor),strokeWidth:stroke}:{}),...(shadow?{extrusion:{color:hex(shadow[1]),offsetX:px(shadow[2])*scale,offsetY:px(shadow[3])*scale,steps:2}}:{}),align:'left',groupId:group,...(!ornament?{fieldId:group,minScale:.65}:{}),opacity:e.opacity*(stroke||gradient.length?1:rgba(t.style.color)[3])});
    paint.set(id,e.paint+.5);
    const pieceStyle:Partial<PieceDefinitionV2>={};
    let start=0;
    const styles:ArsenalTextFragment[]=[];
    for(const [chunkIndex,c] of t.chunks.entries()){
     const part=chunkIndex===0||!concept?c.text.trimStart():c.text;
     const end=Math.min(text.length,start+part.length);
     if(end>start)styles.push({start,end,style:{color:hex(c.style.color),sizeScale:c.size/t.size,...(c.weight!==t.weight?{bold:c.weight>=700}:{})}});
     start=end;
    }
    if(styles.length>1)pieceStyle.textFragments=styles;
    if(concept&&gradient.length>=2)
     pieceStyle.textGradient={colors:gradient.map(hex),start:(pt-y)/lineHeight,end:(pt+height-y)/lineHeight};
    if(entry.code==='CON-21'&&block.id===5){
     const shadows=[...t.style.textShadow.matchAll(/(rgba?\([^)]*\))\s+([\d.-]+)px\s+([\d.-]+)px/g)];
     const last=shadows.at(-1);
     if(last)pieceStyle.extrusion={color:hex(shadows[0][1]),colors:shadows.map(s=>hex(s[1])),offsetX:px(last[2])*scale,offsetY:px(last[3])*scale,steps:shadows.length};
    }
    if(Object.keys(pieceStyle).length)visualStyles.set(id,pieceStyle);
    if(keepLabelTogether){
     const layer=spec.layers.at(-1)!;
     layer.width=width;
     layer.align=bs.textAlign==='center'?'center':bs.textAlign==='right'?'right':'left';
     layer.x=base.x+pl*Math.cos(r)-y*Math.sin(r);
     layer.y=base.y+pl*Math.sin(r)+y*Math.cos(r);
    }
   }x+=t.width;}
   y+=lineHeight;
  }
  if(continuousConceptFields[entry.code]?.includes(block.id)){
   const layer=spec.layers.find(l=>l.fieldId===group);
   if(layer){
    spec.layers=spec.layers.filter(l=>l.fieldId!==group||l===layer);
    visualStyles.delete(layer.id);
    const portal=entry.code==='CON-17';
    const align=portal?(block.id===10?'right':'center'):bs.textAlign==='center'?'center':'left';
    const heightLimit=entry.code==='CON-23'?height*.77:height;
    Object.assign(layer,{x:base.x+(portal?0:pl),y:base.y+(portal?0:pt),width,height:heightLimit,text:block.runs.map((run:any)=>run.text).join('').trim().replace(/\s+/g,' '),align});
    if(portal&&block.id===10){layer.x-=30;layer.width+=30;}
   }
  }
  if(entry.code==='CON-06'&&block.id===10){
   // The highlight is an inline span in the reference. Its surface has to
   // paint inside the same editable group, below the words it decorates.
   for(const layer of spec.layers.filter(l=>l.id==='surface-11'||l.id.startsWith('border-11-'))){
    layer.groupId=group;
    paint.set(layer.id,e.paint+.25);
   }
  }
  if(spec.layers.some(l=>l.fieldId===group))units.push({role,fields:[group]});else if(!spec.layers.some(l=>l.groupId===group))spec.groups=spec.groups.filter(g=>g.id!==group);
 }
 if(entry.code==='CON-23'){
  // Leave room above the yellow card for the original background motifs.
  const scaleY=.77,top=g.boxes[5].box.y*scale, shift=125;
  for(const layer of spec.layers.filter(l=>/^surface-[56]$|^border-[56]-|^text-[67]-/.test(l.id))){
   layer.y=top+shift+(layer.y-top)*scaleY;
   if(layer.kind==='text')continue;
   if(layer.height)layer.height*=scaleY;
   if(layer.points)layer.points=layer.points.map((value,index)=>index%2?value*scaleY:value);
  }
 }
 if(!headlineSeen){const best=units.find(u=>u.role==='body')??units[0];if(best)best.role='headline';}
 // Promote the exact source frame to editable media instead of covering it
 // with an unrelated gray rectangle.
 if(['R9-01','R9-04','R9-14'].includes(entry.code)){
  addGroup('photo');
  if(entry.code==='R9-14')spec.layers.unshift({id:'photo',kind:'rect',x:0,y:0,width:1080,height:1350,fill:hex(root.style.backgroundColor),groupId:'photo',mediaId:'photo',role:'Fotografia de fundo substituível'});
  else {const frame=spec.layers.find(l=>l.id==='surface-4')!;frame.kind='rect';delete frame.points;frame.groupId='photo';frame.mediaId='photo';frame.role='Fotografia substituível na moldura nativa';}
 }
 for(const [i,svg]of g.svgs.entries()){let n=0;const xml=svg.xml.replace(/<([a-zA-Z][\w:-]*)(\s[^<>]*?)?\/?\>/g,(full:string,tag:string,attrs:string)=>{if(tag==='svg')return full.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"').replace(/\swidth="[^"]*"/,'').replace(/\sheight="[^"]*"/,'');const c=svg.children[n++];if(!c)return full;return full.replace(/\s(fill|stroke|stroke-width)="[^"]*"/g,'').replace(/\/?\>$/,`${c.fill?` fill="${c.fill.startsWith('okl')?css(c.fill):c.fill}"`:''}${c.stroke?` stroke="${c.stroke.startsWith('okl')?css(c.stroke):c.stroke}"`:''} stroke-width="${px(c.strokeWidth)}"${full.endsWith('/>')?'/':''}>`);});
  try {const img=await loadImage(Buffer.from(xml)),canvas=createCanvas(Math.max(1,Math.round(svg.box.width*scale)),Math.max(1,Math.round(svg.box.height*scale))),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);const x=svg.box.x*scale,y=svg.box.y*scale,left=Math.max(0,x),top=Math.max(0,y),right=Math.min(1080,x+canvas.width),bottom=Math.min(1350,y+canvas.height);const clipped=createCanvas(Math.max(1,Math.round(right-left)),Math.max(1,Math.round(bottom-top)));clipped.getContext('2d').drawImage(canvas,x-left,y-top);decorations.push({id:`svg-${i}`,bytes:clipped.toBuffer('image/png'),box:{x:left,y:top,width:right-left,height:bottom-top,rotationDeg:0},z:svg.paint+.2,opacity:svg.opacity});}catch(e){throw Error(`${entry.code}: SVG ${i}: ${(e as Error).message}`);}}
 // Preserve DOM stacking between surfaces and content, including SVG backgrounds.
 spec.layers.sort((a,b)=>(paint.get(a.id)??-1)-(paint.get(b.id)??-1));
 if(entry.code==='CON-08')for(const l of spec.layers.filter(l=>l.id.startsWith('text-9-')))l.extrusion={color:'#FF3385',offsetX:4*scale,offsetY:4*scale,steps:1};
 const recipe=recipeFromSpec(spec,fontPool);return {recipe,units,decorations,paint,visualStyles};
}
try{for(const entry of entries){const source=roster.entries.find((r:any)=>r.id===entry.id);try{
 let recipe:RecreationRecipe,units:Unit[],decorations:any[]=[];let previousReferenceId:string|undefined;let htmlPaint:Map<string,number>|undefined,htmlStyles:Map<string,Partial<PieceDefinitionV2>>|undefined;
 if(source.group==='reference'){const original=JSON.parse(await fs.readFile(`designs/acervo82/authored/references/${entry.id}.json`,'utf8'));previousReferenceId=original.previousReferenceId;recipe=original.recipe;
  if(recipe.scene.source.originalHash!==sha256(await fs.readFile(source.preview)))throw Error(`reference_recipe_mismatch:${entry.code}`);recipe.scene.fonts=recipe.scene.fonts.map((f:any)=>fontPool.get(`${f.family}:${f.weight}`));recipe=normalizeRecipe(recreationRecipeSchema.parse(recipe));units=structuredClone(REFERENCES[previousReferenceId!]??recipe.matrix!.fields.map(f=>({role:'body' as const,fields:[f.id]})));
  if(!units.some(u=>u.role==='headline')){units[0].role='headline';units[0].required=false;}
  if(entry.code==='REF-24'){const title=recipe.matrix!.fields.find(f=>f.id==='title')!;const columns=[0,1].map(side=>{const layers=recipe.scene.layers.filter(l=>l.kind==='text'&&l.id!=='title'&&(l.x<540?0:1)===side).sort((a,b)=>a.y-b.y);return {id:`column-${side}`,groupId:recipe.matrix!.groups.find(g=>g.members.some(m=>m.layerId===layers[0].id))!.id,label:`Coluna ${side+1}`,kind:'list' as const,layerIds:layers.map(l=>l.id),minScale:.65,prefix:''};});recipe.matrix!.fields=[title,...columns];units=[{role:'headline',fields:['title']},...columns.map(f=>({role:'body' as const,fields:[f.id],kind:'list' as const,cardinality:{min:0,max:f.layerIds.length}}))];}
  recipe.title=`${entry.code} · ${entry.name}`;recipe.id=`${entry.id}-native-v1`;recipe.createdAt='2026-11-05T00:00:00.000Z';
 }else{const result=await fromHtml(entry,geometry.find((g:any)=>g.group===source.group&&g.order===source.order));({recipe,units,decorations}=result);htmlPaint=result.paint;htmlStyles=result.visualStyles;}
 const recipeBytes=JSON.stringify(recipe);const fileHash=arsenalHash(recipe);const result=await extractRecipeComponents({id:entry.id,referenceId:entry.id,category:'acervo82',title:recipe.title,manifestPath:'designs/acervo82/manifest.json',recipePath:`recipes/${entry.id}.json`,previewPath:source.preview,fileHash,declaredHash:null,sourceApproval:'local-review',sourceFormat:'original',destination:'composition'},recipe,true,units);
 const p=result.package;
 if(previousReferenceId){p.source.referenceId=previousReferenceId;await restoreVisualAssets(result);p.source.referenceId=entry.id;}
 let d=p.components.find(c=>c.fragment.aspectRatio==='4:5')!;if(!d)throw Error('native 4:5 definition absent');
 for(const deco of decorations){const checked=await verifyArsenalAsset(deco.bytes,{license:'curator-provided'}),asset=checked.manifest;await fs.writeFile(path.join(output,'assets',asset.sha256),deco.bytes);d.assets.push(asset);d.fragment.assetIds.push(asset.id);const piece=arsenalPieceSchema.parse({kind:'media',imageAssetId:asset.id,fill:'#FFFFFF',stroke:null,strokeWidth:0,cornerRadius:0,points:deco.replacementPoints??[],...(deco.replacementPoints?{imageReplacement:{label:'Interior do portal',scrimOpacity:.62}}:{}),fontFamily:'Arial',fontAssetId:null,fontSize:12,fontWeight:400,align:'left',lineHeight:1,letterSpacing:0,fixedText:null});const h=arsenalHash(piece);d.pieces[h]=piece;const b=deco.box;d.fragment.instances.push({id:deco.id,pieceHash:h,parentId:null,zIndex:deco.z,x:b.x,y:b.y,width:b.width,height:b.height,rotation:b.rotationDeg,opacity:deco.opacity??1});result.assetFiles.push({manifest:asset,bytes:deco.bytes,relativePath:`assets/${asset.sha256}`,sourceHash:asset.sha256,sourceFamily:'',sourceWeight:400,resolvedWeight:400,sourceUrl:null,adjustment:'Decorative source geometry; no editable text flattened.'});}
 if(htmlPaint){
  for(const i of d.fragment.instances){const styles=htmlStyles?.get(i.id);if(styles){const piece=arsenalPieceSchema.parse({...d.pieces[i.pieceHash],...styles}),hash=arsenalHash(piece);d.pieces[hash]=piece;i.pieceHash=hash;}i.zIndex=htmlPaint.get(i.id)??decorations.find(x=>x.id===i.id)?.z??-1;}
  d.fragment.instances.sort((a,b)=>a.zIndex-b.zIndex).forEach((i,index)=>{i.zIndex=index;});
  for(const group of d.fragment.groups)group.zIndex=Math.min(...d.fragment.instances.filter(i=>i.parentId===group.id).map(i=>i.zIndex));
 }
 if(entry.code==='REF-01'){
  const echo=d.fragment.bindings.find(b=>b.targetIds.includes('eco-topo'))!;
  d.fragment.bindings=d.fragment.bindings.filter(b=>b.id!==echo.id);
  d.fragment.relations=d.fragment.relations.filter(r=>!r.outputs.some(o=>echo.targetIds.includes(o.targetId)));
  p.authorship.units=p.authorship.units.filter(u=>u.source!==echo.source);
  for(const b of d.fragment.bindings.filter(b=>b.source.startsWith('block:label:'))){const i=Number(b.source.split(':')[2]),old=b.source;b.source=`block:label:${i-1}:text`;const unit=p.authorship.units.find(u=>u.source===old);if(unit)unit.source=b.source;}
  for(const id of echo.targetIds){const i=d.fragment.instances.find(i=>i.id===id)!,{contentFragment:_,...original}=d.pieces[i.pieceHash];const piece=arsenalPieceSchema.parse({...original,fixedText:'GRAVAR',fixedTextRole:'ornament'}),hash=arsenalHash(piece);d.pieces[hash]=piece;i.pieceHash=hash;}
 }
 const adaptation=nativeAdaptations.entries[entry.code];
 if(adaptation){
  d.fragment.intentionalOverlaps.push(...(adaptation.overlaps??[]));
  if(adaptation.lineBoxes)d.fragment.lineBoxOverlaps=adaptation.lineBoxes.map(([a,b]:string[])=>({a,b,maxOverlapFraction:.25,singleLineOnly:true}));
  for(const id of adaptation.bleed??[]){const i=d.fragment.instances.find(i=>i.id===id)!;const piece=arsenalPieceSchema.parse({...d.pieces[i.pieceHash],artboardBleed:true}),hash=arsenalHash(piece);d.pieces[hash]=piece;i.pieceHash=hash;}
  for(const [id,offset]of Object.entries(adaptation.offsets??{})as any){const i=d.fragment.instances.find(i=>i.id===id)!;i.x+=offset.x??0;i.y+=offset.y??0;}
 }
 authorNativeSemantics(entry.code,p,d);
 const axes=entry.axes;
 d.completeDesign!.family=entry.id;
 if(entry.code.startsWith('CON-'))d.completeDesign!.authorshipRevision=3;
 else if(decorations.some(deco=>deco.id.startsWith('texture-')))d.completeDesign!.authorshipRevision=2;
 d.completeDesign!.designGuidance!.selection={version:1,description:entry.descriptor,axes};
 d.completeDesign!.designGuidance!.familyIdentity={essential:[entry.descriptor],optional:[],adaptable:['Texto e mídia nos campos nativos']};
 d.completeDesign!.baselineVerified=true;
 d.roles=entry.carouselIntent?['static','cover']:['static'];
 const {hash:_hash,...basis}=d;d=createComponentDefinition({...basis,id:assemblyIdentity(['acervo82-native',entry.id,arsenalHash(basis)])});p.components=[d];
 for(const f of result.assetFiles)await fs.writeFile(path.join(output,f.relativePath),f.bytes);
 const measure=await createComponentTextMeasurer(d.assets,async a=>result.assetFiles.find(f=>f.manifest.id===a.id)!.bytes);
 let preview=nativeScene(p,d,measure);
 const adjustments:any[]=adaptation?[{property:'authored-geometry',...adaptation}]:[];
 const reduced=resolveArsenalGeometry(preview,{measureText:measure,allowReduction:true});
 for(const instance of d.fragment.instances){const e=reduced.elements.find(e=>e.id===`c0-${arsenalHash(instance.id).slice(0,20)}`),piece=d.pieces[instance.pieceHash];if(!e||piece.kind!=='text')continue;
  if(e.fontSize<piece.fontSize-.01){adjustments.push({target:instance.id,property:'fontSize',before:piece.fontSize,after:e.fontSize,cause:'verified-native-fit'});const next={...piece,fontSize:e.fontSize};const h=arsenalHash(next);d.pieces[h]=next;instance.pieceHash=h;}
  instance.width=e.width;instance.height=e.height;
 }
 for(const issue of reduced.issues.filter(i=>i.startsWith('contrast:low:'))){const id=issue.slice('contrast:low:'.length),instance=d.fragment.instances.find(i=>`c0-${arsenalHash(i.id).slice(0,20)}`===id);if(!instance)continue;const piece=d.pieces[instance.pieceHash];
  const candidates:any[]=[...(piece.stroke?[{strokeWidth:Math.max(3,piece.strokeWidth)}]:[]),{fill:'#000000'},{fill:'#FFFFFF'}];
  for(const patch of candidates){const checked=resolveArsenalGeometry({...reduced,overrides:{...reduced.overrides,[id]:{...reduced.overrides[id],...patch}}},{measureText:measure,allowReduction:true});if(!checked.issues.includes(issue)){const next={...piece,...patch},h=arsenalHash(next);d.pieces[h]=next;instance.pieceHash=h;adjustments.push({target:instance.id,before:{fill:piece.fill,strokeWidth:piece.strokeWidth},after:patch,cause:'verified-native-contrast'});break;}}
 }
 const changedBasis={...d};delete (changedBasis as any).hash;d=createComponentDefinition({...changedBasis,id:assemblyIdentity(['acervo82-native',entry.id,arsenalHash(changedBasis)])});p.components=[d];
 preview=nativeScene(p,d,measure);
 const readiness=partitionArsenalReadinessIssues(preview.issues);
 await fs.writeFile(path.join(output,'recipes',`${entry.id}.json`),recipeBytes);
 const [render]=await renderReviewScenes({compositions:[preview],definitions:[d],actor:'acervo82-local-authoring',deadlineMs:Date.now()+45000,loadAssetBytes:async a=>result.assetFiles.find(f=>f.manifest.id===a.id)!.bytes});
 const png=Buffer.from(render.dataUri.split(',')[1],'base64');await fs.writeFile(path.join(output,'renders',`${entry.id}.png`),png);
 await fs.copyFile(source.preview,path.join(output,'references',path.basename(source.preview)));
 const defs=[d];
 if(!readiness.blocking.length&&entry.carouselIntent){
  for(const mode of ['compose','literal'] as const)for(const role of ['development','closing']as const){
   const fn=role==='closing'?'synthesis':entry.carouselIntent;
   defs.push(authorFamilyCarouselVariant(d,role,mode,fn));
  }
 }
 if(readiness.blocking.length){const {hash:_,...draft}=d;draft.completeDesign={...draft.completeDesign!,baselineVerified:false};defs[0]=d=createComponentDefinition({...draft,id:assemblyIdentity(['acervo82-unverified',entry.id,arsenalHash(draft)])});}
 p.assetFiles=result.assetFiles.map(({bytes,...file})=>file);
 for(const def of defs)await fs.writeFile(path.join(output,'definitions',`${def.id}.json`),JSON.stringify(def,null,2)+'\n');
 await fs.writeFile(path.join(output,'packages',`${entry.id}.json`),JSON.stringify({...p,components:defs},null,2)+'\n');
 rows.push({id:entry.id,code:entry.code,name:entry.name,sourceHash:sha256(await fs.readFile(source.preview)),definitionId:d.id,definitionHash:d.hash,definitions:defs.map(c=>({id:c.id,hash:c.hash,role:c.roles})),blocking:readiness.blocking,diagnostics:readiness.diagnostics,render:`renders/${entry.id}.png`,renderHash:sha256(png),axes,adjustments,state:readiness.blocking.length?'needs_adjustment':'technically_rendered'});
 console.log(JSON.stringify({code:entry.code,definitions:defs.length,blocking:readiness.blocking}));
 }catch(e){rows.push({id:entry.id,code:entry.code,state:'needs_adjustment',error:(e as Error).message});console.log(JSON.stringify({code:entry.code,error:(e as Error).message}));}
 await fs.writeFile(path.join(output,'inventory.json'),JSON.stringify({format:'postspark.acervo82.build',version:1,sourceCount:entries.length,rows,paidCalls:0},null,2)+'\n');
}}finally{await Promise.all([closeReviewRenderer(),closeCssDecoration()]);}
console.log(JSON.stringify({output,sources:rows.length,rendered:rows.filter(r=>r.render).length,blocked:rows.filter(r=>r.state==='needs_adjustment').length}));
