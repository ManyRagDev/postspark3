import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, animate } from "framer-motion";
import { ChevronLeft, X, Check, Sparkles } from "lucide-react";
import type { CanvasPostModel } from "./types";

interface RadialTextureSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  post: CanvasPostModel;
  onApplyBackground: (url?: string) => void;
  manifestData: any;
  applyToAllSlides?: boolean;
}

interface CategoryItem {
  key: string;
  label: string;
  description: string;
  icon: string;
  images: string[];
}

interface TextureItem {
  id: string;
  path: string;
  fullUrl: string;
  name: string;
  categoryKey: string;
}

export default function RadialTextureSelector({
  isOpen,
  onClose,
  post,
  onApplyBackground,
  manifestData,
}: RadialTextureSelectorProps) {
  // Nível: 1 = Temas/Categorias, 2 = Texturas da categoria
  const [level, setLevel] = useState<1 | 2>(1);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>("luxo-exclusivo");

  // Rastreamento da textura ativa no post
  const currentSlide = post.slides[post.currentSlideIndex];
  const activeBg = currentSlide?.bgImage || post.bgImage;

  // Processa as categorias do manifest
  const categories: CategoryItem[] = useMemo(() => {
    if (!manifestData?.categories) return [];
    return Object.entries(manifestData.categories).map(([key, cat]: [string, any]) => ({
      key,
      label: cat.label || key,
      description: cat.description || "",
      icon: cat.icon || "✨",
      images: Array.isArray(cat.images) ? cat.images : [],
    }));
  }, [manifestData]);

  // Lista de texturas da categoria ativa
  const currentTextures: TextureItem[] = useMemo(() => {
    const cat = categories.find((c) => c.key === selectedCategoryKey);
    if (!cat) return [];
    return cat.images.map((imgPath, idx) => {
      const cleanName = imgPath
        .split("/")
        .pop()
        ?.replace(/^emanueljunior_/, "")
        ?.replace(/_[a-f0-9-]{36}_d.webp$/i, "")
        ?.replace(/_/g, " ") || `Textura ${idx + 1}`;

      return {
        id: `${cat.key}-${idx}`,
        path: imgPath,
        fullUrl: `/images/backgrounds/${imgPath}`,
        name: cleanName,
        categoryKey: cat.key,
      };
    });
  }, [categories, selectedCategoryKey]);

  // Altura fixa entre os itens no dial
  const itemHeight = 54;
  const radius = 240;

  // Total de itens ativos no nível atual
  const activeTotal = level === 1 ? categories.length : currentTextures.length;

  // Motion value para a posição Y do dial
  const dragY = useMotionValue(0);
  const smoothY = useSpring(dragY, { stiffness: 350, damping: 30, mass: 0.5 });

  // Índice focado no centro
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Rastreia e trava o item focado
  useEffect(() => {
    const unsubscribe = smoothY.on("change", (val) => {
      const idx = Math.round(-val / itemHeight);
      const clamped = Math.max(0, Math.min(activeTotal - 1, idx));
      setFocusedIndex(clamped);
    });
    return () => unsubscribe();
  }, [smoothY, activeTotal, itemHeight]);

  // Reseta a posição suavemente ao trocar de nível
  useEffect(() => {
    dragY.set(0);
    setFocusedIndex(0);
  }, [level, selectedCategoryKey, dragY]);

  // Controle de Arraste com Limites Rígidos e Elasticidade Segura
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const initialDragYRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    initialDragYRef.current = dragY.get();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaY = e.clientY - startYRef.current;
    const rawTarget = initialDragYRef.current + deltaY;

    const minBound = -(activeTotal - 1) * itemHeight;
    const maxBound = 0;

    // Aplica resistência elástica se puxar além das pontas
    if (rawTarget > maxBound) {
      dragY.set(maxBound + (rawTarget - maxBound) * 0.25);
    } else if (rawTarget < minBound) {
      dragY.set(minBound + (rawTarget - minBound) * 0.25);
    } else {
      dragY.set(rawTarget);
    }
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const minBound = -(activeTotal - 1) * itemHeight;
    const maxBound = 0;
    const current = dragY.get();

    // Encaixa com ímã no índice válido mais próximo
    let targetIndex = Math.round(-current / itemHeight);
    targetIndex = Math.max(0, Math.min(activeTotal - 1, targetIndex));

    const snapTarget = -targetIndex * itemHeight;
    animate(dragY, snapTarget, {
      type: "spring",
      stiffness: 400,
      damping: 32,
    });
  };

  const scrollToItem = useCallback(
    (index: number) => {
      const target = -index * itemHeight;
      animate(dragY, target, {
        type: "spring",
        stiffness: 400,
        damping: 32,
      });
    },
    [dragY, itemHeight]
  );

  if (!isOpen) return null;

  const activeCategory =
    categories[level === 1 ? focusedIndex : categories.findIndex((c) => c.key === selectedCategoryKey)] ||
    categories[0];
  const activeTexture = currentTextures[focusedIndex] || currentTextures[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className="absolute inset-0 bg-[#06080D] z-50 flex flex-col justify-between p-3 select-none overflow-hidden"
      >
        {/* ─── 1. BARRA SUPERIOR DE NAVEGAÇÃO ─── */}
        <div className="flex items-center justify-between z-20 pb-2 border-b border-white/10 shrink-0">
          {level === 2 ? (
            <button
              type="button"
              onClick={() => {
                setLevel(1);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              <ChevronLeft size={15} className="text-[oklch(0.78_0.22_48)]" />
              <span>Temas</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[oklch(0.78_0.22_48)]/15 border border-[oklch(0.78_0.22_48)]/30 flex items-center justify-center">
                <Sparkles size={13} className="text-[oklch(0.78_0.22_48)]" />
              </div>
              <span className="text-xs font-bold text-white tracking-wide">
                Catálogo de Texturas HD
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/40 uppercase bg-white/4 px-2 py-0.5 rounded-md border border-white/6">
              {level === 1 ? `${categories.length} Temas` : `${currentTextures.length} Fotos`}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white cursor-pointer active:scale-90"
              title="Fechar Catálogo"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ─── 2. ÁREA CENTRAL (MINIATURA DE FOCO À ESQUERDA + DIAL À DIREITA) ─── */}
        <div className="relative flex-1 w-full flex items-center justify-between overflow-hidden my-1">
          {/* A) LADO ESQUERDO: LENTE DE VISUALIZAÇÃO / CARD DE FOCO */}
          <div className="w-[38%] flex flex-col justify-center items-center z-10 pointer-events-auto">
            {level === 1 && activeCategory && (
              <motion.div
                key={activeCategory.key}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="w-full space-y-2 p-2.5 rounded-2xl bg-white/4 border border-white/10 backdrop-blur-md shadow-xl text-center flex flex-col items-center"
              >
                <span className="text-2xl">{activeCategory.icon}</span>
                <div>
                  <h4 className="text-xs font-bold text-white leading-tight">
                    {activeCategory.label}
                  </h4>
                  <span className="text-[9px] font-mono text-[oklch(0.78_0.22_48)] font-bold">
                    {activeCategory.images.length} Texturas
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryKey(activeCategory.key);
                    setLevel(2);
                  }}
                  className="w-full py-1.5 px-2 rounded-xl text-[10px] font-bold text-black flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
                  }}
                >
                  <span>Explorar</span>
                  <span>➔</span>
                </button>
              </motion.div>
            )}

            {/* NÍVEL 2: MINIATURA GRANDE EM ALTA DEFINIÇÃO DO FUNDO EM FOCO */}
            {level === 2 && activeTexture && (
              <motion.div
                key={activeTexture.id}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="w-full flex flex-col items-center justify-center p-2 rounded-2xl bg-white/4 border border-white/10 backdrop-blur-md shadow-xl"
              >
                <div
                  onClick={() => onApplyBackground(activeTexture.fullUrl)}
                  className="relative w-full aspect-square max-w-[105px] rounded-xl overflow-hidden border border-white/20 shadow-lg cursor-pointer group active:scale-95 transition-transform"
                >
                  <img
                    src={activeTexture.fullUrl}
                    alt={activeTexture.name}
                    className="w-full h-full object-cover"
                  />
                  {activeBg === activeTexture.fullUrl && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-[oklch(0.78_0.22_48)] flex items-center justify-center text-black shadow-md">
                        <Check size={14} className="stroke-[3]" />
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-3 pb-1 px-1 text-center">
                    <span className="text-[8.5px] font-mono text-white font-semibold block truncate">
                      {activeBg === activeTexture.fullUrl ? "● Ativo" : "Toque p/ Vestir"}
                    </span>
                  </div>
                </div>
                <span className="text-[9.5px] font-semibold text-white/90 text-center mt-1.5 line-clamp-1 max-w-[105px]">
                  {activeTexture.name}
                </span>
              </motion.div>
            )}
          </div>

          {/* B) GUIA VISUAL SVG DO ARCO À DIREITA */}
          <svg
            className="pointer-events-none absolute right-0 top-0 h-full w-[170px] z-0 overflow-visible opacity-30"
            viewBox="0 0 170 260"
          >
            <defs>
              <linearGradient id="arcGlowInverted" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="oklch(0.78 0.22 48)" stopOpacity="0.05" />
                <stop offset="50%" stopColor="oklch(0.78 0.22 48)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="oklch(0.78 0.22 48)" stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <path
              d="M 155 15 Q 85 130 155 245"
              fill="none"
              stroke="url(#arcGlowInverted)"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          </svg>

          {/* C) LADO DIREITO: DIAL RADIAL SEM COLISÃO */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative w-[60%] h-full flex items-center justify-end overflow-hidden touch-none cursor-grab active:cursor-grabbing"
          >
            {/* NÍVEL 1: TEMAS */}
            {level === 1 &&
              categories.map((cat, idx) => {
                return (
                  <RadialCategoryItem
                    key={cat.key}
                    index={idx}
                    item={cat}
                    smoothY={smoothY}
                    itemHeight={itemHeight}
                    radius={radius}
                    isCenterFocused={focusedIndex === idx}
                    onSelect={() => {
                      scrollToItem(idx);
                      setSelectedCategoryKey(cat.key);
                      setLevel(2);
                    }}
                  />
                );
              })}

            {/* NÍVEL 2: TEXTURAS */}
            {level === 2 &&
              currentTextures.map((tex, idx) => {
                const isApplied = activeBg === tex.fullUrl;
                return (
                  <RadialTextureThumbnail
                    key={tex.id}
                    index={idx}
                    item={tex}
                    isApplied={isApplied}
                    smoothY={smoothY}
                    itemHeight={itemHeight}
                    radius={radius}
                    isCenterFocused={focusedIndex === idx}
                    onSelect={() => {
                      scrollToItem(idx);
                      onApplyBackground(tex.fullUrl);
                    }}
                  />
                );
              })}
          </div>
        </div>

        {/* ─── 3. RODAPÉ DE CONTROLES ─── */}
        <div className="flex items-center justify-between text-[11px] text-white/50 pt-2 border-t border-white/10 shrink-0 z-20">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.78_0.22_48)] animate-pulse" />
            <span>Deslize no arco para navegar</span>
          </div>

          {activeBg && (
            <button
              type="button"
              onClick={() => onApplyBackground(undefined)}
              className="text-rose-400 hover:text-rose-300 font-bold cursor-pointer transition-colors"
            >
              Remover Fundo
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── ITEM DE CATEGORIA (NÍVEL 1) ──────────────────────────────────────────────
function RadialCategoryItem({
  index,
  item,
  smoothY,
  itemHeight,
  radius,
  isCenterFocused,
  onSelect,
}: {
  index: number;
  item: CategoryItem;
  smoothY: any;
  itemHeight: number;
  radius: number;
  isCenterFocused: boolean;
  onSelect: () => void;
}) {
  const y = useTransform(smoothY, (val: number) => {
    return index * itemHeight + val;
  });

  const x = useTransform(y, (yPos: number) => {
    const normalizedAngle = (yPos / radius) * 1.1;
    return -(Math.cos(normalizedAngle) - 0.25) * 65;
  });

  const scale = useTransform(y, (yPos: number) => {
    const dist = Math.abs(yPos);
    return Math.max(0.75, 1 - (dist / 200) * 0.35);
  });

  const opacity = useTransform(y, (yPos: number) => {
    const dist = Math.abs(yPos);
    return Math.max(0.15, 1 - (dist / 170) * 0.9);
  });

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      style={{ y, x, scale, opacity }}
      className={`absolute right-2 flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-colors cursor-pointer shadow-lg active:scale-95 ${
        isCenterFocused
          ? "bg-white/20 border-[oklch(0.78_0.22_48)] text-white shadow-[0_0_24px_oklch(0.78_0.22_48_/_30%)] font-bold"
          : "bg-[#0b0e17]/90 border-white/12 text-white/70 hover:bg-white/10"
      }`}
    >
      <span className="text-sm">{item.icon}</span>
      <div className="text-left max-w-[75px] truncate">
        <span className="text-xs truncate block">{item.label}</span>
      </div>
      <span className="text-[10px] text-[oklch(0.78_0.22_48)] font-bold">➔</span>
    </motion.button>
  );
}

// ─── THUMBNAIL DE TEXTURA (NÍVEL 2) ───────────────────────────────────────────
function RadialTextureThumbnail({
  index,
  item,
  isApplied,
  smoothY,
  itemHeight,
  radius,
  isCenterFocused,
  onSelect,
}: {
  index: number;
  item: TextureItem;
  isApplied: boolean;
  smoothY: any;
  itemHeight: number;
  radius: number;
  isCenterFocused: boolean;
  onSelect: () => void;
}) {
  const y = useTransform(smoothY, (val: number) => {
    return index * itemHeight + val;
  });

  const x = useTransform(y, (yPos: number) => {
    const normalizedAngle = (yPos / radius) * 1.1;
    return -(Math.cos(normalizedAngle) - 0.25) * 65;
  });

  const scale = useTransform(y, (yPos: number) => {
    const dist = Math.abs(yPos);
    return Math.max(0.75, 1 - (dist / 200) * 0.35);
  });

  const opacity = useTransform(y, (yPos: number) => {
    const dist = Math.abs(yPos);
    return Math.max(0.15, 1 - (dist / 170) * 0.9);
  });

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      style={{ y, x, scale, opacity }}
      className={`absolute right-2 flex items-center gap-2 p-1.5 pr-2.5 rounded-2xl border transition-all cursor-pointer shadow-md active:scale-95 ${
        isApplied
          ? "bg-[oklch(0.78_0.22_48)]/25 border-[oklch(0.78_0.22_48)] text-white shadow-[0_0_24px_oklch(0.78_0.22_48_/_35%)]"
          : isCenterFocused
          ? "bg-white/15 border-white/30 text-white font-medium"
          : "bg-[#0a0d16]/90 border-white/10 text-white/70 hover:bg-white/10"
      }`}
    >
      <div className="relative w-8 h-8 rounded-xl overflow-hidden border border-white/15 shrink-0 shadow-inner">
        <img
          src={item.fullUrl}
          alt={item.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {isApplied && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Check size={12} className="text-[oklch(0.78_0.22_48)] stroke-[3]" />
          </div>
        )}
      </div>
      <div className="text-left max-w-[75px] truncate">
        <span className="text-[10px] font-medium text-white block truncate leading-tight">{item.name}</span>
        <span className="text-[8.5px] font-mono text-white/40 block mt-0.5">
          {isApplied ? "● Ativo" : "Tocar"}
        </span>
      </div>
    </motion.button>
  );
}
