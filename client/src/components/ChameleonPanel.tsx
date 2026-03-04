/**
 * ChameleonPanel — Full design token customization panel.
 * Allows granular editing of every visual property extracted by Chameleon Vision
 * or derived from preset themes via the bridge.
 *
 * Sections: Palette (5 colors), Font, Structure, Typography, Decorations.
 */

import React, { useState } from "react";
import type { DesignTokens, PostVariation } from "@shared/postspark";
import { FONT_CATALOG } from "@/lib/fonts";
import { Palette, Type, Box, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { FontDropdown } from "./ui/FontDropdown";

// ─── Dropdown Options ─────────────────────────────────────────────────────────

const BORDER_RADIUS_OPTIONS = [
  { value: "0px", label: "Seco (0px)" },
  { value: "8px", label: "Leve (8px)" },
  { value: "16px", label: "Médio (16px)" },
  { value: "24px", label: "Arredondado (24px)" },
  { value: "40px", label: "Pílula (40px)" },
];

const BOX_SHADOW_OPTIONS = [
  { value: "none", label: "Nenhuma" },
  { value: "0 10px 25px rgba(0,0,0,0.1)", label: "Suave Elegante" },
  { value: "0 20px 40px rgba(0,0,0,0.15)", label: "Suave Forte" },
  { value: "5px 5px 0px 0px rgba(0,0,0,0.85)", label: "Neo-Brutalista" },
];

const BORDER_OPTIONS = [
  { value: "none", label: "Nenhuma" },
  { value: "1px solid rgba(0,0,0,0.1)", label: "Fina Sutil" },
  { value: "2px solid rgba(0,0,0,0.2)", label: "Marcada 2px" },
  { value: "4px solid rgba(0,0,0,0.3)", label: "Grossa 4px" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ColorInput({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded border border-white/10 cursor-pointer bg-transparent"
      />
      <span className="text-white/70 min-w-[70px]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-0.5 text-white/90 text-xs font-mono uppercase"
        maxLength={9}
      />
    </label>
  );
}

function SelectInput({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-white/60">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white/90 text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function SectionHeader({ icon, title, open, onToggle }: {
  icon: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full py-2 text-sm font-semibold text-white/90 hover:text-white transition-colors"
    >
      <span className="flex items-center gap-2">
        {icon}
        {title}
      </span>
      {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
  );
}

// ─── ChameleonPanel ───────────────────────────────────────────────────────────

interface ChameleonPanelProps {
  tokens: DesignTokens;
  onChange: (tokens: DesignTokens) => void;
  variation?: PostVariation;
  onUpdateVariation?: (partial: Partial<PostVariation>) => void;
  activeTarget?: 'headline' | 'body' | 'accentBar' | 'card' | 'badge' | 'sticker' | 'both';
}

export default function ChameleonPanel({ tokens, onChange, variation, onUpdateVariation, activeTarget = 'both' }: ChameleonPanelProps) {
  const [openSections, setOpenSections] = useState({
    palette: true,
    font: true,
    structure: false,
    typography: false,
    decorations: false,
  });

  const toggle = (key: keyof typeof openSections) =>
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  // Deep-update helpers
  const setColor = (key: keyof DesignTokens["colors"], value: string) =>
    onChange({ ...tokens, colors: { ...tokens.colors, [key]: value } });

  const setTypo = (key: keyof DesignTokens["typography"], value: string) =>
    onChange({ ...tokens, typography: { ...tokens.typography, [key]: value } });

  const setStruct = (key: keyof DesignTokens["structure"], value: string) =>
    onChange({ ...tokens, structure: { ...tokens.structure, [key]: value } });

  // Font groups for the dropdown
  const fontGroups = [
    { label: "Sans-Serif", fonts: FONT_CATALOG.sansSerif },
    { label: "Serifadas", fonts: FONT_CATALOG.serif },
    { label: "Display", fonts: FONT_CATALOG.display },
    { label: "Mono", fonts: FONT_CATALOG.mono },
  ];

  return (
    <div className="flex flex-col gap-1 text-xs">
      {/* ── Palette ────────────────────────────────────────────── */}
      <SectionHeader
        icon={<Palette size={14} />}
        title="Paleta de Cores"
        open={openSections.palette}
        onToggle={() => toggle("palette")}
      />
      {openSections.palette && (
        <div className="flex flex-col gap-2 pb-3 border-b border-white/5">
          <ColorInput label="Fundo (Canvas)" value={tokens.colors.background} onChange={(v) => setColor("background", v)} />
          <ColorInput label="Primária" value={tokens.colors.primary} onChange={(v) => setColor("primary", v)} />
          <ColorInput label="Secundária" value={tokens.colors.secondary} onChange={(v) => setColor("secondary", v)} />
          <ColorInput label="Texto" value={tokens.colors.text} onChange={(v) => setColor("text", v)} />
          <ColorInput label="Fundo (Card)" value={tokens.colors.card} onChange={(v) => setColor("card", v)} />
        </div>
      )}

      {/* ── Font ───────────────────────────────────────────────── */}
      <SectionHeader
        icon={<Type size={14} />}
        title={activeTarget === 'headline' ? 'Tipografia (Título)' : activeTarget === 'body' ? 'Tipografia (Corpo)' : 'Tipografia'}
        open={openSections.font}
        onToggle={() => toggle("font")}
      />
      {openSections.font && (
        <div className="flex flex-col gap-3 pb-3 border-b border-white/5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-xs">Família Tipográfica</span>
              <span className="text-[9px] text-white/40 uppercase tracking-wider bg-white/5 px-1.5 py-0.5 rounded">
                {activeTarget === 'headline' ? 'Contexto: Título'
                  : activeTarget === 'body' ? 'Contexto: Corpo'
                    : activeTarget === 'accentBar' ? 'Contexto: Barrinha'
                      : activeTarget === 'badge' ? 'Contexto: Badge'
                        : activeTarget === 'sticker' ? 'Contexto: Sticker'
                          : 'Contexto: Global'}
              </span>
            </div>

            <FontDropdown
              value={
                activeTarget === 'headline' && variation?.headlineFontFamily
                  ? variation.headlineFontFamily
                  : activeTarget === 'body' && variation?.bodyFontFamily
                    ? variation.bodyFontFamily
                    : tokens.typography.fontFamily
              }
              onChange={(value) => {
                if (activeTarget === 'headline' && onUpdateVariation) {
                  onUpdateVariation({ headlineFontFamily: value });
                } else if (activeTarget === 'body' && onUpdateVariation) {
                  onUpdateVariation({ bodyFontFamily: value });
                } else {
                  setTypo("fontFamily", value);
                  if (onUpdateVariation) {
                    onUpdateVariation({
                      headlineFontFamily: undefined,
                      bodyFontFamily: undefined
                    });
                  }
                  if (tokens.typography.customFontUrl) {
                    setTypo("customFontUrl", "");
                  }
                }
              }}
            />
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-white/60 text-xs">URL Google Fonts (opcional)</span>
            <input
              type="text"
              placeholder="https://fonts.googleapis.com/css2?family=..."
              value={tokens.typography.customFontUrl}
              onChange={(e) => setTypo("customFontUrl", e.target.value)}
              className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white/90 text-xs font-mono placeholder:text-white/20"
            />
          </label>

          {tokens.typography.originalFont && (
            <div className="text-white/40 text-[10px] italic">
              Fonte original detectada: {tokens.typography.originalFont}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <SelectInput
              label="Transformação"
              value={tokens.typography.textTransform}
              options={[
                { value: "none", label: "Normal" },
                { value: "uppercase", label: "CAIXA ALTA" },
              ]}
              onChange={(v) => setTypo("textTransform", v)}
            />
            <SelectInput
              label="Alinhamento"
              value={tokens.typography.textAlign}
              options={[
                { value: "left", label: "Esquerda" },
                { value: "center", label: "Centralizado" },
              ]}
              onChange={(v) => setTypo("textAlign", v)}
            />
          </div>
        </div>
      )}

      {/* ── Structure ──────────────────────────────────────────── */}
      <SectionHeader
        icon={<Box size={14} />}
        title="Estrutura"
        open={openSections.structure}
        onToggle={() => toggle("structure")}
      />
      {openSections.structure && (
        <div className="flex flex-col gap-2 pb-3 border-b border-white/5">
          <SelectInput
            label="Cantos"
            value={tokens.structure.borderRadius}
            options={BORDER_RADIUS_OPTIONS}
            onChange={(v) => setStruct("borderRadius", v)}
          />
          <SelectInput
            label="Sombra"
            value={tokens.structure.boxShadow}
            options={BOX_SHADOW_OPTIONS}
            onChange={(v) => setStruct("boxShadow", v)}
          />
          <SelectInput
            label="Borda"
            value={tokens.structure.border}
            options={BORDER_OPTIONS}
            onChange={(v) => setStruct("border", v)}
          />
        </div>
      )}

      {/* ── Decorations ────────────────────────────────────────── */}
      <SectionHeader
        icon={<Sparkles size={14} />}
        title="Decorações"
        open={openSections.decorations}
        onToggle={() => toggle("decorations")}
      />
      {openSections.decorations && (
        <div className="flex flex-col gap-2 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => onChange({ ...tokens, decorations: "minimal" })}
              className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${tokens.decorations === "minimal"
                ? "bg-white/15 text-white border border-white/20"
                : "bg-white/5 text-white/50 border border-white/5 hover:border-white/15"
                }`}
            >
              Minimalista
            </button>
            <button
              onClick={() => onChange({ ...tokens, decorations: "playful" })}
              className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${tokens.decorations === "playful"
                ? "bg-white/15 text-white border border-white/20"
                : "bg-white/5 text-white/50 border border-white/5 hover:border-white/15"
                }`}
            >
              Playful
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
