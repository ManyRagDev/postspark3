import {useRef,useState} from 'react';
import {trpc} from '@/lib/trpc';
import {arsenalApi} from '@/lib/arsenalApi';
import {componentDefinitionV1Schema} from '@shared/componentAssembly';
import {arsenalHash} from '@shared/arsenalContent';
import {CanvasPostStage,type CanvasPostStageRef} from '../CanvasLab/components/CanvasPostStage';
import {previewComponentDefinition,reviewSamples,type ReviewSample} from './componentReview';

const button='rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40';
type ComponentKind='background'|'content'|'media'|'ornament'|'typography';
type ComponentStatus='draft'|'approved'|'archived';
type FilterStatus=ComponentStatus|'all';
type ReviewEntry={id:string;status:string;definition:unknown;source_key:string;review?:{decision:string;created_at:string}|null};
function briefingHash(preview:Awaited<ReturnType<typeof previewComponentDefinition>>) {
  return arsenalHash({targetId:preview.component.id,targetHash:preview.component.hash,targetRole:preview.targetRole,targetSlide:preview.post.slides[preview.targetSlideIndex]?.id,sample:preview.sample,content:preview.content,contextSlides:preview.post.slides.map(s=>({id:s.id,origin:s.composition?.origin,contentHash:s.composition?.userContentHash})),contextLabel:preview.contextLabel});
}

/** Explicit human review of concrete component versions. Approval and publication remain separate actions. */
export default function ComponentArsenalPanel() {
  const [offset,setOffset]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [kind,setKind]=useState<ComponentKind|'all'>('all'),[status,setStatus]=useState<FilterStatus>('draft');
  const [searchInput,setSearchInput]=useState(''),[search,setSearch]=useState('');
  const [preview,setPreview]=useState<Awaited<ReturnType<typeof previewComponentDefinition>>>();
  const [sample,setSample]=useState<ReviewSample>('curto'),[notes,setNotes]=useState('');
  const [reviewed,setReviewed]=useState<{id:string;hash:string;briefingHash:string;decision:'approved'|'rejected'}>();
  const stage=useRef<CanvasPostStageRef>(null),request=useRef(0),activeTarget=useRef<string|undefined>(undefined);
  const library=trpc.designCatalog.listComponents.useQuery({offset,includeArchived:status==='archived',...(kind==='all'?{}:{kind}),...(status==='all'?{}:{status}),...(search?{search}:{})},{retry:false});
  const action=async(work:()=>Promise<void>)=>{setBusy(true);setError('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const open=(id:string,mode=sample)=>{
    const token=++request.current;
    if(activeTarget.current!==id){activeTarget.current=id;setNotes('');}
    setBusy(true);setError('');setPreview(undefined);setReviewed(undefined);
    void (async()=>{
      try {
        const result=await arsenalApi.designCatalog.previewComponentContext.query({id});
        if(token!==request.current)return;
        const target=componentDefinitionV1Schema.parse(result.target);
        const context=result.context.map((entry:unknown)=>componentDefinitionV1Schema.parse(entry));
        const review=await previewComponentDefinition(target,context,mode);
        if(token===request.current){setSample(mode);setPreview(review);}
      } catch(e) { if(token===request.current)setError((e as Error).message); }
      finally { if(token===request.current)setBusy(false); }
    })();
  };
  const review=(decision:'approved'|'rejected')=>action(async()=>{
    if(!preview||!stage.current)throw new Error('Abra a prévia antes de avaliar.');
    if(preview.post.currentSlideIndex!==preview.targetSlideIndex)throw new Error('Volte ao slide do componente alvo para registrar a revisão.');
    if(decision==='approved'&&preview.issues.length)throw new Error('Corrija os problemas da prévia antes de aprovar.');
    const png=stage.current.exportPng4K();if(!png)throw new Error('Aguarde a renderização do slide alvo.');
    const bytes=Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0));
    const pngHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
    const reviewBriefingHash=briefingHash(preview);
    await arsenalApi.designCatalog.reviewComponent.mutate({id:preview.component.id,hash:preview.component.hash,pngHash,briefingHash:arsenalHash({briefingHash:reviewBriefingHash,pngHash}),decision,notes});
    setReviewed({id:preview.component.id,hash:preview.component.hash,briefingHash:reviewBriefingHash,decision});await library.refetch();
  });
  const pageStart=library.data?.total?offset+1:0;
  const pageEnd=Math.min(offset+50,library.data?.total??0);
  const isTargetSlide=Boolean(preview&&preview.post.currentSlideIndex===preview.targetSlideIndex);
  const currentBriefingHash=preview?briefingHash(preview):'';
  const hasCurrentHumanApproval=Boolean(preview&&reviewed?.decision==='approved'&&reviewed.id===preview.component.id&&reviewed.hash===preview.component.hash&&reviewed.briefingHash===currentBriefingHash);

  return <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5" aria-label="Arsenal de componentes">
    <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">Arsenal de componentes · revisão e publicação</h2><button type="button" className={button} disabled={busy} onClick={()=>void library.refetch()}>Atualizar biblioteca</button></div>
    <p className="text-sm text-slate-400">Confira o componente com conteúdo de teste no papel que ele declara. A avaliação humana vale para a versão e prévia concretas; publicar continua sendo uma ação separada.</p>
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Filtros do catálogo">
      <label className="text-sm text-slate-300">Tipo
        <select className="mt-1 block w-full rounded-lg border border-white/15 bg-black/30 p-2" value={kind} onChange={e=>{setOffset(0);setKind(e.target.value as ComponentKind|'all');}}><option value="all">Todos os tipos</option><option value="background">Fundo</option><option value="content">Conteúdo</option><option value="media">Mídia</option><option value="ornament">Ornamento</option><option value="typography">Tipografia</option></select>
      </label>
      <label className="text-sm text-slate-300">Situação de publicação
        <select className="mt-1 block w-full rounded-lg border border-white/15 bg-black/30 p-2" value={status} onChange={e=>{setOffset(0);setStatus(e.target.value as FilterStatus);}}><option value="draft">Rascunhos</option><option value="approved">Publicados</option><option value="all">Ativos</option><option value="archived">Arquivados</option></select>
      </label>
      <form className="text-sm text-slate-300" onSubmit={e=>{e.preventDefault();setOffset(0);setSearch(searchInput.trim().slice(0,120));}}>
        <label htmlFor="component-search">Busca por nome</label><div className="mt-1 flex gap-2"><input id="component-search" className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 p-2" maxLength={120} value={searchInput} onChange={e=>setSearchInput(e.target.value)} /><button className={button} type="submit">Buscar</button></div>
      </form>
    </div>
    <p className="text-xs text-slate-500">“Publicado” representa o status do catálogo. “Revisão humana” é a evidência de avaliação e não publica o componente.</p>
    {(error||library.error)&&<p role="alert" className="text-sm text-red-300">{error||library.error?.message}</p>}
    <label className="block text-sm text-slate-300">Importar componente ou pacote revisado como rascunho
      <input type="file" accept="application/json,.json" disabled={busy} className="mt-1 block text-xs" onChange={e=>{
        const file=e.target.files?.[0];e.target.value='';if(!file)return;
        void action(async()=>{
          if(file.size>2*1024*1024)throw new Error('Use um pacote de definições de até 2 MiB; assets são importados separadamente.');
          const raw=JSON.parse(await file.text());
          const entries=Array.isArray(raw?.components)?raw.components:Array.isArray(raw)?raw:[raw];
          const parsed=entries.map((entry:unknown)=>componentDefinitionV1Schema.parse(entry));
          if(!parsed.length||parsed.length>100)throw new Error('Importe entre 1 e 100 componentes por arquivo.');
          for(const c of parsed)await arsenalApi.designCatalog.prepareComponentDraft.mutate(c);
          await library.refetch();
        });
      }}/>
      <span className="mt-1 block text-xs text-slate-500">Uma correção recebe identidade e hash próprios. Os assets precisam estar verificados no catálogo; importar não aprova nem publica.</span>
    </label>
    <div className="flex flex-wrap gap-2" aria-label="Amostras de conteúdo">{reviewSamples.map(mode=><button type="button" key={mode} className={button} disabled={busy} aria-pressed={sample===mode} onClick={()=>{setSample(mode);if(preview)open(preview.component.id,mode);}}>{mode}</button>)}</div>
    <p className="text-xs text-slate-400">Uma prévia sequencial usa capa, desenvolvimento e encerramento. Campos incompatíveis permanecem visíveis como issues; não há fallback de conteúdo.</p>
    {library.isLoading&&<p>Carregando componentes do banco…</p>}
    {library.data?.total===0&&<p className="text-sm text-slate-400">Nenhum componente corresponde aos filtros atuais.</p>}
    <div className="max-h-80 overflow-auto rounded-lg border border-white/10"><table className="w-full text-left text-sm"><thead><tr className="border-b border-white/10"><th className="p-2">Componente</th><th className="p-2">Publicação</th><th className="p-2">Revisão humana</th><th className="p-2">Ações</th></tr></thead><tbody>{(library.data?.entries??[]).map((entry:ReviewEntry)=>{
      const parsed=componentDefinitionV1Schema.safeParse(entry.definition);if(!parsed.success)return <tr key={entry.id}><td className="p-2">Definição inválida · {entry.id}</td><td>{entry.status}</td><td>Sem leitura</td><td>Corrigir pacote</td></tr>;
      const c=parsed.data,reviewText=entry.review?`${entry.review.decision==='approved'?'Aprovado':'Correção solicitada'} · ${new Date(entry.review.created_at).toLocaleString('pt-BR')}`:'Sem revisão humana';
      const publication=entry.status==='approved'?'Publicado':entry.status==='archived'?'Arquivado':'Rascunho';
      return <tr className="border-b border-white/5" key={c.id}><td className="p-2"><strong>{c.label}</strong><p className="text-xs text-slate-400">{c.kind} · {c.aspectRatios.join(', ')} · {c.densities.join(', ')}</p><p className="text-xs text-slate-500" title={c.hash}>{entry.source_key} · {c.hash.slice(0,12)}</p></td><td className="p-2">{publication}</td><td className="p-2 text-xs">{reviewText}</td><td className="p-2">{entry.status==='archived'?<span className="text-xs text-slate-500" title="Componentes arquivados não podem ser pré-visualizados por este endpoint; os documentos já entregues continuam preservados.">Preservado; sem prévia</span>:<button type="button" className={button} disabled={busy} onClick={()=>open(c.id)}>Conferir</button>}{entry.status==='approved'&&<button type="button" className={`${button} ml-1`} disabled={busy} onClick={()=>void action(async()=>{await arsenalApi.designCatalog.publishComponent.mutate({id:c.id,status:'archived'});await library.refetch();})}>Arquivar</button>}</td></tr>;
    })}</tbody></table></div>
    <div className="flex justify-between text-xs text-slate-400"><button className={button} disabled={busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Anterior</button><span>{pageStart}–{pageEnd} de {library.data?.total??0}</span><button className={button} disabled={busy||offset+50>=(library.data?.total??0)} onClick={()=>setOffset(offset+50)}>Próxima</button></div>
    {preview&&<div className="space-y-3 rounded-xl border border-cyan-300/25 p-4">
      <h3 className="font-semibold">{preview.component.label} · {preview.sample} · papel alvo: {preview.targetRole}</h3>
      {preview.contextLabel&&<p className="text-xs text-slate-400">Contexto de conteúdo: {preview.contextLabel}. A avaliação abaixo pertence somente ao componente alvo.</p>}
      {preview.slideRoles.length>1&&<div className="flex items-center justify-center gap-3" aria-label="Navegação dos slides de revisão"><button type="button" className={button} disabled={preview.post.currentSlideIndex===0} onClick={()=>setPreview({...preview,post:{...preview.post,currentSlideIndex:preview.post.currentSlideIndex-1}})}>Slide anterior</button><span className="text-sm text-slate-300">{preview.post.currentSlideIndex+1} / {preview.slideRoles.length} · {preview.slideRoles[preview.post.currentSlideIndex]}</span><button type="button" className={button} disabled={preview.post.currentSlideIndex>=preview.slideRoles.length-1} onClick={()=>setPreview({...preview,post:{...preview.post,currentSlideIndex:preview.post.currentSlideIndex+1}})}>Próximo slide</button></div>}
      {!isTargetSlide&&<p className="text-xs text-amber-200">Slide de contexto. Volte ao papel alvo para registrar uma avaliação ou exportar o PNG de revisão.</p>}
      <div className="flex justify-center overflow-hidden"><CanvasPostStage key={`${preview.component.id}:${preview.post.currentSlideIndex}`} ref={stage} post={preview.post} zoom={0.7} isReadOnly /></div>
      {!!preview.mediaPrompts[preview.post.currentSlideIndex]?.prompts.length&&<div className="rounded-lg border border-white/10 p-3 text-xs text-slate-300"><p className="font-medium">Prompts de mídia deste slide</p><ul className="mt-1 list-disc space-y-1 pl-5">{preview.mediaPrompts[preview.post.currentSlideIndex].prompts.map(prompt=><li key={`${prompt.componentId}:${prompt.slotId}`}><span className="text-slate-400">{prompt.slotId}:</span> {prompt.prompt}</li>)}</ul><p className="mt-2 text-slate-500">A prévia não gera nem substitui a mídia; estes são os prompts autorados nos slots selecionados.</p></div>}
      {!!preview.issues.length&&<div role="alert" className="text-sm text-amber-300"><p>Ajustes necessários:</p><ul className="list-disc pl-5">{preview.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div>}
      <p className="text-xs text-slate-400">A prévia mantém sua composição mesmo quando há excesso de conteúdo. A avaliação exporta o PNG do slide alvo. Componentes são imutáveis: para corrigir, prepare uma nova versão e preserve a origem.</p>
      <label className="block text-sm">Observações da revisão<textarea aria-label="Observações da revisão do componente" className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-2" maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy||!isTargetSlide||preview.issues.length>0} onClick={()=>void review('approved')}>Aprovar esta prévia</button><button type="button" className={button} disabled={busy||!isTargetSlide} onClick={()=>void review('rejected')}>Solicitar correção</button><button type="button" className={button} disabled={busy||!hasCurrentHumanApproval} onClick={()=>void action(async()=>{await arsenalApi.designCatalog.publishComponent.mutate({id:preview.component.id,status:'approved'});await library.refetch();})}>Publicar componente aprovado</button></div>
      {reviewed&&reviewed.id===preview.component.id&&reviewed.hash===preview.component.hash&&reviewed.briefingHash===currentBriefingHash&&<p className="text-sm text-cyan-200">Avaliação humana registrada: {reviewed.decision==='approved'?'aprovado; publicação é uma ação separada':'correção solicitada'}.</p>}
    </div>}
  </section>;
}
