/**
 * CompositionTab - Aba de composição e layout (estrutura progressiva)
 *
 * Campos base sempre visíveis + extras no Modo Avançado (Architect)
 */

import { motion, AnimatePresence } from 'framer-motion';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { PostVariation } from '@shared/postspark';
import type { ControlMode } from '@/hooks/useControlMode';
import { PrecisionSlider } from '@/components/ui/PrecisionSlider';
import type { AdvancedLayoutSettings, TextAlignment } from '@/types/editor';

interface CompositionTabProps {
  mode: ControlMode;
  variation: PostVariation;
  onUpdate: (partial: Partial<PostVariation>) => void;
  layoutSettings: AdvancedLayoutSettings;
  onUpdateLayout: (settings: AdvancedLayoutSettings) => void;
  layoutTarget: 'headline' | 'body';
  onSetLayoutTarget: (target: 'headline' | 'body') => void;
  accentColor: string;
}

const LAYOUT_OPTIONS = [
  { value: 'centered' as const, label: 'Centralizado', icon: '⊞' },
  { value: 'left-aligned' as const, label: 'Lateral', icon: '☰' },
  { value: 'split' as const, label: 'Bipartido', icon: '◧' },
  { value: 'minimal' as const, label: 'Minimal', icon: '◻' },
];

const POSITIONS = [
  { x: 'left', y: 'top', label: 'TL' },
  { x: 'center', y: 'top', label: 'TC' },
  { x: 'right', y: 'top', label: 'TR' },
  { x: 'left', y: 'center', label: 'ML' },
  { x: 'center', y: 'center', label: 'MC' },
  { x: 'right', y: 'center', label: 'MR' },
  { x: 'left', y: 'bottom', label: 'BL' },
  { x: 'center', y: 'bottom', label: 'BC' },
  { x: 'right', y: 'bottom', label: 'BR' },
];

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

export function CompositionTab({
  mode,
  variation,
  onUpdate,
  layoutSettings,
  onUpdateLayout,
  layoutTarget,
  onSetLayoutTarget,
  accentColor,
}: CompositionTabProps) {
  const isArchitect = mode === 'architect';

  const updateLayoutTarget = (field: 'position' | 'textAlign', value: string) => {
    onUpdateLayout({
      ...layoutSettings,
      [layoutTarget]: {
        ...layoutSettings[layoutTarget],
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Grid de Layouts - Sempre visível */}
      <motion.div variants={itemVariants}>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-3 block">
          Disposição
        </label>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUT_OPTIONS.map((opt) => (
            <motion.button
              key={opt.value}
              onClick={() => onUpdate({ layout: opt.value })}
              className="flex flex-col items-center gap-2 py-4 rounded-xl transition-all"
              style={{
                background: variation.layout === opt.value ? `${accentColor}15` : 'var(--bg-void)',
                border: `1px solid ${variation.layout === opt.value ? `${accentColor}30` : 'rgba(255, 255, 255, 0.06)'}`,
                color: variation.layout === opt.value ? accentColor : 'var(--text-tertiary)',
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="text-2xl">{opt.icon}</span>
              <span className="text-xs">{opt.label}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Alinhamento - Sempre visível */}
      <motion.div variants={itemVariants}>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-3 block">
          Alinhamento
        </label>
        <div className="flex gap-2">
          {[
            { value: 'left' as TextAlignment, icon: AlignLeft },
            { value: 'center' as TextAlignment, icon: AlignCenter },
            { value: 'right' as TextAlignment, icon: AlignRight },
          ].map(({ value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => {
                onUpdateLayout({
                  ...layoutSettings,
                  headline: { ...layoutSettings.headline, textAlign: value },
                });
              }}
              className="flex-1 flex items-center justify-center py-3 rounded-xl transition-all"
              style={{
                background: layoutSettings.headline.textAlign === value ? `${accentColor}15` : 'var(--bg-void)',
                border: `1px solid ${layoutSettings.headline.textAlign === value ? `${accentColor}30` : 'rgba(255, 255, 255, 0.06)'}`,
                color: layoutSettings.headline.textAlign === value ? accentColor : 'var(--text-tertiary)',
              }}
            >
              <Icon size={18} />
            </button>
          ))}
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
            {/* Seletor de Elemento */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
                Elemento
              </label>
              <div
                className="flex gap-1 p-1 rounded-xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                }}
              >
                {(['headline', 'body'] as const).map((target) => (
                  <button
                    key={target}
                    onClick={() => onSetLayoutTarget(target)}
                    className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: layoutTarget === target ? `${accentColor}20` : 'transparent',
                      color: layoutTarget === target ? accentColor : 'var(--text-tertiary)',
                      border: `1px solid ${layoutTarget === target ? `${accentColor}40` : 'transparent'}`,
                    }}
                  >
                    {target === 'headline' ? 'Título' : 'Corpo'}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Grid 3×3 de Posições */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-3 block">
                Posição
              </label>
              <div className="grid grid-cols-3 gap-1 p-2 rounded-xl" style={{ background: 'var(--bg-void)' }}>
                {POSITIONS.map((pos) => {
                  const isActive =
                    layoutSettings[layoutTarget].position === `${pos.y}-${pos.x}`;
                  return (
                    <button
                      key={pos.label}
                      onClick={() => updateLayoutTarget('position', `${pos.y}-${pos.x}`)}
                      className="aspect-square rounded-lg text-[10px] font-medium transition-all flex items-center justify-center"
                      style={{
                        background: isActive ? `${accentColor}20` : 'transparent',
                        color: isActive ? accentColor : 'var(--text-tertiary)',
                        border: `1px solid ${isActive ? `${accentColor}40` : 'rgba(255, 255, 255, 0.06)'}`,
                      }}
                    >
                      {pos.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Alinhamento do Elemento */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-3 block">
                Alinhamento Tipográfico
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'left' as TextAlignment, icon: AlignLeft },
                  { value: 'center' as TextAlignment, icon: AlignCenter },
                  { value: 'right' as TextAlignment, icon: AlignRight },
                ].map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => updateLayoutTarget('textAlign', value)}
                    className="flex-1 flex items-center justify-center py-3 rounded-xl transition-all"
                    style={{
                      background: layoutSettings[layoutTarget].textAlign === value ? `${accentColor}15` : 'var(--bg-void)',
                      border: `1px solid ${layoutSettings[layoutTarget].textAlign === value ? `${accentColor}30` : 'rgba(255, 255, 255, 0.06)'}`,
                      color: layoutSettings[layoutTarget].textAlign === value ? accentColor : 'var(--text-tertiary)',
                    }}
                  >
                    <Icon size={18} />
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Margem Interna */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-3 block">
                Respiro (Margem Interna)
              </label>
              <PrecisionSlider
                label="Padding"
                value={layoutSettings.padding}
                min={0}
                max={80}
                step={4}
                unit="px"
                onChange={(v) => onUpdateLayout({ ...layoutSettings, padding: v })}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CompositionTab;