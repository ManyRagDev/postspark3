/** Explicit port of the two editor-only families. No generated source is modified. */
import fs from "node:fs/promises";
import path from "node:path";
import {GlobalFonts} from "@napi-rs/canvas";
import {create as readFont} from "fontkit";
import {OFFICIAL_FAMILIES_META} from "../../client/src/pages/CanvasLab/components/types";
import {canvasTypography} from "../../client/src/pages/CanvasLab/lib/catalogTypography";
import {layoutRichText} from "../../client/src/pages/CanvasLab/lib/richTextLayout";
import {referenceFontFamily} from "../../client/src/pages/CanvasLab/lib/referenceFonts";
import type {ReferenceFontAsset} from "../../shared/referenceReconstruction";
import {recipeFromSpec,type CompactSpec} from "../designBatch/builder";
import {installNativeSurface,renderRecipeAsync} from "../designBatch/native";
import {sha256} from "./inventory";

const out="artifacts/component-arsenal/editor-extension-sources";
const fontPath="harness/componentArsenal/fonts/bebas-neue.ttf",licensePath="harness/componentArsenal/fonts/bebas-neue-OFL.txt";
const bytes=await fs.readFile(fontPath),license=await fs.readFile(licensePath,"utf8"),font=readFont(bytes);
if("fonts"in font||font.familyName!=="Bebas Neue"||!license.includes("SIL OPEN FONT LICENSE"))throw new Error("Fonte/licença Bebas Neue não conferida.");
const hash=sha256(bytes),f:ReferenceFontAsset={family:"Bebas Neue",weight:400,sourceUrl:"https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf",mimeType:"font/ttf",dataUrl:`data:font/ttf;base64,${bytes.toString("base64")}`,sha256:hash,license:"open-source"};
const inter=await fs.readFile("shared/typography/fonts/files/inter.ttf"),bodyFont:ReferenceFontAsset={family:"Inter",weight:400,sourceUrl:null,mimeType:"font/ttf",dataUrl:`data:font/ttf;base64,${inter.toString("base64")}`,sha256:sha256(inter),license:"open-source"};
const fonts=new Map([["Bebas Neue:400",f],["Inter:400",bodyFont]]);
installNativeSurface();
for(const asset of fonts.values())GlobalFonts.register(Buffer.from(asset.dataUrl!.split(",")[1],"base64"),referenceFontFamily({fonts:[asset]} as any,asset.family,asset.weight));
await fs.mkdir(path.join(out,"recipes"),{recursive:true});await fs.mkdir(path.join(out,"previews"),{recursive:true});
const sourceFiles=await Promise.all(["client/src/pages/CanvasLab/components/CanvasPostStage.tsx","client/src/pages/CanvasLab/components/types.ts","client/src/pages/CanvasLab/lib/catalogTypography.ts"].map(async file=>({path:file,sha256:sha256(await fs.readFile(file))})));
const items=[];
for(const familyId of ["stroke-impact","cinematic-depth"] as const){
  const meta=OFFICIAL_FAMILIES_META[familyId],variants=[];
  for(const aspectRatio of ["1:1","5:6","9:16"] as const){
    const W=360,H=360*Number(aspectRatio.split(":")[1])/Number(aspectRatio.split(":")[0]),t=canvasTypography(familyId);
    const headline="Sua ideia ganha presença.",body="Clareza na mensagem. Intenção em cada detalhe.";
    const headLayout=layoutRichText({text:headline,width:312,fontSize:t.headlineBase,fontFamily:referenceFontFamily({fonts:[f]}as any,"Bebas Neue",400),fontStyle:"400",fill:meta.defaultPalette.text,align:"left",letterSpacing:t.headlineLetterSpacing,lineHeight:t.headlineLineHeight});
    const bodyLayout=layoutRichText({text:body,width:312,fontSize:t.bodyBase,fontFamily:referenceFontFamily({fonts:[bodyFont]}as any,"Inter",400),fontStyle:"400",fill:meta.defaultPalette.text,align:"left",lineHeight:1.45});
    const availableHeight=H-(aspectRatio==="9:16"?64:32),y=Math.max(36,Math.round((availableHeight-headLayout.height-bodyLayout.height-20)/2));
    const spec:CompactSpec={stem:`editor-${familyId}-${aspectRatio.replace(":","x")}`,title:`${meta.name} · ${aspectRatio} · renderer oficial`,width:W,height:H,background:meta.defaultPalette.background,
      notes:["Porta explicitamente a geometria do Stage oficial, com badge/step/foto desligados e peso regular 400 verificável.","Stroke Impact atualmente altera tipografia; a variável isStrokeImpact não produz contorno automaticamente no Stage. Não se inventou o efeito anunciado na descrição histórica.","Cinematic Depth inclui a moldura real de 12px e borda branca a 8% de opacidade.",`Fontes e renderer rastreados por SHA-256. Bebas Neue ${hash}; licença OFL preservada.`],groups:[{id:"copy",label:"Título e apoio",transform:{x:0,y:0,rotationDeg:0}}],layers:[]};
    if(familyId==="cinematic-depth")spec.layers.push({id:"cinematic-frame",kind:"line",x:12,y:12,width:W-24,height:H-24,points:[0,0,W-24,0,W-24,H-24,0,H-24,0,0],strokeColor:"#FFFFFF",strokeWidth:1,opacity:.08});
    spec.layers.push({id:"headline",kind:"text",x:24,y,width:312,height:headLayout.height,text:headline,fontFamily:"Bebas Neue",fontWeight:400,fontSize:t.headlineBase,lineHeight:t.headlineLineHeight,letterSpacing:t.headlineLetterSpacing,fill:meta.defaultPalette.text,groupId:"copy",fieldId:"headline",fieldLabel:"Título",minScale:.85});
    spec.layers.push({id:"body",kind:"text",x:24,y:y+headLayout.height+12,width:312,height:bodyLayout.height,text:body,fontFamily:"Inter",fontWeight:400,fontSize:t.bodyBase,lineHeight:1.45,fill:meta.defaultPalette.text,groupId:"copy",fieldId:"body",fieldLabel:"Apoio",minScale:.85});
    const recipe=recipeFromSpec(spec,fonts),recipeFile=`recipes/${familyId}-${aspectRatio.replace(":","x")}.json`,preview=`previews/${familyId}-${aspectRatio.replace(":","x")}.png`,recipeBytes=JSON.stringify(recipe,null,2)+"\n";
    await fs.writeFile(path.join(out,recipeFile),recipeBytes);await fs.writeFile(path.join(out,preview),await renderRecipeAsync(recipe));
    variants.push({format:aspectRatio,recipe:recipeFile,preview,sha256:sha256(recipeBytes)});
  }
  items.push({id:familyId,title:meta.name,category:"editor-extension",status:"Renderer oficial portado; revisão visual própria pendente",variants});
}
for(const file of sourceFiles)if(sha256(await fs.readFile(file.path))!==file.sha256)throw new Error(`Renderer mudou:${file.path}`);
await fs.writeFile(path.join(out,"manifest.json"),JSON.stringify({format:"postspark.private-design-collection",version:1,items,sourceFiles,font:{sha256:hash,license:licensePath,sourceUrl:f.sourceUrl},status:"draft-port-awaiting-official-browser-comparison"},null,2)+"\n");
console.log(JSON.stringify({out,families:2,recipes:6,fontHash:hash,approval:"pending"}));
