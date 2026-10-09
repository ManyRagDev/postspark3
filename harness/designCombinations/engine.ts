/** Reusable, bounded composition engine for local experiments. No files are written here. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {RecipeBuilder,localFontPool,sha256} from '../designBatch/builder';
import {registerRecipeFonts,measureLayer,layerMeasurements} from '../designBatch/native';
import {recreationRecipeSchema,type RecreationRecipe} from '../../shared/designRecreation';
import type {ReferenceSceneLayer} from '../../shared/referenceReconstruction';
import {balancedLines} from './textFlow';

export const INPUT='artifacts/design-recreation/batch-2026-09-30/recipes';
export const ids={paper:'0623fb1c14937cd1e67e980b566710ba',ribbons:'94e0a100310160059384fb4c6ca5b2c4',window:'1c2fb00a82a764bab2f4374d03f67886'};
export const sources=Object.fromEntries(Object.entries(ids).map(([key,id])=>[key,recreationRecipeSchema.parse(JSON.parse(readFileSync(join(INPUT,id+'.json'),'utf8')))])) as Record<keyof typeof ids,RecreationRecipe>;
const fonts=localFontPool([INPUT]);
Object.values(sources).forEach(registerRecipeFonts);
const W=736,H=920,CX=W/2,MAX_TEXT=490;
export type Background='paper'|'photo'|'window';
export type Module='paper'|'ribbons'|'window';
export const backgrounds:Background[]=['paper','photo','window'];
export const modules:Module[]=['paper','ribbons','window'];
export const labels={paper:'Papel empilhado',photo:'Fotografia',ribbons:'Tarjas azuis',window:'Janelas'};
const asset=structuredClone(sources.window.matrix!.media.find(m=>m.asset)!.asset!);
const get=(source:keyof typeof sources,id:string)=>structuredClone(sources[source].scene.layers.find(l=>l.id===id)!);
const titleSource:Record<Module,ReferenceSceneLayer>={paper:get('paper','titulo-linha-1'),ribbons:get('ribbons','shortcut'),window:get('window','titulo-principal')};
// These are bounded authoring choices for this pilot, recorded in its manifest.
titleSource.window.fontSize=68;
titleSource.ribbons.fontSize=66;
titleSource.paper.fontSize=86;
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
function luminance(hex:string){const a=hex.match(/[0-9a-f]{2}/gi)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function measured(text:string,font:ReferenceSceneLayer,source:RecreationRecipe){const l={...font,text,width:MAX_TEXT,height:1000};const lay=measureLayer(source,l);return Math.max(...lay.lines.map(l=>l.width));}
function breakWords(text:string,font:ReferenceSceneLayer,source:RecreationRecipe,maxWidth=MAX_TEXT){
  const words=text.trim().split(/\s+/);if(!text.trim()||text.length>600)throw Error('Título vazio ou maior que o escopo de 600 caracteres deste ensaio.');
  const lines:string[]=[];let line='';
  for(const word of words){if(measured(word,font,source)>maxWidth)throw Error('Uma palavra excede a largura útil; requer decisão manual.');const candidate=line?line+' '+word:word;if(line&&measured(candidate,font,source)>maxWidth){lines.push(line);line=word;}else line=candidate;}
  if(line)lines.push(line);return lines;
}
type Box={id:string;x:number;y:number;width:number;height:number};
function intersection(a:Box,b:Box){return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));}
function addLayer(b:RecipeBuilder,l:ReferenceSceneLayer){if(l.kind==='rect')b.rect(l.id,l);else if(l.kind==='line')b.line(l.id,l);else if(l.kind==='polygon')b.polygon(l.id,l);else throw Error('Only graphic layers can be copied as backgrounds');}
export interface CompositionOptions {
  typography?: { recipe: RecreationRecipe; layer: ReferenceSceneLayer };
  support?: string;
  cta?: string;
  textFlow?: 'balanced';
  maxTextWidth?: number;
}
export function compose(background:Background,module:Module,copy:string,options:CompositionOptions={}){
  const donor=options.typography;
  const font={...titleSource[module],...(donor?{fontFamily:donor.layer.fontFamily,fontWeight:donor.layer.fontWeight,letterSpacing:donor.layer.letterSpacing}: {})};
  const measurementSource=donor?.recipe ?? sources[module];
  if(donor) registerRecipeFonts(donor.recipe);
  const compositionFonts=new Map(fonts);
  for(const f of donor?.recipe.scene.fonts ?? []) compositionFonts.set(`${f.family}:${f.weight}`,f);
  const maxTextWidth=options.maxTextWidth ?? MAX_TEXT;
  if(!Number.isFinite(maxTextWidth)||maxTextWidth<MAX_TEXT||maxTextWidth>550) throw new Error('A largura de título deste compositor deve ficar entre 490 e 550 px.');
  const panelWidth=Math.max(588,maxTextWidth+64), halfPanel=panelWidth/2;
  const customization=Object.keys(options).length?JSON.stringify({font:donor?[donor.recipe.id,donor.layer.id]:null,support:options.support,cta:options.cta,...(options.textFlow?{textFlow:options.textFlow}:{}),...(options.maxTextWidth?{maxTextWidth}: {})}):'';
  const seed=`${background}-${module}-${copy}`+customization;
  const lines=options.textFlow==='balanced'?balancedLines(copy,text=>measured(text,font,measurementSource),maxTextWidth):breakWords(copy,font,measurementSource,maxTextWidth), lineHeight=font.fontSize*1.12;
  const lineData=lines.map((text,i)=>{const width=Math.ceil(measured(text,font,measurementSource))+2,angle=module==='ribbons'?(i%2?2.4:-3):0,r=angle*Math.PI/180,pad=module==='window'?0:14;return {text,width,height:lineHeight,angle,r,pad,extent:Math.abs((width+2*pad)*Math.sin(r))+(lineHeight+2*pad)*Math.cos(r)};});
  let offset=0;const boxes:Box[]=[];
  const titleTop=module==='ribbons'?250:module==='window'?255:235;
  for(const [i,l] of lineData.entries()){boxes.push({id:`title-${i}`,x:CX-(Math.abs((l.width+2*l.pad)*Math.cos(l.r))+Math.abs((l.height+2*l.pad)*Math.sin(l.r)))/2,y:titleTop+offset,width:Math.abs((l.width+2*l.pad)*Math.cos(l.r))+Math.abs((l.height+2*l.pad)*Math.sin(l.r)),height:l.extent});offset+=l.extent+12;}
  const titleBottom=titleTop+offset-12,supportY=titleBottom+38,ctaY=supportY+71;
  const contentBottom=ctaY+61;
  if(contentBottom>H-80)throw Error('O bloco ultrapassaria a prancheta. Este caso exige decisão de composição.');
  const bg=background==='paper'?sources.paper.scene.artboard.background:background==='window'?sources.window.scene.artboard.background:'#454A48';
  const b=new RecipeBuilder({id:sha256(seed).slice(0,32),title:`${labels[background]} + ${labels[module]}`,width:W,height:H,background:bg,notes:[
    'Experimento local de recombinação de três receitas. Critérios técnicos não medem beleza nem equivalem a aprovação humana.',
    'O título conserva o corpo, cresce a partir do centro, quebra por palavras e desloca apoio/CTA; realce acompanha os limites medidos.',
    'Esta receita V3 é um instantâneo. As regras flexíveis vivem no manifesto do ensaio; o Admin2 ainda usa seu compilador de caixas fixas.',
    'A foto é o asset previamente inserido pelo usuário na receita aprovada; não é a fotografia da referência nem uma geração nova.'
  ]},compositionFonts);
  if(background==='photo'){
    b.group('background-photo','Fotografia de fundo',{x:0,y:0,rotationDeg:0},b=>{b.rect('photo',{x:0,y:0,width:W,height:H,fill:'#454A48'});b.mediaSlot('photo','photo','Foto substituível');});
    b.rect('scrim',{x:0,y:0,width:W,height:H,fill:'#101923',opacity:.45});
  }else{
    const source=background==='paper'?sources.paper:sources.window,scale=W/source.scene.source.widthPx;
    for(const layer of source.scene.layers.filter(l=>l.id.startsWith('grade-'))){const l=structuredClone(layer);l.x*=scale;l.y*=scale;l.width*=scale;l.height*=scale;l.points=l.points.map(v=>v*scale);l.strokeWidth=Math.max(.7,l.strokeWidth*scale);l.opacity=.6;addLayer(b,l);}
    if(background==='window')for(const id of ['forma-verde-topo','forma-laranja-base','asterisco-base']){const l=get('window',id);l.x*=scale;l.y*=scale;l.width*=scale;l.height*=scale;l.points=l.points.map(v=>v*scale);l.strokeWidth*=scale;addLayer(b,l);}
  }
  const surfaceTop=150,surfaceHeight=Math.max(405,contentBottom-surfaceTop+35);
  const fill=module==='paper'?get('paper','papel-principal').fill:'#F3F3F1';
  b.group('composition','Bloco de conteúdo',{x:CX,y:0,rotationDeg:0},b=>{
    if(module==='paper'){
      b.rect('rear-left',{x:-halfPanel-2,y:surfaceTop+10,width:panelWidth-10,height:surfaceHeight-3,fill:get('paper','folha-traseira-1').fill,rotationDeg:-3});
      b.rect('rear-right',{x:-halfPanel+20,y:surfaceTop-13,width:panelWidth-16,height:surfaceHeight-1,fill:get('paper','folha-traseira-2').fill,rotationDeg:3});
      b.rect('paper-shadow',{x:-halfPanel+8,y:surfaceTop+9,width:panelWidth,height:surfaceHeight,fill:'#B8B3A9',cornerRadiusPx:22});
      b.rect('surface',{x:-halfPanel,y:surfaceTop,width:panelWidth,height:surfaceHeight,fill,cornerRadiusPx:22});
    }
    if(module==='window'){
      b.rect('window-shadow',{x:-halfPanel+11,y:surfaceTop+12,width:panelWidth,height:surfaceHeight,fill:'#111111'});
      b.rect('surface',{x:-halfPanel,y:surfaceTop,width:panelWidth,height:surfaceHeight,fill,strokeColor:'#111111',strokeWidth:5});
      b.line('divider',{x:-halfPanel,y:surfaceTop+56,width:panelWidth,height:1,points:[0,0,panelWidth,0],strokeColor:'#111111',strokeWidth:4});
      for(const [i,c]of ['#EF420C','#E9B708','#46AF45'].entries())b.rect(`control-${i}`,{x:-270+i*29,y:surfaceTop+18,width:19,height:19,fill:c,cornerRadiusPx:10,strokeColor:'#111111',strokeWidth:1.5});
    }
    b.text('eyebrow',{x:-225,y:module==='window'?surfaceTop+21:module==='paper'?surfaceTop+36:197,width:450,height:26,text:'DESIGN COMO PONTO DE PARTIDA',fontFamily:'Inter',fontWeight:700,fontSize:14,letterSpacing:1.2,align:'center',fill:module==='ribbons'?'#FFFFFF':'#191919'});
    if(module==='ribbons'){
      // Solid grounds make small copy readable independently of the photo.
      b.rect('eyebrow-ground',{x:-237,y:188,width:474,height:43,fill:'#111111',cornerRadiusPx:4,zIndex:58});
    }
    for(const [i,l]of lineData.entries()){
      const cy=boxes[i].y+l.extent/2;
      if(module!=='window'){
        const w=l.width+2*l.pad,h=l.height+2*l.pad;
        b.rect(`highlight-${i}`,{x:-w/2*Math.cos(l.r)+h/2*Math.sin(l.r),y:cy-w/2*Math.sin(l.r)-h/2*Math.cos(l.r),width:w,height:h,rotationDeg:l.angle,fill:module==='ribbons'?get('ribbons','ribbon-one-bg').fill:i%2?get('paper','realce-laranja').fill:get('paper','realce-roxo').fill});
      }
      b.text(`title-${i}`,{x:-l.width/2*Math.cos(l.r)+l.height/2*Math.sin(l.r),y:cy-l.width/2*Math.sin(l.r)-l.height/2*Math.cos(l.r),width:l.width,height:l.height,text:l.text,fontFamily:font.fontFamily!,fontWeight:font.fontWeight,fontSize:font.fontSize,lineHeight:1.12,letterSpacing:font.letterSpacing,align:'center',fill:module==='ribbons'?'#FFFFFF':'#191919',rotationDeg:l.angle});
    }
    if(module==='ribbons')b.rect('support-ground',{x:-250,y:supportY-7,width:500,height:50,fill:'#111111',cornerRadiusPx:4});
    b.text('support',{x:-245,y:supportY,width:490,height:39,text:options.support ?? 'Observe, ajuste e siga criando.',fontFamily:'Inter',fontWeight:400,fontSize:25,align:'center',fill:module==='ribbons'?'#FFFFFF':'#191919'});
    b.rect('cta',{x:-192,y:ctaY,width:384,height:56,fill:module==='window'?'#46AF45':module==='paper'?'#D7CEBC':'#FFFFFF',strokeColor:module==='window'?'#111111':null,strokeWidth:module==='window'?3:0,cornerRadiusPx:module==='ribbons'?6:0});
    b.text('cta-copy',{x:-180,y:ctaY+14,width:360,height:34,text:options.cta ?? 'Experimente uma nova ideia',fontFamily:'Inter',fontWeight:700,fontSize:22,align:'center',fill:'#111111'});
    b.field({id:'title',label:'Título — linhas materializadas',layerIds:lines.map((_,i)=>`title-${i}`),minScale:.7});
    b.field({id:'support',label:'Apoio',layerIds:['support']});b.field({id:'cta-copy',label:'Chamada',layerIds:['cta-copy']});
  });
  const recipe=b.build();recipe.createdAt='2026-10-01T00:00:00.000Z';
  // Header ground is behind the header label, irrespective of the decorative background count.
  const header=recipe.scene.layers.find(l=>l.id==='eyebrow')!,ground=recipe.scene.layers.find(l=>l.id==='eyebrow-ground');if(ground)ground.zIndex=header.zIndex-1;
  if(background==='photo')recipe.matrix!.media[0].asset=structuredClone(asset);
  const metrics=layerMeasurements(recipe);assert.ok(metrics.every(m=>m.fits),JSON.stringify({background,module,copy,overflow:metrics.filter(m=>!m.fits)}));
  const geometry=[...boxes,{id:'support',x:CX-250,y:supportY-7,width:500,height:50},{id:'cta',x:CX-192,y:ctaY,width:384,height:56}];
  const collisions=geometry.flatMap((a,i)=>geometry.slice(i+1).filter(b=>intersection(a,b)>.1).map(b=>[a.id,b.id]));
  const titleContrasts=lineData.map((_,i)=>contrast(module==='ribbons'?'#FFFFFF':'#191919',module==='ribbons'?'#244FDA':module==='paper'?(i%2?'#E98B67':'#C2A7DB'):'#F3F3F1'));
  const minContrast=Math.min(...titleContrasts),hierarchy=clamp((font.fontSize/25-1)/3),occupancy=clamp(lineData.reduce((n,l)=>n+l.width,0)/(maxTextWidth*lineData.length));
  assert.ok(minContrast>=4.5,'Pilot title/background contrast must be at least 4.5');
  const score=Number((40*(collisions.length?0:1)+30*clamp((minContrast-1)/6)+20*hierarchy+10*occupancy).toFixed(1));
  assert.equal(collisions.length,0,'Text blocks may not collide in this pilot');
  return {recipe,metrics,geometry,lines,score,criteria:{minTitleContrast:minContrast,hierarchy,occupancy,collisions},rules:{anchor:'center',fontSize:font.fontSize,maxTextWidth,padding:module==='window'?0:14,wrap:options.textFlow==='balanced'?'balanced-words':'words',flow:'title -> support -> cta',sourceModules:[background==='photo'?'window':background,module],photoAssetSource:background==='photo'?ids.window:null,typographySource:donor?{recipeId:donor.recipe.id,layerId:donor.layer.id,fontFamily:font.fontFamily,fontWeight:font.fontWeight}:null},contentBottom};
}
