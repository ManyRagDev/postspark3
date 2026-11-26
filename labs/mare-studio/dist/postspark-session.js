import { uploadStudioAsset } from "./studio-upload.js";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const integrated = /^\/mare(?:\/|$)/.test(globalThis.location?.pathname || "");
let session;

async function response(path, options = {}) {
  const headers = new Headers(options.headers);
  if (session && (options.method || path === "/api/mare/projects")) {
    headers.set("X-PostSpark-Editor-Owner", session.actorId);
  }
  const result = await fetch(path, {credentials:"same-origin", cache:"no-store", ...options, headers});
  if (!result.ok) {
    const details = await result.json().catch(() => ({}));
    const message = details.message || details.error;
    const error = new Error(typeof message === "string" ? message : "Não foi possível acessar o projeto no PostSpark.");
    error.status = result.status;
    throw error;
  }
  return result;
}
const json = async (path, options) => (await response(path,options)).json();
const post = (path, body) => json(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
function identifier(value) {
  if (!uuid.test(value)) throw Error("Identificador de projeto inválido.");
  return value;
}

export async function openPostSpark() {
  if (!integrated) return null;
  const url = new URL(location.href);
  const caps = await json("/api/mare/capabilities");
  if (!caps.editor) {
    const recovery=await json("/api/mare/projects");
    const error=Error("O Maré Studio ainda não está disponível para esta conta.");
    error.recoverable=recovery.projects || [];
    throw error;
  }
  const {actorId, projects} = await json("/api/mare/projects");
  identifier(actorId);
  const anchorId = url.searchParams.get("anchor");
  const anchor = anchorId ? await json("/api/mare/anchors/"+identifier(anchorId)) : null;
  const projectParam = url.searchParams.get("project");
  const projectId = identifier(anchor?.projectId || projectParam || anchor?.id || crypto.randomUUID());
  const record = projects.find(p => p.id === projectId && !p.anchorId);
  if (!anchor && projectParam && !record) throw Error("O projeto não está disponível para esta conta.");
  const team=anchor?anchor.workspaceId:record?record.workspaceId:url.searchParams.get("workspace");
  const workspaceId=team?identifier(team):undefined;
  session = {actorId,projects,projectId,anchor,workspaceId,mobileContextual:caps.mobileContextual===true,revisionId:record?.revisionId ?? null,
    initialRevision:anchor?.revisionId ?? record?.revisionId ?? null,projectRender:caps.projectRender===true,paid:caps.paid === true,speech:caps.speech===true};
  return session;
}
export async function listAccountProjects() {
  const result = await json("/api/mare/projects");
  if (result.actorId !== session.actorId) throw Error("Sua sessão mudou. Reabra o editor.");
  session.projects = result.projects;
  return result.projects;
}
export function canUsePaid() {return Boolean(session?.paid);}
export async function assetBytes(id) {
  return (await response("/api/mare/assets/"+identifier(id))).blob();
}
async function upload(kind, blob) {
  const result = await uploadStudioAsset(blob,{kind,editorOwner:session.actorId,workspaceId:session.workspaceId,anchorId:session.anchor?.id});
  return identifier(result.assetId);
}
export async function saveAccountProject(project, blob) {
  const newProject=!session.anchor && session.localProjectId && session.localProjectId!==project.id;
  const id=newProject ? crypto.randomUUID() : session.projectId;
  const revisionId = await upload("project",blob);
  await post("/api/mare/projects",{id,name:project.name,revisionId,expectedRevisionId:newProject?null:session.revisionId,workspaceId:session.workspaceId,...(session.anchor?{anchorId:session.anchor.id}:{})});
  session.revisionId = revisionId; session.projectId=id; session.localProjectId=project.id;
  if (!session.anchor) {
    const url=new URL(location.href); url.searchParams.set("project",session.projectId);
    history.replaceState(null,"",url);
  }
  return revisionId;
}
export async function returnToPostSpark(projectBlob, videoBlob, compositionId) {
  const anchor=session?.anchor;
  if (!anchor) throw Error("Este projeto avulso ainda não tem um design vinculado.");
  await json("/api/mare/anchors/"+identifier(anchor.id));
  const revisionId=await upload("project",projectBlob);
  const videoAssetId=await upload("video",videoBlob);
  return returnProjectVideo(revisionId,videoAssetId,compositionId);
}
export async function returnProjectVideo(revisionId,videoAssetId,compositionId) {
  const anchor=session.anchor;
  const path="/api/mare/anchors/"+identifier(anchor.id);
  await post(path+"/return",{revisionId,videoAssetId,expectedRevisionId:anchor.revisionId,
    expectedRevision:anchor.expectedRevision,projectId:session.projectId,
    scope:compositionId?"composition":"montage",...(compositionId?{compositionId}:{})});
  return (anchor.agencyProjectId?"/agency":"/thevoid")+"?mareReturn="+encodeURIComponent(anchor.id);
}
export async function processorResult(operation,payload,signal) {
  if(!canUsePaid()) throw Error("Esta operação ainda não está disponível para sua conta.");
  const base="/api/mare/processor";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint = Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,"0")).join("");
  const key = ["mare-job",session.actorId,session.anchor?.id || session.projectId,operation,fingerprint].join("/");
  let id = localStorage.getItem(key);
  if (!id) {
    const quote = await post(base+"/quote", {operation,payload,workspaceId:session.workspaceId,...(session.anchor?{anchorId:session.anchor.id}:{})});
    id = identifier(quote.id);
    if (!Number.isSafeInteger(quote.sparks) || quote.sparks < 0) throw Error("Cotação inválida.");
    signal?.throwIfAborted();
    const action = operation === "firstCut" ? "Gerar roteiro, direção e prévia com os materiais selecionados" :
      operation === "review" ? "Enviar o vídeo com áudio para revisão" : operation === "narration" ? "Gerar narração e enviar o roteiro ao provedor" :
      "Enviar o pedido e o contexto do projeto ao provedor";
    const balance=Number.isFinite(quote.balance)?" Saldo da conta: "+quote.balance+" Sparks.":"";
    if (!window.confirm(action+" por "+quote.sparks+" Sparks?"+balance)) throw Error("Operação cancelada.");
    localStorage.setItem(key,id);
  }
  const job = base+"/jobs/"+identifier(id);
  try { await post(job+"/start",{}); }
  catch(error){ if ([402,403,404,409].includes(error.status)) localStorage.removeItem(key); throw error; }
  for (;;) {
    signal?.throwIfAborted();
    const state=await json(job,{signal});
    if (state.status === "ready") {
      const result = await response(job+"/result",{signal});
      const blob = await result.blob();
      localStorage.removeItem(key);
      return new Response(blob, {headers:result.headers});
    }
    if (state.status === "failed") localStorage.removeItem(key);
    if(state.status==="failed" || state.status==="reconciling") throw Error(state.error || "O processamento não pôde ser concluído agora.");
    if(!["queued","running"].includes(state.status)) throw Error("Estado de processamento desconhecido.");
    await new Promise(resolve=>setTimeout(resolve,1200));
  }
}

export function editorialHistory(signal) {
  const scope=session.anchor?"anchorId="+session.anchor.id:"projectId="+session.projectId;
  return json("/api/mare/processor/editorial?"+scope+(session.workspaceId?"&workspaceId="+session.workspaceId:""),{signal});
}
export async function readEditorial(jobId,editor,revision,signal,manifest) {
  const base="/api/mare/processor/jobs/"+identifier(jobId);
  const [data,movie,portable]=await Promise.all([manifest || json(base+"/result",{signal}),
    response(base+"/editorial/movie",{signal}).then(r=>r.blob()),
    response(base+"/editorial/project",{signal}).then(r=>r.blob())]);
  const proposal={revision,apply:()=>editor.invoke("project.open",{file:new File([portable],"Projeto.mare")},revision)};
  return {...data,jobId,proposal,movie,portable};
}
export async function cloudFirstCut({session:editor,brief,cta,seconds,files,signal,report}) {
  const state=editor.inspect(),materials=[];
  if(state.clips.length||state.tracks.length||state.sound.assetId||state.compositions.some(c=>!Array.isArray(c.layers)||c.layers.length>0))
    throw Error("Comece em um projeto vazio para criar a peça.");
  report("Enviando os materiais para o PostSpark…",{});
  for(const file of files){
    const kind=file.type.split("/")[0];
    if(!["video","audio","image"].includes(kind))throw Error("Formato de material inválido.");
    const asset=await uploadStudioAsset(file,{kind,editorOwner:session.actorId,workspaceId:session.workspaceId,anchorId:session.anchor?.id,signal});
    materials.push({id:asset.assetId,name:file.name});
  }
  report("Preparando o primeiro corte…",{});
  const manifest=await (await processorResult("firstCut",{projectId:session.projectId,brief,cta,seconds,materials},signal)).json();
  return readEditorial(manifest.jobId,editor,state.revision,signal,manifest);
}
export async function cloudReview(editor,firstCutId,revision,signal,projectId=session.projectId) {
  const manifest=await (await processorResult("review",{projectId,firstCutId},signal)).json();
  return readEditorial(manifest.jobId,editor,revision,signal,manifest);
}

export const currentAnchorId=()=>session?.anchor?.id;

export const currentWorkspaceId=()=>session?.workspaceId;

export async function queueProjectRender(project,packed,{compositionId,format,frame,signal,progress}){
  if(!session.projectRender)throw Error("A renderização no servidor ainda não está disponível nesta conta.");
  signal?.throwIfAborted();
  const {renderScope}=await import("./editor-media.js");
  const {durationOf}=await import("./montage-model.js");
  const media=renderScope(project,compositionId);
  if(durationOf(media)>60.001 || media.clips.length+(media.extraTracks||[]).reduce((n,t)=>n+t.clips.length,0)>48)
    throw Error("O servidor aceita até 60 segundos e 48 clipes por renderização.");
  progress?.("Salvando a fonte editável no PostSpark…");
  const revisionId=await saveAccountProject(project,packed);
  const payload={revisionId,compositionId,format,frame,workspaceId:session.workspaceId};
  const base="/api/mare/processor";
  const quote=await post(base+"/project-render?quote=1",payload);
  signal?.throwIfAborted();
  let id=quote.id;
  if(!id){
    if(!Number.isSafeInteger(quote.remaining)||quote.remaining<=0)throw Error("A franquia mensal de renderização está esgotada.");
    if(!window.confirm("Preparar o vídeo no servidor usando 1 render da franquia? Restam "+quote.remaining+" de "+quote.limit+" neste mês."))
      throw Error("Renderização cancelada.");
    id=(await post(base+"/project-render",payload)).id;
  }
  const job=base+"/jobs/"+identifier(id);
  const cancel=()=>{void response(job,{method:"DELETE"}).catch(()=>{});};
  signal?.addEventListener("abort",cancel,{once:true});
  try{for(;;){
    signal?.throwIfAborted();
    const state=await json(job,{signal});
    if(state.status==="ready"){
      const manifest=await json(job+"/result",{signal});
      if(manifest.revisionId!==revisionId||manifest.mime!==(format==="webm"?"video/webm":"video/mp4"))throw Error("O resultado não corresponde ao projeto.");
      identifier(manifest.videoAssetId);
      return manifest;
    }
    if(!["queued","running","reconciling"].includes(state.status))throw Error(state.error || "Não foi possível concluir a renderização.");
    progress?.(state.status==="queued"?"Aguardando a fila de vídeo…":state.status==="reconciling"?"Verificando a entrega…":"Renderizando no servidor · "+Number(state.progress||0)+"%");
    await new Promise(resolve=>setTimeout(resolve,1200));
  }}finally{signal?.removeEventListener("abort",cancel);}
}
