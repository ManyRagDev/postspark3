import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, Check, Layers3, X } from "lucide-react";
import type { CanvasPostModel } from "./types";
import { REPLICATION_GROUPS, type ReplicationGroup } from "../lib/slideReplication";

const GROUP_LABELS: Record<ReplicationGroup, { title: string; detail: string }> = {
  background: { title: "Fundo", detail: "Imagem, enquadramento e divisão" },
  colors: { title: "Cores", detail: "Paleta e overlay; preserva cores manuais do texto" },
  font: { title: "Fonte", detail: "Família tipográfica" },
  headline: { title: "Título", detail: "Alinhamento, tamanho, efeito e cor; sem copiar palavras" },
  body: { title: "Corpo", detail: "Alinhamento, tamanho, efeito e cor; sem copiar palavras" },
  composition: { title: "Composição", detail: "Família visual; sem copiar conteúdo" },
};

interface SlideReplicationDialogProps {
  open: boolean;
  post: CanvasPostModel;
  onOpenChange: (open: boolean) => void;
  onApply: (groups: ReplicationGroup[], targets: number[]) => void;
}

export default function SlideReplicationDialog({ open, post, onOpenChange, onApply }: SlideReplicationDialogProps) {
  const [step, setStep] = useState<"properties" | "targets">("properties");
  const [groups, setGroups] = useState<ReplicationGroup[]>([]);
  const [targets, setTargets] = useState<number[]>([]);
  const sourceIndex = post.currentSlideIndex;
  const availableTargets = post.slides.map((_, index) => index).filter(index => index !== sourceIndex);

  useEffect(() => {
    if (!open) return;
    setStep("properties");
    setGroups([]);
    setTargets([]);
  }, [open, sourceIndex]);

  const toggleGroup = (group: ReplicationGroup) => {
    setGroups(previous => previous.includes(group) ? previous.filter(item => item !== group) : [...previous, group]);
  };
  const toggleTarget = (index: number) => {
    setTargets(previous => previous.includes(index) ? previous.filter(item => item !== index) : [...previous, index]);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/65 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[81] flex max-h-[min(62dvh,560px)] flex-col rounded-t-3xl border border-white/15 bg-[#0d111b] text-white shadow-2xl outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(540px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
            {step === "targets" ? (
              <button type="button" onClick={() => setStep("properties")} aria-label="Voltar às propriedades" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10"><ArrowLeft size={18} /></button>
            ) : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-400/15 text-orange-300"><Layers3 size={19} /></span>}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-bold">Replicar do slide {sourceIndex + 1}</Dialog.Title>
              <Dialog.Description className="text-xs text-white/55">{step === "properties" ? "1 de 2 · Escolha o que copiar" : "2 de 2 · Escolha os destinos"}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Cancelar replicação" className="flex h-10 w-10 items-center justify-center rounded-xl text-white/70 hover:bg-white/10"><X size={18} /></button>
            </Dialog.Close>
          </div>

          {step === "properties" ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <div className="space-y-2">
                {REPLICATION_GROUPS.map(group => (
                  <label key={group} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                    <input type="checkbox" checked={groups.includes(group)} onChange={() => toggleGroup(group)} className="h-5 w-5 shrink-0 accent-orange-400" />
                    <span className="min-w-0"><span className="block text-xs font-semibold">{GROUP_LABELS[group].title}</span><span className="block text-[11px] leading-snug text-white/55">{GROUP_LABELS[group].detail}</span></span>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-white/45">Texto escrito, imagens sobrepostas e sublinhado de palavras não são copiados.</p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold">Slides de destino</span>
                <div className="flex gap-3 text-xs text-orange-300">
                  <button type="button" onClick={() => setTargets(availableTargets)}>Todos</button>
                  <button type="button" onClick={() => setTargets([])}>Limpar</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {availableTargets.map(index => {
                  const slide = post.slides[index];
                  const selected = targets.includes(index);
                  return (
                    <button key={slide.id} type="button" onClick={() => toggleTarget(index)} aria-pressed={selected} aria-label={`Slide ${index + 1}: ${slide.headline || "sem título"}`} className={`flex min-h-20 items-start gap-2 rounded-xl border p-3 text-left ${selected ? "border-orange-400 bg-orange-400/15" : "border-white/10 bg-white/5"}`}>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${selected ? "bg-orange-400 text-black" : "bg-white/10 text-white/70"}`}>{selected ? <Check size={14} /> : index + 1}</span>
                      <span className="min-w-0"><span className="block text-[11px] font-bold">Slide {index + 1}</span><span className="line-clamp-2 text-[10px] text-white/55">{slide.headline || "Sem título"}</span></span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="shrink-0 border-t border-white/10 bg-[#0d111b] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 sm:pb-4">
            {step === "targets" && <p className="mb-2 text-[11px] text-white/55">{groups.map(group => GROUP_LABELS[group].title).join(" + ")} · {targets.length} slide{targets.length === 1 ? "" : "s"} selecionado{targets.length === 1 ? "" : "s"}</p>}
            <button type="button" disabled={step === "properties" ? groups.length === 0 : targets.length === 0} onClick={() => step === "properties" ? setStep("targets") : onApply(groups, targets)} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-orange-400 px-4 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">
              {step === "properties" ? "Escolher slides" : `Aplicar ${targets.length === 1 ? "ao" : "aos"} ${targets.length} slide${targets.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
