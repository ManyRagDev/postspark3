import React, { useMemo } from "react";
import {
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  Trash2,
  ChevronsUp,
  ChevronsDown,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { CanvasPostModel, CanvasCustomText, CanvasCustomImage, type TextLegibilityEffect } from "./types";
import {
  applyPatchToCurrentSlide,
  duplicateExtraElement,
  removeExtraElement,
  reorderExtraElement,
  resolveSlideExtraImages,
  updateExtraElement as updateExtraImage,
} from "../lib/documentCommands";
import FontPickerDropdown from "./FontPickerDropdown";
import { FONT_CATALOG } from "@/lib/fonts";

interface PropertyInspectorProps {
  post: CanvasPostModel;
  selectedId: string;
  onUpdatePost: (patch: Partial<CanvasPostModel>) => void;
  onClose: () => void;
  isMobile?: boolean;
}

export default function PropertyInspector({ post, selectedId, onUpdatePost, onClose, isMobile }: PropertyInspectorProps) {
  const currentSlideIndex = post.currentSlideIndex;
  const currentSlide = post.slides[currentSlideIndex];

  // Resolver que tipo de elemento está selecionado e o valor de suas propriedades
  const isHeadline = selectedId === "headline";
  const isSubtext = selectedId === "subtext";
  const isBadge = selectedId === "badge";
  const isMainText = isHeadline || isSubtext;

  // Procurar em extraTexts
  const slideExtraTexts = currentSlide?.extraTexts || [];
  const globalExtraTexts = post.extraTexts || [];
  const extraTextMatch = slideExtraTexts.find(t => t.id === selectedId) || globalExtraTexts.find(t => t.id === selectedId);
  const isExtraText = !!extraTextMatch;
  const isSlideSpecificExtra = !!slideExtraTexts.find(t => t.id === selectedId);

  // Procurar em extraImages
  const extraImage = resolveSlideExtraImages(post, post.currentSlideIndex).find(img => img.id === selectedId) as (CanvasCustomImage & { scale?: number }) | undefined;

  // Valores de Propriedade Resolvidos
  let fontFamily = "Inter";
  let color = "#ffffff";
  let opacity = 1;
  let effect = "none";
  let effectColor = "";
  let align = "left";

  if (isHeadline) {
    fontFamily = post.fontFamily;
    color = post.palette.headlineColor || post.palette.text;
    effect = post.headlineEffect || "none";
    effectColor = post.headlineEffectColor || "";
    align = post.headlineAlign;
  } else if (isSubtext) {
    fontFamily = post.fontFamily;
    color = post.palette.subtextColor || post.palette.text;
    effect = post.subtextEffect || "none";
    effectColor = post.subtextEffectColor || "";
    align = post.bodyAlign;
  } else if (isExtraText && extraTextMatch) {
    fontFamily = extraTextMatch.fontFamily || post.fontFamily;
    color = extraTextMatch.color || "#ffffff";
    opacity = extraTextMatch.opacity ?? 1;
    align = extraTextMatch.align || "left";
    effect = extraTextMatch.effect || "none";
    effectColor = extraTextMatch.effectColor || "";
  }

  // Handlers de atualização
  const updateFontFamily = (val: string) => {
    if (isHeadline || isSubtext) {
      onUpdatePost({ fontFamily: val });
    } else if (isExtraText) {
      updateExtraText({ fontFamily: val });
    }
  };

  const updateColor = (val: string) => {
    if (isHeadline) {
      onUpdatePost({
        palette: { ...post.palette, headlineColor: val },
        manualHeadlineColor: true
      });
    } else if (isSubtext) {
      onUpdatePost({
        palette: { ...post.palette, subtextColor: val },
        manualSubtextColor: true
      });
    } else if (isExtraText) {
      updateExtraText({ color: val });
    }
  };

  const updateAlign = (val: "left" | "center" | "right") => {
    if (isHeadline) onUpdatePost({ headlineAlign: val });
    else if (isSubtext) onUpdatePost({ bodyAlign: val });
    else if (isExtraText) updateExtraText({ align: val });
  };

  const updateEffect = (val: string) => {
    if (isHeadline) onUpdatePost({ headlineEffect: val as any });
    else if (isSubtext) onUpdatePost({ subtextEffect: val as any });
    else if (isExtraText) updateExtraText({ effect: val as TextLegibilityEffect });
  };

  const updateEffectColor = (val: string) => {
    if (isHeadline) onUpdatePost({ headlineEffectColor: val });
    else if (isSubtext) onUpdatePost({ subtextEffectColor: val });
    else if (isExtraText) updateExtraText({ effectColor: val });
  };

  const updateOpacity = (val: number) => {
    if (isExtraText) updateExtraText({ opacity: val });
  };

  const updateExtraText = (patch: Partial<CanvasCustomText>) => {
    if (!extraTextMatch) return;
    if (isSlideSpecificExtra) {
      const texts = currentSlide.extraTexts?.map(t => t.id === selectedId ? { ...t, ...patch } : t) || [];
      const updatedSlides = [...post.slides];
      updatedSlides[currentSlideIndex] = { ...currentSlide, extraTexts: texts };
      onUpdatePost({ slides: updatedSlides });
    } else {
      const texts = post.extraTexts?.map(t => t.id === selectedId ? { ...t, ...patch } : t) || [];
      onUpdatePost({ extraTexts: texts });
    }
  };

  const titleStr = isHeadline
    ? "Título Principal"
    : isSubtext
      ? "Subtítulo / Corpo"
      : isBadge
        ? "Badge"
        : isExtraText
          ? "Texto Adicional"
          : extraImage
            ? "Imagem Sobreposta"
            : "Elemento";

  if (!isHeadline && !isSubtext && !isBadge && !extraTextMatch && !extraImage) {
    return null;
  }

  return (
    <div className={`flex flex-col h-full bg-[#121215] text-white ${isMobile ? 'p-0' : 'w-full'}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center font-bold text-xs">
            {extraImage ? (
              <ImageIcon size={14} className="text-white/80" />
            ) : isHeadline ? (
              "T"
            ) : isSubtext ? (
              "S"
            ) : (
              "A"
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">{titleStr}</h3>
            {isExtraText && (
               <div className="text-[10px] text-white/50">{isSlideSpecificExtra ? 'Apenas neste slide' : 'Global'}</div>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {extraImage && (
          <>
            {extraImage.url && (
              <div className="rounded-lg overflow-hidden border border-white/10 bg-black/40 h-28 flex items-center justify-center p-2">
                <img
                  src={extraImage.url}
                  alt="Imagem Sobreposta"
                  className="max-h-full max-w-full object-contain rounded"
                />
              </div>
            )}

            {/* Escala */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                  Escala
                </label>
                <span className="text-xs font-mono text-white/50">
                  {Math.round((extraImage.scaleX ?? 1) * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0.2"
                  max="2.5"
                  step="0.05"
                  value={extraImage.scaleX ?? 1}
                  onChange={(e) => {
                    const nextScale = parseFloat(e.target.value);
                    onUpdatePost(
                      updateExtraImage(post, extraImage.id, {
                        scaleX: nextScale,
                        scaleY: nextScale,
                      })
                    );
                  }}
                  className="flex-1 accent-[oklch(0.78_0.22_48)] h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Opacidade */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                  Opacidade
                </label>
                <span className="text-xs font-mono text-white/50">
                  {Math.round((extraImage.opacity ?? 1) * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={extraImage.opacity ?? 1}
                  onChange={(e) =>
                    onUpdatePost(
                      updateExtraImage(post, extraImage.id, {
                        opacity: parseFloat(e.target.value),
                      } as any)
                    )
                  }
                  className="flex-1 accent-[oklch(0.78_0.22_48)] h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Arredondamento */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                  Cantos Arredondados
                </label>
                <span className="text-xs font-mono text-white/50">
                  {extraImage.cornerRadius || 0}px
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="2"
                  value={extraImage.cornerRadius || 0}
                  onChange={(e) =>
                    onUpdatePost(
                      updateExtraImage(post, extraImage.id, {
                        cornerRadius: parseInt(e.target.value, 10),
                      } as any)
                    )
                  }
                  className="flex-1 accent-[oklch(0.78_0.22_48)] h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Giro */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                  Giro
                </label>
                <span className="text-xs font-mono text-white/50">
                  {extraImage.rotation || 0}°
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="5"
                  value={extraImage.rotation || 0}
                  onChange={(e) =>
                    onUpdatePost(
                      updateExtraImage(post, extraImage.id, {
                        rotation: parseInt(e.target.value, 10),
                      } as any)
                    )
                  }
                  className="flex-1 accent-[oklch(0.78_0.22_48)] h-1 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Botões de Camada */}
            <div className="space-y-3 pt-4 border-t border-white/10">
              <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                Organização
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePost(reorderExtraElement(post, extraImage.id, "front"))
                  }
                  className="p-2 rounded bg-white/5 hover:bg-white/10 text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <ChevronsUp size={14} /> Trazer p/ Frente
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePost(reorderExtraElement(post, extraImage.id, "back"))
                  }
                  className="p-2 rounded bg-white/5 hover:bg-white/10 text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <ChevronsDown size={14} /> Enviar p/ Trás
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdatePost(duplicateExtraElement(post, extraImage.id).post);
                    toast.success("Imagem duplicada!");
                  }}
                  className="p-2 rounded bg-white/5 hover:bg-white/10 text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Copy size={14} /> Duplicar Camada
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdatePost(removeExtraElement(post, extraImage.id));
                    onClose();
                  }}
                  className="p-2 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Trash2 size={14} /> Remover Camada
                </button>
              </div>
            </div>
          </>
        )}

        {/* Fonte & Alinhamento */}
        {!extraImage && (
          <div className="space-y-3">
            <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Fonte e Alinhamento</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                 <FontPickerDropdown
                    value={fontFamily}
                    onChange={updateFontFamily}
                    userFonts={post.userFonts}
                 />
              </div>
              <div className="flex bg-white/5 border border-white/10 rounded-lg overflow-hidden shrink-0">
                {[
                  { id: "left", icon: <AlignLeft size={14} /> },
                  { id: "center", icon: <AlignCenter size={14} /> },
                  { id: "right", icon: <AlignRight size={14} /> },
                ].map((a) => (
                  <button
                    key={a.id}
                    onClick={() => updateAlign(a.id as any)}
                    className={`p-2 transition-colors cursor-pointer ${align === a.id ? 'bg-[oklch(0.78_0.22_48)] text-black' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                  >
                    {a.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cor Principal */}
        {!extraImage && (
          <div className="space-y-3">
            <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Cor do Texto</label>
            <div className="flex items-center gap-2">
               <input
                  type="color"
                  value={color}
                  onChange={(e) => updateColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
               />
               <div className="flex gap-1.5 flex-wrap flex-1">
                 {['#FFFFFF', '#000000', post.palette.accent, post.palette.background, '#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA'].filter(Boolean).map(c => (
                    <button key={c} onClick={() => updateColor(c)} className="w-6 h-6 rounded-full border border-white/20 shadow-sm transition-transform hover:scale-110 cursor-pointer" style={{ backgroundColor: c }} />
                 ))}
               </div>
            </div>
          </div>
        )}

        {/* Opacidade (ExtraText) */}
        {isExtraText && (
          <div className="space-y-3">
            <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Opacidade</label>
            <div className="flex items-center gap-3">
              <input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(e) => updateOpacity(parseFloat(e.target.value))} className="flex-1 accent-[oklch(0.78_0.22_48)] h-1 bg-white/10 rounded-lg cursor-pointer" />
              <span className="text-xs font-mono text-white/50 w-10 text-right">{Math.round(opacity * 100)}%</span>
            </div>
          </div>
        )}

        {/* Efeitos Especiais (Título, Corpo ou Texto Extra) */}
        {(isMainText || isExtraText) && (
          <div className="space-y-3">
            <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold flex items-center justify-between">
               Fundo de Legibilidade
               {effect !== "none" && (
                  <input type="color" value={effectColor || post.palette.background} onChange={(e) => updateEffectColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0" title="Cor do Efeito" />
               )}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: "none", label: "Nenhum" },
                { id: "scrim", label: "Sombra Scrim" },
                { id: "box-card", label: "Caixa Clássica" },
                { id: "box-pill", label: "Pílula" },
                { id: "box-glass", label: "Glassmorfismo" },
                { id: "box-accent", label: "Caixa Destaque" },
                { id: "box-brutal", label: "Caixa Brutal" },
                { id: "strip-line", label: "Fitas de Texto" },
              ].map(eff => (
                <button
                  key={eff.id}
                  onClick={() => updateEffect(eff.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer border ${effect === eff.id ? 'bg-[oklch(0.78_0.22_48)]/20 border-[oklch(0.78_0.22_48)] text-white' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'}`}
                >
                  {eff.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ações Extra Texts */}
        {isExtraText && (
          <div className="space-y-3 pt-4 border-t border-white/10">
            <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Organização</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdatePost(reorderExtraElement(post, selectedId, "front"))}
                className="p-2 rounded bg-white/5 hover:bg-white/10 text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <ChevronsUp size={14} /> Trazer p/ Frente
              </button>
              <button
                type="button"
                onClick={() => onUpdatePost(reorderExtraElement(post, selectedId, "back"))}
                className="p-2 rounded bg-white/5 hover:bg-white/10 text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <ChevronsDown size={14} /> Enviar p/ Trás
              </button>
              <button
                type="button"
                onClick={() => {
                   onUpdatePost(duplicateExtraElement(post, selectedId).post);
                   toast.success("Texto duplicado!");
                }}
                className="p-2 rounded bg-white/5 hover:bg-white/10 text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Copy size={14} /> Duplicar
              </button>
              <button
                type="button"
                onClick={() => {
                   onUpdatePost(removeExtraElement(post, selectedId));
                   onClose();
                }}
                className="p-2 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Trash2 size={14} /> Excluir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
