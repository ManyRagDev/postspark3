import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useRef, type ReactNode } from "react";
import {
  ArrowLeft, Type, Palette, ImagePlus, Layout,
  Download, Copy, Check, Loader2, Save, Sparkles,
  AlignLeft, AlignCenter, AlignRight,
} from "lucide-react";
import { useAIProcessingStages, useCompletionFlash } from "@/hooks/useAIProcessingStages";
import type { PostVariation, Platform, AspectRatio, BackgroundValue, BgOverlaySettings } from "@shared/postspark";
import { PLATFORM_SPECS, ASPECT_RATIO_LABELS, DEFAULT_BG_OVERLAY } from "@shared/postspark";
import PostCard from "../PostCard";
import RatioIcon from "../RatioIcon";
import OrganicBackground from "../OrganicBackground";
import EditorSlider from "../ui/EditorSlider";
import PositionGrid from "../ui/PositionGrid";
import BackgroundPicker from "../BackgroundPicker";
import MobileEditSheet from "../MobileEditSheet";
import type { ImageSettings, AdvancedLayoutSettings, TextAlignment } from "@/types/editor";
import { DEFAULT_IMAGE_SETTINGS, DEFAULT_LAYOUT_SETTINGS } from "@/types/editor";

const RATIOS: AspectRatio[] = ["1:1", "5:6", "9:16"];

interface WorkbenchProps {
  variation: PostVariation;
  onBack: () => void;
  onSave: (variation: PostVariation) => void;
  onGenerateImage: (prompt: string) => Promise<string>;
  isSaving: boolean;
}

type DockTab = "text" | "design" | "image" | "layout";

const PRESET_COLORS = [
  "#0a0a1a", "#1a1a2e", "#16213e", "#0f3460",
  "#1b1b2f", "#2d132c", "#3d0c02", "#1a0000",
  "#FF5F1F", "#06B6D4", "#8B5CF6", "#EC4899",
  "#10B981", "#F59E0B", "#EF4444", "#6366F1",
];

const PLATFORMS: Platform[] = ["instagram", "twitter", "linkedin", "facebook"];

const LAYOUT_OPTIONS: { value: PostVariation["layout"]; label: string; icon: string }[] = [
  { value: "centered", label: "Centralizado", icon: "⊞" },
  { value: "left-aligned", label: "Lateral", icon: "☰" },
  { value: "split", label: "Bipartido", icon: "◧" },
  { value: "minimal", label: "Minimal", icon: "◻" },
];

const BLEND_MODES = ["normal", "multiply", "screen", "overlay", "darken", "lighten"] as const;

const TABS: { id: DockTab; label: string; Icon: typeof Type }[] = [
  { id: "text", label: "Texto", Icon: Type },
  { id: "design", label: "Design", Icon: Palette },
  { id: "image", label: "Imagem", Icon: ImagePlus },
  { id: "layout", label: "Composição", Icon: Layout },
];

export default function Workbench({
  variation: initialVariation,
  onBack,
  onSave,
  onGenerateImage,
  isSaving,
}: WorkbenchProps) {
  const [variation, setVariation] = useState<PostVariation>(initialVariation);
  const [activeTab, setActiveTab] = useState<DockTab>("text");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialVariation.aspectRatio ?? "1:1");
  const [copied, setCopied] = useState(false);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [imageSettings, setImageSettings] = useState<ImageSettings>(DEFAULT_IMAGE_SETTINGS);
  const [advancedLayout, setAdvancedLayout] = useState<AdvancedLayoutSettings>(DEFAULT_LAYOUT_SETTINGS);
  const [layoutTarget, setLayoutTarget] = useState<"headline" | "body">("headline");
  const [bgValue, setBgValue] = useState<BackgroundValue>({ type: "none" });
  const [bgOverlay, setBgOverlay] = useState<BgOverlaySettings>(DEFAULT_BG_OVERLAY);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const { stageText: imageStageText } = useAIProcessingStages({
    isActive: isGeneratingImg,
    preset: "image",
  });
  const showImageFlash = useCompletionFlash(isGeneratingImg);

  const update = useCallback((partial: Partial<PostVariation>) => {
    setVariation((prev) => ({ ...prev, ...partial }));
  }, []);

  const updateImgSetting = useCallback(<K extends keyof ImageSettings>(key: K, value: ImageSettings[K]) => {
    setImageSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateLayoutTarget = useCallback((field: "position" | "textAlign", value: string) => {
    setAdvancedLayout((prev) => ({
      ...prev,
      [layoutTarget]: { ...prev[layoutTarget], [field]: value },
    }));
  }, [layoutTarget]);

  const handleCopyText = useCallback(() => {
    const text = [
      variation.headline,
      "",
      variation.body,
      "",
      variation.hashtags.map((h) => `#${h.replace("#", "")}`).join(" "),
      variation.callToAction,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [variation]);

  const handleGenerateImage = useCallback(async () => {
    setIsGeneratingImg(true);
    try {
      const url = await onGenerateImage(variation.imagePrompt);
      if (url) update({ imageUrl: url });
    } finally {
      setIsGeneratingImg(false);
    }
  }, [variation.imagePrompt, onGenerateImage, update]);

  // Mobile: ao selecionar aba no ReactorArc, abre o bottom sheet
  const handleMobileTabSelect = useCallback((id: string) => {
    setActiveTab(id as DockTab);
    setMobileSheetOpen(true);
  }, []);

  const handleExport = useCallback(async () => {
    if (!canvasRef.current) return;
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(canvasRef.current, {
        scale: 2, backgroundColor: null, useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `postspark-${variation.platform}-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Export failed:", err);
    }
  }, [variation.platform]);

  const accentColor = variation.accentColor || "#a855f7";

  // ── Conteúdo de cada aba ──
  const TabContent = () => (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18 }}
        className="space-y-4"
      >
        {/* ── TEXTO ── */}
        {activeTab === "text" && (
          <>
            <Field label="Plataforma">
              <div className="flex gap-1.5 flex-wrap">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => update({ platform: p })}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: variation.platform === p ? `${accentColor}20` : "oklch(1 0 0 / 4%)",
                      border: `1px solid ${variation.platform === p ? `${accentColor}50` : "oklch(1 0 0 / 6%)"}`,
                      color: variation.platform === p ? accentColor : "oklch(0.55 0.03 280)",
                    }}
                  >
                    {PLATFORM_SPECS[p].label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Título">
              <input
                type="text"
                value={variation.headline}
                onChange={(e) => update({ headline: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none input-premium"
                style={{ background: "oklch(0.06 0.02 280)", border: "1px solid oklch(1 0 0 / 12%)", color: "oklch(0.9 0.01 280)" }}
              />
            </Field>
            <Field label="Corpo">
              <textarea
                value={variation.body}
                onChange={(e) => update({ body: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none input-premium"
                style={{ background: "oklch(0.06 0.02 280)", border: "1px solid oklch(1 0 0 / 12%)", color: "oklch(0.9 0.01 280)" }}
              />
            </Field>
            <Field label="Hashtags">
              <input
                type="text"
                value={variation.hashtags.join(", ")}
                onChange={(e) => update({ hashtags: e.target.value.split(",").map((h) => h.trim()).filter(Boolean) })}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none input-premium"
                style={{ background: "oklch(0.06 0.02 280)", border: "1px solid oklch(1 0 0 / 12%)", color: "oklch(0.9 0.01 280)" }}
                placeholder="#tag1, #tag2"
              />
            </Field>
            <Field label="CTA (legenda)">
              <input
                type="text"
                value={variation.callToAction}
                onChange={(e) => update({ callToAction: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none input-premium"
                style={{ background: "oklch(0.06 0.02 280)", border: "1px solid oklch(1 0 0 / 12%)", color: "oklch(0.9 0.01 280)" }}
                placeholder="Descubra mais..."
              />
            </Field>
          </>
        )}

        {/* ── DESIGN ── */}
        {activeTab === "design" && (
          <>
            <Field label="Cor de Fundo">
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => update({ backgroundColor: color })}
                    className="w-8 h-8 rounded-lg transition-all hover:scale-110 active:scale-95"
                    style={{
                      background: color,
                      border: variation.backgroundColor === color
                        ? `2px solid ${accentColor}` : "1px solid oklch(1 0 0 / 15%)",
                      boxShadow: variation.backgroundColor === color
                        ? `0 0 10px ${accentColor}44` : "none",
                    }}
                  />
                ))}
                <label className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-all" style={{ border: "1px dashed oklch(1 0 0 / 20%)" }}>
                  <span className="text-sm" style={{ color: "oklch(0.5 0.03 280)" }}>+</span>
                  <input type="color" value={variation.backgroundColor} onChange={(e) => update({ backgroundColor: e.target.value })} className="sr-only" />
                </label>
              </div>
            </Field>
            <Field label="Cor do Texto">
              <ColorRow value={variation.textColor} onChange={(v) => update({ textColor: v })} />
            </Field>
            <Field label="Cor de Destaque">
              <ColorRow value={variation.accentColor} onChange={(v) => update({ accentColor: v })} />
            </Field>
          </>
        )}

        {/* ── IMAGEM ── */}
        {activeTab === "image" && (
          <>
            {/* Seção: Plano de Fundo */}
            <SectionTitle>Superfície de Fundo</SectionTitle>
            <BackgroundPicker
              currentText={variation.headline}
              value={bgValue}
              overlay={bgOverlay}
              onValueChange={setBgValue}
              onOverlayChange={setBgOverlay}
            />

            {/* Seção: Ajustes de Imagem */}
            <SectionTitle>Calibração Visual</SectionTitle>
            <EditorSlider
              label="Zoom"
              value={imageSettings.zoom}
              min={0.5}
              max={3}
              step={0.05}
              formatValue={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => updateImgSetting("zoom", v)}
            />
            <EditorSlider
              label="Brilho"
              value={imageSettings.brightness}
              min={0}
              max={2}
              step={0.05}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => updateImgSetting("brightness", v)}
            />
            <EditorSlider
              label="Contraste"
              value={imageSettings.contrast}
              min={0}
              max={2}
              step={0.05}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => updateImgSetting("contrast", v)}
            />
            <EditorSlider
              label="Saturação"
              value={imageSettings.saturation}
              min={0}
              max={2}
              step={0.05}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => updateImgSetting("saturation", v)}
            />
            <EditorSlider
              label="Blur"
              value={imageSettings.blur}
              min={0}
              max={20}
              step={0.5}
              formatValue={(v) => `${v}px`}
              onChange={(v) => updateImgSetting("blur", v)}
            />

            {/* Seção: Overlay */}
            <SectionTitle>Sobreposição</SectionTitle>
            <Field label="Cor do overlay">
              <ColorRow
                value={imageSettings.overlayColor}
                onChange={(v) => updateImgSetting("overlayColor", v)}
              />
            </Field>
            <EditorSlider
              label="Opacidade"
              value={imageSettings.overlayOpacity}
              min={0}
              max={1}
              step={0.05}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => updateImgSetting("overlayOpacity", v)}
            />
            <Field label="Blend Mode">
              <select
                value={imageSettings.blendMode}
                onChange={(e) => updateImgSetting("blendMode", e.target.value as ImageSettings["blendMode"])}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none input-premium"
                style={{
                  background: "oklch(0.06 0.02 280)",
                  border: "1px solid oklch(1 0 0 / 12%)",
                  color: "oklch(0.85 0.01 280)",
                }}
              >
                {BLEND_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>

            {/* Seção: Imagem de Fundo */}
            <SectionTitle>Imagem Base</SectionTitle>
            <Field label="Descrição da Imagem">
              <textarea
                value={variation.imagePrompt}
                onChange={(e) => update({ imagePrompt: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none input-premium"
                style={{ background: "oklch(0.06 0.02 280)", border: "1px solid oklch(1 0 0 / 12%)", color: "oklch(0.9 0.01 280)" }}
                placeholder="Descreva a cena visual ideal para este post..."
              />
            </Field>
            <button
              onClick={handleGenerateImage}
              disabled={isGeneratingImg}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50${isGeneratingImg ? " shimmer" : ""}`}
              style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}44`, color: accentColor }}
            >
              {isGeneratingImg ? <><Loader2 size={14} className="animate-spin" /> {imageStageText}</> : <><Sparkles size={14} /> Sintetizar Visual</>}
            </button>
          </>
        )}

        {/* ── LAYOUT ── */}
        {activeTab === "layout" && (
          <>
            {/* Layout base */}
            <Field label="Disposição">
              <div className="grid grid-cols-2 gap-2">
                {LAYOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update({ layout: opt.value })}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-all"
                    style={{
                      background: variation.layout === opt.value ? `${accentColor}18` : "oklch(1 0 0 / 4%)",
                      border: `1px solid ${variation.layout === opt.value ? `${accentColor}44` : "oklch(1 0 0 / 6%)"}`,
                      color: variation.layout === opt.value ? accentColor : "oklch(0.55 0.03 280)",
                    }}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>

            {/* Posicionamento avançado */}
            <SectionTitle>Posicionamento Fino</SectionTitle>

            {/* Toggle Título / Corpo */}
            <div
              className="flex gap-1 p-0.5 rounded-xl"
              style={{ background: "oklch(1 0 0 / 5%)", border: "1px solid oklch(1 0 0 / 8%)" }}
            >
              {(["headline", "body"] as const).map((target) => (
                <button
                  key={target}
                  onClick={() => setLayoutTarget(target)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: layoutTarget === target ? `${accentColor}22` : "transparent",
                    border: `1px solid ${layoutTarget === target ? `${accentColor}44` : "transparent"}`,
                    color: layoutTarget === target ? accentColor : "oklch(0.48 0.03 280)",
                  }}
                >
                  {target === "headline" ? "Título" : "Corpo"}
                </button>
              ))}
            </div>

            {/* Grid 3×3 */}
            <Field label="Posição">
              <PositionGrid
                value={advancedLayout[layoutTarget].position}
                onChange={(pos) => updateLayoutTarget("position", pos)}
                accentColor={accentColor}
              />
            </Field>

            {/* Alinhamento do texto */}
            <Field label="Alinhamento tipográfico">
              <div className="flex gap-2">
                {(["left", "center", "right"] as TextAlignment[]).map((align) => {
                  const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
                  const isActive = advancedLayout[layoutTarget].textAlign === align;
                  return (
                    <button
                      key={align}
                      onClick={() => updateLayoutTarget("textAlign", align)}
                      className="flex-1 flex items-center justify-center py-2 rounded-xl transition-all"
                      style={{
                        background: isActive ? `${accentColor}20` : "oklch(1 0 0 / 4%)",
                        border: `1px solid ${isActive ? `${accentColor}44` : "oklch(1 0 0 / 6%)"}`,
                        color: isActive ? accentColor : "oklch(0.48 0.03 280)",
                      }}
                    >
                      <Icon size={14} />
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Padding */}
            <SectionTitle>Respiro</SectionTitle>
            <EditorSlider
              label="Margem interna"
              value={advancedLayout.padding}
              min={0}
              max={80}
              step={4}
              formatValue={(v) => `${v}px`}
              onChange={(v) =>
                setAdvancedLayout((prev) => ({ ...prev, padding: v }))
              }
            />
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <motion.div
      className="fixed inset-0 flex flex-col"
      style={{ background: "oklch(0.06 0.02 280)" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, filter: "blur(12px)" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {/* Fundo orgânico animado — sutil no editor */}
      <OrganicBackground accentColor={accentColor} intensity={0.22} />

      {/* ── Header ── */}
      <motion.div
        className="relative z-20 flex items-center gap-3 px-4 md:px-5 py-3 shrink-0"
        style={{
          background: "oklch(0.055 0.018 280)",
          borderBottom: "1px solid oklch(1 0 0 / 6%)",
        }}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {/* Voltar */}
        <button
          onClick={onBack}
          className="glass flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium active:scale-95 transition-transform shrink-0"
          style={{ color: "oklch(0.6 0.03 280)" }}
        >
          <ArrowLeft size={15} />
          <span className="hidden sm:inline">Retornar</span>
        </button>

        {/* Título do post — centro */}
        <div className="flex-1 min-w-0 text-center hidden md:block">
          <p
            className="text-[11px] font-medium truncate mx-auto max-w-sm"
            style={{ color: "oklch(0.48 0.03 280)", fontFamily: "var(--font-display)" }}
          >
            {variation.headline || "Editor"}
          </p>
        </div>

        {/* Ações agrupadas à direita */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={handleCopyText}
            className="glass flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium active:scale-95 transition-all"
            style={{ color: "oklch(0.6 0.03 280)" }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span className="hidden sm:inline">{copied ? "Duplicado" : "Duplicar"}</span>
          </button>

          <button
            onClick={handleExport}
            className="glass flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium active:scale-95 transition-all"
            style={{ color: "oklch(0.65 0.1 220)" }}
          >
            <Download size={13} />
            <span className="hidden sm:inline">Exportar</span>
          </button>

          <button
            onClick={() => onSave(variation)}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold active:scale-95 transition-all disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
              color: "oklch(0.08 0.02 280)",
              boxShadow: `inset 0 1px 0 oklch(1 0 0 / 20%), 0 4px 16px ${accentColor}40`,
            }}
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Consolidar
          </button>
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════
          Body: canvas + painel — superfície única
      ══════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden relative">

        {/* ── Canvas stage ── */}
        <div className="md:flex-1 flex flex-col items-center justify-center gap-4 px-6 py-6 shrink-0 md:shrink overflow-hidden relative">

          {/* Névoa de acento — não cria shape, só tinge o ar em volta do card */}
          <motion.div
            className="absolute pointer-events-none"
            style={{
              inset: 0,
              zIndex: 0,
            }}
            animate={{
              background: `radial-gradient(ellipse 55% 50% at 50% 48%, ${accentColor}09 0%, transparent 80%)`,
            }}
            transition={{ duration: 1.8 }}
          />

          {/* Card container */}
          <motion.div
            className={`relative z-10 ${aspectRatio === "9:16"
                ? "w-full max-w-[200px] md:max-w-[260px]"
                : aspectRatio === "5:6"
                  ? "w-full max-w-xs md:max-w-sm"
                  : "w-full max-w-sm md:max-w-lg"
              }`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 280, damping: 26 }}
          >
            {/* Sombra projetada abaixo */}
            <motion.div
              className="absolute pointer-events-none"
              style={{
                bottom: "-20px",
                left: "15%",
                right: "15%",
                height: "32px",
                filter: "blur(18px)",
                borderRadius: "50%",
              }}
              animate={{ background: `${accentColor}22` }}
              transition={{ duration: 1 }}
            />

            {/* Glow ring */}
            <motion.div
              className={`absolute -inset-px rounded-2xl pointer-events-none${showImageFlash ? " flash-gold" : ""}`}
              animate={{ boxShadow: `0 0 0 1px ${accentColor}22, 0 24px 80px ${accentColor}14` }}
              transition={{ duration: 1.2 }}
            />

            {/* Spec label */}
            <div
              className="absolute top-2.5 right-2.5 z-20 px-2 py-0.5 rounded-md text-[9px] font-medium uppercase tracking-wider pointer-events-none"
              style={{ background: "oklch(0 0 0 / 55%)", color: "oklch(0.7 0 0)", backdropFilter: "blur(8px)" }}
            >
              {PLATFORM_SPECS[variation.platform].label}
            </div>

            {/* The actual canvas */}
            <div ref={canvasRef}>
              <PostCard
                variation={variation}
                aspectRatio={aspectRatio}
                imageSettings={imageSettings}
                advancedLayout={activeTab === "layout" ? advancedLayout : undefined}
                bgValue={bgValue}
                bgOverlay={bgOverlay}
              />
            </div>
          </motion.div>

          {/* ── Ratio picker ── */}
          <motion.div
            className="relative z-10 flex items-center gap-0.5 p-0.5 rounded-full"
            style={{ background: "oklch(1 0 0 / 4%)", border: "1px solid oklch(1 0 0 / 7%)" }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {RATIOS.map((r) => {
              const active = r === aspectRatio;
              const iconColor = active ? "oklch(0.08 0 0)" : "oklch(0.45 0.02 280)";
              return (
                <motion.button
                  key={r}
                  onClick={() => setAspectRatio(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors select-none"
                  animate={{
                    background: active ? accentColor : "transparent",
                    color: active ? "oklch(0.08 0 0)" : "oklch(0.45 0.02 280)",
                  }}
                  transition={{ duration: 0.18 }}
                >
                  <RatioIcon ratio={r} size={12} color={iconColor} />
                  {ASPECT_RATIO_LABELS[r].label}
                </motion.button>
              );
            })}
          </motion.div>
        </div>

        {/* ── Divider: linha fina de separação funcional — não barreira visual ── */}
        <div
          className="hidden md:block shrink-0 self-stretch"
          style={{
            width: "1px",
            background: "oklch(1 0 0 / 6%)",
          }}
        />

        {/* ── Painel de edição (desktop only) ── */}
        <motion.div
          className="hidden md:flex md:w-[360px] flex-col shrink-0 overflow-hidden"
          style={{
            background: "oklch(0.055 0.018 280)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          {/* Linha de acento no topo — ecoa a cor do card em curso */}
          <motion.div
            style={{ height: "1px", flexShrink: 0 }}
            animate={{
              background: `linear-gradient(90deg, ${accentColor}50 0%, ${accentColor}20 60%, transparent 100%)`,
            }}
            transition={{ duration: 1.2 }}
          />

          {/* Tab bar */}
          <div
            className="flex items-center shrink-0 px-1 py-1"
            style={{ borderBottom: "1px solid oklch(1 0 0 / 5%)" }}
          >
            {TABS.map(({ id, label, Icon }) => {
              const active = activeTab === id;
              return (
                <motion.button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg text-[11px] font-semibold"
                  animate={{
                    background: active ? `${accentColor}12` : "transparent",
                    color: active ? accentColor : "oklch(0.35 0.025 280)",
                  }}
                  transition={{ duration: 0.15 }}
                >
                  <Icon size={12} />
                  <span>{label}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Tab content — scrollável */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <TabContent />
          </div>
        </motion.div>
      </div>

      {/* ══ MOBILE NAVIGATION (MobileEditSheet) ══ */}
      <div className="md:hidden">
        <MobileEditSheet
          isOpen={mobileSheetOpen}
          onClose={() => setMobileSheetOpen(false)}
          activeTabLabel={TABS.find((t) => t.id === activeTab)?.label}
        >
          <TabContent />
        </MobileEditSheet>
      </div>
    </motion.div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label
        className="block text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "oklch(0.55 0.04 280)", fontFamily: "var(--font-display)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      className="pt-4 pb-1 -mx-4 px-4 text-[10px] font-bold uppercase tracking-widest"
      style={{
        color: "oklch(0.48 0.04 280)",
        borderTop: "1px solid oklch(1 0 0 / 6%)",
        backgroundImage: "linear-gradient(90deg, oklch(1 0 0 / 3%) 0%, transparent 60%)",
        fontFamily: "var(--font-display)",
      }}
    >
      {children}
    </div>
  );
}

function ColorRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0.5"
        style={{ background: "oklch(0.06 0.02 280)", border: "1px solid oklch(1 0 0 / 12%)" }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-3 py-2 rounded-xl text-sm outline-none font-mono input-premium"
        style={{ background: "oklch(0.06 0.02 280)", border: "1px solid oklch(1 0 0 / 12%)", color: "oklch(0.85 0.01 280)" }}
      />
    </div>
  );
}
