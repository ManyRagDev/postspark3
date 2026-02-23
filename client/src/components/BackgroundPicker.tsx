/**
 * BackgroundPicker — Seletor de fundo para o PostCard.
 *
 * 5 modos:
 *  • none    — sem fundo (cor pura do tema)
 *  • gallery — 95+ imagens curadas em categorias
 *  • ai      — geração via Pollinations (simples) ou Gemini (complexo)
 *  • upload  — arquivo local
 *  • solid   — cor sólida com presets
 *
 * Overlay controls: opacidade, cor, posição X/Y
 */

import type React from "react";
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, FolderOpen, Sparkles, Upload, Palette,
  ChevronDown, Loader2, RefreshCw, Check,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { BackgroundValue, BgOverlaySettings } from "@shared/postspark";
import { Slider } from "@/components/ui/slider";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BackgroundPickerProps {
  currentText?: string;
  value: BackgroundValue;
  overlay: BgOverlaySettings;
  onValueChange: (v: BackgroundValue) => void;
  onOverlayChange: (o: BgOverlaySettings) => void;
}

type TabId = "none" | "gallery" | "ai" | "upload" | "solid";

// ── Presets de cor ─────────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  "#0f0f1a", "#1a1a2e", "#0d1117", "#111827",
  "#1e1b4b", "#172554", "#14532d", "#450a0a",
  "#7c3aed", "#2563eb", "#059669", "#dc2626",
  "#d97706", "#db2777", "#0891b2", "#ffffff",
];

// ── Tab config ──────────────────────────────────────────────────────────────
const TABS: { id: TabId; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: "none", label: "Nenhum", Icon: X },
  { id: "gallery", label: "Acervo", Icon: FolderOpen },
  { id: "ai", label: "IA", Icon: Sparkles },
  { id: "upload", label: "Enviar", Icon: Upload },
  { id: "solid", label: "Cor sólida", Icon: Palette },
];

// ── SectionLabel ──────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-semibold uppercase tracking-widest mb-2"
      style={{ color: "oklch(0.55 0.04 280)" }}
    >
      {children}
    </p>
  );
}

// ── BackgroundPicker ──────────────────────────────────────────────────────────
export default function BackgroundPicker({
  currentText,
  value,
  overlay,
  onValueChange,
  onOverlayChange,
}: BackgroundPickerProps) {
  const activeTab: TabId = value.type as TabId;

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState(currentText ?? "");
  const [imageProvider, setImageProvider] = useState<'pollinations' | 'gemini'>('gemini');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── tRPC ────────────────────────────────────────────────────────────────────
  const { data: categories = [], isLoading: categoriesLoading } =
    trpc.post.listBackgrounds.useQuery();

  const generateBgMutation = trpc.post.generateBackground.useMutation({
    onSuccess: (data) => {
      onValueChange({ type: "ai", url: data.imageData });
    },
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const switchTab = useCallback(
    (tab: TabId) => {
      if (tab === "none") {
        onValueChange({ type: "none" });
        setGalleryOpen(false);
      } else if (tab === "gallery") {
        onValueChange({ type: "gallery" });
        setGalleryOpen(true);
      } else if (tab !== activeTab) {
        onValueChange({ type: tab });
        setGalleryOpen(false);
      } else {
        setGalleryOpen(false);
      }
    },
    [activeTab, onValueChange]
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        onValueChange({ type: "upload", url: ev.target?.result as string });
      };
      reader.readAsDataURL(file);
    },
    [onValueChange]
  );

  const handleGenerateAI = useCallback(() => {
    if (!aiPrompt.trim()) return;
    generateBgMutation.mutate({ prompt: aiPrompt.trim(), provider: imageProvider });
  }, [aiPrompt, imageProvider, generateBgMutation]);

  const handleSelectGalleryImage = useCallback(
    (imgPath: string) => {
      onValueChange({ type: "gallery", url: imgPath });
      setGalleryOpen(false);
    },
    [onValueChange]
  );

  // ── Gallery category ─────────────────────────────────────────────────────────
  const currentCategory =
    categories.find((c) => c.id === selectedCategory) ?? categories[0];

  // ── Gallery panel ────────────────────────────────────────────────────────────
  const galleryPanel = activeTab === "gallery" && (
    <AnimatePresence>
      {galleryOpen && (
        <motion.div
          key="gallery"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="mt-3 rounded-xl overflow-hidden border"
          style={{ borderColor: "oklch(1 0 0 / 10%)", background: "oklch(0.12 0.02 280)" }}
        >
          {/* Category selector */}
          <div className="p-3 border-b" style={{ borderColor: "oklch(1 0 0 / 8%)" }}>
            {categoriesLoading ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: "oklch(0.55 0.04 280)" }}>
                <Loader2 size={12} className="animate-spin" />
                Preparando acervo…
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedCategory || categories[0]?.id || ""}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full appearance-none rounded-lg px-3 py-1.5 text-xs pr-8 outline-none"
                  style={{
                    background: "oklch(0.16 0.02 280)",
                    color: "oklch(0.9 0.02 280)",
                    border: "1px solid oklch(1 0 0 / 12%)",
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.images.length})
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "oklch(0.55 0.04 280)" }}
                />
              </div>
            )}
          </div>

          {/* Image grid */}
          {currentCategory && (
            <div className="p-3 grid grid-cols-4 gap-1.5 max-h-52 overflow-y-auto">
              {currentCategory.images.map((img) => {
                const isSelected = value.type === "gallery" && value.url === img;
                return (
                  <button
                    key={img}
                    onClick={() => handleSelectGalleryImage(img)}
                    className="relative aspect-square rounded-lg overflow-hidden focus:outline-none transition-transform hover:scale-105"
                    style={{
                      border: isSelected
                        ? "2px solid oklch(0.7 0.22 40)"
                        : "2px solid transparent",
                    }}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                    {isSelected && (
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: "oklch(0.7 0.22 40 / 30%)" }}
                      >
                        <Check size={14} style={{ color: "oklch(0.7 0.22 40)" }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Gallery selected preview ─────────────────────────────────────────────────
  const galleryPreview = activeTab === "gallery" && value.url && !galleryOpen && (
    <div className="mt-3 space-y-2">
      <div className="relative aspect-square rounded-xl overflow-hidden">
        <img src={value.url} alt="Fundo selecionado" className="w-full h-full object-cover" />
      </div>
      <button
        onClick={() => setGalleryOpen(true)}
        className="w-full py-1.5 rounded-lg text-xs font-medium"
        style={{ background: "oklch(0.16 0.02 280)", color: "oklch(0.7 0.04 280)" }}
      >
        Alterar seleção
      </button>
    </div>
  );

  // ── AI tab content ───────────────────────────────────────────────────────────
  const aiContent = activeTab === "ai" && (
    <div className="mt-3 space-y-3">
      {/* Toggle Provider */}
      <div
        className="flex items-center gap-1 p-1 rounded-xl"
        style={{ background: "oklch(0.12 0.02 280)", border: "1px solid oklch(1 0 0 / 10%)" }}
      >
        {(["pollinations", "gemini"] as const).map((provider) => {
          const isActive = imageProvider === provider;
          const label = provider === "pollinations" ? "Rápido" : "Avançado";
          const isDisabled = provider === "pollinations";

          return (
            <button
              key={provider}
              onClick={() => { if (!isDisabled) setImageProvider(provider); }}
              disabled={isDisabled}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg text-xs font-medium transition-all ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              style={{
                background: isActive ? "oklch(0.7 0.22 40)" : "transparent",
                color: isActive ? "oklch(0.08 0.02 280)" : "oklch(0.6 0.04 280)",
              }}
            >
              <div className="flex items-center gap-1">
                {label}
                {isDisabled && (
                  <span className="text-[8px] bg-white/10 px-1 py-0.5 rounded uppercase tracking-wider">
                    Em breve
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px]" style={{ color: "oklch(0.5 0.04 280)" }}>
        {imageProvider === 'gemini'
          ? "Motor avançado — imagens detalhadas e realistas (mais lento)"
          : "Motor rápido — padrões abstratos e gradientes"}
      </p>

      {/* Prompt */}
      <textarea
        value={aiPrompt}
        onChange={(e) => setAiPrompt(e.target.value)}
        placeholder={
          currentText
            ? `Ex.: "${currentText.slice(0, 40)}…"`
            : "Descreva o fundo desejado"
        }
        rows={2}
        className="w-full rounded-lg px-3 py-2 text-xs resize-none outline-none"
        style={{
          background: "oklch(0.12 0.02 280)",
          color: "oklch(0.9 0.02 280)",
          border: "1px solid oklch(1 0 0 / 12%)",
        }}
      />

      {/* Generate button */}
      <button
        onClick={handleGenerateAI}
        disabled={!aiPrompt.trim() || generateBgMutation.isPending}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-40"
        style={{ background: "oklch(0.7 0.22 40)", color: "oklch(0.08 0.02 280)" }}
      >
        {generateBgMutation.isPending ? (
          <>
            <Loader2 size={13} className="animate-spin" />
            Sintetizando…
          </>
        ) : value.type === "ai" && value.url ? (
          <>
            <RefreshCw size={13} />
            Gerar nova versão
          </>
        ) : (
          <>
            <Sparkles size={13} />
            Sintetizar com IA
          </>
        )}
      </button>

      {/* Preview */}
      {value.type === "ai" && value.url && (
        <div className="relative aspect-square rounded-xl overflow-hidden">
          <img src={value.url} alt="Fundo gerado" className="w-full h-full object-cover" />
        </div>
      )}

      {generateBgMutation.isError && (
        <p className="text-[10px] text-red-400">
          Ajuste necessário. Tente novamente.
        </p>
      )}
    </div>
  );

  // ── Upload tab content ───────────────────────────────────────────────────────
  const uploadContent = activeTab === "upload" && (
    <div className="mt-3 space-y-3">
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full py-6 rounded-xl border-2 border-dashed text-xs font-medium flex flex-col items-center gap-2 transition-colors"
        style={{ borderColor: "oklch(1 0 0 / 15%)", color: "oklch(0.6 0.04 280)" }}
      >
        <Upload size={20} style={{ color: "oklch(0.55 0.04 280)" }} />
        Selecione um arquivo de imagem
        <span style={{ color: "oklch(0.45 0.03 280)" }}>JPG, PNG, WebP, GIF</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />
      {value.type === "upload" && value.url && (
        <div className="relative aspect-square rounded-xl overflow-hidden">
          <img src={value.url} alt="Upload" className="w-full h-full object-cover" />
          <button
            onClick={() => onValueChange({ type: "none" })}
            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: "oklch(0.1 0.02 280 / 80%)" }}
          >
            <X size={12} style={{ color: "oklch(0.9 0.02 280)" }} />
          </button>
        </div>
      )}
    </div>
  );

  // ── Solid color tab ──────────────────────────────────────────────────────────
  const solidContent = activeTab === "solid" && (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl border flex-shrink-0"
          style={{
            background: value.type === "solid" ? value.color : "#1a1a2e",
            borderColor: "oklch(1 0 0 / 15%)",
          }}
        />
        <input
          type="color"
          value={value.type === "solid" ? (value.color ?? "#1a1a2e") : "#1a1a2e"}
          onChange={(e) => onValueChange({ type: "solid", color: e.target.value })}
          className="flex-1 h-10 rounded-xl cursor-pointer outline-none"
          style={{ border: "1px solid oklch(1 0 0 / 15%)" }}
        />
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {COLOR_PRESETS.map((color) => {
          const isSelected = value.type === "solid" && value.color === color;
          return (
            <button
              key={color}
              onClick={() => onValueChange({ type: "solid", color })}
              className="aspect-square rounded-lg transition-transform hover:scale-110 focus:outline-none"
              style={{
                background: color,
                border: isSelected
                  ? "2px solid oklch(0.7 0.22 40)"
                  : "2px solid oklch(1 0 0 / 10%)",
              }}
            />
          );
        })}
      </div>
    </div>
  );

  // ── Overlay controls ─────────────────────────────────────────────────────────
  const showOverlay = value.type !== "none" && value.type !== "solid";

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Tab row */}
      <div
        className="flex gap-1 p-1 rounded-xl"
        style={{ background: "oklch(0.1 0.02 280)", border: "1px solid oklch(1 0 0 / 8%)" }}
      >
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium transition-all"
              style={{
                background: isActive ? "oklch(0.7 0.22 40)" : "transparent",
                color: isActive ? "oklch(0.08 0.02 280)" : "oklch(0.55 0.04 280)",
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === "none" && (
            <div className="mt-4 py-6 flex flex-col items-center gap-2 rounded-xl" style={{ background: "oklch(1 0 0 / 2%)", border: "1px dashed oklch(1 0 0 / 8%)" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "oklch(1 0 0 / 4%)" }}>
                <Palette size={16} style={{ color: "oklch(0.45 0.03 280)" }} />
              </div>
              <p className="text-xs text-center leading-relaxed" style={{ color: "oklch(0.5 0.04 280)" }}>
                Sem superfície de fundo.<br />
                <span style={{ color: "oklch(0.4 0.03 280)" }}>A composição usa a cor base do tema.</span>
              </p>
            </div>
          )}
          {galleryPanel}
          {!galleryOpen && galleryPreview}
          {aiContent}
          {uploadContent}
          {solidContent}
        </motion.div>
      </AnimatePresence>

      {/* Overlay controls */}
      {showOverlay && (
        <div
          className="mt-4 space-y-3 pt-4"
          style={{ borderTop: "1px solid oklch(1 0 0 / 8%)" }}
        >
          <SectionLabel>Overlay</SectionLabel>

          {/* Opacity */}
          <div className="flex items-center gap-3">
            <span className="text-xs w-20 flex-shrink-0" style={{ color: "oklch(0.65 0.04 280)" }}>
              Opacidade
            </span>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[overlay.opacity]}
              onValueChange={([v]) => onOverlayChange({ ...overlay, opacity: v })}
              className="flex-1"
            />
            <span className="text-xs w-8 text-right tabular-nums" style={{ color: "oklch(0.55 0.04 280)" }}>
              {Math.round(overlay.opacity * 100)}%
            </span>
          </div>

          {/* Color */}
          <div className="flex items-center gap-3">
            <span className="text-xs w-20 flex-shrink-0" style={{ color: "oklch(0.65 0.04 280)" }}>
              Cor
            </span>
            <div className="flex items-center gap-2 flex-1">
              <div
                className="w-6 h-6 rounded-md border flex-shrink-0"
                style={{ background: overlay.color, borderColor: "oklch(1 0 0 / 20%)" }}
              />
              <input
                type="color"
                value={overlay.color}
                onChange={(e) => onOverlayChange({ ...overlay, color: e.target.value })}
                className="w-8 h-6 rounded cursor-pointer border-0 outline-none p-0"
              />
            </div>
          </div>

          {/* Position X */}
          <div className="flex items-center gap-3">
            <span className="text-xs w-20 flex-shrink-0" style={{ color: "oklch(0.65 0.04 280)" }}>
              Posição X
            </span>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[overlay.position.x]}
              onValueChange={([v]) =>
                onOverlayChange({ ...overlay, position: { ...overlay.position, x: v } })
              }
              className="flex-1"
            />
            <span className="text-xs w-8 text-right tabular-nums" style={{ color: "oklch(0.55 0.04 280)" }}>
              {overlay.position.x}%
            </span>
          </div>

          {/* Position Y */}
          <div className="flex items-center gap-3">
            <span className="text-xs w-20 flex-shrink-0" style={{ color: "oklch(0.65 0.04 280)" }}>
              Posição Y
            </span>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[overlay.position.y]}
              onValueChange={([v]) =>
                onOverlayChange({ ...overlay, position: { ...overlay.position, y: v } })
              }
              className="flex-1"
            />
            <span className="text-xs w-8 text-right tabular-nums" style={{ color: "oklch(0.55 0.04 280)" }}>
              {overlay.position.y}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
