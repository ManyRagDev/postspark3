import { arsenalHash } from "../../shared/arsenalContent";
import {
  createComponentDefinition,
  type ComponentDefinitionV1,
} from "../../shared/componentAssembly";
import { arsenalPieceSchema, arsenalVariantSchema, type PieceDefinitionV2 } from "../../shared/designArsenal";
import { arsenalWorldGeometry } from "../../shared/arsenalGeometry";
import type { ComponentPackage } from "./extract";

// Initial audited sample. Each entry maps to a concrete source recipe already
// represented in the reference corpus; adding a family requires its own review.
const AUDITED_REFERENCES = new Set([
  "0623fb1c14937cd1e67e980b566710ba", // Papel empilhado
  "1c2fb00a82a764bab2f4374d03f67886", // Janelas sobrepostas
  "c5d8dcc1ddabea113d4f4a5ea76cde0d", // Tipografia extrudada
]);

const uuidFrom = (seed: string) => {
  const h = arsenalHash(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/**
 * Add carousel-ready development/closing content while preserving the actual
 * authored composition. New geometry and contrast adjustments are explicit; no demo copy is transferred.
 */
export function carouselIdentityComponents(p: ComponentPackage): ComponentDefinitionV1[] {
  if (!AUDITED_REFERENCES.has(p.source.referenceId) || p.source.destination !== "composition") return [];

  const source = p.components.find(c => c.kind === "content" &&
    !c.source.variantKey.includes("-quiet") &&
    !c.source.variantKey.includes("-typed-"));
  if (!source) return [];

  const result: ComponentDefinitionV1[] = [];
  for (const role of ["development", "closing"] as const) {
    const original = structuredClone(source.fragment);
    const headline = original.bindings.find(b => b.source === "block:headline:0:text");
    const body = original.bindings.find(b => b.source === "block:body:0:text");
    const cta = original.bindings.find(b => b.source === "block:callToAction:0:text");
    if (!headline || !body) continue;
    // Identical reading styles become one flowing paragraph; display fragments
    // with different face treatments retain their canonical fragment contract.
    for(const binding of [body,cta]){
      if(!binding||binding.targetIds.length<2)continue;
      const styles=binding.targetIds.map(id=>{const node=original.instances.find(i=>i.id===id)!;const {contentFragment:_fragment,...style}=source.pieces[node.pieceHash];return arsenalHash(style);});
      if(new Set(styles).size===1)binding.targetIds=[binding.targetIds[0]];
    }

    // Source layers that carry editable authored text are limited to the
    // canonical slots. Source surfaces, rotated accents, media frames and
    // fixed non-copy ornaments stay at their authored geometry and z-order.
    const keptTextIds = new Set([
      ...headline.targetIds,
      ...body.targetIds,
      ...(cta?.targetIds ?? []),
    ]);
    const allIds = new Set(original.instances.map(i => i.id));
    const textIds = new Set(Object.keys(source.pieces).length
      ? original.instances.filter(i => source.pieces[i.pieceHash]?.kind === "text").map(i => i.id)
      : []);
    // Keep the structural pieces that carry this source's visual signature;
    // omit unrelated cover copy/ornament so the slide has room to breathe.
    const supportIds = p.source.referenceId === "0623fb1c14937cd1e67e980b566710ba"
      ? new Set(["sombra-papel", "papel-principal"])
      : p.source.referenceId === "1c2fb00a82a764bab2f4374d03f67886"
        ? new Set(["cartao-conteudo", "cartao-conteudo-sombra", "titulo-janela", "titulo-janela-sombra", "janela-foto-controle-0", "janela-foto-controle-1", "janela-foto-controle-2", "cta-fundo", "cta-sombra"])
        : new Set<string>();
    const retained = new Set([...allIds].filter(id =>
      (!textIds.has(id) && (supportIds.size === 0 || supportIds.has(id) || source.pieces[original.instances.find(i => i.id === id)!.pieceHash]?.kind === "media")) || keptTextIds.has(id)));
    original.instances = original.instances.filter(i => retained.has(i.id));
    // Resolve source group transforms once, then author the carousel layout in
    // artboard coordinates so new boxes are not transformed a second time.
    const authoredPieces: Record<string, PieceDefinitionV2> = structuredClone(source.pieces);
    for (const instance of original.instances) {
      const world = arsenalWorldGeometry({...instance,label:instance.id,scale:1}, original.groups);
      let oldPiece = authoredPieces[instance.pieceHash];
      if(keptTextIds.has(instance.id))instance.opacity=1;
      if(oldPiece.contentFragment && original.bindings.some(b=>b.targetIds.length===1&&b.targetIds[0]===instance.id)){
        const {contentFragment:_fragment,...style}=oldPiece;
        oldPiece=arsenalPieceSchema.parse(style);instance.pieceHash=arsenalHash(oldPiece);authoredPieces[instance.pieceHash]=oldPiece;
      }
      instance.x=world.x; instance.y=world.y; instance.rotation=world.rotation;
      instance.width*=world.scale; instance.height*=world.scale; instance.parentId=null;
      if (oldPiece && oldPiece.kind === "text" && world.scale !== 1) {
        const adjusted=arsenalPieceSchema.parse({ ...oldPiece, fontSize:oldPiece.fontSize*world.scale,
          ...(oldPiece.extrusion ? {extrusion:{...oldPiece.extrusion,offsetX:oldPiece.extrusion.offsetX*world.scale,offsetY:oldPiece.extrusion.offsetY*world.scale}} : {}) });
        const hash=arsenalHash(adjusted); authoredPieces[hash]=adjusted; instance.pieceHash=hash;
      }
    }
    original.groups = [];
    original.bindings = original.bindings
      .filter(b => b === headline || b === body || b === cta)
      .map(b => ({
        ...b,
        source: b === headline ? "block:headline:0:text" : b === body ? "block:body:0:text" : "block:callToAction:0:text",
        required: b === headline,
      }));
    original.relations = original.relations.filter(r =>
      r.inputs.every(id => retained.has(id)) && r.outputs.every(o => retained.has(o.targetId)));
    if (original.mediaSlots) original.mediaSlots = original.mediaSlots.filter(s => retained.has(s.id));
    if (original.lineBoxOverlaps) {
      original.lineBoxOverlaps = original.lineBoxOverlaps.filter(pair => retained.has(pair.a) && retained.has(pair.b));
      if (!original.lineBoxOverlaps.length) delete original.lineBoxOverlaps;
    }
    const W = original.artboard.width, H = original.artboard.height;
    const projectionScale=Math.min(1080/W,1350/H), minReadableFont=36.4/projectionScale;
    const target = (binding: typeof headline | undefined) => binding?.targetIds.flatMap(id => original.instances.filter(i => i.id === id)) ?? [];
    const headlineNodes = target(headline), bodyNodes = target(body), ctaNodes = target(cta);
    const layoutText = (nodes: typeof original.instances, box: { x:number; y:number; width:number; height:number }, countScale:number) => {
      const gap = box.height * .045, each = Math.max(1, (box.height - gap * Math.max(0,nodes.length-1)) / Math.max(1,nodes.length));
      nodes.forEach((node,index) => { node.parentId=null; node.x=box.x; node.y=box.y+index*(each+gap); node.width=box.width; node.height=each; });
      // The textFit relations retain the source font/style while allowing copy
      // to reflow within the newly authored development/closing region.
      for(const node of nodes) {
        const old=authoredPieces[node.pieceHash];
        if(old?.kind==="text"){
          const display=headlineNodes.some(i=>i.id===node.id);
          const fontSize=Math.max(minReadableFont,Math.min(old.fontSize*countScale,each*.70/old.lineHeight,display?W*.1:W*.038));
          if(Math.abs(fontSize-old.fontSize)>.01){
            const factor=fontSize/old.fontSize;
            const adjusted=arsenalPieceSchema.parse({...old,fontSize,
              ...(old.extrusion?{extrusion:{...old.extrusion,offsetX:old.extrusion.offsetX*factor,offsetY:old.extrusion.offsetY*factor}}:{})});
            const hash=arsenalHash(adjusted);authoredPieces[hash]=adjusted;node.pieceHash=hash;
          }
        }
        const fit=original.relations.find(r=>r.kind==="textFit"&&r.outputs.some(o=>o.targetId===node.id));
        if(fit){const piece=authoredPieces[node.pieceHash];fit.parameters={...fit.parameters,maxWidth:box.width,maxHeight:each,minFontSize:piece?.kind==="text"?Math.min(piece.fontSize,Math.max(minReadableFont,piece.fontSize*.76)):minReadableFont};}
      }
    };
    if (p.source.referenceId === "0623fb1c14937cd1e67e980b566710ba") {
      layoutText(headlineNodes, role === "development" ? {x:W*.23,y:H*.22,width:W*.54,height:H*.35} : {x:W*.24,y:H*.20,width:W*.52,height:H*.29}, role === "development" ? .78 : .66);
      layoutText(bodyNodes,{x:W*.24,y:H*.60,width:W*.52,height:H*.12},.9);
      layoutText(ctaNodes,{x:W*.29,y:H*.76,width:W*.42,height:H*.07},.9);
      const surface=original.instances.find(i=>i.id==="sombra-papel");
      if(surface){surface.parentId=null;surface.x=W*.12;surface.y=H*.12;surface.width=W*.76;surface.height=H*.72;}
      if(surface) original.relations.push({id:"carousel-paper-fit",kind:"surfaceFit",version:1,enabled:true,inputs:headlineNodes.map(i=>i.id).concat(bodyNodes.map(i=>i.id)),outputs:[{targetId:surface.id,properties:["x","y","width","height"]}],parameters:{padding:{left:W*.06,right:W*.06,top:H*.05,bottom:H*.05},minWidth:W*.76,minHeight:H*.32}});
    } else if (p.source.referenceId === "1c2fb00a82a764bab2f4374d03f67886") {
      layoutText(headlineNodes, role === "development" ? {x:W*.12,y:H*.13,width:W*.76,height:H*.18} : {x:W*.16,y:H*.16,width:W*.68,height:H*.12}, role === "development" ? .9 : .72);
      layoutText(bodyNodes,{x:W*.17,y:H*.40,width:W*.66,height:H*.28},.82);
      layoutText(ctaNodes,{x:W*.24,y:H*.77,width:W*.52,height:H*.08},.9);
      const panel=original.instances.find(i=>i.id==="cartao-conteudo");
      if(panel){panel.parentId=null;panel.x=W*.12;panel.y=H*.35;panel.width=W*.76;panel.height=H*.39;}
      const windowSurface=original.instances.find(i=>i.id==="titulo-janela");
      if(windowSurface){
        windowSurface.rotation=0;
        original.relations.push({id:"carousel-window-title-fit",kind:"surfaceFit",version:1,enabled:true,inputs:headlineNodes.map(i=>i.id),outputs:[{targetId:windowSurface.id,properties:["x","y","width","height"]}],parameters:{padding:{left:W*.035,right:W*.035,top:H*.07,bottom:H*.025},minWidth:W*.76,minHeight:H*.16}});
        for(let n=0;n<3;n++){
          const control=original.instances.find(i=>i.id===`janela-foto-controle-${n}`);if(!control)continue;
          control.zIndex=windowSurface.zIndex+1+n;control.rotation=0;control.width=W*.018;control.height=W*.018;
          for(const axis of ["x","y"] as const)original.relations.push({id:`carousel-control-${n}-${axis}`,kind:"anchor",version:1,enabled:true,inputs:[windowSurface.id],outputs:[{targetId:control.id,properties:[axis]}],parameters:{axis,referenceEdge:"start",targetEdge:"start",offset:axis==="x"?W*(.025+n*.03):H*.022}});
        }
      }
      if(panel){panel.rotation=0;original.relations.push({id:"carousel-window-content-fit",kind:"surfaceFit",version:1,enabled:true,inputs:bodyNodes.map(i=>i.id),outputs:[{targetId:panel.id,properties:["x","y","width","height"]}],parameters:{padding:{left:W*.035,right:W*.035,top:H*.025,bottom:H*.025},minWidth:W*.76,minHeight:H*.20}});}
      const ctaSurface=original.instances.find(i=>i.id==="cta-fundo");
      if(ctaSurface){ctaSurface.rotation=0;original.relations.push({id:"carousel-cta-fit",kind:"surfaceFit",version:1,enabled:true,inputs:ctaNodes.map(i=>i.id),outputs:[{targetId:ctaSurface.id,properties:["x","y","width","height"]}],parameters:{padding:{left:W*.035,right:W*.035,top:H*.02,bottom:H*.02},minWidth:W*.55,minHeight:H*.07}});}
      for(const node of ctaNodes){const piece=arsenalPieceSchema.parse({...authoredPieces[node.pieceHash],fill:"#111111"}),hash=arsenalHash(piece);authoredPieces[hash]=piece;node.pieceHash=hash;}
      original.limitations.push("CTA usa o preto real da tipografia da referência sobre a tarja laranja para garantir contraste; controles reposicionados no cabeçalho da janela.");
    } else {
      // Preserve the source's extruded display treatment while scaling its
      // grouped headline; enlarge the tiny citation copy for carousel reading.
      const currentHeadline=headlineNodes;
      const headlineBox=role==="development"?{x:W*.12,y:H*.12,width:W*.76,height:H*.40}:{x:W*.18,y:H*.10,width:W*.64,height:H*.30};
      layoutText(currentHeadline,headlineBox,role==="development"?.82:.68);
      layoutText(bodyNodes,{x:W*.14,y:role==="development"?H*.68:H*.55,width:W*.72,height:H*.20},.9);
      const minStroke=3/projectionScale;
      for(const node of currentHeadline){
        const old=authoredPieces[node.pieceHash];
        if(old?.kind==="text"&&old.extrusion){const adjusted=arsenalPieceSchema.parse({...old,stroke:"#161616",strokeWidth:Math.max(old.strokeWidth,minStroke)});const hash=arsenalHash(adjusted);authoredPieces[hash]=adjusted;node.pieceHash=hash;}
      }
      original.limitations.push("A tipografia extrudada conserva face e extrusão; contorno escuro autorado para contraste em fundo claro. Avaliar com a copy final.");
    }
    if(p.source.referenceId==="0623fb1c14937cd1e67e980b566710ba"){
      const main=original.instances.find(i=>i.id==="papel-principal"),shadow=original.instances.find(i=>i.id==="sombra-papel");
      if(main&&shadow){
        main.rotation=0;shadow.rotation=0;
        original.relations=original.relations.filter(r=>r.id!=="carousel-paper-fit");
        original.relations.push({id:"carousel-paper-fit",kind:"surfaceFit",version:1,enabled:true,inputs:headlineNodes.concat(bodyNodes,ctaNodes).map(i=>i.id),outputs:[{targetId:main.id,properties:["x","y","width","height"]}],parameters:{padding:{left:W*.065,right:W*.065,top:H*.05,bottom:H*.05},minWidth:W*.72,minHeight:H*.65}});
      }
    }
    for(const [shadowId,surfaceId]of [["sombra-papel","papel-principal"],["cartao-conteudo-sombra","cartao-conteudo"],["titulo-janela-sombra","titulo-janela"],["cta-sombra","cta-fundo"]]){
      const shadow=original.instances.find(i=>i.id===shadowId),surface=original.instances.find(i=>i.id===surfaceId);if(!shadow||!surface)continue;
      shadow.rotation=surface.rotation;
      original.relations.push({id:`carousel-shadow-size-${shadowId}`,kind:"surfaceFit",version:1,enabled:true,inputs:[surfaceId],outputs:[{targetId:shadowId,properties:["width","height"]}],parameters:{padding:{left:0,right:0,top:0,bottom:0},minWidth:1,minHeight:1}});
      for(const axis of ["x","y"] as const)original.relations.push({id:`carousel-shadow-${shadowId}-${axis}`,kind:"anchor",version:1,enabled:true,inputs:[surfaceId],outputs:[{targetId:shadowId,properties:[axis]}],parameters:{axis,referenceEdge:"start",targetEdge:"start",offset:axis==="x"?W*.012:H*.009}});
    }
    const footer=original.instances.find(i=>i.id==="footer-rule");
    if(footer){footer.x=W*.12;footer.y=(role==="development"?.64:.51)*H;footer.width=W*.76;const piece=arsenalPieceSchema.parse({...authoredPieces[footer.pieceHash],points:[0,0,W*.76,0]}),hash=arsenalHash(piece);authoredPieces[hash]=piece;footer.pieceHash=hash;}
    original.limitations.push("Blocos de leitura/CTA com estilo idêntico foram unificados para fluxo natural. CTA canônico opcional é visível quando preenchido; headline conserva fragmentos e tratamentos distintos.");
    const usedAssets = new Set(original.instances.map(i => authoredPieces[i.pieceHash]?.fontAssetId).filter(Boolean));
    const assets = source.assets.filter(a => usedAssets.has(a.id));
    original.assetIds = assets.map(a => a.id);
    original.variantKey += `-carousel-${role}`;
    const fragment = arsenalVariantSchema.parse(original);
    const pieces = Object.fromEntries(fragment.instances.map(i => [i.pieceHash, authoredPieces[i.pieceHash]]));
    original.limitations.push("Variante de carrossel autorada: regiões, tamanhos e suportes adaptados; peças/fontes e tratamentos da referência mantidos. Campos demonstrativos externos à copy foram removidos.");
    const { hash: _ignoredHash, ...base } = source;
    const authored = {
      ...base,
      id: source.id,
      label: `${source.label} · carrossel ${role === "development" ? "desenvolvimento" : "encerramento"}`,
      description: role === "development"
        ? "Variação para desenvolvimento do argumento com identidade geométrica original e slots de copy canônicos."
        : "Variação para encerramento com identidade geométrica original; CTA editável somente quando a referência o autorou.",
      source: { ...source.source, variantKey: fragment.variantKey },
      roles: [role],
      densities: ["balanced" as const, "expressive" as const],
      fragment,
      pieces,
      assets,
      colorRoles: Object.fromEntries(fragment.instances.map(i => [i.id,
        source.colorRoles?.[i.id] ?? "preserve" as const])),
      removableElementIds: (source.removableElementIds ?? []).filter(id => fragment.instances.some(i => i.id === id)),
    };
    const {id:_ignoredId,...definition}=authored;
    result.push(createComponentDefinition({...definition,id:uuidFrom(arsenalHash(definition))}));
  }
  return result;
}
