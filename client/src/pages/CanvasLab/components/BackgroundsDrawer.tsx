import { useState, useMemo } from "react";
import { X, Search, Sparkles, Image as ImageIcon, Check, Sliders } from "lucide-react";
import { toast } from "sonner";
import type { CanvasPostModel } from "./types";

interface BackgroundsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  post: CanvasPostModel;
  onApplyBackground: (url?: string) => void;
  manifestData: any;
  applyToAllSlides: boolean;
  onToggleApplyToAll: (value: boolean) => void;
}

export default function BackgroundsDrawer({
  isOpen,
  onClose,
  post,
  onApplyBackground,
  manifestData,
  applyToAllSlides,
  onToggleApplyToAll,
}: BackgroundsDrawerProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const currentSlide = post.slides[post.currentSlideIndex];
  const activeBg = currentSlide?.bgImage || post.bgImage;

  // Lista agregada de todas as imagens com metadados
  const allImages = useMemo(() => {
    if (!manifestData?.categories) return [];
    const list: Array<{ path: string; fullUrl: string; categoryKey: string; categoryLabel: string; name: string }> = [];

    Object.entries(manifestData.categories).forEach(([catKey, cat]: [string, any]) => {
      if (Array.isArray(cat.images)) {
        cat.images.forEach((imgPath: string) => {
          // Extrai nome legível do arquivo
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 left-80 w-[440px] bg-[#0A0D14]/95 backdrop-blur-2xl border-r border-white/12 shadow-[16px_0_40px_rgba(0,0,0,0.8)] z-40 flex flex-col transition-all duration-300 animate-in slide-in-from-left-4 select-none">
      {/* ─── CABEÇALHO DA GAVETA ─── */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[oklch(0.78_0.22_48)]/15 border border-[oklch(0.78_0.22_48)]/30 flex items-center justify-center text-[oklch(0.78_0.22_48)]">
            <ImageIcon size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>Biblioteca de Texturas</span>
              <span className="text-[10px] font-mono font-normal bg-white/10 text-white/70 px-1.5 py-0.5 rounded-full">
                {allImages.length}
              </span>
            </h3>
            <p className="text-[11px] text-white/40">Texturas oficiais em alta resolução</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-all cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* ─── BARRA DE PESQUISA & OPÇÃO CARROSSEL ─── */}
      <div className="p-4 space-y-3 border-b border-white/8 bg-white/1">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar textura (ouro, linho, concreto, papel...)"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)] transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Chave: Aplicar a todos os slides */}
        {post.slides.length > 1 && (
          <label className="flex items-center justify-between p-2 rounded-xl bg-white/4 border border-white/8 cursor-pointer hover:bg-white/6 transition-all">
            <span className="text-[11px] font-medium text-white/80">Aplicar textura a todos os slides</span>
            <input
              type="checkbox"
              checked={applyToAllSlides}
              onChange={(e) => onToggleApplyToAll(e.target.checked)}
              className="w-3.5 h-3.5 accent-[oklch(0.78_0.22_48)] cursor-pointer"
            />
          </label>
        )}
      </div>

      {/* ─── CATEGORIAS EM ABAS LÍQUIDAS ─── */}
      <div className="p-3 border-b border-white/8 bg-white/2">
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === "all"
                ? "bg-white text-black shadow-sm"
                : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            Todas ({allImages.length})
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

      {/* ─── GRADE ESPAÇOSA DE ALTA DEFINIÇÃO (2 COLUNAS) ─── */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {filteredImages.length === 0 ? (
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
                  
                  {/* Nome da textura */}
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
        )}
      </div>

      {/* ─── RODAPÉ DA GAVETA ─── */}
      <div className="p-3 border-t border-white/10 bg-white/2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            onApplyBackground(undefined);
          }}
          className="text-xs text-white/60 hover:text-white py-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
        >
          Usar Apenas Cor Sólida
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-bold text-black py-1.5 px-4 rounded-lg bg-white hover:bg-white/90 transition-all cursor-pointer shadow-sm"
        >
          Concluir
        </button>
      </div>
    </div>
  );
}
