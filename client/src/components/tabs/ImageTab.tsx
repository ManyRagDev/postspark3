/**
 * ImageTab - Aba de imagem e calibração visual (estrutura progressiva)
 *
 * Campos base sempre visíveis + extras no Modo Avançado (Architect)
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, ImageOff, Images, Upload, Palette, Wand2 } from 'lucide-react';
import type { PostVariation } from '@shared/postspark';
import type { ControlMode } from '@/hooks/useControlMode';
import { PrecisionSlider } from '@/components/ui/PrecisionSlider';
import type { ImageSettings } from '@/types/editor';

interface ImageTabProps {
  mode: ControlMode;
  variation: PostVariation;
  onUpdate: (partial: Partial<PostVariation>) => void;
  imageSettings: ImageSettings;
  onUpdateImageSetting: <K extends keyof ImageSettings>(key: K, value: ImageSettings[K]) => void;
  onGenerateImage: () => void;
  isGenerating: boolean;
  accentColor: string;
}

type ImageSource = 'none' | 'gallery' | 'upload' | 'color' | 'ai';

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

const BLEND_MODES = [
  { value: 'normal', label: 'Normal', icon: '◯' },
  { value: 'multiply', label: 'Multiply', icon: '✕' },
  { value: 'screen', label: 'Screen', icon: '◻' },
  { value: 'overlay', label: 'Overlay', icon: '◎' },
  { value: 'darken', label: 'Darken', icon: '◐' },
  { value: 'lighten', label: 'Lighten', icon: '◑' },
];

export function ImageTab({
  mode,
  variation,
  onUpdate,
  imageSettings,
  onUpdateImageSetting,
  onGenerateImage,
  isGenerating,
  accentColor,
}: ImageTabProps) {
  const isArchitect = mode === 'architect';
  const [activeSource, setActiveSource] = useState<ImageSource>('ai');

  return (
    <div className="space-y-4">
      {/* Sub-nav de fontes - Sempre visível */}
      <motion.div variants={itemVariants} className="flex gap-1">
        {[
          { id: 'none' as ImageSource, icon: ImageOff, label: 'Nenhuma' },
          { id: 'gallery' as ImageSource, icon: Images, label: 'Galeria' },
          { id: 'upload' as ImageSource, icon: Upload, label: 'Importar' },
          { id: 'color' as ImageSource, icon: Palette, label: 'Cor' },
          { id: 'ai' as ImageSource, icon: Wand2, label: 'IA' },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveSource(id)}
            className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[10px] transition-all flex-1"
            style={{
              background: activeSource === id ? `${accentColor}15` : 'transparent',
              color: activeSource === id ? accentColor : 'var(--text-tertiary)',
              border: `1px solid ${activeSource === id ? `${accentColor}30` : 'transparent'}`,
            }}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </motion.div>

      {/* Prompt IA - Sempre visível quando fonte é AI */}
      {activeSource === 'ai' && (
        <motion.div variants={itemVariants}>
          <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
            Descrição da Imagem
          </label>
          <textarea
            value={variation.imagePrompt}
            onChange={(e) => onUpdate({ imagePrompt: e.target.value })}
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
            style={{
              background: 'var(--bg-void)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--text-primary)',
            }}
            placeholder="Descreva a cena visual ideal..."
          />
          <motion.button
            onClick={onGenerateImage}
            disabled={isGenerating}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #d4af37, #c9a227)',
              color: '#0a0b0f',
              boxShadow: '0 4px 16px rgba(212, 175, 55, 0.3)',
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Sintetizando...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Sintetizar Visual
              </>
            )}
          </motion.button>
        </motion.div>
      )}

      {/* Preview da imagem */}
      {variation.imageUrl && (
        <motion.div variants={itemVariants}>
          <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
            Resultado
          </label>
          <div
            className="aspect-square rounded-xl overflow-hidden"
            style={{
              background: 'var(--bg-void)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <img
              src={variation.imageUrl}
              alt="Generated"
              className="w-full h-full object-cover"
            />
          </div>
        </motion.div>
      )}

      {/* Campos Avançados (Architect) */}
      <AnimatePresence>
        {isArchitect && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden"
          >
            {/* Calibração Visual */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-3 flex items-center gap-2">
                <span>▼</span> Calibração Visual
              </label>
              <div className="space-y-3 pl-2">
                <PrecisionSlider
                  label="Zoom"
                  value={imageSettings.zoom}
                  min={0.5}
                  max={3}
                  step={0.05}
                  formatValue={(v) => `${v.toFixed(2)}×`}
                  onChange={(v) => onUpdateImageSetting('zoom', v)}
                />
                <PrecisionSlider
                  label="Brilho"
                  value={imageSettings.brightness}
                  min={0}
                  max={2}
                  step={0.05}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => onUpdateImageSetting('brightness', v)}
                />
                <PrecisionSlider
                  label="Contraste"
                  value={imageSettings.contrast}
                  min={0}
                  max={2}
                  step={0.05}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => onUpdateImageSetting('contrast', v)}
                />
                <PrecisionSlider
                  label="Saturação"
                  value={imageSettings.saturation}
                  min={0}
                  max={2}
                  step={0.05}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => onUpdateImageSetting('saturation', v)}
                />
                <PrecisionSlider
                  label="Blur"
                  value={imageSettings.blur}
                  min={0}
                  max={20}
                  step={0.5}
                  formatValue={(v) => `${v}px`}
                  onChange={(v) => onUpdateImageSetting('blur', v)}
                />
              </div>
            </motion.div>

            {/* Sobreposição */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-3 flex items-center gap-2">
                <span>▼</span> Sobreposição
              </label>
              <div className="space-y-3 pl-2">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={imageSettings.overlayColor}
                    onChange={(e) => onUpdateImageSetting('overlayColor', e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
                  />
                  <input
                    type="text"
                    value={imageSettings.overlayColor}
                    onChange={(e) => onUpdateImageSetting('overlayColor', e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl text-sm font-mono uppercase"
                    style={{
                      background: 'var(--bg-void)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <PrecisionSlider
                  label="Opacidade"
                  value={imageSettings.overlayOpacity}
                  min={0}
                  max={1}
                  step={0.05}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => onUpdateImageSetting('overlayOpacity', v)}
                />
              </div>
            </motion.div>

            {/* Blend Modes */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-3 block">
                Blend Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {BLEND_MODES.map((bm) => (
                  <button
                    key={bm.value}
                    onClick={() => onUpdateImageSetting('blendMode', bm.value as ImageSettings['blendMode'])}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg text-[10px] transition-all"
                    style={{
                      background: imageSettings.blendMode === bm.value ? `${accentColor}15` : 'var(--bg-void)',
                      color: imageSettings.blendMode === bm.value ? accentColor : 'var(--text-tertiary)',
                      border: `1px solid ${imageSettings.blendMode === bm.value ? `${accentColor}30` : 'rgba(255, 255, 255, 0.06)'}`,
                    }}
                  >
                    <span className="text-lg">{bm.icon}</span>
                    <span>{bm.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ImageTab;