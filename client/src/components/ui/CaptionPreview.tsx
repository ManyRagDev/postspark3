/**
 * CaptionPreview - Preview da legenda abaixo do card
 * 
 * Simula o feed real da plataforma escolhida
 * Mostra contador de caracteres e preview de hashtags
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Hash } from 'lucide-react';
import type { Platform } from '@shared/postspark';
import { PLATFORM_SPECS } from '@shared/postspark';

interface CaptionPreviewProps {
  caption: string;
  hashtags: string[];
  platform: Platform;
  showPreview: boolean;
  onTogglePreview: () => void;
  accentColor?: string;
}

export function CaptionPreview({
  caption,
  hashtags,
  platform,
  showPreview,
  onTogglePreview,
  accentColor = '#a855f7',
}: CaptionPreviewProps) {
  const maxChars = PLATFORM_SPECS[platform].maxChars;
  const charCount = caption.length;
  const percentage = (charCount / maxChars) * 100;
  
  // Cores baseadas na proximidade do limite
  const getProgressColor = () => {
    if (percentage > 90) return '#ef4444'; // red
    if (percentage > 75) return '#f59e0b'; // amber
    return accentColor;
  };

  // Renderiza hashtags com estilo
  const renderHashtags = () => {
    if (hashtags.length === 0) return null;
    
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {hashtags.slice(0, 10).map((tag, i) => (
          <span
            key={i}
            className="text-xs font-medium"
            style={{ color: accentColor }}
          >
            #{tag.replace('#', '')}
          </span>
        ))}
        {hashtags.length > 10 && (
          <span className="text-xs text-[var(--text-tertiary)]">
            +{hashtags.length - 10} mais
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* Header com toggle e contador */}
      <div className="flex items-center justify-between">
        <button
          onClick={onTogglePreview}
          className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          {showPreview ? <Eye size={12} /> : <EyeOff size={12} />}
          <span>Preview da legenda</span>
        </button>
        
        {/* Contador de caracteres */}
        <div className="flex items-center gap-2">
          <div
            className="w-16 h-1 rounded-full overflow-hidden"
            style={{ background: 'rgba(255, 255, 255, 0.1)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: getProgressColor() }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(percentage, 100)}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span
            className="text-xs font-mono tabular-nums"
            style={{ 
              color: percentage > 90 ? '#ef4444' : 'var(--text-tertiary)' 
            }}
          >
            {charCount}/{maxChars}
          </span>
        </div>
      </div>

      {/* Preview da legenda */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="p-3 rounded-xl space-y-2"
              style={{
                background: 'var(--bg-void)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {/* Badge da plataforma */}
              <div className="flex items-center gap-2">
                <span className="text-sm">{PLATFORM_SPECS[platform].icon}</span>
                <span className="text-[10px] font-medium text-[var(--text-tertiary)]">
                  {PLATFORM_SPECS[platform].label}
                </span>
              </div>

              {/* Texto da legenda */}
              {caption ? (
                <p
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {caption}
                </p>
              ) : (
                <p className="text-sm italic text-[var(--text-tertiary)]">
                  Nenhuma legenda adicionada
                </p>
              )}

              {/* Hashtags */}
              {renderHashtags()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CaptionPreview;