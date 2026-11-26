import {loadCompositionFont} from "./composition-fonts.js";
import {assertComposition,newComposition,newLayer,imageLayerFromFile} from "./composition-model.js";
import {drawComposition} from "./renderer.js";

export function selectionViewport({width,height}) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error("Dimensões de seleção inválidas.");
  const scale=Math.min(540/width,960/height);
  return {width:width*scale,height:height*scale,left:(540-width*scale)/2,top:(960-height*scale)/2,scale};
}
export async function readCanvasImage(value){
  const source=new URL(value,location.origin);
  if (!(source.protocol==="data:" && /^data:image\/(?:png|jpeg|webp);base64,/i.test(source.href)) &&
      !(source.origin===location.origin && /^\/(?:api\/(?:post-media|studio-media)|arsenal|backgrounds|images|designs)\//.test(source.pathname)))
    throw Error("A imagem da seleção precisa estar na biblioteca do PostSpark.");
  const result=await fetch(source,{credentials:"same-origin"});
  if(!result.ok)throw Error("Não foi possível abrir a imagem do design.");
  return result.blob();
}
export async function prepareSelection(source){
  const viewport=selectionViewport(source);
  if(!Array.isArray(source.layers)||!source.layers.length||source.layers.length>64)throw Error("Esta seleção excede a capacidade da composição.");
  const {scale,left,top}=viewport,document=newComposition("transparent"),media=new Map();
  const duration=source.seconds??4;
  const fonts=new Set();
  document.sourceSize={width:source.width,height:source.height};
  for(const incoming of source.layers){
    const type={rect:"square",ellipse:"circle",text:"text",image:"image"}[incoming.kind];
    if(!type)throw Error("Um dos elementos selecionados ainda não pode ser animado.");
    let layer;
    if(type==="image"){
      const blob=await readCanvasImage(incoming.url);
      layer=await imageLayerFromFile(new File([blob],incoming.name||"Imagem",{type:blob.type}),duration);
      const img=new Image();img.src=layer.src;await img.decode();media.set(layer.src,img);
      layer.fit=incoming.fit || "cover";
    }else layer=newLayer(type,duration);
    if(incoming.name)layer.name=incoming.name;
    Object.assign(layer,{width:incoming.width*scale,height:incoming.height*scale});
    Object.assign(layer.props,{x:left+incoming.x*scale,y:top+incoming.y*scale,rotation:incoming.rotation??0,opacity:incoming.opacity??1});
    if(incoming.color){
      if(!CSS.supports("color",incoming.color))throw Error("Cor incompatível em "+layer.name);
      const pixel=window.document.createElement("canvas").getContext("2d");
      pixel.fillStyle=incoming.color;pixel.fillRect(0,0,1,1);
      const [r,g,b,a]=pixel.getImageData(0,0,1,1).data;
      layer.color="#"+[r,g,b].map(value=>value.toString(16).padStart(2,"0")).join("");
      layer.props.opacity*=a/255;
    }
    if(type==="text"){
      Object.assign(layer,{text:incoming.text,fontSize:incoming.fontSize*scale,align:incoming.align??"left",fontWeight:incoming.fontWeight??400,
        italic:incoming.italic??false,fontFamily:incoming.fontFamily||"Arial",wrap:true});
      fonts.add(layer.fontFamily);
    }
    document.layers.push(layer);
  }
  assertComposition(document);
  const unavailable=(await Promise.all([...fonts].map(async family=>(await loadCompositionFont(family))?null:family))).filter(Boolean);
  return {document,unavailable,name:source.name||"Seleção do CanvasLab",duration,viewport,media,fonts:[...fonts]};
}
export function selectionPreview(canvas,{document,media,viewport}){
  canvas.width=360;
  canvas.height=Math.round(360*viewport.height/viewport.width);
  const ctx=canvas.getContext("2d");
  const ratio=canvas.width/viewport.width;
  ctx.setTransform(ratio,0,0,canvas.height/viewport.height,-viewport.left*ratio,-viewport.top*canvas.height/viewport.height);
  drawComposition(ctx,document,0,media);
}
