import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ExtractionProjectSelect } from "./ExtractionProjectSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CanvasPostStage,
  type CanvasPostStageRef,
} from "@/pages/CanvasLab/components/CanvasPostStage";
import { intentToCanvasModel } from "./intentToCanvasModel";
import { artworkTextFont, artworkToCanvasModel } from "./artworkToCanvasModel";
import { prepareCanvasFont } from "@/lib/fonts";
import { designExtractionModelLabels, type DesignExtractionModel, type DesignExtractionResult } from "@shared/designExtraction";
import type { AspectRatioType, CanvasPostModel } from "@/pages/CanvasLab/components/types";
import type { CanvasSaveInputMeta } from "@/pages/CanvasLab/lib/saveAdapter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Sparkles,
  ExternalLink,
  Save,
  Loader2,
  X,
  CheckCircle2,
  ShieldAlert,
  Layers,
  Palette,
  FolderPlus,
  BookOpen,
  ArrowRight,
} from "lucide-react";

interface DesignExtractionReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTryAnotherModel: () => void;
  extraction: DesignExtractionResult;
  previewDataUrl: string;
  sourceUrl: string | null;
  project: { id: string; name: string };
  projects: Array<{ id: string; name: string }>;
  onChangeProject: (id: string) => void;
  model: DesignExtractionModel;
  onExtractionSaved: (project: { id: string; name: string }, postIds: number[]) => void;
  onOpenEditor?: (post: CanvasPostModel, input: CanvasSaveInputMeta) => void;
}

export function DesignExtractionReviewModal({
  isOpen,
  onClose,
  onTryAnotherModel,
  extraction,
  previewDataUrl,
  sourceUrl,
  project,
  projects,
  onChangeProject,
  model,
  onExtractionSaved,
  onOpenEditor,
}: DesignExtractionReviewModalProps) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const proposals = "proposals" in extraction ? extraction.proposals : extraction.intents;
  const [selectedProposal, setSelectedProposal] = useState(0);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatioType>("4:5");
  const [approvedProposals, setApprovedProposals] = useState(
    () => new Set(proposals.map((_, index) => index))
  );

  // Destino da extração (somente visível / configurável por Admin)
  const [adminDestination, setAdminDestination] = useState<"project" | "original-family">("project");

  const stageRef = useRef<CanvasPostStageRef>(null);
  const konvaContainerRef = useRef<HTMLDivElement>(null);
  const [konvaViewport, setKonvaViewport] = useState({ width: 440, height: 560 });

  useEffect(() => {
    const el = konvaContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setKonvaViewport({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  const activeProposal = proposals[selectedProposal];
  const [fontReady, setFontReady] = useState(
    () => "intents" in extraction && !extraction.dna.composition
  );
  useEffect(() => {
    const { dna } = extraction;
    const fonts = "proposals" in extraction
      ? extraction.proposals.flatMap(proposal => proposal.texts.map(text => artworkTextFont(dna, text)))
      : extraction.dna.composition
        ? [
            { fontFamily: dna.typography.headingFont, fontWeight: dna.typography.headingWeight, fontStyle: extraction.dna.composition.headingStyle },
            { fontFamily: dna.typography.bodyFont, fontWeight: 400, fontStyle: "normal" },
            { fontFamily: dna.typography.labelFont, fontWeight: 700, fontStyle: "normal" },
          ]
        : [];
    if (!fonts.length) return;
    const uniqueFonts = new Map(fonts.map(font => [JSON.stringify(font), font]));
    let active = true;
    const ready = () => { if (active) setFontReady(true); };
    const timeout = setTimeout(ready, 3000);
    void Promise.allSettled(Array.from(uniqueFonts.values(), ({ fontFamily, fontWeight, fontStyle }) =>
      prepareCanvasFont(fontFamily, fontWeight, fontStyle === "italic")
    )).then(() => { clearTimeout(timeout); ready(); });
    return () => { active = false; clearTimeout(timeout); };
  }, [extraction]);

  // Preview, editor and save use the same materialized document for the selected format.
  const models = useMemo(() => {
    if (!fontReady) return [];
    if ("proposals" in extraction) {
      return extraction.proposals.map(proposal => artworkToCanvasModel(extraction.dna, proposal, selectedAspectRatio));
    }
    return extraction.intents.map(intent => intentToCanvasModel(extraction.dna, intent, {
      aspectRatio: selectedAspectRatio,
    }));
  }, [extraction, fontReady, selectedAspectRatio]);
  const activeCanvasModel = models[selectedProposal];

  // Escala dinâmica Konva para caber com perfeição no container
  const baseStageWidth = 360;
  const baseStageHeight =
    360 * (selectedAspectRatio === "9:16" ? 16 / 9 : selectedAspectRatio === "4:5" ? 5 / 4 : 1);

  const stageZoom = useMemo(() => {
    const pad = 24;
    const availW = Math.max(180, konvaViewport.width - pad);
    const availH = Math.max(180, konvaViewport.height - pad);
    return Math.min(1.15, availW / baseStageWidth, availH / baseStageHeight);
  }, [konvaViewport.width, konvaViewport.height, baseStageWidth, baseStageHeight]);

  const saveToProjectMutation = trpc.templateIngestion.saveExtractionToProject.useMutation();
  const previewFamilyDraftMutation = trpc.templateIngestion.previewOriginalFamilyDraft.useMutation();

  // Abrir a intenção atual diretamente no CanvasLab
  const handleOpenInCanvasLab = () => {
    if (!activeCanvasModel) return;
    try {
      const input: CanvasSaveInputMeta = sourceUrl
        ? { inputType: "url", inputContent: sourceUrl }
        : { inputType: "image", inputContent: activeProposal.name };
      if (onOpenEditor) onOpenEditor(activeCanvasModel, input);
      else {
        sessionStorage.setItem("postspark.open_canvas_post", JSON.stringify({ ...input, model: activeCanvasModel }));
        setLocation("/thevoid");
      }
      onClose();
    } catch (e) {
      toast.error("Não foi possível preparar o post para o CanvasLab.");
    }
  };

  // Salvar no projeto ou submeter rascunho de família original
  const [isSaving, setIsSaving] = useState(false);
  const handleSave = async () => {
    if (!activeCanvasModel) return;
    setIsSaving(true);
    try {
      const familyDraft = isAdmin && adminDestination === "original-family";
      if (familyDraft) await previewFamilyDraftMutation.mutateAsync({ extraction });
      const posts = proposals.flatMap((proposal, index) => (familyDraft ? index === selectedProposal : approvedProposals.has(index))
        ? [{ title: `${extraction.dna.styleName} - ${proposal.name}`, canvasModel: models[index], ...(familyDraft && { previewDataUrl }) }]
        : []);
      const saved = await saveToProjectMutation.mutateAsync({ projectId: project.id, extraction, posts });
      if (saved.projectId !== project.id || saved.postIds.length !== posts.length)
        throw new Error("O projeto não confirmou todos os modelos selecionados.");
      void utils.brandProjects.list.invalidate().catch(() => {});
      toast.success(familyDraft
        ? `Rascunho de família verificado. Modelo salvo em ${project.name}.`
        : `${posts.length === 1 ? "Modelo salvo" : `${posts.length} modelos salvos`} em ${project.name}.`);
      onExtractionSaved(project, saved.postIds);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar extração.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleApproveProposal = (index: number) => {
    setApprovedProposals(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        if (next.size <= 1) {
          toast.warning("Selecione pelo menos um modelo.");
          return prev;
        }
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && !isSaving && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[96vw] sm:!max-w-[96vw] w-[1420px] h-[92vh] !flex flex-col p-0 gap-0 bg-[#0b0d13] border-white/10 text-white overflow-hidden shadow-2xl rounded-2xl"
      >
        <DialogTitle className="sr-only">Modelos do Replicar Design</DialogTitle>
        <DialogDescription className="sr-only">
          Escolha os modelos que deseja reutilizar nos briefings deste projeto.
        </DialogDescription>

        {/* ─── 1. TOP BAR ─── */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#10141f] p-3 lg:min-h-16 lg:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-inner">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-white tracking-tight">
                  {extraction.dna.styleName}
                </h2>
                <Badge variant="outline" className="text-[10px] uppercase font-mono border-orange-500/40 text-orange-400 bg-orange-500/10">
                  {extraction.dna.movement}
                </Badge>
                {sourceUrl && (
                  <span className="text-[11px] text-white/40 truncate max-w-xs font-mono">
                    ({new URL(sourceUrl).hostname})
                  </span>
                )}
              </div>
              <p className="hidden max-w-xl truncate text-[11px] text-white/50 lg:block">
                {extraction.dna.summary}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:gap-3">
            <ExtractionProjectSelect projects={projects} value={project.id} disabled={isSaving} onChange={onChangeProject} />
            {/* SELETOR DE DESTINO PARA ADMIN (EXCLUSIVO) */}
            {isAdmin && (
              <div className="flex items-center bg-black/40 border border-orange-500/30 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setAdminDestination("project")}
                  className={`text-xs px-2.5 py-1 rounded flex items-center gap-1.5 transition ${
                    adminDestination === "project"
                      ? "bg-orange-600 text-white font-medium"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  <FolderPlus className="size-3.5" />
                  Salvar no Projeto
                </button>
                <button
                  type="button"
                  onClick={() => setAdminDestination("original-family")}
                  className={`text-xs px-2.5 py-1 rounded flex items-center gap-1.5 transition ${
                    adminDestination === "original-family"
                      ? "bg-amber-600 text-white font-medium"
                      : "text-white/60 hover:text-white"
                  }`}
                  title="Sanitiza textos/marcas e envia como rascunho de Família Original para o acervo global (Admin)"
                >
                  <BookOpen className="size-3.5" />
                  Família Original (Rascunho)
                </button>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenInCanvasLab}
              disabled={!activeCanvasModel || isSaving}
              className="h-9 px-3.5 text-xs border-white/20 hover:bg-white/10 text-white gap-1.5"
            >
              <ExternalLink className="size-3.5" />
              Editar no CanvasLab
            </Button>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !activeCanvasModel}
              className="h-9 px-4 text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-600/20 gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  {adminDestination === "original-family" ? "Submeter Rascunho Global" : `Salvar em ${project.name}`}
                </>
              )}
            </Button>

            <button
              onClick={onClose}
              disabled={isSaving}
              aria-label="Fechar modelos"
              className="size-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition ml-1"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* ─── 2. CORPO TRIPARTIDO (3 COLUNAS) ─── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#0b0d13] lg:grid lg:grid-cols-12 lg:divide-x lg:divide-white/10 lg:overflow-hidden">
          {/* COLUNA ESQUERDA (3 colunas): Referência Original + DNA Extraído */}
          <div className="order-3 flex shrink-0 flex-col bg-[#0e111a] lg:order-none lg:col-span-3 lg:min-h-0">
            <div className="p-3.5 border-b border-white/10 flex items-center justify-between text-xs font-medium text-white/70">
              <span className="flex items-center gap-1.5">
                <Palette className="size-3.5 text-orange-400" />
                Referência & DNA Visual
              </span>
            </div>

            <ScrollArea className="flex-1 p-4 space-y-5">
              {/* Preview da Imagem Original / Screenshot */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-mono text-white/40 uppercase tracking-wider">
                  Referência Original
                </div>
                <div className="relative rounded-xl overflow-hidden border border-white/15 bg-black/50 aspect-video max-h-48 flex items-center justify-center">
                  <img
                    src={previewDataUrl}
                    alt="Referência original"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                  <span className="text-white/70">{designExtractionModelLabels[model]}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={onTryAnotherModel}
                    className="h-auto px-2 py-1.5 text-xs text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
                  >
                    Testar outro modelo
                  </Button>
                </div>
              </div>

              {/* Tokens: Cores Extraídas */}
              <div className="space-y-2 pt-2">
                <div className="text-[11px] font-mono text-white/40 uppercase tracking-wider flex items-center justify-between">
                  <span>Paleta de Cores</span>
                  <span className="text-[10px] text-white/30">6 papéis</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(extraction.dna.palette).map(([role, hex]) => (
                    <div
                      key={role}
                      className="p-1.5 rounded-lg border border-white/10 bg-white/[0.02] flex items-center gap-2"
                    >
                      <div
                        className="size-5 rounded border border-white/20 shrink-0 shadow-sm"
                        style={{ backgroundColor: hex }}
                      />
                      <div className="min-w-0">
                        <div className="text-[9px] uppercase font-mono text-white/40 truncate">{role}</div>
                        <div className="text-[10px] font-mono text-white/80">{hex}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tokens: Tipografia Real */}
              <div className="space-y-2 pt-2">
                <div className="text-[11px] font-mono text-white/40 uppercase tracking-wider">
                  Tipografia Detectada
                </div>
                <div className="space-y-1.5 bg-black/40 border border-white/10 rounded-xl p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-[11px]">Título / Destaque:</span>
                    <span className="font-semibold text-white/90">{extraction.dna.typography.headingFont}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-[11px]">Corpo / Suporte:</span>
                    <span className="font-medium text-white/80">{extraction.dna.typography.bodyFont}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-[11px]">Rótulos / Tags:</span>
                    <span className="font-mono text-orange-400/90 text-[11px]">{extraction.dna.typography.labelFont}</span>
                  </div>
                </div>
              </div>

              {/* Tokens: Superfícies e Formas */}
              <div className="space-y-2 pt-2 pb-6">
                <div className="text-[11px] font-mono text-white/40 uppercase tracking-wider">
                  Tratamento Gráfico
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-black/30 border border-white/10 rounded-lg p-2">
                    <div className="text-white/40 text-[10px]">Contorno / Borda</div>
                    <div className="font-medium text-white/80 mt-0.5">{extraction.dna.surfaces.borderWidth}px sólida</div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-2">
                    <div className="text-white/40 text-[10px]">Sombra Densa</div>
                    <div className="font-medium text-white/80 mt-0.5">
                      {extraction.dna.surfaces.hardShadow ? `${extraction.dna.surfaces.shadowOffset}px rígida` : "Sem sombra"}
                    </div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-2">
                    <div className="text-white/40 text-[10px]">Cantos</div>
                    <div className="font-medium text-white/80 mt-0.5 capitalize">{extraction.dna.surfaces.corners}</div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-2">
                    <div className="text-white/40 text-[10px]">Textura de Fundo</div>
                    <div className="font-medium text-white/80 mt-0.5 capitalize">{extraction.dna.surfaces.texture}</div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* COLUNA CENTRAL (5 colunas): Render Konva 2D Interativo */}
          <div className="order-1 flex h-[52dvh] min-h-64 shrink-0 flex-col bg-[#090b10] lg:order-none lg:col-span-5 lg:h-auto lg:min-h-0">
            <div className="p-3 border-b border-white/10 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white/80">{activeProposal.name}</span>
                <Badge variant="outline" className="text-[10px] border-white/20 text-white/60 bg-white/5">
                  {selectedAspectRatio}
                </Badge>
              </div>

              {/* Seletor de Formato (4:5, 1:1, 9:16) */}
              <div className="flex items-center gap-1 bg-black/50 border border-white/10 p-0.5 rounded-lg">
                {(["4:5", "1:1", "9:16"] as AspectRatioType[]).map(ratio => (
                  <button
                    key={ratio}
                    onClick={() => setSelectedAspectRatio(ratio)}
                    className={`text-[11px] px-2 py-0.5 rounded font-mono transition ${
                      selectedAspectRatio === ratio
                        ? "bg-orange-500 text-white font-bold"
                        : "text-white/50 hover:text-white"
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* Container Responsivo do Palco Konva */}
            <div
              ref={konvaContainerRef}
              className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden relative"
            >
              <div
                style={{
                  transform: `scale(${stageZoom})`,
                  transformOrigin: "center center",
                  transition: "transform 0.15s ease-out",
                }}
                className="shrink-0 overflow-hidden rounded-lg border border-white/15 shadow-2xl"
              >
                {activeCanvasModel ? <CanvasPostStage ref={stageRef} post={activeCanvasModel} zoom={1} /> : (
                  <p role="status" className="px-4 py-3 text-xs text-white/60">Preparando a tipografia da referência…</p>
                )}
              </div>
            </div>

            <div className="p-3 border-t border-white/10 bg-[#0d1017] text-[11px] text-white/60 flex items-center justify-between">
              <span className="line-clamp-2" title={activeProposal.rationale}>
                {activeProposal.rationale}
              </span>
              <button
                onClick={handleOpenInCanvasLab}
                disabled={!activeCanvasModel || isSaving}
                className="text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1 shrink-0 ml-2"
              >
                Abrir na Prancheta <ArrowRight className="size-3" />
              </button>
            </div>
          </div>

          {/* Propostas e seleção para salvar */}
          <div className="order-2 flex shrink-0 flex-col bg-[#0e111a] lg:order-none lg:col-span-4 lg:min-h-0">
            <div className="p-3.5 border-b border-white/10 flex items-center justify-between text-xs font-medium text-white/70">
              <span className="flex items-center gap-1.5">
                <Layers className="size-3.5 text-orange-400" />
                Modelos ({proposals.length})
              </span>
              <span className="text-[10px] text-white/40">
                {approvedProposals.size} de {proposals.length}
              </span>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-2">
                {proposals.map((proposal, index) => {
                  const isSelected = selectedProposal === index;
                  const isApproved = approvedProposals.has(index);
                  const headline = "texts" in proposal
                    ? proposal.texts.find(text => text.role === "headline")?.text
                    : proposal.headline;

                  return (
                    <div
                      key={index}
                      className={`flex items-start justify-between gap-2 rounded-xl border transition ${
                        isSelected
                          ? "border-orange-500/60 bg-orange-500/[0.08]"
                          : "border-white/10 bg-black/30 hover:border-white/20"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedProposal(index)}
                        aria-pressed={isSelected}
                        className="min-w-0 flex-1 rounded-xl p-3.5 text-left focus-visible:outline-2 focus-visible:outline-orange-400"
                      >
                        <span className="block text-xs font-semibold text-white/90">{proposal.name}</span>
                        <span className="mt-1 line-clamp-2 text-[11px] text-white/60">{headline}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleApproveProposal(index)}
                        aria-pressed={isApproved}
                        aria-label={`Incluir ${proposal.name} nos modelos do projeto`}
                        className={`mr-3 mt-3 flex size-7 shrink-0 items-center justify-center rounded-md border transition ${
                          isApproved
                            ? "border-green-500/40 bg-green-500/20 text-green-400"
                            : "border-white/10 bg-white/5 text-white/40 hover:text-white"
                        }`}
                      >
                        <CheckCircle2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Aviso de Isolamento / Segurança */}
            <div className="p-3 border-t border-white/10 bg-black/40 text-[11px] text-white/50 flex items-start gap-2">
              <ShieldAlert className="size-3.5 text-orange-400/80 shrink-0 mt-0.5" />
              <span>
                {isAdmin && adminDestination === "original-family"
                  ? "Modo Admin: Este design será sanitizado (sem marcas ou textos originais) e submetido como rascunho de Família Original para moderação."
                  : "Os modelos ficam no projeto. Use qualquer um deles em um novo briefing."}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
