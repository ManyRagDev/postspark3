/**
 * TextTab - Aba de edição de texto (estrutura progressiva)
 *
 * Campos base sempre visíveis + extras no Modo Avançado (Architect)
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import type { PostVariation, Platform } from '@shared/postspark';
import { PLATFORM_SPECS } from '@shared/postspark';
import type { ControlMode } from '@/hooks/useControlMode';

interface TextTabProps {
  mode: ControlMode;
  variation: PostVariation;
  onUpdate: (partial: Partial<PostVariation>) => void;
  accentColor: string;
}

const PLATFORMS: Platform[] = ['instagram', 'twitter', 'linkedin', 'facebook'];

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

export function TextTab({
  mode,
  variation,
  onUpdate,
  accentColor,
}: TextTabProps) {
  const isArchitect = mode === 'architect';

  return (
    <div className="space-y-4">
      {/* Plataforma - Sempre visível */}
      <motion.div variants={itemVariants}>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
          Plataforma
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => onUpdate({ platform: p })}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background:
                  variation.platform === p
                    ? `${accentColor}20`
                    : 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${
                  variation.platform === p
                    ? `${accentColor}50`
                    : 'rgba(255, 255, 255, 0.06)'
                }`,
                color:
                  variation.platform === p
                    ? accentColor
                    : 'var(--text-tertiary)',
              }}
            >
              {PLATFORM_SPECS[p].label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Título - Sempre visível */}
      <motion.div variants={itemVariants}>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
          Título
          {variation.headline && (
            <span className="ml-2 text-[10px] text-[var(--text-tertiary)]">
              {variation.headline.length} caracteres
            </span>
          )}
        </label>
        <input
          type="text"
          value={variation.headline}
          onChange={(e) => onUpdate({ headline: e.target.value })}
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
          style={{
            background: 'var(--bg-void)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'var(--text-primary)',
          }}
          placeholder="Digite o título do post..."
        />
      </motion.div>

      {/* Corpo - Sempre visível */}
      <motion.div variants={itemVariants}>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
          Corpo
          {variation.body && (
            <span className="ml-2 text-[10px] text-[var(--text-tertiary)]">
              {variation.body.length} caracteres
            </span>
          )}
        </label>
        <textarea
          value={variation.body}
          onChange={(e) => onUpdate({ body: e.target.value })}
          rows={4}
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none transition-all"
          style={{
            background: 'var(--bg-void)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'var(--text-primary)',
          }}
          placeholder="Digite o conteúdo do post..."
        />
        <button
          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all"
          style={{
            background: 'rgba(212, 175, 55, 0.1)',
            color: '#d4af37',
            border: '1px solid rgba(212, 175, 55, 0.2)',
          }}
        >
          <Sparkles size={10} />
          Otimizar com IA
        </button>
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
            {/* Hashtags */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
                Hashtags
              </label>
              <input
                type="text"
                value={variation.hashtags.join(', ')}
                onChange={(e) =>
                  onUpdate({
                    hashtags: e.target.value
                      .split(/[,\s]+/)
                      .map((h) => h.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: 'var(--bg-void)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-primary)',
                }}
                placeholder="#marketing, #socialmedia, #branding"
              />
              <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                Separe por vírgula ou espaço
              </p>
            </motion.div>

            {/* CTA */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
                CTA (Call to Action)
              </label>
              <input
                type="text"
                value={variation.callToAction}
                onChange={(e) => onUpdate({ callToAction: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: 'var(--bg-void)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-primary)',
                }}
                placeholder="Clique no link da bio para saber mais..."
              />
            </motion.div>

            {/* Análise de Sentimento */}
            <motion.div variants={itemVariants}>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
                Análise de Sentimento
              </label>
              <div
                className="p-3 rounded-xl"
                style={{
                  background: 'var(--bg-void)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--text-secondary)]">Tom detectado</span>
                  <span
                    className="text-xs font-medium"
                    style={{ color: accentColor }}
                  >
                    {variation.tone || 'Neutro'}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: accentColor }}
                    initial={{ width: 0 }}
                    animate={{ width: '65%' }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TextTab;