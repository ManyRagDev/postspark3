import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { downloadImageFile } from '@/lib/downloadHelper';
import type { CanvasPostModel } from './types';
import { BACKGROUND_SLOT, imageRequestForTarget, mediaTargets, targetExists, type MediaTarget, type MediaUpdate } from '../lib/mediaSlots';

const field = 'w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-white';
const button = 'rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-50';

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler a foto.'));
    reader.readAsDataURL(file);
  });
}

/** One media destination control for background and every named slot, on desktop and mobile. */
export default function MediaSlotPanel({ post, onUpdate, selectedId, retainedPreview, onRetainPreview }: { post: CanvasPostModel; onUpdate: MediaUpdate; selectedId?: string | null; retainedPreview?: string; onRetainPreview?: (url: string | undefined) => void }) {
  const latest = useRef({ post, onUpdate, onRetainPreview });
  latest.current = { post, onUpdate, onRetainPreview };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [choice, setChoice] = useState(BACKGROUND_SLOT);
  const targets = mediaTargets(post);
  const selected = targets.find(t => t.id === choice) ?? targets[0];
  const slideId = post.slides[post.currentSlideIndex]?.id;
  const key = `${slideId}:${selected?.id}`;
  const [draft, setDraft] = useState({ key, prompt: selected?.prompt ?? '' });
  const prompt = draft.key === key ? draft.prompt : selected?.prompt ?? '';
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [localPreview, setPreview] = useState<string>();
  const preview = onRetainPreview ? retainedPreview : localPreview;
  const generate = trpc.post.generateImage.useMutation();
  const upload = trpc.post.saveMediaAsset.useMutation();
  useEffect(() => {
    if (selectedId && targets.some(t => t.id === selectedId)) setChoice(selectedId);
  }, [selectedId, slideId]);
  if (!selected || !slideId || (!post.slides[post.currentSlideIndex]?.composition && !preview)) return null;
  const capture = (): MediaTarget => ({ postId: post.id, slideId, slotId: selected.id });
  const keepOrApply = (url: string, target: MediaTarget) => {
    const current = latest.current;
    if (targetExists(current.post, target)) {
      current.onUpdate(target, { kind: 'apply', url });
      toast.success('Imagem aplicada no destino escolhido.');
    } else {
      current.onRetainPreview?.(url);
      if (mounted.current && !current.onRetainPreview) setPreview(url);
      toast.info('O destino foi removido. Sua imagem está disponível para outro espaço.', {
        action: { label: 'Baixar imagem', onClick: () => downloadImageFile(url, 'postspark-imagem.png') },
      });
    }
  };
  const generateImage = async () => {
    if (inFlight.current || !prompt.trim() || prompt.length > 2000) return;
    const target = capture();
    const request = imageRequestForTarget(latest.current.post, target, prompt);
    latest.current.onUpdate(target, { kind: 'prompt', prompt });
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await generate.mutateAsync({...request,idempotencyKey: crypto.randomUUID()});
      if (!result.imageUrl) throw new Error('Nenhuma imagem retornada.');
      keepOrApply(result.imageUrl, target);
    } catch (error) { toast.error((error as Error).message); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const sendFile = async (file?: File) => {
    if (!file || inFlight.current) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      toast.error('Use uma imagem PNG, JPEG ou WebP de até 8 MB.'); return;
    }
    const target = capture();
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await upload.mutateAsync({ imageData: await readImage(file) });
      keepOrApply(result.url, target);
    } catch (error) { toast.error((error as Error).message); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  return <div className="space-y-3 text-white" data-media-slot-panel>
    <label className="block text-xs">Destino da imagem
      <select aria-label="Destino da imagem" className={field} value={selected.id} onChange={e => setChoice(e.target.value)}>
        {targets.map(t => <option key={t.id} value={t.id}>{t.label}{t.id !== BACKGROUND_SLOT && !t.url ? ' · imagem pendente' : ''}</option>)}
      </select>
    </label>
    <p className="text-xs text-white/60">{selected.id === BACKGROUND_SLOT ? 'O fundo fica atrás das peças; painéis opacos podem cobri-lo.' : `${Math.round(selected.width)} × ${Math.round(selected.height)}. Você pode inserir a foto depois; esse espaço continua editável.`}</p>
    {selected.url && <>
      <img src={selected.url} alt={selected.label} className="max-h-40 w-full rounded-lg object-contain" />
      <button type="button" className={button} onClick={() => onUpdate(capture(), { kind: 'remove' })}>Remover imagem</button>
      {(['focalX', 'focalY'] as const).map(axis => <label className="block text-xs" key={axis}>
        Ponto focal {axis === 'focalX' ? 'horizontal' : 'vertical'}
        <input aria-label={`Enquadramento ${axis}`} type="range" min="0" max="1" step="0.01" value={selected[axis]} className="w-full" onChange={e => onUpdate(capture(), { kind: 'focal', [axis]: Number(e.target.value) })} />
      </label>)}
    </>}
    <label className="block text-xs">Descrição da imagem
      <textarea aria-label="Descrição da imagem do destino" value={prompt} maxLength={2000} rows={4} className={field}
        onChange={e => setDraft({ key, prompt: e.target.value })}
        onBlur={() => { if (prompt !== selected.prompt) onUpdate(capture(), { kind: 'prompt', prompt }); }} />
    </label>
    <button type="button" className={button} disabled={busy || !prompt.trim() || prompt.length > 2000} onClick={() => void generateImage()}>{busy ? 'Preparando imagem…' : 'Gerar imagem com IA'}</button>
    <label className={`${button} block cursor-pointer text-center`}>Enviar ou trocar foto
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="mt-2 w-full text-xs" aria-label="Enviar imagem no destino" onChange={e => { void sendFile(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
    {preview && <div className="space-y-2 rounded-lg border border-amber-300/40 p-2">
      <p className="text-xs">Imagem pronta sem destino. Escolha um espaço acima para aplicar.</p>
      <img src={preview} alt="Imagem pronta para aplicação" className="max-h-36 w-full object-contain" />
      <button type="button" className={button} onClick={() => { onUpdate(capture(), { kind: 'apply', url: preview }); setPreview(undefined); onRetainPreview?.(undefined); }}>Aplicar no destino atual</button>
    </div>}
  </div>;
}
