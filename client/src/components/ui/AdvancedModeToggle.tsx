/**
 * AdvancedModeToggle - Toggle global para Modo Avançado
 * 
 * Quando ativado, revela controles extras em todas as seções.
 * Toggle único e consistente, sem duplicação por tab.
 */

import { motion } from 'framer-motion';
import { Sparkles, Settings2 } from 'lucide-react';
import type { ControlMode } from '@/hooks/useControlMode';

interface AdvancedModeToggleProps {
  mode: ControlMode;
  onChange: (mode: ControlMode) => void;
  /** Cor de destaque */
  accentColor?: string;
  /** Versão compacta para header */
  compact?: boolean;
}

export function AdvancedModeToggle({
  mode,
  onChange,
  accentColor = '#a855f7',
  compact = false,
}: AdvancedModeToggleProps) {
  const isArchitect = mode === 'architect';

  if (compact) {
    return (
      <button
        onClick={() => onChange(isArchitect ? 'captain' : 'architect')}
        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
        style={{
          background: isArchitect ? `${accentColor}15` : 'rgba(255, 255, 255, 0.04)',
          border: `1px solid ${isArchitect ? `${accentColor}30` : 'rgba(255, 255, 255, 0.08)'}`,
        }}
      >
        <motion.div
          animate={{ rotate: isArchitect ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <Settings2
            size={14}
            style={{ color: isArchitect ? accentColor : 'var(--text-tertiary)' }}
          />
        </motion.div>
        <span
          className="text-xs font-medium"
          style={{ color: isArchitect ? accentColor : 'var(--text-tertiary)' }}
        >
          {isArchitect ? 'Avançado' : 'Simples'}
        </span>
      </button>
    );
  }

  return (
    <motion.button
      onClick={() => onChange(isArchitect ? 'captain' : 'architect')}
      className="relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full"
      style={{
        background: isArchitect
          ? `linear-gradient(135deg, ${accentColor}15, ${accentColor}08)`
          : 'rgba(255, 255, 255, 0.03)',
        border: `1px solid ${isArchitect ? `${accentColor}30` : 'rgba(255, 255, 255, 0.08)'}`,
      }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Ícone animado */}
      <motion.div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{
          background: isArchitect ? `${accentColor}20` : 'rgba(255, 255, 255, 0.06)',
        }}
        animate={{ rotate: isArchitect ? 180 : 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {isArchitect ? (
          <Settings2 size={16} style={{ color: accentColor }} />
        ) : (
          <Sparkles size={16} className="text-[#d4af37]" />
        )}
      </motion.div>

      {/* Texto */}
      <div className="flex-1 text-left">
        <div
          className="text-sm font-medium"
          style={{
            color: isArchitect ? accentColor : 'var(--text-primary)',
          }}
        >
          {isArchitect ? 'Modo Avançado' : 'Modo Simples'}
        </div>
        <div className="text-[10px] text-[var(--text-tertiary)]">
          {isArchitect ? 'Todos os controles ativos' : 'Controles essenciais'}
        </div>
      </div>

      {/* Toggle Switch */}
      <div
        className="w-11 h-6 rounded-full relative transition-colors"
        style={{
          background: isArchitect ? accentColor : 'rgba(255, 255, 255, 0.1)',
        }}
      >
        <motion.div
          className="absolute top-1 w-4 h-4 rounded-full"
          style={{
            background: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
          animate={{ left: isArchitect ? '24px' : '4px' }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </div>
    </motion.button>
  );
}

export default AdvancedModeToggle;