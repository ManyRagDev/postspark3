import {arsenalHash} from "../../shared/arsenalContent";
import {createComponentDefinition,type ComponentDefinitionV1} from "../../shared/componentAssembly";
import {arsenalVariantSchema} from "../../shared/designArsenal";
import {aspectRatioDimensions} from "../../shared/aspectRatios";
import type {ComponentPackage} from "./extract";
import {sha256} from "./inventory";

export type FormatAdaptation={version:"uniform-portrait-v1";sourceComponentId:string;componentId:string;from:"5:6";to:"4:5";sourceArtboard:{width:number;height:number};targetArtboard:{width:number;height:number};scale:number;translation:{x:number;y:number};approval:"pending-own-review"};

/** Preserve local geometry and relations under an explicit uniform projection; never rewrite source. */
export function portraitAdaptations(p:ComponentPackage):{components:ComponentDefinitionV1[];provenance:FormatAdaptation[]}{
  const components:ComponentDefinitionV1[]=[],provenance:FormatAdaptation[]=[];
  for(const c of p.components.filter(c=>c.fragment.aspectRatio==="5:6")){
    const f=structuredClone(c.fragment),sourceArtboard={width:f.artboard.width,height:f.artboard.height},targetArtboard=aspectRatioDimensions["4:5"],scale=Math.min(targetArtboard.width/sourceArtboard.width,targetArtboard.height/sourceArtboard.height),translation={x:(targetArtboard.width-sourceArtboard.width*scale)/2,y:(targetArtboard.height-sourceArtboard.height*scale)/2};
    const root="authored-portrait-projection";
    if(f.groups.some(g=>g.id===root)||f.instances.some(i=>i.id===root))throw new Error("ID reservado de adaptação colide com origem");
    f.groups=f.groups.map(g=>({...g,parentId:g.parentId??root}));f.instances=f.instances.map(i=>({...i,parentId:i.parentId??root}));
    f.groups.push({id:root,label:"Projeção uniforme 5:6 para 4:5",parentId:null,zIndex:Math.min(...f.instances.map(i=>i.zIndex),0),x:translation.x,y:translation.y,width:sourceArtboard.width,height:sourceArtboard.height,rotation:0,opacity:1,scale});
    f.artboard={...f.artboard,...targetArtboard};f.aspectRatio="4:5";f.variantKey+="-portrait4x5";
    f.limitations.push("Adaptação 4:5 por projeção uniforme rastreável: conteúdo/efeitos/relações locais preservados; margens adicionais conservam fundo. Revisão própria obrigatória.");
    const {hash:oldHash,id:oldId,...base}=c,definition={...base,label:`${c.label} · 4:5`,source:{...c.source,variantKey:f.variantKey},aspectRatios:["4:5" as const],fragment:arsenalVariantSchema.parse(f)};
    const h=sha256(arsenalHash(definition)),id=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`,component=createComponentDefinition({...definition,id});
    components.push(component);provenance.push({version:"uniform-portrait-v1",sourceComponentId:c.id,componentId:id,from:"5:6",to:"4:5",sourceArtboard,targetArtboard,scale,translation,approval:"pending-own-review"});
    const sample=p.authorship.semanticSamples?.find(s=>s.componentId===c.id);if(sample)p.authorship.semanticSamples!.push({...structuredClone(sample),componentId:id});
  }
  return{components,provenance};
}
