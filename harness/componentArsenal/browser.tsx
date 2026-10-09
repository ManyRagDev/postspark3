import React,{useEffect,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {CanvasPostStage,type CanvasPostStageRef} from "../../client/src/pages/CanvasLab/components/CanvasPostStage";
import {INITIAL_POST} from "../../client/src/pages/CanvasLab/components/types";
import {loadMatrixMedia,type ReferenceMediaImage} from "../../client/src/pages/Admin2/matrixMedia";
import {ensureReferenceFontsLoaded} from "../../client/src/pages/CanvasLab/lib/referenceFonts";
import {layoutRichText} from "../../client/src/pages/CanvasLab/lib/richTextLayout";
import {buildDraftPreview,buildSemanticPreview,diagnosticFromComposition} from "./preview";
import type {ComponentPackage} from "./extract";
import type {SourceRecord} from "./inventory";
import type {ReferenceReconstructionSpecV2} from "../../shared/referenceReconstruction";
import "../../client/src/index.css";

const requestedDataset=new URLSearchParams(window.location.search).get("dataset")??"revision-7-cta";
const ROOT=`/artifacts/component-arsenal/${/^[A-Za-z0-9_-]+$/.test(requestedDataset)?requestedDataset:"revision-7-cta"}`;
type Row=SourceRecord&{package?:string;status:string;reason?:string};
function Review(){
  const [rows,setRows]=useState<Row[]>([]),[index,setIndex]=useState(0),[p,setPackage]=useState<ComponentPackage|null>(null),[media,setMedia]=useState<ReferenceMediaImage[]>([]),[mode,setMode]=useState<"original"|"quiet">("original"),[texts,setTexts]=useState<Record<string,string>>({}),[converted,setConverted]=useState<ReferenceReconstructionSpecV2|null>(null),[issues,setIssues]=useState<string[]>([]),[error,setError]=useState("");
  const sourceRef=useRef<CanvasPostStageRef>(null),convertedRef=useRef<CanvasPostStageRef>(null);
  const [portrait,setPortrait]=useState(false);
  useEffect(()=>{void fetch(`${ROOT}/inventory.json`).then(r=>r.json()).then(i=>setRows(i.rows)).catch(e=>setError(e.message));},[]);
  useEffect(()=>{let active=true;setPackage(null);setConverted(null);setError("");setTexts({});
    const row=rows[index];if(!row)return;if(!row.package){setError(row.reason??"Sem pacote preparado.");return;}
    void(async()=>{const response=await fetch(`${ROOT}/${row.package}`);if(!response.ok)throw new Error("Pacote indisponível");const packet:ComponentPackage=await response.json();const m=await loadMatrixMedia(packet.sourceSnapshot.recipe);await ensureReferenceFontsLoaded(packet.sourceSnapshot.recipe.scene);if(active){setMedia(m);setPackage(packet)}})().catch(e=>active&&setError(e.message));return()=>{active=false};
  },[rows,index]);
  useEffect(()=>{let active=true;if(!p)return;setConverted(null);setIssues([]);
    try{const usePortrait=portrait&&!!p.authorship.formatAdaptations?.length,sample=p.authorship.semanticSamples?.find(s=>s.presentation===(mode==="quiet"?"quiet":"source")&&p.components.find(c=>c.id===s.componentId)!.fragment.variantKey.endsWith("-portrait4x5")===usePortrait),adapted=usePortrait?p.components.find(c=>c.kind==="content"&&c.fragment.variantKey.endsWith(mode==="quiet"?"-quiet-portrait4x5":"-portrait4x5")&&!c.fragment.variantKey.includes("-typed-")&&(mode==="quiet"||!c.fragment.variantKey.includes("-quiet"))):undefined,result=sample?buildSemanticPreview(p,sample.componentId,layoutRichText,"medium"):buildDraftPreview(p,mode,layoutRichText,texts,adapted?.id),scene=diagnosticFromComposition(p,result.composition);void ensureReferenceFontsLoaded(scene).then(()=>{if(active){setConverted(scene);setIssues(result.composition.issues)}}).catch(e=>active&&setError(e.message));}catch(e){setError((e as Error).message)}return()=>{active=false};
  },[p,mode,texts,portrait]);
  const download=(ref:React.RefObject<CanvasPostStageRef|null>,suffix:string)=>{try{const a=document.createElement("a");a.href=ref.current!.exportPng4K();a.download=`${p?.source.referenceId}-${suffix}.png`;a.click()}catch(e){setError((e as Error).message)}};
  return <main style={{maxWidth:1320,margin:"auto",padding:24,color:"#edf2f7",background:"#111827",minHeight:"100vh",fontFamily:"system-ui"}}>
    <h1 style={{fontSize:28,fontWeight:700}}>Arsenal de componentes · revisão</h1>
    <p>87 receitas preservadas, mais seis variantes de duas famílias portadas do editor. Pacotes em rascunho: nenhuma publicação ou aprovação automática. A prancheta da direita usa o Stage oficial em diagnóstico dos elementos compilados; não comprova edição, persistência ou exportação do fluxo de produto.</p>
    <label><input type="checkbox" checked={portrait} onChange={e=>setPortrait(e.target.checked)}/> Visualizar adaptação 4:5 quando disponível (origem preservada à esquerda)</label>
    <div style={{display:"flex",gap:12,margin:"20px 0",flexWrap:"wrap"}}><select aria-label="Referência" value={index} onChange={e=>setIndex(Number(e.target.value))} style={{color:"black",maxWidth:650}}>{rows.map((r,i)=><option key={r.id} value={i}>{i+1} · {r.category} · {r.title} · {r.sourceFormat}</option>)}</select><button onClick={()=>setIndex(i=>Math.max(0,i-1))}>Anterior</button><button onClick={()=>setIndex(i=>Math.min(rows.length-1,i+1))}>Próxima</button><select aria-label="Adaptação" value={mode} onChange={e=>setMode(e.target.value as typeof mode)} style={{color:"black"}}><option value="original">Composição de origem</option><option value="quiet">Adaptação para leitura</option></select></div>
    {error&&<p role="alert" style={{color:"#fca5a5",whiteSpace:"pre-wrap"}}>{error}</p>}
    {p&&<><p>{p.source.title} · origem: {p.source.sourceApproval} · derivação: revisão pendente.</p><p style={{fontSize:12}}>SHA-256: {p.source.fileHash}</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(380px,1fr))",gap:24}}>
      <section><h2>Receita original · Stage oficial</h2><CanvasPostStage ref={sourceRef} post={structuredClone(INITIAL_POST)} zoom={1} isReadOnly diagnosticScene={p.sourceSnapshot.recipe.scene} diagnosticTextMode="fixed-lines" diagnosticLayerStyles={p.sourceSnapshot.recipe.adaptation?.layerStyles} diagnosticMediaImages={media} diagnosticNeutralFrame/><button onClick={()=>download(sourceRef,"source")}>Baixar PNG de origem</button></section>
      <section><h2>Elementos compilados · {mode==="quiet"?"leitura":"composição"}</h2>{converted&&<CanvasPostStage ref={convertedRef} post={structuredClone(INITIAL_POST)} zoom={1} isReadOnly diagnosticScene={converted} diagnosticTextMode="wrap" diagnosticNeutralFrame/>}<p role="status" style={{color:issues.length?"#fbbf24":"#a7f3d0"}}>{issues.join("; ")||"Sem pendências geométricas nesta prévia. Revisão visual continua necessária."}</p><p>Fotos aguardam preenchimento; a mídia ilustrativa da origem não é publicada.</p><button disabled={!converted} onClick={()=>download(convertedRef,"compiled")}>Baixar PNG compilado</button></section>
    </div><details><summary>Editar o conteúdo do ensaio</summary>{p.authorship.units.map(u=><label key={u.source} style={{display:"block",margin:"12px 0"}}>{u.role} · {u.fields.join(", ")}<textarea aria-label={u.source} value={texts[u.source]??u.sampleText} onChange={e=>setTexts(t=>({...t,[u.source]:e.target.value}))} style={{display:"block",width:"100%",minHeight:60,color:"black"}}/></label>)}</details><details><summary>Limitações e ajustes de fonte</summary><ul>{p.authorship.limitations.map(l=><li key={l}>{l}</li>)}{p.assetFiles.filter(a=>a.adjustment).map(a=><li key={`${a.manifest.id}:${a.sourceWeight}`}>{a.sourceFamily}: {a.adjustment}</li>)}</ul></details></>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Review/>);
