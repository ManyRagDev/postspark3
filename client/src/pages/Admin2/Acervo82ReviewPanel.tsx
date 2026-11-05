import { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

const normalize = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const labels = {single:'Post único',carousel:'Carrossel',photo:'Fotografia',list:'Lista',comparison:'Comparação',metric:'Dado'};

export default function Acervo82ReviewPanel() {
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState<keyof typeof labels|'all'>('all');
  const [selected,setSelected]=useState<string>();
  const [opening,setOpening]=useState(false);
  const [,navigate]=useLocation();
  const openingFixture=trpc.catalog.openAcervo82Review.useMutation();
  const review=trpc.catalog.acervo82Review.useQuery(undefined,{retry:false,staleTime:30_000});
  if(!review.data)return null;
  const entries=review.data.filter(entry=>(filter==='all'||entry.capabilities[filter])&&normalize([entry.code,entry.name,...entry.aliases].join(' ')).includes(normalize(search.trim())));
  const detail=entries.find(entry=>entry.id===selected)??entries[0];
  async function open(id:string,mode:'static'|'compose'='static') {
    setOpening(true);
    try {
      const model=await openingFixture.mutateAsync({id,mode});
      sessionStorage.setItem('postspark.open_canvas_post',JSON.stringify({model,inputType:'text',inputContent:'Conferência técnica do acervo · abertura controlada'}));
      navigate('/thevoid');
    } catch { toast.error('Não foi possível abrir a composição local.'); }
    finally {setOpening(false);}
  }
  return <section aria-label="Conferência do acervo de 82 designs" className="space-y-4 rounded-2xl border border-white/10 p-5">
    <div><h2 className="text-xl font-semibold">Acervo de 82 designs</h2><p className="text-sm text-slate-400">Compare a referência com o render nativo. A abertura controlada serve para testar edição e persistência.</p></div>
    <div className="flex flex-wrap gap-3">
      <input aria-label="Buscar design por código ou nome" className="rounded-lg border border-white/15 bg-black/25 px-3 py-2" placeholder="Ex.: REF-03 ou cartaz" value={search} onChange={event=>setSearch(event.target.value)} />
      <select aria-label="Filtrar por capacidade" className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2" value={filter} onChange={event=>setFilter(event.target.value as typeof filter)}><option value="all">Todas as capacidades</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      <span role="status" className="self-center text-sm text-slate-400">{entries.length} de {review.data.length} entradas</span>
    </div>
    <div className="grid gap-4 md:grid-cols-[minmax(11rem,1fr)_minmax(0,3fr)]">
      <ul className="max-h-[28rem] overflow-auto rounded-lg border border-white/10">
        {entries.map(entry=><li key={entry.id}><button type="button" aria-pressed={detail?.id===entry.id} onClick={()=>setSelected(entry.id)} className="w-full border-b border-white/5 p-2 text-left text-sm hover:bg-white/5 aria-pressed:bg-violet-500/20"><strong>{entry.code}</strong> · {entry.name}</button></li>)}
      </ul>
      {detail?<div className="space-y-3">
        <div><h3 className="font-semibold">{detail.code} · {detail.name}</h3><p className="text-xs text-slate-400">{Object.entries(labels).filter(([key])=>detail.capabilities[key as keyof typeof labels]).map(([,value])=>value).join(' · ')}</p></div>
        <div className="grid grid-cols-2 gap-3">
          <figure><img loading="lazy" alt={`Referência ${detail.code}`} src={detail.referenceUrl} className="aspect-[4/5] w-full rounded bg-black/30 object-contain"/><figcaption className="text-xs text-slate-400">Referência do showcase</figcaption></figure>
          <figure>{detail.renderUrl?<img loading="lazy" alt={`Render nativo ${detail.code}`} src={detail.renderUrl} className="aspect-[4/5] w-full rounded bg-black/30 object-contain"/>:<p>Render pendente</p>}<figcaption className="text-xs text-slate-400">CanvasLab</figcaption></figure>
        </div>
        <p className="text-sm">{detail.status==='ready_for_local_review'?'Disponível para conferência local':'Ajuste pendente'}</p>
        {detail.differences.length>0&&<ul className="space-y-1 text-xs text-slate-400">{detail.differences.map(value=><li key={value}>{value}</li>)}</ul>}
        <div className="flex flex-wrap gap-2">{detail.renderUrl&&<button type="button" disabled={opening} onClick={()=>void open(detail.id)} className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-50">{opening?'Abrindo…':'Abrir no editor'}</button>}
        {detail.capabilities.carousel&&<button type="button" disabled={opening} onClick={()=>void open(detail.id,'compose')} className="rounded-lg border border-violet-400/50 px-3 py-2 text-sm disabled:opacity-50">Abrir carrossel</button>}</div>
      </div>:<p>Nenhuma entrada corresponde à busca.</p>}
    </div>
  </section>;
}
