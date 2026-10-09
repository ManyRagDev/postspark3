import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Plus, RefreshCw, ScanEye, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CanvasPostStage, type CanvasPostStageRef } from "@/pages/CanvasLab/components/CanvasPostStage";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";
import { emptyReferenceLayer, referenceSceneIssues, type ReferenceReconstructionSpecV2, type ReferenceSceneLayer } from "@shared/referenceReconstruction";
import { compareReferenceScene, visualComparisonPass } from "./referenceSceneComparison";
import { unresolvedReferenceFonts } from "./referenceFontAssets";
import { ensureReferenceFontsLoaded } from "@/pages/CanvasLab/lib/referenceFonts";
import { FIRST_REFERENCE_SHA256, firstReferenceCalibration } from "./referenceCalibration";
import { REFERENCE_RENDERER_VERSION } from "@shared/referenceReconstruction";

type Comparison = {
  sceneHash: string;
  overallSimilarity: number;
  regions: Array<{ layerId: string; similarity: number }>;
  comparedAt: string;
};

export function ReferenceSceneWorkbench(props: {
  scene: ReferenceReconstructionSpecV2;
  post: CanvasPostModel;
  sceneHash: string | null;
  referenceImage: string | null;
  baselinePngDataUrl: string | null;
  comparison: Comparison | null;
  acceptedSceneHash: string | null;
  onSceneChange: (scene: ReferenceReconstructionSpecV2) => void;
  onCompared: (comparison: Comparison, png: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onCaptureFonts: () => Promise<void>;
  onRecompile: () => void;
}) {
  const stageRef = useRef<CanvasPostStageRef>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baselineSimilarity, setBaselineSimilarity] = useState<number | null>(null);
  useEffect(() => setBaselineSimilarity(null), [props.sceneHash]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(props.scene.layers[0]?.id ?? null);
  const selected = props.scene.layers.find(layer => layer.id === selectedLayerId) ?? props.scene.layers[0] ?? null;
  const issues = referenceSceneIssues(props.scene);
  const unresolvedFonts = unresolvedReferenceFonts(props.scene);
  const comparison = props.comparison?.sceneHash === props.sceneHash ? props.comparison : null;
  const rendererCurrent = props.scene.rendererVersion === REFERENCE_RENDERER_VERSION;
  const accepted = Boolean(rendererCurrent && props.sceneHash && props.acceptedSceneHash === props.sceneHash);
  const canAccept = Boolean(rendererCurrent && props.referenceImage && props.sceneHash && comparison && visualComparisonPass(comparison) && issues.length === 0 && unresolvedFonts.length === 0 && (baselineSimilarity === null || baselineSimilarity >= 0.995));

  const updateLayer = (id: string, patch: Partial<ReferenceSceneLayer>) => {
    props.onSceneChange({ ...props.scene, layers: props.scene.layers.map(layer => layer.id === id ? { ...layer, ...patch, provenance: "curator" } : layer) });
  };

  const addLayer = (kind: ReferenceSceneLayer["kind"]) => {
    const id = `curator-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const next = emptyReferenceLayer(kind, id);
    next.x = Math.round(props.scene.source.widthPx * 0.1);
    next.y = Math.round(props.scene.source.heightPx * 0.1);
    next.zIndex = props.scene.layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0) + 1;
    props.onSceneChange({ ...props.scene, layers: [...props.scene.layers, next] });
    setSelectedLayerId(id);
  };

  const runComparison = async () => {
    if (!props.referenceImage || !props.sceneHash) return;
    setWorking(true);
    setError(null);
    try {
      await ensureReferenceFontsLoaded(props.scene);
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const renderDataUrl = stageRef.current?.exportPng4K();
      if (!renderDataUrl) throw new Error("A prévia do CanvasLab ainda não está pronta.");
      const result = await compareReferenceScene({ referenceDataUrl: props.referenceImage, renderDataUrl, scene: props.scene, sceneHash: props.sceneHash });
      props.onCompared(result, renderDataUrl);
      setBaselineSimilarity(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível comparar a reconstrução.");
    } finally {
      setWorking(false);
    }
  };

  const compareSavedBaseline = async () => {
    if (!props.baselinePngDataUrl || !props.sceneHash) return;
    setWorking(true);
    setError(null);
    try {
      await ensureReferenceFontsLoaded(props.scene);
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const renderDataUrl = stageRef.current?.exportPng4K();
      if (!renderDataUrl) throw new Error("A prévia do CanvasLab ainda não está pronta.");
      const result = await compareReferenceScene({ referenceDataUrl: props.baselinePngDataUrl, renderDataUrl, scene: props.scene, sceneHash: props.sceneHash });
      setBaselineSimilarity(result.overallSimilarity);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível conferir o baseline salvo.");
    } finally {
      setWorking(false);
    }
  };

  const numberInput = (label: string, key: keyof ReferenceSceneLayer, step = 1) => {
    if (!selected || typeof selected[key] !== "number") return null;
    return <label key={key} className="text-[11px] text-slate-400">{label}
      <Input type="number" step={step} value={selected[key] as number}
        onChange={event => updateLayer(selected.id, { [key]: Number(event.target.value) } as Partial<ReferenceSceneLayer>)}
        className="mt-1 h-8 text-xs" />
    </label>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Receita visual V2</p>
          <p className="text-xs text-slate-400">{props.scene.source.widthPx} × {props.scene.source.heightPx} px · {props.scene.layers.length} camadas · hash {props.sceneHash?.slice(0, 12) ?? "calculando"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.scene.source.originalHash === FIRST_REFERENCE_SHA256 && <Button size="sm" variant="outline" onClick={() => props.onSceneChange(firstReferenceCalibration(props.scene))}>Usar inventário manual do primeiro caso</Button>}
          <Button size="sm" variant="outline" onClick={() => void props.onCaptureFonts()}><Type className="size-4" />Incorporar fontes</Button>
          <Button size="sm" variant="outline" onClick={props.onRecompile}><RefreshCw className="size-4" />Recompilar prévia</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-300">Referência e regiões</p>
          {props.referenceImage ? <div className="relative mx-auto max-w-[360px] overflow-hidden rounded-md">
            <img src={props.referenceImage} alt="Referência visual para comparação" className="block w-full" />
            {props.scene.layers.map(layer => <div key={layer.id} className="pointer-events-none absolute border border-cyan-400/60"
              style={{ left: `${layer.x / props.scene.source.widthPx * 100}%`, top: `${layer.y / props.scene.source.heightPx * 100}%`, width: `${layer.width / props.scene.source.widthPx * 100}%`, height: `${layer.height / props.scene.source.heightPx * 100}%` }} />)}
          </div> : <p className="text-sm text-amber-300">Anexe novamente a imagem original para medir fidelidade. A receita pode ser renderizada sem ela.</p>}
        </div>
        <div className="flex flex-col items-center rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-300">Reconstrução no CanvasLab</p>
          <div className="flex w-full justify-center overflow-hidden">
            <CanvasPostStage ref={stageRef} post={props.post} diagnosticScene={props.scene} zoom={0.75} isReadOnly />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-semibold text-slate-300">Camadas em ordem de desenho</p>
          {[...props.scene.layers].sort((a, b) => a.zIndex - b.zIndex).map(layer => (
            <button key={layer.id} type="button" onClick={() => setSelectedLayerId(layer.id)}
              className={`block w-full rounded-lg border px-2 py-2 text-left text-xs ${selected?.id === layer.id ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 hover:border-white/25"}`}>
              <span className="font-semibold text-white">{layer.role}</span>
              <span className="block truncate text-slate-400">{layer.kind} · z{layer.zIndex} {layer.text ? `· ${layer.text}` : ""}</span>
            </button>
          ))}
          <div className="flex flex-wrap gap-1 border-t border-white/10 pt-2">
            {(["text", "arcText", "rect", "line", "polygon"] as const).map(kind => <Button key={kind} size="sm" variant="outline" onClick={() => addLayer(kind)} className="h-7 px-2 text-[10px]"><Plus className="size-3" />{kind}</Button>)}
          </div>
        </div>

        {selected && <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-300">Editar {selected.kind} · {selected.id}</p>
            <Button size="sm" variant="ghost" onClick={() => props.onSceneChange({ ...props.scene, layers: props.scene.layers.filter(layer => layer.id !== selected.id) })}><X className="size-4" />Remover</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-[11px] text-slate-400">Papel<Input value={selected.role} onChange={event => updateLayer(selected.id, { role: event.target.value })} className="mt-1 h-8 text-xs" /></label>
            {numberInput("Camada z", "zIndex")}
            <label className="text-[11px] text-slate-400">Suporte
              <select value={selected.support} onChange={event => updateLayer(selected.id, { support: event.target.value as ReferenceSceneLayer["support"] })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-slate-900 px-2 text-xs text-white">
                <option value="supported">Reproduzível</option><option value="unknown">Incerto</option><option value="unsupported">Não suportado</option>
              </select>
            </label>
          </div>
          {(selected.kind === "text" || selected.kind === "arcText") && <label className="block text-[11px] text-slate-400">Texto literal (use Enter para quebras)
            <Textarea value={selected.text ?? ""} onChange={event => updateLayer(selected.id, { text: event.target.value })} className="mt-1 min-h-16 text-xs" />
          </label>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {numberInput("x px", "x")}{numberInput("y px", "y")}{numberInput("Largura px", "width")}{numberInput("Altura px", "height")}
            {numberInput("Rotação °", "rotationDeg")}{numberInput("Opacidade", "opacity", 0.05)}{numberInput("Traço px", "strokeWidth", 0.5)}
            <label className="text-[11px] text-slate-400">Cor<Input type="color" value={selected.fill} onChange={event => updateLayer(selected.id, { fill: event.target.value })} className="mt-1 h-8 p-1" /></label>
            <label className="text-[11px] text-slate-400">Contorno<Input type="color" value={selected.strokeColor ?? "#222222"} onChange={event => updateLayer(selected.id, { strokeColor: event.target.value })} className="mt-1 h-8 p-1" /></label>
          </div>
          {(selected.kind === "text" || selected.kind === "arcText") && <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="text-[11px] text-slate-400">Fonte<Input value={selected.fontFamily ?? ""} onChange={event => updateLayer(selected.id, { fontFamily: event.target.value || null })} className="mt-1 h-8 text-xs" /></label>
              {numberInput("Peso", "fontWeight", 100)}{numberInput("Tamanho px", "fontSize")}{numberInput("Espaçamento", "letterSpacing", 0.5)}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {numberInput("Entrelinha", "lineHeight", 0.05)}
              <label className="text-[11px] text-slate-400">Alinhamento<select value={selected.align} onChange={event => updateLayer(selected.id, { align: event.target.value as ReferenceSceneLayer["align"] })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-slate-900 px-2 text-xs text-white"><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={Boolean(selected.extrusion)} onChange={event => updateLayer(selected.id, { extrusion: event.target.checked ? { color: "#252525", offsetX: 16, offsetY: 24, steps: 16 } : null })} />Extrusão tipográfica</label>
            {selected.extrusion && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="text-[11px] text-slate-400">Cor da extrusão<Input type="color" value={selected.extrusion.color} onChange={event => updateLayer(selected.id, { extrusion: { ...selected.extrusion!, color: event.target.value } })} className="mt-1 h-8 p-1" /></label>
              {(["offsetX", "offsetY", "steps"] as const).map(field => <label key={field} className="text-[11px] text-slate-400">{field}<Input type="number" value={selected.extrusion![field]} onChange={event => updateLayer(selected.id, { extrusion: { ...selected.extrusion!, [field]: Number(event.target.value) } })} className="mt-1 h-8 text-xs" /></label>)}
            </div>}
          </>}
          {selected.kind === "arcText" && selected.arc && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["centerX", "centerY", "radius", "startAngleDeg"] as const).map(field => <label key={field} className="text-[11px] text-slate-400">{field}<Input type="number" value={selected.arc![field]} onChange={event => updateLayer(selected.id, { arc: { ...selected.arc!, [field]: Number(event.target.value) } })} className="mt-1 h-8 text-xs" /></label>)}
          </div>}
          {(selected.kind === "line" || selected.kind === "polygon") && <label className="block text-[11px] text-slate-400">Pontos relativos x,y separados por vírgula
            <Textarea value={selected.points.join(", ")} onChange={event => updateLayer(selected.id, { points: event.target.value.split(/[,\s]+/).map(Number).filter(Number.isFinite) })} className="mt-1 min-h-12 text-xs" />
          </label>}
          <label className="block text-[11px] text-slate-400">Incerteza observada<Input value={selected.uncertainty ?? ""} onChange={event => updateLayer(selected.id, { uncertainty: event.target.value || null })} className="mt-1 h-8 text-xs" /></label>
        </div>}
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void runComparison()} disabled={!props.referenceImage || !props.sceneHash || working}><ScanEye className="size-4" />{working ? "Comparando…" : "Comparar com a referência"}</Button>
          {props.baselinePngDataUrl && <Button size="sm" variant="outline" onClick={() => void compareSavedBaseline()} disabled={!props.sceneHash || working}>Conferir render salvo</Button>}
          <Button size="sm" onClick={props.onAccept} disabled={!canAccept} className="bg-emerald-500 text-black hover:bg-emerald-400"><Check className="size-4" />{accepted ? "Receita aprovada" : "Aprovar correspondência"}</Button>
          <Button size="sm" variant="outline" onClick={props.onReject}>Não corresponde</Button>
        </div>
        {comparison && <p className="text-xs text-slate-300">Similaridade global de pixels: {Math.round(comparison.overallSimilarity * 100)}%. Regiões: {comparison.regions.map(region => `${region.layerId} ${Math.round(region.similarity * 100)}%`).join(" · ")}. A decisão visual continua humana.</p>}
        {baselineSimilarity !== null && <p className={`text-xs ${baselineSimilarity >= 0.995 ? "text-emerald-300" : "text-amber-300"}`}>Correspondência com o render salvo: {(baselineSimilarity * 100).toFixed(1)}%{baselineSimilarity < 0.995 ? " · a reprodução mudou; revise antes de aprovar." : ""}</p>}
        {!rendererCurrent && <p className="text-xs text-amber-300">Esta receita foi criada com outra versão do renderer. Recompile e confira o render salvo antes de aprovar.</p>}
        {comparison && !visualComparisonPass(comparison) && <p className="text-xs text-amber-300">A diferença ainda é grande: requer ao menos 65% no conjunto e 40% em cada região antes da aprovação.</p>}
        {issues.map((issue, index) => <p key={`${index}-${issue}`} className="flex gap-2 text-xs text-amber-300"><CircleAlert className="mt-0.5 size-3 shrink-0" />{issue}</p>)}
        {unresolvedFonts.map((font, index) => <p key={`${index}-${font}`} className="text-xs text-amber-300">Fonte não incorporada: {font}</p>)}
        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>
    </div>
  );
}
