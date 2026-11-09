import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FontDropdown } from "@/components/ui/FontDropdown";
import {
  CanvasPostStage,
  type CanvasPostStageRef,
} from "@/pages/CanvasLab/components/CanvasPostStage";
import { materializeReferenceDiagnostic } from "@/pages/Admin/referenceSceneCompiler";
import type { RecreationRecipe } from "@shared/designRecreation";
import { emptyReferenceLayer } from "@shared/referenceReconstruction";
import { recipeToCanvasModel, detectAspectRatio } from "./recipeToCanvasModel";
import type { AspectRatioType } from "@/pages/CanvasLab/components/types";
import { isDarkColor } from "@/pages/CanvasLab/components/types";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Eye,
  EyeOff,
  Layers,
  Palette,
  Sparkles,
  ExternalLink,
  Save,
  Image as ImageIcon,
  Loader2,
  X,
  Plus,
} from "lucide-react";

interface TemplateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipe: RecreationRecipe;
  previewDataUrl: string;
}

export function TemplateReviewModal({
  isOpen,
  onClose,
  recipe: initialRecipe,
  previewDataUrl,
}: TemplateReviewModalProps) {
  const [, setLocation] = useLocation();
  const [recipe, setRecipe] = useState<RecreationRecipe>(() => structuredClone(initialRecipe));
  const [title, setTitle] = useState(initialRecipe.title || "Novo Template Ingerido");
  const [showOverlays, setShowOverlays] = useState(true);
  const [previewMode, setPreviewMode] = useState<"diagnostic" | "interactive">("interactive");

  const sourceWidth = recipe.scene?.source?.widthPx || 1080;
  const sourceHeight = recipe.scene?.source?.heightPx || 1080;
  const defaultRatio = useMemo(() => detectAspectRatio(sourceWidth, sourceHeight), [sourceWidth, sourceHeight]);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatioType>(defaultRatio);

  const stageRef = useRef<CanvasPostStageRef>(null);
  const konvaContainerRef = useRef<HTMLDivElement>(null);
  const [konvaViewport, setKonvaViewport] = useState({ width: 420, height: 520 });

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

  const saveMutation = trpc.templateIngestion?.saveAsTemplate?.useMutation
    ? trpc.templateIngestion.saveAsTemplate.useMutation()
    : { mutateAsync: async (_args: any) => ({ id: 0 }), isPending: false };

  // Filtra apenas camadas visíveis para alimentar o modelo interativo
  const visibleRecipe = useMemo<RecreationRecipe>(() => {
    return {
      ...recipe,
      scene: {
        ...recipe.scene,
        layers: recipe.scene.layers.filter(l => (l.opacity ?? 1) > 0),
      },
    };
  }, [recipe]);

  // Modelo interativo derivado
  const canvasModel = useMemo(() => {
    return recipeToCanvasModel(visibleRecipe, {
      title,
      originalImageUrl: previewDataUrl,
      targetAspectRatio: selectedAspectRatio,
    });
  }, [visibleRecipe, title, previewDataUrl, selectedAspectRatio]);

  // Modelo diagnóstico para visualização de fidelidade de receita
  const diagnosticPost = useMemo(() => {
    return materializeReferenceDiagnostic(visibleRecipe.scene);
  }, [visibleRecipe.scene]);

  // Cálculo de escala responsiva do palco Konva 2D
  const baseStageWidth = 360;
  const baseStageHeight =
    previewMode === "diagnostic"
      ? (360 * sourceHeight) / Math.max(1, sourceWidth)
      : 360 * (canvasModel.aspectRatio === "9:16" ? 16 / 9 : canvasModel.aspectRatio === "4:5" ? 5 / 4 : 1);

  const stageZoom = useMemo(() => {
    const pad = 24;
    const availW = Math.max(180, konvaViewport.width - pad);
    const availH = Math.max(180, konvaViewport.height - pad);
    return Math.min(1.15, availW / baseStageWidth, availH / baseStageHeight);
  }, [konvaViewport.width, konvaViewport.height, baseStageWidth, baseStageHeight]);

  // Manipulação de camadas
  const handleUpdateLayerText = (layerId: string, text: string) => {
    setRecipe(prev => {
      const next = structuredClone(prev);
      const layer = next.scene.layers.find(l => l.id === layerId);
      if (layer && (layer.kind === "text" || layer.kind === "arcText")) {
        layer.text = text;
      }
      return next;
    });
  };

  const handleUpdateLayerFont = (layerId: string, fontFamily: string) => {
    setRecipe(prev => {
      const next = structuredClone(prev);
      const layer = next.scene.layers.find(l => l.id === layerId);
      if (layer && (layer.kind === "text" || layer.kind === "arcText")) {
        layer.fontFamily = fontFamily;
      }
      return next;
    });
  };

  const handleUpdateLayerColor = (layerId: string, color: string) => {
    setRecipe(prev => {
      const next = structuredClone(prev);
      const layer = next.scene.layers.find(l => l.id === layerId);
      if (layer) {
        layer.fill = color;
      }
      return next;
    });
  };

  const handleToggleLayerVisibility = (layerId: string) => {
    setRecipe(prev => {
      const next = structuredClone(prev);
      const layer = next.scene.layers.find(l => l.id === layerId);
      if (layer) {
        layer.opacity = (layer.opacity ?? 1) > 0 ? 0 : 1;
      }
      return next;
    });
  };

  const handleAddTextLayer = () => {
    setRecipe(prev => {
      const next = structuredClone(prev);
      const newId = `custom-text-${next.scene.layers.length + 1}`;
      const newLayer = {
        ...emptyReferenceLayer("text", newId),
        role: next.scene.layers.some(l => l.kind === "text" && l.role === "headline") ? "support" : "headline",
        zIndex: next.scene.layers.length,
        x: Math.round(sourceWidth * 0.1),
        y: Math.round(sourceHeight * 0.18),
        width: Math.round(sourceWidth * 0.8),
        height: Math.round(sourceHeight * 0.14),
        fill: isDarkColor(next.scene.artboard.background) ? "#FFFFFF" : "#111111",
        text: "Novo título ou chamada",
        fontFamily: "Plus Jakarta Sans",
        fontWeight: 800,
        fontSize: Math.round(sourceWidth * 0.055),
        align: "left" as const,
        opacity: 1,
      };
      next.scene.layers.push(newLayer);
      return next;
    });
  };

  const handleUpdateBackground = (bg: string) => {
    setRecipe(prev => {
      const next = structuredClone(prev);
      next.scene.artboard.background = bg;
      return next;
    });
  };

  // Ações de saída
  const handleOpenInCanvasLab = () => {
    try {
      sessionStorage.setItem(
        "postspark.open_canvas_post",
        JSON.stringify({
          model: canvasModel,
          inputType: "image",
          inputContent: `Template Ingerido: ${title}`,
        })
      );
      toast.success("Template carregado! Redirecionando para o CanvasLab...");
      onClose();
      setLocation("/thevoid");
    } catch {
      toast.error("Erro ao preparar o documento para o CanvasLab.");
    }
  };

  const handleSaveToCatalog = async () => {
    try {
      await saveMutation.mutateAsync({
        title,
        canvasModel,
        previewDataUrl,
      });
      toast.success("Template salvo na sua biblioteca com sucesso!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar template.");
    }
  };

  const textLayers = recipe.scene.layers.filter(l => l.kind === "text" || l.kind === "arcText");
  const shapeLayers = recipe.scene.layers.filter(l => l.kind === "rect" || l.kind === "polygon" || l.kind === "line");

  // Auditoria de contraste
  const currentBg = recipe.scene.artboard.background || "#111111";
  const primaryTextColor = textLayers[0]?.fill || (isDarkColor(currentBg) ? "#FFFFFF" : "#111111");
  const isContrastGood = isDarkColor(currentBg) ? !isDarkColor(primaryTextColor) : isDarkColor(primaryTextColor);

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[96vw] sm:!max-w-[96vw] w-[1420px] h-[90vh] max-h-[920px] !flex flex-col p-0 gap-0 bg-[#0d0f14] border-white/10 text-white overflow-hidden shadow-2xl"
      >
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-white/10 bg-[#12151d] shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="size-8 shrink-0 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="sr-only">Revisão e Aprovação de Template</DialogTitle>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="h-7 px-2 font-semibold text-sm bg-black/30 border-white/15 hover:border-white/25 focus:border-orange-500/60 text-white rounded w-60 sm:w-80 md:w-96"
                  placeholder="Nome do template"
                />
                <Badge
                  variant="outline"
                  className="bg-orange-500/10 border-orange-500/30 text-orange-400 text-[10px] uppercase font-mono shrink-0"
                >
                  Engenharia Reversa Visual
                </Badge>
              </div>
              <DialogDescription className="text-xs text-white/50 truncate mt-0.5">
                Revise os elementos detectados antes de salvar na biblioteca ou abrir na prancheta interativa.
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveToCatalog}
              disabled={saveMutation.isPending}
              className="border-white/15 bg-white/5 hover:bg-white/10 text-white/85 text-xs h-8"
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="size-3.5 mr-1.5" />
              )}
              Salvar no Acervo
            </Button>
            <Button
              size="sm"
              onClick={handleOpenInCanvasLab}
              className="bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs h-8 shadow-lg shadow-orange-600/20"
            >
              <ExternalLink className="size-3.5 mr-1.5" />
              Abrir no CanvasLab
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar modal"
              className="ml-1 size-8 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Main Work Area: 3 Columns on Desktop */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Coluna 1: Referência Original */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0a0c10] p-4 relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 pb-3 shrink-0">
              <span className="text-xs font-mono uppercase text-white/70 tracking-wider flex items-center gap-2 truncate">
                <span className="size-2 shrink-0 rounded-full bg-blue-500 inline-block" />
                Arte Original ({sourceWidth}×{sourceHeight}px)
              </span>
              <button
                type="button"
                onClick={() => setShowOverlays(v => !v)}
                className={`text-[11px] font-mono px-2.5 py-1 rounded border transition shrink-0 ${
                  showOverlays
                    ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                    : "bg-white/5 text-white/50 border-white/10 hover:text-white"
                }`}
              >
                {showOverlays ? "Ocultar Caixas" : "Mostrar Caixas"}
              </button>
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center p-2 overflow-hidden">
              <div className="relative inline-flex max-h-full max-w-full rounded-lg overflow-hidden border border-white/15 shadow-2xl">
                <img
                  src={previewDataUrl}
                  alt="Referência Original"
                  className="block max-h-[68vh] w-auto max-w-full object-contain pointer-events-none select-none"
                />

                {/* Overlays de caixas detectadas */}
                {showOverlays && (
                  <div className="absolute inset-0 pointer-events-none">
                    {recipe.scene.layers.map((layer, index) => {
                      if ((layer.opacity ?? 1) <= 0) return null;
                      const leftPct = (layer.x / sourceWidth) * 100;
                      const topPct = (layer.y / sourceHeight) * 100;
                      const widthPct = (layer.width / sourceWidth) * 100;
                      const heightPct = (layer.height / sourceHeight) * 100;

                      const isText = layer.kind === "text" || layer.kind === "arcText";
                      return (
                        <div
                          key={layer.id || index}
                          className={`absolute border transition-opacity ${
                            isText
                              ? "border-emerald-400/90 bg-emerald-400/10 text-emerald-200"
                              : "border-purple-400/75 bg-purple-400/10 text-purple-200"
                          }`}
                          style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            width: `${widthPct}%`,
                            height: `${heightPct}%`,
                          }}
                        >
                          <span className="text-[9px] font-mono font-semibold px-1 py-0.2 bg-black/85 rounded absolute -top-4 left-0 whitespace-nowrap">
                            {layer.role || (isText ? "texto" : "forma")}
                          </span>
                        </div>
                      );
                    })}

                    {/* Slots de mídia (missingElements) */}
                    {recipe.missingElements?.map((item, index) => {
                      if (!item.box) return null;
                      return (
                        <div
                          key={`missing-${index}`}
                          className="absolute border-2 border-dashed border-cyan-400/90 bg-cyan-400/15 text-cyan-200"
                          style={{
                            left: `${item.box.x * 100}%`,
                            top: `${item.box.y * 100}%`,
                            width: `${item.box.width * 100}%`,
                            height: `${item.box.height * 100}%`,
                          }}
                        >
                          <span className="text-[9px] font-mono font-semibold px-1 py-0.2 bg-cyan-950/90 text-cyan-300 rounded absolute top-1 left-1">
                            Slot: {item.role || "mídia"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Coluna 2: Renderização 2D Konva Live */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0f1118] p-4 relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 shrink-0">
              <span className="text-xs font-mono uppercase text-orange-400/90 tracking-wider flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-orange-500 inline-block animate-pulse" />
                Render 2D Konva
              </span>

              <div className="flex items-center gap-2">
                {previewMode === "interactive" && (
                  <select
                    aria-label="Proporção do template"
                    value={selectedAspectRatio}
                    onChange={e => setSelectedAspectRatio(e.target.value as AspectRatioType)}
                    className="h-6 rounded border border-white/15 bg-black/40 px-2 text-[11px] font-mono text-white/85 focus:outline-none focus:border-orange-500/50"
                  >
                    <option value="1:1" className="bg-neutral-900">1:1 Feed</option>
                    <option value="4:5" className="bg-neutral-900">4:5 Retrato</option>
                    <option value="9:16" className="bg-neutral-900">9:16 Stories</option>
                  </select>
                )}

                <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("interactive")}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded transition ${
                      previewMode === "interactive"
                        ? "bg-orange-500 text-white font-medium"
                        : "text-white/55 hover:text-white"
                    }`}
                  >
                    CanvasLab
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("diagnostic")}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded transition ${
                      previewMode === "diagnostic"
                        ? "bg-orange-500 text-white font-medium"
                        : "text-white/55 hover:text-white"
                    }`}
                  >
                    Receita 1:1
                  </button>
                </div>
              </div>
            </div>

            <div
              ref={konvaContainerRef}
              className="flex-1 min-h-0 flex items-center justify-center p-2 relative overflow-hidden"
            >
              <div
                className="relative rounded-xl overflow-hidden border border-white/15 shadow-2xl flex items-center justify-center bg-black/40"
                style={{
                  width: Math.round(baseStageWidth * stageZoom),
                  height: Math.round(baseStageHeight * stageZoom),
                }}
              >
                {previewMode === "interactive" ? (
                  <CanvasPostStage
                    ref={stageRef}
                    post={canvasModel}
                    zoom={stageZoom}
                    isReadOnly
                  />
                ) : (
                  <CanvasPostStage
                    ref={stageRef}
                    post={diagnosticPost}
                    diagnosticScene={visibleRecipe.scene}
                    diagnosticTextMode="fixed-lines"
                    diagnosticLayerStyles={recipe.adaptation?.layerStyles}
                    diagnosticNeutralFrame
                    zoom={stageZoom}
                    isReadOnly
                  />
                )}
              </div>
            </div>

            <div className="text-center pt-2 text-[11px] text-white/45 font-mono shrink-0">
              Motor 2D Konva · {previewMode === "interactive" ? `Formato ${canvasModel.aspectRatio}` : `Proporção original (${sourceWidth}×${sourceHeight})`}
            </div>
          </div>

          {/* Coluna 3: Painel de Ajuste Fino & Checklist de Camadas */}
          <div className="w-full lg:w-[390px] xl:w-[420px] shrink-0 flex flex-col bg-[#12151f] min-h-0 overflow-hidden">
            <Tabs defaultValue="layers" className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="px-4 pt-3 border-b border-white/10 shrink-0">
                <TabsList className="grid grid-cols-3 bg-black/40 border border-white/10 h-8 w-full">
                  <TabsTrigger value="layers" className="text-xs">
                    <Layers className="size-3.5 mr-1" />
                    Camadas ({textLayers.length + shapeLayers.length})
                  </TabsTrigger>
                  <TabsTrigger value="colors" className="text-xs">
                    <Palette className="size-3.5 mr-1" />
                    Cores
                  </TabsTrigger>
                  <TabsTrigger value="slots" className="text-xs">
                    <ImageIcon className="size-3.5 mr-1" />
                    Mídia ({recipe.missingElements?.length || 0})
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ABA 1: CAMADAS & TEXTOS */}
              <TabsContent value="layers" className="flex-1 min-h-0 m-0 p-0 overflow-hidden flex flex-col">
                <ScrollArea className="flex-1 min-h-0 p-4">
                  <div className="space-y-3 pb-6">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-white/55 uppercase tracking-wider">
                        Textos Detectados ({textLayers.length})
                      </span>
                      <button
                        type="button"
                        onClick={handleAddTextLayer}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-400 hover:text-orange-300 transition"
                      >
                        <Plus className="size-3" />
                        Adicionar Texto
                      </button>
                    </div>

                    {textLayers.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3.5 text-xs text-white/60 space-y-2">
                        <p>
                          A referência priorizou superfícies e blocos gráficos. Você pode clicar em{" "}
                          <strong className="text-white">Adicionar Texto</strong> acima ou editar livremente no CanvasLab.
                        </p>
                      </div>
                    ) : (
                      textLayers.map((layer, idx) => {
                        const isVisible = (layer.opacity ?? 1) > 0;
                        return (
                          <div
                            key={layer.id || idx}
                            className={`rounded-xl border p-3 transition ${
                              isVisible
                                ? "bg-white/[0.03] border-white/10"
                                : "bg-white/[0.01] border-white/5 opacity-50"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className="text-[9px] font-mono uppercase bg-white/5 border-white/10 text-white/75"
                                >
                                  {layer.role || "texto"}
                                </Badge>
                                <span className="text-[10px] text-white/40 font-mono">
                                  #{idx + 1}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleToggleLayerVisibility(layer.id)}
                                className="size-6 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/10 transition"
                                title={isVisible ? "Ocultar camada" : "Exibir camada"}
                              >
                                {isVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                              </button>
                            </div>

                            <div className="space-y-2">
                              <Input
                                value={layer.text || ""}
                                onChange={e => handleUpdateLayerText(layer.id, e.target.value)}
                                className="h-8 text-xs bg-black/40 border-white/10 text-white"
                                placeholder="Conteúdo do texto"
                              />

                              <div className="grid grid-cols-2 gap-2">
                                <div className="min-w-0">
                                  <FontDropdown
                                    value={layer.fontFamily || "Inter"}
                                    onChange={font => handleUpdateLayerFont(layer.id, font)}
                                  />
                                </div>
                                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-md px-2 h-9">
                                  <input
                                    type="color"
                                    value={layer.fill?.startsWith("#") ? layer.fill : "#ffffff"}
                                    onChange={e => handleUpdateLayerColor(layer.id, e.target.value)}
                                    className="size-5 rounded cursor-pointer border-0 bg-transparent"
                                  />
                                  <span className="text-[11px] font-mono text-white/70 uppercase">
                                    {layer.fill || "#FFFFFF"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {shapeLayers.length > 0 && (
                      <>
                        <div className="text-[11px] font-mono text-white/55 uppercase tracking-wider mt-4 mb-2">
                          Formas & Cartões ({shapeLayers.length})
                        </div>
                        <div className="space-y-1.5">
                          {shapeLayers.map((shape, idx) => {
                            const isVisible = (shape.opacity ?? 1) > 0;
                            return (
                              <div
                                key={shape.id || idx}
                                className={`flex items-center justify-between rounded-lg border p-2.5 transition ${
                                  isVisible
                                    ? "border-white/10 bg-white/[0.025]"
                                    : "border-white/5 bg-white/[0.01] opacity-45"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className="size-4 shrink-0 rounded border border-white/25"
                                    style={{ backgroundColor: shape.fill }}
                                  />
                                  <span className="text-xs text-white/85 font-mono truncate">
                                    {shape.role || "superfície"}
                                  </span>
                                  <span className="text-[10px] text-white/40 font-mono shrink-0">
                                    {Math.round(shape.width)}×{Math.round(shape.height)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    type="color"
                                    value={shape.fill?.startsWith("#") ? shape.fill : "#1e1e24"}
                                    onChange={e => handleUpdateLayerColor(shape.id, e.target.value)}
                                    className="size-5 rounded cursor-pointer border-0 bg-transparent"
                                    title="Alterar cor da superfície"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleToggleLayerVisibility(shape.id)}
                                    className="size-6 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/10 transition"
                                    title={isVisible ? "Ocultar superfície" : "Exibir superfície"}
                                  >
                                    {isVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* ABA 2: PALETA DE CORES & CONTRASTE */}
              <TabsContent value="colors" className="flex-1 min-h-0 m-0 p-4 space-y-4 overflow-y-auto">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <div className="text-xs font-semibold text-white/90">Fundo da Prancheta</div>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={currentBg.startsWith("#") ? currentBg : "#111111"}
                      onChange={e => handleUpdateBackground(e.target.value)}
                      className="size-8 rounded cursor-pointer border border-white/20 bg-transparent"
                    />
                    <Input
                      value={currentBg}
                      onChange={e => handleUpdateBackground(e.target.value)}
                      className="h-8 font-mono text-xs uppercase bg-black/40 border-white/10 text-white w-28"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <div className="text-xs font-semibold text-white/90">Auditoria de Legibilidade (WCAG)</div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-white/5">
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium text-white/80">Contraste Fundo × Título</div>
                      <div className="text-[11px] text-white/50">
                        {isContrastGood ? "Excelente conformidade e nitidez" : "Atenção: contraste baixo"}
                      </div>
                    </div>
                    <Badge
                      className={`text-xs ${
                        isContrastGood
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                          : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                      }`}
                    >
                      {isContrastGood ? "WCAG AA ✓" : "Revisar"}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                  <div className="text-xs font-semibold text-white/90">Notas de Extração da IA</div>
                  <ul className="text-xs text-white/60 space-y-1 list-disc pl-4">
                    {recipe.notes?.slice(0, 4).map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              </TabsContent>

              {/* ABA 3: SLOTS DE MÍDIA */}
              <TabsContent value="slots" className="flex-1 min-h-0 m-0 p-4 space-y-3 overflow-y-auto">
                <div className="text-xs text-white/60 leading-relaxed">
                  Áreas que continham fotos, ilustrações ou texturas na referência original foram convertidas em
                  slots de mídia inteligentes para substituição no CanvasLab.
                </div>

                {(!recipe.missingElements || recipe.missingElements.length === 0) ? (
                  <div className="p-6 text-center text-xs text-white/40 border border-dashed border-white/10 rounded-xl">
                    Nenhum slot de mídia complexo exigido para esta composição.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {recipe.missingElements.map((item, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px] uppercase font-mono">
                            Slot #{idx + 1} · {item.role || "mídia"}
                          </Badge>
                          {item.essential && (
                            <span className="text-[10px] text-amber-400/90 font-mono">
                              Essencial para o equilíbrio
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium text-white/90">{item.description}</div>
                        <div className="text-[11px] text-white/50">{item.reason}</div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
