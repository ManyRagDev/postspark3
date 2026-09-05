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

import { AlertTriangle } from "lucide-react";
import type { CanvasPostModel } from "./types";
import { getContrastWarnings } from "../lib/contrast";

interface TypographyColorControlsProps {
  post: CanvasPostModel;
  onUpdatePost: (patch: Partial<CanvasPostModel>) => void;
  /** Visual compacto para o drawer mobile. */
  compact?: boolean;
}

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

export default function TypographyColorControls({ post, onUpdatePost, compact = false }: TypographyColorControlsProps) {
  const warnings = getContrastWarnings(post);
  const headlineColor = post.palette.headlineColor ?? post.palette.text;
  const subtextColor = post.palette.subtextColor ?? post.palette.text;

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
    </div>
  );
}
