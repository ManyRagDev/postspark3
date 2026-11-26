// Loaded only by the private render worker. The worker resolves every input and checkpoints model requests.
import {projectEditor as session} from "./app.js";
import {createEditorialCut} from "./editorial-run.js";
import {reviewEditorialCut} from "./editorial-review.js";

import { setWorkerMp4Encoder } from "./precise-export.js";

setWorkerMp4Encoder(async (source, signal) => {
  const response = await fetch("/encode-mp4", {method: "POST", body: source, signal});
  if (!response.ok) throw Error("O servidor não conseguiu preparar o MP4.");
  return response.blob();
});

export async function runEditorial(input) {
  const signal = new AbortController().signal;
  const localBlob = async name => {
    const r = await fetch("/input/"+name);
    if (!r.ok) throw Error("Mídia de entrada indisponível.");
    return r.blob();
  };
  if(input.operation==="packageRender"){
    const {unpackProject}=await import("./engine.js");
    const {renderScope}=await import("./editor-media.js");
    const {selectionViewport}=await import("./canvas-selection.js");
    const {durationOf}=await import("./montage-model.js");
    const {exportPreciseMP4,exportTransparentWebM}=await import("./precise-export.js");
    const document=await unpackProject(await localBlob("project"));
    const project=renderScope(document,input.compositionId);
    const duration=durationOf(project);
    if(!duration || duration>60.001 || project.clips.length+(project.extraTracks||[]).reduce((n,t)=>n+t.clips.length,0)>48)
      throw Error("A renderização no servidor aceita até 60 segundos e 48 clipes.");
    const composition=document.compositions.find(c=>c.id===input.compositionId);
    if(input.format==="webm" && composition?.document?.background!=="transparent")throw Error("A composição selecionada tem fundo opaco.");
    const size=input.frame || composition?.document?.sourceSize;
    const viewport=size?selectionViewport(size):undefined;
    const width=1080,height=viewport?2*Math.round(540*viewport.height/viewport.width):1920;
    if(height<2||height>1920)throw Error("Proporção de saída incompatível.");
    const encode=input.format==="webm"?exportTransparentWebM:exportPreciseMP4;
    let last=-1;
    const onProgress=fraction=>{
      const step=Math.min(99,Math.floor(fraction*20)*5);
      if(step<=last)return;
      last=step;
      return fetch("/progress",{method:"POST",body:String(step)}).then(response=>{
        if(!response.ok)throw Error("A renderização foi interrompida.");
      });
    };
    const blob=await encode(project,{width,height,viewport,signal,onProgress});
    const delivery=await fetch("/delivery/movie",{method:"PUT",body:blob});
    if(!delivery.ok)throw Error("Falha ao guardar o vídeo produzido.");
    return {width,height,duration};
  }
  let cut, manifest;
  if (input.operation === "firstCut") {
    await session.invoke("project.new",{name:"Primeiro corte"},session.inspect().revision);
    const files = [];
    for (const [i,material] of input.materials.entries()) {
      const blob=await localBlob(i);
      files.push(new File([blob],material.name,{type:blob.type}));
    }
    cut = await createEditorialCut({session,files,brief:input.brief,cta:input.cta,seconds:input.seconds,signal});
    manifest = {script:cut.script,trace:cut.trace};
  } else {
    const portable=await localBlob("project"),movie=await localBlob("movie");
    await session.invoke("project.open",{file:new File([portable],"Primeiro-corte.mare")},session.inspect().revision);
    const revision=session.inspect().revision;
    cut = await reviewEditorialCut({target:{inspect:q=>session.inspect(q),refine:commands=>session.prepare(revision,commands)},
      brief:input.brief,cta:input.cta,movie,signal,check:()=>{}});
    if(!cut.changed) Object.assign(cut,{movie,portable});
    manifest = {review:cut.review,changed:cut.changed,trace:cut.trace};
  }
  for (const [name,blob] of [["project",cut.portable],["movie",cut.movie]]) {
    const res=await fetch("/delivery/"+name,{method:"PUT",body:blob});
    if(!res.ok)throw Error("Não foi possível guardar o resultado.");
  }
  return manifest;
}
