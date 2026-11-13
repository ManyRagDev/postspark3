import { useState, useMemo, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useIsMobile } from "@/hooks/useMobile";
import { X, Search, Image as ImageIcon, Sparkles } from "lucide-react";
import type { CanvasPostModel } from "./types";
import type { SeamlessPanoramaMeta } from "../lib/seamlessCarousel";

interface BackgroundsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  post: CanvasPostModel;
  onApplyBackground: (url?: string) => void;
  onApplySeamlessPanorama?: (panorama: SeamlessPanoramaMeta) => void;
  manifestData: any;
  initialTab?: string;
}

export default function BackgroundsDrawer({
  isOpen,
  onClose,
  post,
  onApplyBackground,
  onApplySeamlessPanorama,
  manifestData,
  initialTab,
}: BackgroundsDrawerProps) {
  const isMobile = useIsMobile();
  const isCarousel = Boolean(post.slides && post.slides.length > 1);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    initialTab || (isCarousel ? "seamless" : "all")
  );
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setSelectedCategory(initialTab || (isCarousel ? "seamless" : "all"));
      setSearchQuery("");
    }
  }, [isOpen, initialTab, isCarousel]);

  const currentSlide = post.slides[post.currentSlideIndex];
  const activeBg = currentSlide?.composition?.version === 3
    ? currentSlide.composition.customBackground?.imageUrl
    : currentSlide?.bgImage ?? post.bgImage;

  // Lista dos panoramas contínuos
  const seamlessCarousels = useMemo<SeamlessPanoramaMeta[]>(() => {
    if (!manifestData?.seamlessCarousels || !Array.isArray(manifestData.seamlessCarousels)) return [];
    return manifestData.seamlessCarousels;
  }, [manifestData]);

  // Lista agregada de todas as texturas normais
  const allImages = useMemo(() => {
    if (!manifestData?.categories) return [];
    const list: Array<{ path: string; fullUrl: string; categoryKey: string; categoryLabel: string; name: string }> = [];

    Object.entries(manifestData.categories).forEach(([catKey, cat]: [string, any]) => {
      if (Array.isArray(cat.images)) {
        cat.images.forEach((imgPath: string) => {
          const cleanName = imgPath
            .split("/")
            .pop()
            ?.replace(/^emanueljunior_/, "")
            ?.replace(/_[a-f0-9-]{36}_d.webp$/i, "")
            ?.replace(/_/g, " ") || "Textura";

          list.push({
            path: imgPath,
            fullUrl: `/images/backgrounds/${imgPath}`,
            categoryKey: catKey,
            categoryLabel: cat.label,
            name: cleanName,
          });
        });
      }
    });

    return list;
  }, [manifestData]);

  // Filtra por categoria e busca
  const filteredImages = useMemo(() => {
    return allImages.filter((img) => {
      const matchesCat = selectedCategory === "all" || img.categoryKey === selectedCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        img.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        img.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [allImages, selectedCategory, searchQuery]);

  const filteredSeamless = useMemo(() => {
    if (!isCarousel) return [];
    return seamlessCarousels.filter((pano) => {
      const matchesSearch =
        !searchQuery.trim() ||
        pano.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pano.series.toLowerCase().includes(searchQuery.toLowerCase()) ||
        `${pano.slideCount} slides`.includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [seamlessCarousels, searchQuery, isCarousel]);

  if (!isOpen) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={value => { if (!value) onClose(); }}>
    <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[79] bg-black/60" />
    <Dialog.Content className="fixed inset-y-0 left-0 z-[80] flex h-[100dvh] w-full flex-col bg-[#0A0D14] text-white shadow-2xl outline-none md:left-80 md:w-[440px] md:max-w-[calc(100vw-20rem)]">
      {/* ─── CABEÇALHO DA GAVETA ─── */}
      <div className="shrink-0 p-4 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[oklch(0.78_0.22_48)]/15 border border-[oklch(0.78_0.22_48)]/30 flex items-center justify-center text-[oklch(0.78_0.22_48)]">
            <ImageIcon size={16} />
          </div>
          <div className="min-w-0">
            <Dialog.Title asChild>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>Biblioteca de Fundos</span>
              <span className="text-[10px] font-mono font-normal bg-white/10 text-white/70 px-1.5 py-0.5 rounded-full">
                {selectedCategory === "seamless" ? seamlessCarousels.length : allImages.length}
              </span>
            </h3>
            </Dialog.Title>
            <Dialog.Description className="text-xs text-white/60">
              {isCarousel
                ? "Panoramas contínuos e texturas em alta resolução"
                : "Texturas oficiais em alta resolução"}
            </Dialog.Description>
          </div>
        </div>
        <button
          type="button"
          aria-label="Fechar biblioteca de fundos"
          onClick={onClose}
          className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl bg-white/5 hover:bg-white/15 text-white/70 hover:text-white cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* ─── BARRA DE PESQUISA ─── */}
      <div className="shrink-0 px-4 pb-3 pt-2 border-b border-white/10">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            aria-label="Buscar fundos"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              selectedCategory === "seamless"
                ? "Buscar panorama (paper, cyberpunk, brutalist...)"
                : "Buscar textura (ouro, linho, concreto, papel...)"
            }
            className="min-h-11 w-full pl-9 pr-10 rounded-xl bg-black/40 border border-white/15 text-base md:text-sm text-white placeholder-white/40 outline-none focus:border-orange-400"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Limpar busca de fundos"
              onClick={() => setSearchQuery("")}
              className="absolute right-0 top-0 grid min-h-11 min-w-11 place-items-center text-white/70 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ─── CATEGORIAS EM ABAS LÍQUIDAS ─── */}
      <div className="shrink-0 p-3 border-b border-white/10">
        <select aria-label="Categoria de fundos" value={selectedCategory} onChange={event => setSelectedCategory(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#151923] px-3 text-base md:hidden">
          {isCarousel && <option value="seamless">Fundos contínuos ({seamlessCarousels.length})</option>}
          <option value="all">Todas as texturas ({allImages.length})</option>
          {Object.entries(manifestData?.categories ?? {}).map(([key, category]: [string, any]) => <option key={key} value={key}>{category.label} ({category.images?.length ?? 0})</option>)}
        </select>
        <div className="hidden gap-1.5 flex-wrap md:flex">
          {/* ABA SEAMLESS CAROUSEL (Exclusiva para carrosséis) */}
          {isCarousel && (
            <button
              type="button"
              onClick={() => setSelectedCategory("seamless")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === "seamless"
                  ? "bg-gradient-to-r from-[#FF5C00] to-orange-400 text-white shadow-md shadow-orange-500/20"
                  : "bg-orange-500/10 border border-orange-500/30 text-orange-300 hover:bg-orange-500/20"
              }`}
            >
              <Sparkles size={12} className={selectedCategory === "seamless" ? "text-white" : "text-orange-400"} />
              <span>Seamless Carousel</span>
              <span className="text-[10px] opacity-80 font-mono">({seamlessCarousels.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === "all"
                ? "bg-white text-black shadow-sm"
                : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            Todas as texturas ({allImages.length})
          </button>

          {manifestData?.categories &&
            Object.entries(manifestData.categories).map(([catKey, cat]: [string, any]) => {
              const isSel = selectedCategory === catKey;
              const count = cat.images?.length || 0;
              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setSelectedCategory(catKey)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isSel
                      ? "bg-white text-black shadow-sm"
                      : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span className="text-[10px] opacity-60">({count})</span>
                </button>
              );
            })}
        </div>
      </div>

      {/* ─── CORPO DA GAVETA: SEAMLESS CAROUSEL (1 COLUNA HORIZONTAL) OU TEXTURAS (2 COLUNAS) ─── */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 custom-scrollbar">
        {selectedCategory === "seamless" && isCarousel ? (
          filteredSeamless.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-white/40">
              <Sparkles size={32} className="mb-2 opacity-30 text-orange-400" />
              <p className="text-xs">Nenhum panorama encontrado para "{searchQuery}".</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 text-xs text-orange-200/90 leading-relaxed">
                <p className="font-semibold text-white flex items-center gap-1.5 mb-1">
                  <Sparkles size={13} className="text-orange-400" />
                  <span>Panoramas Contínuos em Tira</span>
                </p>
                <p className="text-[11px] text-white/60">
                  A imagem atravessa todos os slides em fileira contínua. Ao escolher um, o palco abre a visão fantasma panorâmica para inspeção.
                </p>
              </div>

              {filteredSeamless.map((pano) => {
                const isSelected = activeBg === pano.url || (activeBg && activeBg.includes(pano.id));
                const currentCount = post.slides.length;
                const panoCount = pano.slideCount;

                let matchLabel = `Encaixe exato (${panoCount} slides)`;
                let matchColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                if (panoCount > currentCount) {
                  matchLabel = `${panoCount} slides • usa ${currentCount} e corta ${panoCount - currentCount}`;
                  matchColor = "text-blue-400 bg-blue-500/10 border-blue-500/20";
                } else if (panoCount < currentCount) {
                  matchLabel = `${panoCount} slides • ${currentCount - panoCount} slide(s) sem fundo`;
                  matchColor = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                }

                return (
                  <button
                    key={pano.id}
                    type="button"
                    onClick={() => {
                      if (onApplySeamlessPanorama) {
                        onApplySeamlessPanorama(pano);
                      } else {
                        onApplyBackground(pano.url);
                      }
                      onClose();
                    }}
                    className={`w-full group rounded-2xl overflow-hidden border transition-all cursor-pointer text-left flex flex-col bg-black/40 ${
                      isSelected
                        ? "border-[oklch(0.78_0.22_48)] ring-2 ring-[oklch(0.78_0.22_48)]/40 shadow-xl"
                        : "border-white/10 hover:border-white/30 hover:shadow-lg"
                    }`}
                  >
                    {/* Imagem panorâmica completa em proporção 4:1 com linhas guias das fatias */}
                    <div className="relative aspect-[4/1] w-full overflow-hidden bg-neutral-900">
                      <img
                        src={pano.previewUrl || pano.url}
                        alt={pano.name}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        loading="lazy"
                      />
                      {/* Divisórias das fatias proporcionais */}
                      <div className="absolute inset-0 pointer-events-none flex">
                        {Array.from({ length: panoCount - 1 }).map((_, idx) => (
                          <div
                            key={idx}
                            style={{ left: `${((idx + 1) / panoCount) * 100}%` }}
                            className="absolute inset-y-0 w-px border-r border-dashed border-white/40 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]"
                          />
                        ))}
                      </div>

                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[9px] font-mono font-bold uppercase tracking-wider text-white border border-white/15">
                          {panoCount} Slides
                        </span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-[oklch(0.78_0.22_48)] text-black flex items-center justify-center text-xs font-bold shadow-md">
                            ✓
                          </span>
                        )}
                      </div>

                      <div className="absolute bottom-2 left-2">
                        <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-black/60 backdrop-blur-md text-white/80">
                          {pano.series}
                        </span>
                      </div>
                    </div>

                    {/* Metadados e compatibilidade */}
                    <div className="p-3 flex items-center justify-between gap-2 border-t border-white/5 bg-white/[0.02]">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white group-hover:text-orange-300 transition-colors truncate">
                          {pano.name}
                        </div>
                        <div className="text-[10px] text-white/40 mt-0.5">
                          {pano.width} × {pano.height}px • Safe Zones Centrais
                        </div>
                      </div>

                      <span className={`px-2 py-1 rounded-md text-[9.5px] font-semibold border shrink-0 ${matchColor}`}>
                        {matchLabel}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          filteredImages.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-white/40">
              <ImageIcon size={32} className="mb-2 opacity-30" />
              <p className="text-xs">Nenhuma textura encontrada para "{searchQuery}".</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredImages.map((img, i) => {
                const isSelected = activeBg === img.fullUrl;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      onApplyBackground(img.fullUrl);
                      if (isMobile) onClose();
                    }}
                    className={`group relative aspect-[4/3] rounded-xl overflow-hidden border transition-all cursor-pointer text-left ${
                      isSelected
                        ? "border-[oklch(0.78_0.22_48)] ring-2 ring-[oklch(0.78_0.22_48)]/40 shadow-lg"
                        : "border-white/10 hover:border-white/40 hover:shadow-md"
                    }`}
                  >
                    <img
                      src={img.fullUrl}
                      alt={img.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                      <span className="text-[10px] font-medium text-white/90 line-clamp-1 group-hover:text-white">
                        {img.name}
                      </span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-[oklch(0.78_0.22_48)] text-black flex items-center justify-center text-[10px] font-bold shrink-0">
                          ✓
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* ─── RODAPÉ DA GAVETA ─── */}
      <div className="shrink-0 border-t border-white/10 p-3 pb-[max(12px,env(safe-area-inset-bottom))] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            onApplyBackground(undefined);
            if (isMobile) onClose();
          }}
          className="min-h-11 text-sm text-white/75 hover:text-white px-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer"
        >
          Usar Apenas Cor Sólida
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 text-sm font-bold text-black px-4 rounded-lg bg-white hover:bg-white/90 cursor-pointer shadow-sm"
        >
          Concluir
        </button>
      </div>
    </Dialog.Content>
    </Dialog.Portal>
    </Dialog.Root>
  );
}
