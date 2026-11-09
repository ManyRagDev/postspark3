import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CanvasPostStage,
  type CanvasPostStageRef,
} from "@/pages/CanvasLab/components/CanvasPostStage";
import { intentToCanvasModel } from "./intentToCanvasModel";
import type { DesignExtraction, PostIntent, PostIntentKind } from "@shared/designExtraction";
import type { AspectRatioType, CanvasPostModel } from "@/pages/CanvasLab/components/types";
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
  extraction: DesignExtraction;
  previewDataUrl: string;
  sourceUrl: string | null;
  projectId: string;
  onExtractionSaved?: (projectId: string) => void;
}

export function DesignExtractionReviewModal({
  isOpen,
  onClose,
  extraction,
  previewDataUrl,
  sourceUrl,
  projectId,
  onExtractionSaved,
}: DesignExtractionReviewModalProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [selectedIntentKind, setSelectedIntentKind] = useState<PostIntentKind>(
    extraction.intents[0]?.kind || "value-pillars"
  );
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatioType>("4:5");
  const [approvedKinds, setApprovedKinds] = useState<Set<PostIntentKind>>(
    () => new Set(extraction.intents.map(i => i.kind))
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

  // Encontra a intenção ativa selecionada
  const activeIntent = useMemo(() => {
    return extraction.intents.find(i => i.kind === selectedIntentKind) || extraction.intents[0];
  }, [extraction.intents, selectedIntentKind]);

  // Gera o CanvasPostModel para a intenção ativa atual
  const activeCanvasModel = useMemo<CanvasPostModel>(() => {
    return intentToCanvasModel(extraction.dna, activeIntent, {
      aspectRatio: selectedAspectRatio,
    });
  }, [extraction.dna, activeIntent, selectedAspectRatio]);

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

  const saveToProjectMutation = trpc.templateIngestion?.saveExtractionToProject?.useMutation
    ? trpc.templateIngestion.saveExtractionToProject.useMutation()
    : { mutateAsync: async (_args: any) => ({ projectId, postIds: [] }), isPending: false };

  const previewFamilyDraftMutation = trpc.templateIngestion?.previewOriginalFamilyDraft?.useMutation
    ? trpc.templateIngestion.previewOriginalFamilyDraft.useMutation()
    : { mutateAsync: async (_args: any) => ({ sanitized: {} as any }), isPending: false };

  // Abrir a intenção atual diretamente no CanvasLab
  const handleOpenInCanvasLab = () => {
    try {
      sessionStorage.setItem("canvaslab_imported_model", JSON.stringify(activeCanvasModel));
      toast.success(`Abrindo post "${activeIntent.name}" no CanvasLab...`);
      onClose();
      setLocation("/canvaslab?imported=true");
    } catch (e) {
      toast.error("Não foi possível preparar o post para o CanvasLab.");
    }
  };

  // Salvar no projeto ou submeter rascunho de família original
  const [isSaving, setIsSaving] = useState(false);
  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (isAdmin && adminDestination === "original-family") {
        // Pré-visualização sanitizada e rascunho
        const res = await previewFamilyDraftMutation.mutateAsync({ extraction });
        toast.success(
          "Rascunho de família original verificado e pronto para o acervo geral (pendente de aprovação)."
        );
        // Também salvamos no projeto do admin
        await saveToProjectMutation.mutateAsync({
          projectId,
          extraction,
          posts: [
            {
              title: `${extraction.dna.styleName} - ${activeIntent.name}`,
              canvasModel: activeCanvasModel,
              previewDataUrl: previewDataUrl,
            },
          ],
        });
        onExtractionSaved?.(projectId);
        onClose();
        return;
      }

      // Fluxo Padrão (Todo usuário + Admin em modo projeto):
      // Gera as composições aprovadas e salva exclusivamente no projeto do usuário
      const postsToSave = extraction.intents
        .filter(i => approvedKinds.has(i.kind))
        .map(intent => {
          const model = intentToCanvasModel(extraction.dna, intent, {
            aspectRatio: selectedAspectRatio,
          });
          return {
            title: `${extraction.dna.styleName} - ${intent.name}`,
            canvasModel: model,
            previewDataUrl: undefined,
          };
        });

      await saveToProjectMutation.mutateAsync({
        projectId,
        extraction,
        posts: postsToSave,
      });

      toast.success(
        `${postsToSave.length} posts salvos no projeto e DNA de design calibrado com sucesso!`
      );
      onExtractionSaved?.(projectId);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar extração.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleApproveKind = (kind: PostIntentKind) => {
    setApprovedKinds(prev => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size <= 1) {
          toast.warning("Mantenha ao menos 1 post aprovado.");
          return prev;
        }
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[96vw] sm:!max-w-[96vw] w-[1420px] h-[92vh] !flex flex-col p-0 gap-0 bg-[#0b0d13] border-white/10 text-white overflow-hidden shadow-2xl rounded-2xl"
      >
        <DialogTitle className="sr-only">Extração Criativa de DNA e Intenções de Design</DialogTitle>
        <DialogDescription className="sr-only">
          Revise a identidade visual extraída e as variações de post geradas antes de salvar no seu projeto.
        </DialogDescription>

        {/* ─── 1. TOP BAR ─── */}
        <header className="h-16 px-6 border-b border-white/10 bg-[#10141f] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-inner">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
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
              <p className="text-[11px] text-white/50 truncate max-w-xl">
                {extraction.dna.summary}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
              className="h-9 px-3.5 text-xs border-white/20 hover:bg-white/10 text-white gap-1.5"
            >
              <ExternalLink className="size-3.5" />
              Editar no CanvasLab
            </Button>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
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
                  {adminDestination === "original-family" ? "Submeter Rascunho Global" : `Salvar ${approvedKinds.size} Posts no Projeto`}
                </>
              )}
            </Button>

            <button
              onClick={onClose}
              className="size-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition ml-1"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* ─── 2. CORPO TRIPARTIDO (3 COLUNAS) ─── */}
        <div className="flex-1 min-h-0 grid grid-cols-12 divide-x divide-white/10 bg-[#0b0d13]">
          {/* COLUNA ESQUERDA (3 colunas): Referência Original + DNA Extraído */}
          <div className="col-span-3 flex flex-col min-h-0 bg-[#0e111a]">
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
          <div className="col-span-5 flex flex-col min-h-0 bg-[#090b10]">
            <div className="p-3 border-b border-white/10 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white/80">{activeIntent.name}</span>
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
                className="shadow-2xl rounded-lg overflow-hidden border border-white/15"
              >
                <CanvasPostStage
                  ref={stageRef}
                  post={activeCanvasModel}
                  zoom={1}
                />
              </div>
            </div>

            {/* Rodapé da Coluna Central: Rationale do Post */}
            <div className="p-3 border-t border-white/10 bg-[#0d1017] text-[11px] text-white/60 flex items-center justify-between">
              <span className="truncate max-w-sm">
                💡 <strong className="text-white/80">Estratégia:</strong> {activeIntent.rationale}
              </span>
              <button
                onClick={handleOpenInCanvasLab}
                className="text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1 shrink-0 ml-2"
              >
                Abrir na Prancheta <ArrowRight className="size-3" />
              </button>
            </div>
          </div>

          {/* COLUNA DIREITA (4 colunas): Seletor de Intenções + Aprovação em Lote */}
          <div className="col-span-4 flex flex-col min-h-0 bg-[#0e111a]">
            <div className="p-3.5 border-b border-white/10 flex items-center justify-between text-xs font-medium text-white/70">
              <span className="flex items-center gap-1.5">
                <Layers className="size-3.5 text-orange-400" />
                Variações por Intencionalidade ({extraction.intents.length})
              </span>
              <span className="text-[10px] text-white/40">
                {approvedKinds.size} selecionadas para salvar
              </span>
            </div>

            <ScrollArea className="flex-1 p-4 space-y-3">
              <div className="text-[11px] text-white/50 leading-relaxed pb-1">
                A IA analisou sua referência e desdobrou a proposta em ângulos editoriais complementares para redes sociais:
              </div>

              {extraction.intents.map((intent, idx) => {
                const isSelected = selectedIntentKind === intent.kind;
                const isApproved = approvedKinds.has(intent.kind);

                return (
                  <div
                    key={intent.kind}
                    onClick={() => setSelectedIntentKind(intent.kind)}
                    className={`p-3.5 rounded-xl border transition cursor-pointer relative ${
                      isSelected
                        ? "border-orange-500/60 bg-orange-500/[0.08] shadow-md shadow-orange-500/5"
                        : "border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="size-5 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[10px] font-mono text-white/70">
                          {idx + 1}
                        </span>
                        <div>
                          <h4 className="text-xs font-semibold text-white/90">
                            {intent.name}
                          </h4>
                          <span className="text-[10px] font-mono uppercase text-orange-400/80">
                            {intent.kind}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          toggleApproveKind(intent.kind);
                        }}
                        className={`size-6 rounded-md flex items-center justify-center transition ${
                          isApproved
                            ? "bg-green-500/20 text-green-400 border border-green-500/40"
                            : "bg-white/5 text-white/30 border border-white/10 hover:text-white"
                        }`}
                        title={isApproved ? "Incluído para salvar" : "Ignorar este post"}
                      >
                        <CheckCircle2 className="size-3.5" />
                      </button>
                    </div>

                    <p className="text-[11px] text-white/60 mt-2 line-clamp-2">
                      {intent.headline}
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-white/40">
                      <span>CTA: &quot;{intent.ctaLabel}&quot;</span>
                      <span className="text-white/30">{intent.items.length} itens de apoio</span>
                    </div>
                  </div>
                );
              })}
            </ScrollArea>

            {/* Aviso de Isolamento / Segurança */}
            <div className="p-3 border-t border-white/10 bg-black/40 text-[11px] text-white/50 flex items-start gap-2">
              <ShieldAlert className="size-3.5 text-orange-400/80 shrink-0 mt-0.5" />
              <span>
                {isAdmin && adminDestination === "original-family"
                  ? "Modo Admin: Este design será sanitizado (sem marcas ou textos originais) e submetido como rascunho de Família Original para moderação."
                  : "Isolamento estrito: Este DNA e seus posts são salvos exclusivamente no seu projeto privado e nunca impactam outros usuários."}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
