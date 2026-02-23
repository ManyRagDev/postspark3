import { useState, useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { ArrowLeft, Layers, Sparkles, ImagePlus, Loader2, Palette, LayoutGrid, AlignJustify, Globe, Check } from "lucide-react";
import type { PostVariation, AspectRatio, TemporaryTheme } from "@shared/postspark";
import { ASPECT_RATIO_LABELS } from "@shared/postspark";
import OrganicBackground from "../OrganicBackground";
import PostCard from "../PostCard";
import RatioIcon from "../RatioIcon";
import StyleSelector from "../StyleSelector";
import type { ThemeConfig } from "@/lib/themes";
import { useAIProcessingStages, useCompletionFlash } from "@/hooks/useAIProcessingStages";

const RATIOS: AspectRatio[] = ["1:1", "5:6", "9:16"];

interface HoloDeckProps {
  variations: PostVariation[];
  onSelect: (variation: PostVariation, options?: { aspectRatio?: AspectRatio; theme?: ThemeConfig }) => void;
  onBack: () => void;
  onGenerateImage: (variation: PostVariation) => void;
  loadingImageId: string | null;
  extractedThemes?: TemporaryTheme[];
  isExtractingStyles?: boolean;
}

type ViewMode = "peek" | "wallet";

// ─── Mini pill: card não-ativo (peek mode) ───────────────────────────────────
function CardPill({
  variation,
  position,
  onClick,
}: {
  variation: PostVariation;
  position: "above" | "below";
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-2xl text-left"
      style={{
        height: 68,
        background: variation.backgroundColor || "#1a1a2e",
        border: `1px solid ${variation.accentColor}28`,
      }}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(120deg, ${variation.backgroundColor || "#1a1a2e"} 30%, ${variation.accentColor}18 100%)`,
        }}
      />
      <div
        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full"
        style={{ background: variation.accentColor || "#a855f7" }}
      />
      <div className="relative z-10 flex items-center gap-3 px-4 h-full">
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold leading-snug truncate"
            style={{ color: variation.textColor || "#ffffff" }}
          >
            {variation.headline}
          </p>
          <p
            className="text-[11px] mt-0.5 truncate"
            style={{ color: `${variation.textColor || "#ffffff"}60` }}
          >
            {variation.tone}
            {variation.hashtags?.[0] ? ` · #${variation.hashtags[0].replace("#", "")}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-base" style={{ color: `${variation.textColor || "#ffffff"}30` }}>
          {position === "above" ? "↑" : "↓"}
        </span>
      </div>
    </motion.button>
  );
}

// ─── Wallet card: um card do deck empilhado ──────────────────────────────────
function WalletCard({
  variation,
  stackIndex, // 0 = topo (ativo), 1 = segundo, 2 = terceiro...
  total,
  onSwipedLeft,
  onSwipedRight,
  isActive,
  aspectRatio,
}: {
  variation: PostVariation;
  stackIndex: number;
  total: number;
  onSwipedLeft: () => void;
  onSwipedRight: () => void;
  isActive: boolean;
  aspectRatio?: AspectRatio;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-18, 0, 18]);
  const cardOpacity = useTransform(x, [-200, -120, 0, 120, 200], [0, 0.6, 1, 0.6, 0]);
  const overlayBg = useTransform(
    x,
    [-60, 0, 60],
    ["rgba(239,68,68,0.18)", "rgba(0,0,0,0)", "rgba(34,197,94,0.18)"]
  );

  // Cards de baixo ficam mais recuados
  const yOffset = stackIndex * 14;
  const scaleVal = 1 - stackIndex * 0.06;
  const opacityVal = 1 - stackIndex * 0.22;

  if (!isActive) {
    return (
      <motion.div
        className="absolute w-full"
        style={{ top: 0 }}
        animate={{
          y: yOffset,
          scale: scaleVal,
          opacity: opacityVal,
          zIndex: total - stackIndex,
        }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
      >
        <PostCard variation={variation} aspectRatio={aspectRatio} />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="absolute w-full cursor-grab active:cursor-grabbing"
      style={{ x, rotate, opacity: cardOpacity, zIndex: total + 1, top: 0 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragEnd={(_, info) => {
        if (info.offset.x < -80) onSwipedLeft();
        else if (info.offset.x > 80) onSwipedRight();
      }}
      whileDrag={{ scale: 0.97 }}
      animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      {/* Feedback de direção: vermelho esquerda, verde direita */}
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none z-10"
        style={{ background: overlayBg }}
      />
      <PostCard variation={variation} aspectRatio={aspectRatio} />
    </motion.div>
  );
}

// ─── Action bar (compartilhada entre os dois modos) ──────────────────────────
function ActionBar({
  variation,
  loadingImageId,
  onGenerateImage,
  onSelect,
  onOpenStyles,
  isDraggingRef,
  imageStageText,
}: {
  variation: PostVariation;
  loadingImageId: string | null;
  onGenerateImage: () => void;
  onSelect: () => void;
  onOpenStyles: () => void;
  isDraggingRef: MutableRefObject<boolean>;
  imageStageText: string;
}) {
  const isLoading = loadingImageId === variation.id;
  return (
    <div
      className="glass flex items-center rounded-2xl overflow-hidden shrink-0"
    >
      <button
        onClick={onGenerateImage}
        disabled={isLoading}
        className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-40${isLoading ? " shimmer" : ""}`}
        style={{ color: "oklch(0.68 0.12 40)", borderRight: "1px solid oklch(1 0 0 / 7%)" }}
      >
        {isLoading ? (
          <><Loader2 size={13} className="animate-spin" /> {imageStageText}</>
        ) : (
          <><ImagePlus size={13} /> Sintetizar visual</>
        )}
      </button>

      <button
        onClick={() => { if (!isDraggingRef.current) onSelect(); }}
        data-tour="select-variation"
        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors hover:bg-white/5"
        style={{ color: "oklch(0.75 0.14 160)", borderRight: "1px solid oklch(1 0 0 / 7%)" }}
      >
        <Sparkles size={13} />
        Selecionar
      </button>

      <button
        onClick={onOpenStyles}
        data-tour="open-styles"
        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors hover:bg-white/5"
        style={{ color: "oklch(0.65 0.1 280)" }}
      >
        <Palette size={13} />
        Estilo visual
      </button>
    </div>
  );
}

// ─── Extracted Theme Card ────────────────────────────────────────────────────
function ExtractedThemeCard({
  theme,
  isSelected,
  onSelect,
}: {
  theme: TemporaryTheme;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      onClick={onSelect}
      className="w-full text-left rounded-xl overflow-hidden transition-all"
      style={{
        background: theme.colors.bg,
        border: `2px solid ${isSelected ? theme.colors.accent : "transparent"}`,
        boxShadow: isSelected ? `0 0 20px ${theme.colors.accent}44` : "none",
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="p-3" style={{ background: `${theme.colors.bg}dd` }}>
        <div className="flex items-center gap-2 mb-1.5">
          <Globe size={12} style={{ color: theme.colors.accent }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.colors.accent }}>
            Extraído do site
          </span>
        </div>
        <p className="text-xs font-semibold truncate" style={{ color: theme.colors.text }}>
          {theme.label}
        </p>
        <p className="text-[10px] mt-0.5 truncate" style={{ color: `${theme.colors.text}88` }}>
          {theme.designPattern.category}
        </p>
        <div className="flex items-center gap-1 mt-2">
          <div
            className="w-4 h-4 rounded-full shrink-0 ring-1 ring-white/20"
            style={{ background: theme.colors.accent || "#f59e0b" }}
            title="Accent"
          />
          <div
            className="w-4 h-4 rounded-full shrink-0 ring-1 ring-white/20"
            style={{ background: theme.colors.bg || "#ffffff" }}
            title="Background"
          />
          <div
            className="w-4 h-4 rounded-full shrink-0 ring-1 ring-white/20"
            style={{ background: theme.colors.text || "#1f2937" }}
            title="Text"
          />
          <div
            className="w-4 h-4 rounded-full shrink-0 ring-1 ring-white/20"
            style={{ background: theme.colors.surface || "#8b5cf6" }}
            title="Surface"
          />
        </div>
      </div>
      {isSelected && (
        <motion.div
          className="absolute top-1.5 right-1.5 p-0.5 rounded-full"
          style={{ background: theme.colors.accent }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
        >
          <Check size={10} style={{ color: theme.colors.bg }} />
        </motion.div>
      )}
    </motion.button>
  );
}

// ─── HoloDeck ─────────────────────────────────────────────────────────────────
export default function HoloDeck({
  variations,
  onSelect,
  onBack,
  onGenerateImage,
  loadingImageId,
  extractedThemes = [],
  isExtractingStyles = false,
}: HoloDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("peek");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [isStyleSelectorOpen, setIsStyleSelectorOpen] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeConfig | undefined>(undefined);
  const isDragging = useRef(false);

  const { stageText: imageStageText } = useAIProcessingStages({
    isActive: loadingImageId !== null,
    preset: "image",
  });
  const showImageFlash = useCompletionFlash(loadingImageId !== null);

  const activeVariation = variations[currentIndex];
  const accentColor = activeVariation?.accentColor || "#a855f7";
  const prevIndex = (currentIndex - 1 + variations.length) % variations.length;
  const nextIndex = (currentIndex + 1) % variations.length;

  // Card max-width alinhado com as dimensões do Workbench (360px base em todos os formatos)
  // para garantir que o preview seja fiel ao que aparece no editor
  const cardMaxW = aspectRatio === "9:16" ? "max-w-[280px] md:max-w-[360px]"
    : aspectRatio === "5:6" ? "max-w-[300px] md:max-w-[360px]"
      : "max-w-[320px] md:max-w-[360px]";

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % variations.length);
  }, [variations.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + variations.length) % variations.length);
  }, [variations.length]);

  const toggleMode = useCallback(() => {
    setViewMode((m) => (m === "peek" ? "wallet" : "peek"));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") goNext();
      if (e.key === "ArrowUp") goPrev();
      if (e.key === "ArrowRight") viewMode === "peek" ? toggleMode() : goNext();
      if (e.key === "ArrowLeft") viewMode === "peek" ? undefined : goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, toggleMode, viewMode]);

  // Cards visíveis no wallet: ativo + 2 embaixo
  const walletVisible = [0, 1, 2].map((offset) => ({
    index: (currentIndex + offset) % variations.length,
    stackIndex: offset,
  }));

  return (
    <motion.div
      className="fixed inset-0 flex flex-col"
      style={{ background: "oklch(0.05 0.02 280)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: "blur(24px)" }}
      transition={{ duration: 0.4 }}
    >
      {/* Fundo orgânico animado — intensidade alta para dar vida à tela */}
      <OrganicBackground accentColor={accentColor} intensity={0.9} />

      {/* Glow radial central que reage à cor do card ativo */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          background: `radial-gradient(ellipse 70% 60% at 40% 50%, ${accentColor}22 0%, transparent 70%)`,
        }}
        transition={{ duration: 1.6, ease: "easeInOut" }}
      />

      {/* Grain */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "160px 160px",
          opacity: 0.028,
        }}
      />

      {/* ── Header ── */}
      <motion.div
        className="relative z-30 flex items-center justify-between px-5 pt-5 pb-2 shrink-0"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.38 }}
      >
        <button
          onClick={onBack}
          className="glass flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium active:scale-95 transition-transform"
          style={{ color: "oklch(0.6 0.03 280)" }}
        >
          <ArrowLeft size={15} />
          Retornar
        </button>

        {/* Counter */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{
            background: "oklch(1 0 0 / 5%)",
            border: "1px solid oklch(1 0 0 / 8%)",
          }}
        >
          <Layers size={12} style={{ color: accentColor }} />
          <span className="text-xs font-medium" style={{ color: "oklch(0.65 0.03 280)" }}>
            {currentIndex + 1}
            <span style={{ color: "oklch(0.35 0.02 280)" }}> / {variations.length}</span>
          </span>
        </div>

        {/* Ratio picker — visível apenas no mobile (no desktop fica na sidebar) */}
        <div
          className="flex md:hidden items-center gap-0.5 p-0.5 rounded-full"
          style={{ background: "oklch(1 0 0 / 6%)", border: "1px solid oklch(1 0 0 / 9%)" }}
        >
          {RATIOS.map((r) => {
            const active = r === aspectRatio;
            const iconColor = active ? "oklch(0.08 0 0)" : "oklch(0.45 0.02 280)";
            return (
              <motion.button
                key={r}
                data-tour={`ratio-${r}`}
                onClick={() => setAspectRatio(r)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors select-none"
                animate={{
                  background: active ? accentColor : "transparent",
                  color: active ? "oklch(0.08 0 0)" : "oklch(0.45 0.02 280)",
                }}
                transition={{ duration: 0.18 }}
              >
                <RatioIcon ratio={r} size={10} color={iconColor} />
                {ASPECT_RATIO_LABELS[r].label}
              </motion.button>
            );
          })}
        </div>

        {/* Desktop: espaço para alinhar header (sidebar cobre o lado direito) */}
        <div className="hidden md:block w-16" />
      </motion.div>

      {/* ── Wrapper desktop: card (flex-1) + sidebar (w-72) ── */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">

        {/* ─────────────────────────────────────────────────
          ÁREA DO CARD (mobile: full width, desktop: flex-1)
          Desktop: conteúdo alinhado à direita para ficar perto da sidebar
      ───────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto md:overflow-hidden">

          {/* ─────────────────────────────────────────────────
          MODO PEEK STACK (padrão)
      ───────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {viewMode === "peek" && (
              <motion.div
                key="peek"
                className="flex-1 flex flex-col items-center justify-center px-5 gap-2.5 min-h-0 overflow-y-auto"
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -60 }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                // Swipe horizontal no container = troca para modo wallet
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.1}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -70) setViewMode("wallet");
                }}
              >
                {/* Pill anterior */}
                <motion.div
                  className={`w-full ${cardMaxW} shrink-0`}
                  key={`prev-${prevIndex}`}
                  initial={{ opacity: 0, y: -18 }}
                  animate={{ opacity: 0.75, y: 0 }}
                  transition={{ type: "spring", stiffness: 340, damping: 32 }}
                >
                  <CardPill variation={variations[prevIndex]} position="above" onClick={goPrev} />
                </motion.div>

                {/* Card visual ativo */}
                <motion.div
                  key={`card-${currentIndex}`}
                  className={`w-full ${cardMaxW} shrink-0 relative cursor-grab active:cursor-grabbing`}
                  initial={{ opacity: 0, scale: 0.88, y: 28 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={0.22}
                  onDragStart={() => { isDragging.current = true; }}
                  onDragEnd={(_, info) => {
                    isDragging.current = false;
                    if (info.offset.y < -52) goNext();
                    else if (info.offset.y > 52) goPrev();
                  }}
                  whileDrag={{ scale: 0.975 }}
                >
                  <motion.div
                    className={`absolute -inset-px rounded-2xl pointer-events-none${showImageFlash ? " flash-gold" : ""}`}
                    animate={{ boxShadow: `0 0 0 1px ${accentColor}38, 0 20px 70px ${accentColor}22` }}
                    transition={{ duration: 1.2, ease: "easeInOut" }}
                  />
                  <PostCard variation={activeVariation} theme={selectedTheme} aspectRatio={aspectRatio} />
                </motion.div>

                {/* Action bar */}
                <motion.div
                  key={`actions-${currentIndex}`}
                  className={`w-full ${cardMaxW} shrink-0`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, type: "spring", stiffness: 280, damping: 28 }}
                >
                  <ActionBar
                    variation={activeVariation}
                    loadingImageId={loadingImageId}
                    onGenerateImage={() => onGenerateImage(activeVariation)}
                    onSelect={() => onSelect(activeVariation, { aspectRatio, theme: selectedTheme })}
                    onOpenStyles={() => setIsStyleSelectorOpen(true)}
                    isDraggingRef={isDragging}
                    imageStageText={imageStageText}
                  />
                </motion.div>

                {/* Pill próximo */}
                <motion.div
                  className={`w-full ${cardMaxW} shrink-0`}
                  key={`next-${nextIndex}`}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 0.75, y: 0 }}
                  transition={{ type: "spring", stiffness: 340, damping: 32 }}
                >
                  <CardPill variation={variations[nextIndex]} position="below" onClick={goNext} />
                </motion.div>

                {/* Hint de swipe lateral (só aparece brevemente) */}
                <motion.div
                  className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 pointer-events-none"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 0.3, x: 0 }}
                  transition={{ delay: 2, duration: 0.5 }}
                >
                  <span className="text-lg" style={{ color: "oklch(0.5 0.03 280)" }}>›</span>
                  <span className="text-[9px] writing-vertical" style={{ color: "oklch(0.35 0.02 280)", writingMode: "vertical-rl" }}>
                    deck
                  </span>
                </motion.div>
              </motion.div>
            )}

            {/* ─────────────────────────────────────────────────
            MODO WALLET DECK (Tinder-style)
        ───────────────────────────────────────────────── */}
            {viewMode === "wallet" && (
              <motion.div
                key="wallet"
                className="flex-1 flex flex-col items-center justify-center px-5 gap-4 min-h-0 overflow-y-auto"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
              >
                {/* Stack de cards — proporção dinâmica + overflow para cards deslocados aparecerem */}
                <div
                  className={`relative w-full ${cardMaxW} overflow-visible`}
                  style={{ aspectRatio: aspectRatio === "1:1" ? "1/1" : aspectRatio === "5:6" ? "5/6" : "9/16" }}
                >
                  {/* Render de baixo para cima para z-index correto */}
                  {[...walletVisible].reverse().map(({ index, stackIndex }) => (
                    <WalletCard
                      key={`wallet-${index}-${currentIndex}`}
                      variation={variations[index]}
                      stackIndex={stackIndex}
                      total={3}
                      isActive={stackIndex === 0}
                      onSwipedLeft={goNext}
                      onSwipedRight={goPrev}
                      aspectRatio={aspectRatio}
                    />
                  ))}
                </div>

                {/* Action bar */}
                <motion.div
                  className={`w-full ${cardMaxW} shrink-0 mt-4`}
                  key={`wallet-actions-${currentIndex}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 280, damping: 28 }}
                >
                  <ActionBar
                    variation={activeVariation}
                    loadingImageId={loadingImageId}
                    onGenerateImage={() => onGenerateImage(activeVariation)}
                    onSelect={() => onSelect(activeVariation, { aspectRatio, theme: selectedTheme })}
                    onOpenStyles={() => setIsStyleSelectorOpen(true)}
                    isDraggingRef={isDragging}
                    imageStageText={imageStageText}
                  />
                </motion.div>

                {/* Hint de swipe */}
                <motion.p
                  className="text-[11px] text-center shrink-0"
                  style={{ color: "oklch(0.35 0.02 280)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  Deslize para navegar entre variações
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Barra inferior: switch de modo + dots ── */}
          <motion.div
            className="relative z-30 flex flex-col items-center gap-3 pt-2 pb-5 shrink-0 md:pb-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {/* Switch pill de modo */}
            <button
              onClick={toggleMode}
              className="relative flex items-center rounded-full p-0.5"
              style={{
                background: "oklch(1 0 0 / 7%)",
                border: "1px solid oklch(1 0 0 / 10%)",
                backdropFilter: "blur(12px)",
              }}
            >
              {/* Thumb animado */}
              <motion.div
                className="absolute rounded-full"
                style={{ height: "calc(100% - 4px)", top: 2 }}
                animate={{
                  left: viewMode === "peek" ? 2 : "50%",
                  width: "50%",
                  background: accentColor,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />

              {/* Label Pilha */}
              <span
                className="relative z-10 flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-full transition-colors select-none"
                style={{
                  color: viewMode === "peek" ? "oklch(0.08 0 0)" : "oklch(0.5 0.02 280)",
                }}
              >
                <AlignJustify size={12} />
                Pilha
              </span>

              {/* Label Deck */}
              <span
                className="relative z-10 flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-full transition-colors select-none"
                style={{
                  color: viewMode === "wallet" ? "oklch(0.08 0 0)" : "oklch(0.5 0.02 280)",
                }}
              >
                <LayoutGrid size={12} />
                Deck
              </span>
            </button>

            {/* Dots de navegação entre cards */}
            <div className="flex items-center gap-1.5">
              {variations.map((_, i) => (
                <motion.button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className="rounded-full"
                  animate={{
                    width: i === currentIndex ? 24 : 6,
                    height: 6,
                    background: i === currentIndex ? accentColor : "oklch(1 0 0 / 14%)",
                    opacity: i === currentIndex ? 1 : 0.45,
                  }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              ))}
            </div>
          </motion.div>

        </div> {/* /card area */}

        {/* ── SIDEBAR DESKTOP (oculta em mobile) ── */}
        <motion.aside
          className="hidden md:flex flex-col w-80 shrink-0 overflow-y-auto rounded-l-2xl mt-2 mb-2 mr-2"
          style={{
            background: "linear-gradient(135deg, oklch(0.10 0.03 280 / 55%), oklch(0.06 0.02 280 / 70%))",
            backdropFilter: "blur(32px)",
            border: "1px solid oklch(1 0 0 / 6%)",
            boxShadow: "inset 0 1px 0 oklch(1 0 0 / 6%)",
          }}
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 280, damping: 30 }}
        >
          {/* Barra de acento no topo da sidebar — conecta visualmente ao card */}
          <motion.div
            className="shrink-0 h-0.5 w-full"
            animate={{ background: `linear-gradient(90deg, ${accentColor}90, transparent)` }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />

          {/* Info do card ativo */}
          <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid oklch(1 0 0 / 5%)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "oklch(0.4 0.03 280)", fontFamily: "var(--font-display)" }}>
              Variação {currentIndex + 1} de {variations.length}
            </p>
            <p className="text-sm font-semibold leading-snug" style={{ color: "oklch(0.88 0.01 280)" }}>
              {activeVariation.headline}
            </p>
            <p className="text-[11px] mt-1.5 line-clamp-2" style={{ color: "oklch(0.55 0.03 280)" }}>
              {activeVariation.body}
            </p>
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              {activeVariation.hashtags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: `${activeVariation.accentColor}15`,
                    color: activeVariation.accentColor,
                    border: `1px solid ${activeVariation.accentColor}30`,
                  }}
                >
                  #{tag.replace("#", "")}
                </span>
              ))}
            </div>
          </div>

          {/* Ratio picker — desktop only */}
          <div className="px-5 py-4" style={{ borderBottom: "1px solid oklch(1 0 0 / 5%)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "oklch(0.4 0.03 280)", fontFamily: "var(--font-display)" }}>
              Proporção
            </p>
            <div className="flex gap-2">
              {RATIOS.map((r) => {
                const active = r === aspectRatio;
                const iconColor = active ? "oklch(0.08 0 0)" : "oklch(0.5 0.02 280)";
                return (
                  <motion.button
                    key={r}
                    data-tour={`ratio-${r}`}
                    onClick={() => setAspectRatio(r)}
                    className="flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-xl text-[11px] font-semibold"
                    animate={{
                      background: active ? accentColor : "oklch(1 0 0 / 5%)",
                      color: active ? "oklch(0.08 0 0)" : "oklch(0.5 0.02 280)",
                      border: active ? `1px solid ${accentColor}` : "1px solid oklch(1 0 0 / 8%)",
                    }}
                    transition={{ duration: 0.18 }}
                  >
                    <RatioIcon ratio={r} size={14} color={iconColor} />
                    {ASPECT_RATIO_LABELS[r].label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Ações principais — desktop vertical */}
          <div className="px-5 py-4 flex flex-col gap-2.5" style={{ borderBottom: "1px solid oklch(1 0 0 / 5%)" }}>
            {/* Usar este — destaque */}
            <motion.button
              onClick={() => { if (!isDragging.current) onSelect(activeVariation, { aspectRatio, theme: selectedTheme }); }}
              data-tour="select-variation"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
              style={{ background: accentColor, color: "oklch(0.08 0 0)", boxShadow: `inset 0 1px 0 oklch(1 0 0 / 18%), 0 4px 16px ${accentColor}44` }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Sparkles size={15} />
              Selecionar este
            </motion.button>

            {/* Gerar imagem */}
            <button
              onClick={() => onGenerateImage(activeVariation)}
              disabled={loadingImageId === activeVariation.id}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all disabled:opacity-40${loadingImageId === activeVariation.id ? " shimmer" : ""}`}
              style={{
                background: "oklch(1 0 0 / 6%)",
                border: "1px solid oklch(1 0 0 / 9%)",
                color: "oklch(0.68 0.12 40)",
              }}
            >
              {loadingImageId === activeVariation.id ? (
                <><Loader2 size={13} className="animate-spin" /> {imageStageText}</>
              ) : (
                <><ImagePlus size={13} /> Sintetizar visual</>
              )}
            </button>

            {/* Estilo */}
            <button
              onClick={() => setIsStyleSelectorOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all"
              style={{
                background: "oklch(1 0 0 / 5%)",
                border: "1px solid oklch(1 0 0 / 8%)",
                color: "oklch(0.65 0.1 280)",
              }}
            >
              <Palette size={13} />
              Estilo visual
            </button>
          </div>

          {/* Extracted Styles Section - Only shown when URL input */}
          {extractedThemes.length > 0 && (
            <div className="px-5 py-4" style={{ borderBottom: "1px solid oklch(1 0 0 / 5%)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "oklch(0.4 0.03 280)", fontFamily: "var(--font-display)" }}>
                <Globe size={10} className="inline mr-1" />
                Estilos do Site
              </p>
              <div className="flex flex-col gap-2">
                {extractedThemes.map((theme) => (
                  <ExtractedThemeCard
                    key={theme.id}
                    theme={theme}
                    isSelected={selectedTheme?.id === theme.id}
                    onSelect={() => setSelectedTheme(theme as ThemeConfig)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Loading indicator for style extraction */}
          {isExtractingStyles && (
            <div className="px-5 py-4" style={{ borderBottom: "1px solid oklch(1 0 0 / 5%)" }}>
              <div className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" style={{ color: accentColor }} />
                <p className="text-[10px] font-medium" style={{ color: "oklch(0.5 0.03 280)" }}>
                  Extraindo estilos do site...
                </p>
              </div>
            </div>
          )}

          {/* Navegação entre variações */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "oklch(0.4 0.03 280)", fontFamily: "var(--font-display)" }}>
              Variações
            </p>
            <div className="flex flex-col gap-1.5">
              {variations.map((v, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all"
                  style={{
                    background: i === currentIndex ? `${accentColor}15` : "transparent",
                    border: `1px solid ${i === currentIndex ? `${accentColor}35` : "oklch(1 0 0 / 6%)"}`,
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: i === currentIndex ? accentColor : "oklch(1 0 0 / 20%)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: i === currentIndex ? "oklch(0.88 0.01 280)" : "oklch(0.55 0.03 280)" }}>
                      {v.headline}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: "oklch(0.4 0.02 280)" }}>
                      {v.tone}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </motion.aside>

      </div> {/* /wrapper desktop */}

      <StyleSelector
        isOpen={isStyleSelectorOpen}
        onClose={() => setIsStyleSelectorOpen(false)}
        onSelect={(theme) => setSelectedTheme(theme)}
        currentThemeId={selectedTheme?.id}
      />
    </motion.div>
  );
}
