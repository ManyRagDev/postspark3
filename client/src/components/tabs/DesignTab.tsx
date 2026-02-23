/**
 * DesignTab - Aba de design e cores (estrutura progressiva)
 *
 * Campos base sempre visíveis + extras no Modo Avançado (Architect)
 */

import { motion, AnimatePresence } from 'framer-motion';
import type { PostVariation } from '@shared/postspark';
import type { ControlMode } from '@/hooks/useControlMode';
import { PrecisionSlider } from '@/components/ui/PrecisionSlider';

interface DesignTabProps {
  mode: ControlMode;
  variation: PostVariation;
  onUpdate: (partial: Partial<PostVariation>) => void;
  accentColor: string;
}

const PRESET_COLORS = [
  '#0a0a1a',
  '#1a1a2e',
  '#16213e',
  '#0f3460',
  '#1b1b2f',
  '#2d132c',
  '#3d0c02',
  '#1a0000',
  '#FF5F1F',
  '#06B6D4',
  '#8B5CF6',
  '#EC4899',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#6366F1',
];

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

export function DesignTab({
  mode,
  variation,
  onUpdate,
  accentColor,
}: DesignTabProps) {
  const isArchitect = mode === 'architect';

  return (
    <div className="space-y-4">
      {/* Presets de Cores - Sempre visível */}
      <motion.div variants={itemVariants}>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-3 block">
          Paleta de Cores
        </label>
        <div className="grid grid-cols-4 gap-2">
          {PRESET_COLORS.map((color) => (
            <motion.button
              key={color}
              onClick={() => onUpdate({ backgroundColor: color })}
              className="w-full aspect-square rounded-xl transition-all"
              style={{
                background: color,
                border:
                  variation.backgroundColor === color
                    ? `2px solid ${accentColor}`
                    : '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow:
                  variation.backgroundColor === color
                    ? `0 0 12px ${accentColor}40`
                    : 'none',
              }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
            />
          ))}
        </div>
      </motion.div>

      {/* Preview rápido */}
      <motion.div variants={itemVariants}>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
          Prévia
        </label>
        <div
          className="h-20 rounded-xl flex items-center justify-center"
          style={{ background: variation.backgroundColor }}
        >
          <span
            className="text-sm font-medium"
            style={{ color: variation.textColor }}
          >
            Aa
          </span>
        </div>
      </motion.div>

      {/* Campos Avançados (Architect) */}
      <AnimatePresence>
        {isArchitect && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden"
          >
            {/* Cor de Fundo */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
                Cor de Fundo
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={variation.backgroundColor}
                  onChange={(e) =>
                    onUpdate({ backgroundColor: e.target.value })
                  }
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
                />
                <input
                  type="text"
                  value={variation.backgroundColor}
                  onChange={(e) =>
                    onUpdate({ backgroundColor: e.target.value })
                  }
                  className="flex-1 px-3 py-2 rounded-xl text-sm font-mono uppercase"
                  style={{
                    background: 'var(--bg-void)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </motion.div>

            {/* Cor do Texto */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
                Cor do Texto
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={variation.textColor}
                  onChange={(e) => onUpdate({ textColor: e.target.value })}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
                />
                <input
                  type="text"
                  value={variation.textColor}
                  onChange={(e) => onUpdate({ textColor: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-xl text-sm font-mono uppercase"
                  style={{
                    background: 'var(--bg-void)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </motion.div>

            {/* Cor de Destaque */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
                Cor de Destaque
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={variation.accentColor || '#a855f7'}
                  onChange={(e) => onUpdate({ accentColor: e.target.value })}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
                />
                <input
                  type="text"
                  value={variation.accentColor || '#a855f7'}
                  onChange={(e) => onUpdate({ accentColor: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-xl text-sm font-mono uppercase"
                  style={{
                    background: 'var(--bg-void)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </motion.div>

            {/* Opacidades */}
            <motion.div variants={itemVariants} className="space-y-3">
              <label className="text-xs font-medium text-[var(--text-secondary)] block">
                Opacidades
              </label>
              <PrecisionSlider
                label="Fundo"
                value={100}
                min={0}
                max={100}
                step={1}
                unit="%"
                onChange={() => {}}
              />
              <PrecisionSlider
                label="Texto"
                value={100}
                min={0}
                max={100}
                step={1}
                unit="%"
                onChange={() => {}}
              />
            </motion.div>

            {/* Gradiente */}
            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Modo Gradiente
                </label>
                <button
                  className="w-10 h-5 rounded-full relative"
                  style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <div
                    className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full"
                    style={{ background: 'var(--text-tertiary)' }}
                  />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default DesignTab;