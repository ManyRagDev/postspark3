/**
 * TypographyColorControls — Cores e tamanho da tipografia (item 2).
 *
 * Controles de cor (Título/Corpo) e multiplicadores de tamanho, usados na
 * aba "Texto" do CanvasSidebar (desktop) e do CanvasMobileDrawer (mobile).
 *
 * Integração com o guardião de contraste (item 1):
 *  - escolher uma cor manualmente marca manualHeadlineColor/manualSubtextColor,
 *    preservando a escolha do usuário em mudanças futuras de fundo;
 *  - "Limpar" remove o override e devolve a resolução automática;
 *  - quando a escolha manual fica ilegível, um selo "contraste baixo" é exibido.
 */

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { CanvasCustomText, CanvasPostModel, TextLegibilityEffect } from "./types";
import { TEXT_EFFECTS_META } from "./types";
import { getContrastWarnings } from "../lib/contrast";

interface TypographyColorControlsProps {
  post: CanvasPostModel;
  onUpdatePost: (patch: Partial<CanvasPostModel>) => void;
  /** Caixa de texto livre atualmente selecionada no canvas. */
  selectedExtraText?: CanvasCustomText;
  onUpdateExtraText?: (id: string, patch: Partial<CanvasCustomText>) => void;
  /** Visual compacto para o drawer mobile. */
  compact?: boolean;
}

type EffectTarget = "both" | "headline" | "subtext" | "selected";

function LowContrastBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 text-[9px] font-bold px-1.5 py-0.5"
      title="O contraste desta cor de texto está baixo. Escolha uma cor mais clara/escura ou clique em Limpar para voltar ao automático."
    >
      <AlertTriangle size={9} />
      contraste baixo
    </span>
  );
}

export default function TypographyColorControls({
  post,
  onUpdatePost,
  selectedExtraText,
  onUpdateExtraText,
  compact = false,
}: TypographyColorControlsProps) {
  const warnings = getContrastWarnings(post);
  const headlineColor = post.palette.headlineColor ?? post.palette.text;
  const subtextColor = post.palette.subtextColor ?? post.palette.text;

  const [effectTarget, setEffectTarget] = useState<EffectTarget>("both");
  const [effectTargetSelectionId, setEffectTargetSelectionId] = useState<string>();
  const canTargetSelectedBox = Boolean(selectedExtraText && onUpdateExtraText);
  const selectedExtraTextId = canTargetSelectedBox ? selectedExtraText?.id : undefined;
  const resolvedEffectTarget: EffectTarget = selectedExtraTextId && effectTargetSelectionId !== selectedExtraTextId
    ? "selected"
    : effectTarget === "selected" && !selectedExtraTextId
    ? "both"
    : effectTarget;

  const selectEffectTarget = (target: EffectTarget) => {
    setEffectTarget(target);
    setEffectTargetSelectionId(selectedExtraTextId);
  };

  const currentEffect =
    resolvedEffectTarget === "both"
      ? (post.headlineEffect === post.subtextEffect ? post.headlineEffect || "none" : null)
      : resolvedEffectTarget === "headline"
      ? post.headlineEffect || "none"
      : resolvedEffectTarget === "subtext"
      ? post.subtextEffect || "none"
      : selectedExtraText?.effect || "none";

  const handleSelectEffect = (effectId: TextLegibilityEffect) => {
    if (resolvedEffectTarget === "both") {
      onUpdatePost({ headlineEffect: effectId, subtextEffect: effectId });
    } else if (resolvedEffectTarget === "headline") {
      onUpdatePost({ headlineEffect: effectId });
    } else if (resolvedEffectTarget === "subtext") {
      onUpdatePost({ subtextEffect: effectId });
    } else if (selectedExtraText && onUpdateExtraText) {
      onUpdateExtraText(selectedExtraText.id, { effect: effectId });
    }
  };

  const handleSelectEffectColor = (color: string) => {
    if (resolvedEffectTarget === "both") {
      onUpdatePost({ headlineEffectColor: color, subtextEffectColor: color });
    } else if (resolvedEffectTarget === "headline") {
      onUpdatePost({ headlineEffectColor: color });
    } else if (resolvedEffectTarget === "subtext") {
      onUpdatePost({ subtextEffectColor: color });
    } else if (selectedExtraText && onUpdateExtraText) {
      onUpdateExtraText(selectedExtraText.id, { effectColor: color });
    }
  };

  const clearEffectColor = () => {
    if (resolvedEffectTarget === "both") {
      onUpdatePost({ headlineEffectColor: undefined, subtextEffectColor: undefined });
    } else if (resolvedEffectTarget === "headline") {
      onUpdatePost({ headlineEffectColor: undefined });
    } else if (resolvedEffectTarget === "subtext") {
      onUpdatePost({ subtextEffectColor: undefined });
    } else if (selectedExtraText && onUpdateExtraText) {
      onUpdateExtraText(selectedExtraText.id, { effectColor: undefined });
    }
  };

  const hasActiveEffect =
    resolvedEffectTarget === "headline"
      ? Boolean(post.headlineEffect && post.headlineEffect !== "none")
      : resolvedEffectTarget === "subtext"
      ? Boolean(post.subtextEffect && post.subtextEffect !== "none")
      : resolvedEffectTarget === "selected"
      ? Boolean(selectedExtraText?.effect && selectedExtraText.effect !== "none")
      : Boolean((post.headlineEffect && post.headlineEffect !== "none") || (post.subtextEffect && post.subtextEffect !== "none"));

  const activeEffectColor =
    resolvedEffectTarget === "headline"
      ? post.headlineEffectColor
      : resolvedEffectTarget === "subtext"
      ? post.subtextEffectColor
      : resolvedEffectTarget === "selected"
      ? selectedExtraText?.effectColor
      : post.headlineEffectColor || post.subtextEffectColor;

  const currentEffectColorHex = activeEffectColor && activeEffectColor.startsWith("#")
    ? activeEffectColor
    : "#000000";

  const setHeadlineColor = (v: string) =>
    onUpdatePost({ palette: { ...post.palette, headlineColor: v }, manualHeadlineColor: true });
  const setSubtextColor = (v: string) =>
    onUpdatePost({ palette: { ...post.palette, subtextColor: v }, manualSubtextColor: true });
  const clearHeadline = () =>
    onUpdatePost({ palette: { ...post.palette, headlineColor: undefined }, manualHeadlineColor: false });
  const clearSubtext = () =>
    onUpdatePost({ palette: { ...post.palette, subtextColor: undefined }, manualSubtextColor: false });

  const sliderClass = compact ? "w-full accent-[oklch(0.78_0.22_48)] cursor-pointer" : "w-full accent-[oklch(0.78_0.22_48)]";
  const labelClass = compact
    ? "text-[10px] font-mono text-white/50 uppercase"
    : "text-[10px] text-white/50 block";

  return (
    <div className={compact ? "space-y-3 pt-1" : "space-y-3"}>
      <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold block">
        Cores e Tamanho da Tipografia
      </label>

      {/* ── Cores por elemento ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={headlineColor}
            onChange={(e) => setHeadlineColor(e.target.value)}
            className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border border-white/15 shrink-0"
            title="Cor do título"
          />
          <span className="text-[11px] text-white/70 font-semibold">Título</span>
          {warnings.headline && <LowContrastBadge />}
          {post.manualHeadlineColor && (
            <button
              type="button"
              onClick={clearHeadline}
              className="ml-auto text-[9px] uppercase tracking-wider text-white/40 hover:text-white transition-colors cursor-pointer"
              title="Voltar à cor automática (guardião de contraste)"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="color"
            value={subtextColor}
            onChange={(e) => setSubtextColor(e.target.value)}
            className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border border-white/15 shrink-0"
            title="Cor do corpo"
          />
          <span className="text-[11px] text-white/70 font-semibold">Corpo</span>
          {warnings.subtext && <LowContrastBadge />}
          {post.manualSubtextColor && (
            <button
              type="button"
              onClick={clearSubtext}
              className="ml-auto text-[9px] uppercase tracking-wider text-white/40 hover:text-white transition-colors cursor-pointer"
              title="Voltar à cor automática (guardião de contraste)"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Tamanhos ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Tamanho do título</label>
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={post.headlineSizeScale ?? 1}
            onChange={(e) => onUpdatePost({ headlineSizeScale: parseFloat(e.target.value) })}
            className={sliderClass}
          />
          <span className="text-[9px] font-mono text-white/40">
            {Math.round((post.headlineSizeScale ?? 1) * 100)}%
          </span>
        </div>
        <div>
          <label className={labelClass}>Tamanho do corpo</label>
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={post.subtextSizeScale ?? 1}
            onChange={(e) => onUpdatePost({ subtextSizeScale: parseFloat(e.target.value) })}
            className={sliderClass}
          />
          <span className="text-[9px] font-mono text-white/40">
            {Math.round((post.subtextSizeScale ?? 1) * 100)}%
          </span>
        </div>
      </div>

      {/* ── Efeitos de Legibilidade (10 Estilos Oficiais) ── */}
      <div className="pt-3 border-t border-white/8 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold block">
            Fundo e Efeito das Letras
          </label>
          <span className="text-[9px] font-mono text-white/40">
            {resolvedEffectTarget === "selected"
              ? `Caixa: ${TEXT_EFFECTS_META[selectedExtraText?.effect || "none"]?.name}`
              : post.headlineEffect === post.subtextEffect
              ? TEXT_EFFECTS_META[post.headlineEffect || "none"]?.name
              : `T: ${TEXT_EFFECTS_META[post.headlineEffect || "none"]?.name} • C: ${TEXT_EFFECTS_META[post.subtextEffect || "none"]?.name}`}
          </span>
        </div>

        {/* Seletor de Alvo: Ambos | Título | Corpo | Caixa selecionada */}
        <div className={`grid ${canTargetSelectedBox ? "grid-cols-2" : "grid-cols-3"} items-center gap-0.5 p-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px]`}>
          <button
            type="button"
            onClick={() => selectEffectTarget("both")}
            aria-pressed={resolvedEffectTarget === "both"}
            className={`flex-1 py-1 px-2 rounded-md font-medium transition-all text-center cursor-pointer ${
              resolvedEffectTarget === "both"
                ? "bg-[oklch(0.78_0.22_48)] text-white shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            Ambos
          </button>
          <button
            type="button"
            onClick={() => selectEffectTarget("headline")}
            aria-pressed={resolvedEffectTarget === "headline"}
            className={`flex-1 py-1 px-2 rounded-md font-medium transition-all text-center cursor-pointer ${
              resolvedEffectTarget === "headline"
                ? "bg-[oklch(0.78_0.22_48)] text-white shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            Título
          </button>
          <button
            type="button"
            onClick={() => selectEffectTarget("subtext")}
            aria-pressed={resolvedEffectTarget === "subtext"}
            className={`flex-1 py-1 px-2 rounded-md font-medium transition-all text-center cursor-pointer ${
              resolvedEffectTarget === "subtext"
                ? "bg-[oklch(0.78_0.22_48)] text-white shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            Corpo
          </button>
          {canTargetSelectedBox && (
            <button
              type="button"
              onClick={() => selectEffectTarget("selected")}
              aria-pressed={resolvedEffectTarget === "selected"}
              className={`py-1 px-2 rounded-md font-medium transition-all text-center cursor-pointer ${
                resolvedEffectTarget === "selected"
                  ? "bg-[oklch(0.78_0.22_48)] text-white shadow-sm"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Caixa selecionada
            </button>
          )}
        </div>

        {/* Lista de Efeitos */}
        {compact ? (
          /* Mobile Drawer: Carrossel Horizontal Deslizante com Chips */
          <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-none scroll-smooth">
            {Object.values(TEXT_EFFECTS_META).map((eff) => {
              const isSelected = currentEffect === eff.id;
              return (
                <button
                  key={eff.id}
                  type="button"
                  onClick={() => handleSelectEffect(eff.id)}
                  title={eff.description}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs shrink-0 border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[oklch(0.78_0.22_48)]/20 border-[oklch(0.78_0.22_48)] text-white font-bold shadow-[0_0_12px_rgba(255,92,0,0.25)]"
                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="text-sm leading-none">{eff.icon}</span>
                  <span>{eff.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          /* Desktop Sidebar: Grade de Botões com Ícone e Categoria */
          <div className="grid grid-cols-2 gap-1.5">
            {Object.values(TEXT_EFFECTS_META).map((eff) => {
              const isSelected = currentEffect === eff.id;
              return (
                <button
                  key={eff.id}
                  type="button"
                  onClick={() => handleSelectEffect(eff.id)}
                  title={eff.description}
                  className={`flex items-center gap-2 p-2 rounded-xl text-left border transition-all cursor-pointer text-xs ${
                    isSelected
                      ? "bg-[oklch(0.78_0.22_48)]/15 border-[oklch(0.78_0.22_48)] text-white font-bold shadow-sm"
                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="text-base leading-none">{eff.icon}</span>
                  <div className="truncate">
                    <div className="truncate font-medium">{eff.name}</div>
                    <div className="text-[9px] text-white/40 truncate">{eff.category}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Seletor de Cor da Sombra / Fundo do Efeito */}
        {hasActiveEffect && (
          <div className="pt-2.5 mt-2 border-t border-white/8 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-white/60 font-semibold flex items-center gap-1.5">
                <span>Cor da Sombra / Fundo</span>
              </label>
              {(resolvedEffectTarget === "headline"
                ? post.headlineEffectColor
                : resolvedEffectTarget === "subtext"
                ? post.subtextEffectColor
                : resolvedEffectTarget === "selected"
                ? selectedExtraText?.effectColor
                : post.headlineEffectColor || post.subtextEffectColor) && (
                <button
                  type="button"
                  onClick={clearEffectColor}
                  className="text-[9px] uppercase tracking-wider text-white/40 hover:text-white transition-colors cursor-pointer"
                  title="Restaurar cor automática do efeito"
                >
                  Padrão
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <input
                type="color"
                value={currentEffectColorHex}
                onChange={(e) => handleSelectEffectColor(e.target.value)}
                className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border border-white/15 shrink-0"
                title="Escolher cor personalizada da sombra ou fundo"
              />

              {/* Presets Rápidos */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                {[
                  { label: "Preto", value: "#000000" },
                  { label: "Branco", value: "#FFFFFF" },
                  { label: "Marca", value: post.palette.accent },
                  { label: "Grafite", value: "#1A1A1E" },
                  { label: "Dourado", value: "#D4AF37" },
                  { label: "Vermelho", value: "#FF4D30" },
                  { label: "Ciano", value: "#00F0FF" },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleSelectEffectColor(preset.value)}
                    title={`Aplicar cor ${preset.label} (${preset.value})`}
                    className="w-5 h-5 rounded-full shrink-0 border border-white/20 cursor-pointer hover:scale-110 active:scale-95 transition-transform"
                    style={{ backgroundColor: preset.value }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
