/**
 * WorkbenchV2 — Shell do editor ativo.
 *
 * Layout de 3 colunas no desktop:
 *   [Sidebar Esquerda | Canvas Central | Painel de Ações Rápidas]
 *
 * Mobile: Totalmente responsivo via useArcDrawer e MobileEditSheet (Fase 4.8).
 *
 * Regras:
 *  - ZERO estado local complexo. Todo estado vem do Zustand (useEditorStore).
 *  - Esta casca apenas organiza o layout e delega para os blocos modulares.
 */

import React from "react";
import { ArrowLeft, Download, Type, Palette, Image as ImageIcon, Layout as LayoutIcon, Save, Loader2, Undo2, Redo2 } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { useEditorHistory } from "@/editor/history/useEditorHistory";
import { useIsMobile } from "@/hooks/useMobile";
import { motion } from "framer-motion";
import { useArcDrawer, TabId } from "@/hooks/useArcDrawer";
import MobileEditSheet from "@/components/MobileEditSheet";
import { trpc } from "@/lib/trpc";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import type { AspectRatio, GenerationDebugTrace, PostVariation } from "@shared/postspark";
import { ASPECT_RATIO_LABELS } from "@shared/postspark";
import { toast } from "sonner";
import RatioIcon from "../../RatioIcon";

import CanvasWorkspace from "./CanvasWorkspace";
import PlatformBlock from "./blocks/PlatformBlock";
import DesignBlock from "./blocks/DesignBlock";
import FontColorBlock from "./blocks/FontColorBlock";
import ImageBlock from "./blocks/ImageBlock";
import LayoutBlock from "./blocks/LayoutBlock";
import CaptionBlock from "./blocks/CaptionBlock";
import ElementContentBlock from "./blocks/ElementContentBlock";
import GenerationAuditPanel from "@/components/GenerationAuditPanel";

interface WorkbenchV2Props {
  /** Callback para voltar ao HoloDeck */
  onBack?: () => void;
  /** Callback de salvamento */
  onSave?: (variation: PostVariation) => void;
  /** Estado de salvamento */
  isSaving?: boolean;
  /** Callback de exportação (html2canvas) */
  onExport?: () => void;
  generationDebug?: GenerationDebugTrace;
}

const DESKTOP_ACCOUNT_SAFE_WIDTH = 240;
const DESKTOP_ACCOUNT_SAFE_HEIGHT = 76;

// ─── Sidebar Esquerda (Desktop) ──────────────────────────────────────────────
interface LeftSidebarProps {
  onGenerateImage: (prompt: string, provider: "pollinations_fast" | "pollinations_hd") => Promise<string>;
  isGenerating: boolean;
  accentColor: string;
}

function LeftSidebar({ onGenerateImage, isGenerating, accentColor }: LeftSidebarProps) {
  const [expandedSections, setExpandedSections] = React.useState<string[]>([]);
  const layoutTarget = useEditorStore(s => s.layoutTarget);
  const setLayoutTarget = useEditorStore(s => s.setLayoutTarget);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => (prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]));
  };

  const isTextContext = layoutTarget === "headline" || layoutTarget === "body";
  const isBrandContext = layoutTarget === "badge" || layoutTarget === "sticker" || layoutTarget === "accentBar" || layoutTarget === "carouselArrow";
  const isSectionContext = layoutTarget.startsWith("section:");
  const isAdvancedTextContext = layoutTarget.startsWith("textElement:");
  const isCardContext = layoutTarget === "card";

  // MODO CONTEXTUAL (Foco isolado no elemento clicado)
  if (isTextContext || isBrandContext || isSectionContext || isAdvancedTextContext || isCardContext) {
    const labels: Record<string, string> = {
      headline: "Título Principal",
      body: "Corpo de Texto",
      badge: "Badge (Tag)",
      sticker: "Sticker Decorativo",
      accentBar: "Barra de Destaque",
      carouselArrow: "Seta do Carrossel",
      card: "Card Principal",
    };
    return (
      <aside
        data-workbench-editor-surface
        className="w-[300px] flex-shrink-0 h-full flex flex-col gap-4 overflow-y-auto overflow-x-hidden custom-scrollbar"
        style={{
          width: "300px",
          minWidth: "300px",
          maxWidth: "300px",
          background: "var(--bg-panel, rgba(18,18,28,0.95))",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          padding: "1rem",
        }}
      >
        <div className="flex items-center gap-3 mb-2 pb-4 border-b border-white/10">
          <button onClick={() => setLayoutTarget("global")} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors" title="Voltar para configurações globais">
            <ArrowLeft size={14} className="text-[var(--text-secondary)]" />
          </button>
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Editando {labels[layoutTarget] || "Elemento"}</span>
        </div>
        {/* Renderiza os blocos necessários para o contexto */}
        {(isTextContext || layoutTarget === "badge" || layoutTarget === "sticker") && <FontColorBlock />}
        {isBrandContext && <DesignBlock />}
        {(isSectionContext || isAdvancedTextContext) && <ElementContentBlock />}
        {!isAdvancedTextContext && <LayoutBlock />}
      </aside>
    );
  }

  // MODO GLOBAL (Renderização normal dos CollapsibleSections)
  return (
    <aside
      data-workbench-editor-surface
      className="w-[300px] flex-shrink-0 h-full flex flex-col gap-4 overflow-y-auto overflow-x-hidden custom-scrollbar"
      style={{
        width: "300px",
        minWidth: "300px",
        maxWidth: "300px",
        background: "var(--bg-panel, rgba(18,18,28,0.95))",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        padding: "1rem",
      }}
    >
      <CollapsibleSection
        title="Texto"
        icon={
          <div className="relative">
            {expandedSections.includes("text") && (
              <motion.div
                layoutId="section-glow-text"
                className="absolute inset-0 blur-sm rounded-full opacity-30 bg-current"
                style={{ backgroundColor: accentColor }}
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            )}
            <Type size={16} className="relative z-10" />
          </div>
        }
        isExpanded={expandedSections.includes("text")}
        onToggle={() => toggleSection("text")}
      >
        <div className="flex flex-col gap-4">
          <ElementContentBlock />
          <FontColorBlock />
          <CaptionBlock />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Design"
        icon={
          <div className="relative">
            {expandedSections.includes("design") && (
              <motion.div
                layoutId="section-glow-design"
                className="absolute inset-0 blur-sm rounded-full opacity-30 bg-current"
                style={{ backgroundColor: accentColor }}
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            )}
            <Palette size={16} className="relative z-10" />
          </div>
        }
        isExpanded={expandedSections.includes("design")}
        onToggle={() => toggleSection("design")}
      >
        <DesignBlock />
      </CollapsibleSection>

      <CollapsibleSection
        title="Mídia"
        icon={
          <div className="relative">
            {expandedSections.includes("image") && (
              <motion.div
                layoutId="section-glow-image"
                className="absolute inset-0 blur-sm rounded-full opacity-30 bg-current"
                style={{ backgroundColor: accentColor }}
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            )}
            <ImageIcon size={16} className="relative z-10" />
          </div>
        }
        isExpanded={expandedSections.includes("image")}
        onToggle={() => toggleSection("image")}
      >
        <ImageBlock onGenerateImage={onGenerateImage} isGenerating={isGenerating} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Layout"
        icon={
          <div className="relative">
            {expandedSections.includes("layout") && (
              <motion.div
                layoutId="section-glow-layout"
                className="absolute inset-0 blur-sm rounded-full opacity-30 bg-current"
                style={{ backgroundColor: accentColor }}
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            )}
            <LayoutIcon size={16} className="relative z-10" />
          </div>
        }
        isExpanded={expandedSections.includes("layout")}
        onToggle={() => toggleSection("layout")}
      >
        <div className="flex flex-col gap-4">
          <LayoutBlock />
          <PlatformBlock />
        </div>
      </CollapsibleSection>
    </aside>
  );
}

// ─── Painel Direito (Quick Actions - Desktop) ─────────────────────────────────
function RightPanel({ topClearance = 0 }: { topClearance?: number }) {
  const aspectRatio = useEditorStore(s => s.aspectRatio);
  const setAspectRatio = useEditorStore(s => s.setAspectRatio);
  const activeVariation = useEditorStore(s => s.activeVariation);
  const accentColor = activeVariation?.accentColor || "#a855f7";

  return (
    <aside
      className="flex-shrink-0 flex flex-col gap-3"
      style={{
        width: "200px",
        minWidth: "200px",
        maxWidth: "200px",
        background: "var(--bg-panel, rgba(18,18,28,0.95))",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        padding: "1rem",
        paddingTop: `${topClearance + 16}px`,
      }}
    >
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Ações Rápidas</p>

      <div className="flex flex-col gap-4 mt-2">
        <div>
          <label className="text-[10px] font-medium text-[var(--text-secondary)] mb-2 block uppercase tracking-wider">Proporção (Tamanho)</label>
          <div
            className="flex flex-col gap-1 p-1 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {(["1:1", "5:6", "9:16"] as AspectRatio[]).map(ratio => {
              const isActive = aspectRatio === ratio;
              const iconColor = isActive ? "#000000" : "var(--text-tertiary)";

              return (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition-all duration-300 select-none relative group/ratio`}
                  style={{
                    background: isActive ? `${accentColor}15` : "transparent",
                    color: isActive ? accentColor : "var(--text-tertiary)",
                    border: isActive ? `1px solid ${accentColor}` : "1px solid transparent",
                    boxShadow: isActive ? `0 0 15px ${accentColor}30` : "none",
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="ratio-active-glow"
                      className="absolute inset-0 rounded-lg blur-sm bg-current opacity-20 pointer-events-none"
                      animate={{ opacity: [0.1, 0.3, 0.1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    />
                  )}
                  <RatioIcon ratio={ratio} size={14} color={isActive ? accentColor : "var(--text-tertiary)"} />
                  {ASPECT_RATIO_LABELS[ratio].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 opacity-40 pointer-events-none mt-4 border-t border-white/10 pt-4">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">+ (V2 Actions)</span>
        </div>
      </div>
    </aside>
  );
}

// ─── WorkbenchV2 (raiz) ───────────────────────────────────────────────────────
export default function WorkbenchV2({ onBack, onSave, isSaving, onExport, generationDebug }: WorkbenchV2Props) {
  const activeVariation = useEditorStore(s => s.activeVariation);
  const baseVariation = useEditorStore(s => s.baseVariation);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const arcDrawer = useArcDrawer();
  const { canUndo, canRedo, undo, redo } = useEditorHistory();

  const generateBackgroundMutation = trpc.post.generateBackground.useMutation();
  const [isGeneratingImg, setIsGeneratingImg] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);

  const handleGenerateImage = React.useCallback(
    async (prompt: string, provider: "pollinations_fast" | "pollinations_hd" = "pollinations_fast") => {
      setIsGeneratingImg(true);
      try {
        const result = await generateBackgroundMutation.mutateAsync({
          prompt,
          provider,
        });
        if (result.imageData) {
          useEditorStore.getState().setBgValue({ type: "ai", url: result.imageData });
          return result.imageData;
        }
        return "";
      } catch (error) {
        console.error("Failed to generate background:", error);
        return "";
      } finally {
        setIsGeneratingImg(false);
      }
    },
    [generateBackgroundMutation]
  );

  const handleExport = React.useCallback(async () => {
    if (onExport) {
      onExport();
      return;
    }

    const exportPlatform = activeVariation?.platform ?? "instagram";

    if (!canvasRef.current) {
      toast.error("Nao foi possivel localizar a area do post para exportacao.");
      return;
    }

    setIsExporting(true);
    const EXPORT_TIMEOUT_MS = 30_000;
    let timedOut = false;

    try {
      const exportRoot = canvasRef.current.matches("[data-post-export-root]")
        ? canvasRef.current
        : canvasRef.current.querySelector("[data-post-export-root]") as HTMLElement | null;
      if (!exportRoot) {
        throw new Error("Export root element not found");
      }
      const logicalWidth = exportRoot.offsetWidth;
      const logicalHeight = exportRoot.offsetHeight;
      if (!logicalWidth || !logicalHeight) {
        throw new Error("Export root has no measurable size");
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          timedOut = true;
          reject(new Error("Export timeout: fonts or images did not settle"));
        }, EXPORT_TIMEOUT_MS);

        const resolveIfReady = () => {
          clearTimeout(timeout);
          resolve();
        };

        document.fonts.ready.then(() => {
          const images = exportRoot.querySelectorAll("img");
          if (images.length === 0) {
            requestAnimationFrame(() => requestAnimationFrame(resolveIfReady));
            return;
          }
          let pending = images.length;
          const decrement = () => {
            pending--;
            if (pending === 0) requestAnimationFrame(() => requestAnimationFrame(resolveIfReady));
          };
          images.forEach((img) => {
            if (img.complete) {
              decrement();
            } else {
              img.addEventListener("load", decrement, { once: true });
              img.addEventListener("error", decrement, { once: true });
            }
          });
        }).catch(() => {
          requestAnimationFrame(() => requestAnimationFrame(resolveIfReady));
        });
      });

      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(exportRoot, {
        scale: 3,
        width: logicalWidth,
        height: logicalHeight,
        backgroundColor: null,
        useCORS: true,
        onclone: (_document, element) => {
          const clonedRoot = element as HTMLElement;
          clonedRoot.style.width = `${logicalWidth}px`;
          clonedRoot.style.height = `${logicalHeight}px`;
          clonedRoot.style.transform = "none";

          let ancestor = clonedRoot.parentElement;
          while (ancestor && ancestor !== _document.body) {
            ancestor.style.transform = "none";
            ancestor.style.transition = "none";
            ancestor = ancestor.parentElement;
          }
        },
      });
      const link = document.createElement("a");
      link.download = `postspark-${exportPlatform}-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Export failed:", error);
      if (timedOut) {
        toast.error("A exportacao excedeu o tempo limite. Tente novamente.");
      } else {
        toast.error("A exportacao falhou. Tente novamente.");
      }
    } finally {
      setIsExporting(false);
    }
  }, [activeVariation, onExport]);

  if (!activeVariation) {
    return <div className="flex items-center justify-center h-full text-[var(--text-tertiary)]">Nenhum post selecionado.</div>;
  }

  const { activeTab } = arcDrawer.state;
  const accentColor = activeVariation.accentColor ?? "#a855f7";
  const desktopHeaderPaddingRight = !isMobile ? `${DESKTOP_ACCOUNT_SAFE_WIDTH}px` : undefined;

  return (
    <div className="flex flex-col h-screen w-full relative overflow-hidden" style={{ background: "var(--bg-void, #0a0a12)" }}>
      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-4 py-2 flex-shrink-0 z-10"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "var(--bg-panel, rgba(18,18,28,0.95))",
          height: "48px",
          paddingRight: desktopHeaderPaddingRight,
        }}
      >
        <button onClick={onBack} className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-sm">
          <ArrowLeft size={15} />
          <span>Voltar</span>
        </button>

        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1.5 pointer-events-none">
          <span className="text-sm font-semibold tracking-tight truncate max-w-[300px] text-center" style={{ color: "var(--text-primary)" }}>
            {activeVariation.headline || "Sem título"}
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: "var(--text-secondary)" }}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 size={13} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: "var(--text-secondary)" }}
            title="Refazer (Ctrl+Shift+Z)"
          >
            <Redo2 size={13} />
          </button>

          <button
            onClick={() => onSave?.(baseVariation ?? activeVariation)}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 bg-white text-black hover:bg-white/90 active:scale-95 disabled:opacity-50 relative group/save overflow-hidden"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>Salvar</span>
          </button>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-500 active:scale-95 relative group/export"
            style={{
              background: `${accentColor}15`,
              border: `1px solid ${accentColor}`,
              color: accentColor,
              boxShadow: `0 0 20px ${accentColor}30`,
            }}
          >
            <motion.div
              className="absolute inset-0 blur-md opacity-0 group-hover:opacity-40 transition-opacity bg-current"
              animate={{ opacity: [0.2, 0.4, 0.2] }}
              transition={{ repeat: Infinity, duration: 2.5 }}
            />
            {isExporting ? <Loader2 size={13} className="relative z-10 animate-spin" /> : <Download size={13} className="relative z-10" />}
            <span className="relative z-10">{isExporting ? "Exportando" : "Exportar"}</span>
          </button>
        </div>
      </header>

      {/* ── Conteúdo Central ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative min-h-0">
        {!isMobile && <LeftSidebar onGenerateImage={handleGenerateImage} isGenerating={isGeneratingImg} accentColor={accentColor} />}

        <CanvasWorkspace canvasRef={canvasRef} renderMode={isExporting ? "export" : "edit"} />

        {!isMobile && <RightPanel topClearance={DESKTOP_ACCOUNT_SAFE_HEIGHT} />}
      </div>

      {/* ── Mobile: Bottom Navigation Bar ───────────────────────────────── */}
      {isMobile && (
        <div
          className="flex items-center justify-around px-2 py-3 border-t border-white/5 bg-[var(--bg-panel)] z-40"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
          }}
        >
          {[
            { id: "text" as TabId, Icon: Type, label: "Conteúdo" },
            { id: "design" as TabId, Icon: Palette, label: "Design" },
            { id: "image" as TabId, Icon: ImageIcon, label: "Mídia" },
            { id: "composition" as TabId, Icon: LayoutIcon, label: "Layout" },
          ].map(({ id, Icon, label }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => arcDrawer.selectTab(id)}
                className="flex flex-col items-center gap-1 min-w-[64px] transition-all active:scale-95 relative group/nav"
                style={{
                  color: isActive ? accentColor : "var(--text-tertiary)",
                }}
              >
                <div className="relative">
                  {isActive && (
                    <motion.div
                      layoutId="mobile-nav-glow"
                      className="absolute inset-0 blur-md rounded-full opacity-40 bg-current"
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    />
                  )}
                  <Icon size={20} strokeWidth={isActive ? 3 : 2} className={`relative z-10 transition-transform duration-300 ${isActive ? "scale-110" : ""}`} />
                </div>
                <span className={`text-[9px] font-black tracking-[0.1em] uppercase relative z-10 ${isActive ? "opacity-100" : "opacity-40"}`}>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Mobile: Edit Sheet ─────────────────────────────────────────── */}
      {isMobile && (
        <MobileEditSheet
          isOpen={arcDrawer.state.isOpen}
          onClose={arcDrawer.close}
          activeTabLabel={
            activeTab === "text" ? "Editar Conteúdo" : activeTab === "design" ? "Identidade Visual" : activeTab === "image" ? "Fundo & Mídia" : activeTab === "composition" ? "Layout & Proporção" : ""
          }
        >
          <div className="space-y-8 pb-10">
            {activeTab === "text" && (
              <>
                <ElementContentBlock />
                <FontColorBlock />
                <CaptionBlock />
              </>
            )}
            {activeTab === "design" && <DesignBlock />}
            {activeTab === "image" && <ImageBlock onGenerateImage={handleGenerateImage} isGenerating={isGeneratingImg} />}
            {activeTab === "composition" && (
              <>
                <LayoutBlock />
                <PlatformBlock />
              </>
            )}
          </div>
        </MobileEditSheet>
      )}
      {/* AUDIT_DEBUG_START */}
      <GenerationAuditPanel trace={generationDebug} title="Auditoria do Workbench" />
      {/* AUDIT_DEBUG_END */}
    </div>
  );
}
