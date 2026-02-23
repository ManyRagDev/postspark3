/**
 * BackgroundGallery - Galeria de backgrounds por categoria
 * 
 * Carrega imagens de client/public/images/backgrounds/
 * Organiza por categorias semânticas
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, ImageOff } from 'lucide-react';

// Tipo para o manifesto
interface BackgroundManifest {
  categories: Record<string, {
    label: string;
    description: string;
    icon: string;
    images: string[];
  }>;
}

// Cache do manifesto
let cachedManifest: BackgroundManifest | null = null;

// Hook para carregar manifesto
function useBackgroundManifest() {
  const [manifest, setManifest] = useState<BackgroundManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cachedManifest) {
      setManifest(cachedManifest);
      setLoading(false);
      return;
    }

    fetch('/images/backgrounds/manifest.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load manifest');
        return res.json();
      })
      .then(data => {
        cachedManifest = data;
        setManifest(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  return { manifest, loading, error };
}

interface BackgroundGalleryProps {
  onSelect: (url: string) => void;
  selectedUrl?: string;
  accentColor?: string;
}

export function BackgroundGallery({
  onSelect,
  selectedUrl,
  accentColor = '#a855f7',
}: BackgroundGalleryProps) {
  const { manifest, loading, error } = useBackgroundManifest();
  const [activeCategory, setActiveCategory] = useState<string>('acolhimento-respiro');

  // Obter categorias do manifesto
  const categories = manifest ? Object.keys(manifest.categories) : [];
  const currentCategory = manifest?.categories[activeCategory];
  const currentImages = currentCategory?.images || [];

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin" style={{ color: accentColor }} />
        <span className="ml-2 text-xs text-[var(--text-tertiary)]">Carregando galeria...</span>
      </div>
    );
  }

  // Error state
  if (error || !manifest) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <ImageOff size={20} className="text-[var(--text-tertiary)]" />
        <span className="text-xs text-[var(--text-tertiary)]">Não foi possível carregar a galeria</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Categorias */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {categories.map((cat) => {
          const info = manifest.categories[cat];
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all"
              style={{
                background: isActive ? `${accentColor}20` : 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${isActive ? `${accentColor}40` : 'rgba(255, 255, 255, 0.06)'}`,
                color: isActive ? accentColor : 'var(--text-tertiary)',
              }}
            >
              <span>{info.icon}</span>
              <span>{info.label}</span>
            </button>
          );
        })}
      </div>

      {/* Info da categoria */}
      <p className="text-[9px] text-[var(--text-tertiary)]">
        {currentCategory?.description}
      </p>

      {/* Grid de imagens */}
      {currentImages.length > 0 ? (
        <div className="grid grid-cols-4 gap-1.5">
          {currentImages.map((imagePath, index) => {
            // Encode cada segmento do path separadamente para preservar as barras
            const encodedPath = imagePath.split('/').map(encodeURIComponent).join('/');
            const url = `/images/backgrounds/${encodedPath}`;
            // selectedUrl pode ter sido salvo sem encoding (compatibilidade) — compara também o path raw
            const rawUrl = `/images/backgrounds/${imagePath}`;
            const isSelected = selectedUrl === url || selectedUrl === rawUrl;
            return (
              <motion.button
                key={`${activeCategory}-${index}`}
                onClick={() => onSelect(url)}
                className="relative aspect-square rounded-lg overflow-hidden group"
                style={{
                  border: isSelected ? `2px solid ${accentColor}` : '1px solid rgba(255, 255, 255, 0.06)',
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <img
                  src={url}
                  alt={`Background ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                
                {/* Overlay no hover */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)' }}
                />
                
                {/* Indicador de seleção */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: `${accentColor}40` }}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: accentColor }}
                      >
                        <Check size={14} color="#000" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <ImageOff size={16} className="text-[var(--text-tertiary)]" />
          <span className="text-[10px] text-[var(--text-tertiary)]">
            Nenhum background nesta categoria
          </span>
        </div>
      )}

      {/* Contador */}
      <p className="text-[8px] text-[var(--text-tertiary)] text-center">
        {currentImages.length} backgrounds disponíveis
      </p>
    </div>
  );
}

export default BackgroundGallery;