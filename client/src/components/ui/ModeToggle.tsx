/**
 * ModeToggle - Toggle Captain/Architect para o sistema Dual Layer
 * 
 * Design premium com cores distintivas:
 * - Captain (Dourado): Simples, eficiente, amigável
 * - Architect (Roxo): Técnico, poderoso, avançado
 */

import { motion } from 'framer-motion';
import { Sparkles, SlidersHorizontal } from 'lucide-react';
import type { ControlMode } from '@/hooks/useControlMode';

interface ModeToggleProps {
  mode: ControlMode;
  onChange: (mode: ControlMode) => void;
  leftLabel?: string;
  rightLabel?: string;
  showIcons?: boolean;
  className?: string;
}

export function ModeToggle({
  mode,
  onChange,
  leftLabel = 'Captain',
  rightLabel = 'Architect',
  showIcons = true,
  className = '',
}: ModeToggleProps) {
  const isCaptain = mode === 'captain';

  return (
    <div
      className={`flex items-center gap-1.5 p-1 rounded-xl backdrop-blur-md ${className}`}
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Captain Button */}
      <motion.button
        onClick={() => onChange('captain')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all relative"
        animate={{
          background: isCaptain
            ? 'rgba(212, 175, 55, 0.15)'
            : 'transparent',
          color: isCaptain ? '#d4af37' : 'rgba(148, 163, 184, 0.6)',
        }}
        whileHover={!isCaptain ? { color: 'rgba(148, 163, 184, 0.9)' } : {}}
        whileTap={{ scale: 0.97 }}
      >
        {showIcons && (
          <Sparkles size={14} className={isCaptain ? 'opacity-100' : 'opacity-50'} />
        )}
        <span>{leftLabel}</span>
        {isCaptain && (
          <motion.div
            layoutId="mode-indicator"
            className="absolute inset-0 rounded-lg border border-[#d4af37]/30"
            initial={false}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        )}
      </motion.button>

      {/* Architect Button */}
      <motion.button
        onClick={() => onChange('architect')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all relative"
        animate={{
          background: !isCaptain
            ? 'rgba(99, 102, 241, 0.15)'
            : 'transparent',
          color: !isCaptain ? '#6366f1' : 'rgba(148, 163, 184, 0.6)',
        }}
        whileHover={isCaptain ? { color: 'rgba(148, 163, 184, 0.9)' } : {}}
        whileTap={{ scale: 0.97 }}
      >
        {showIcons && (
          <SlidersHorizontal size={14} className={!isCaptain ? 'opacity-100' : 'opacity-50'} />
        )}
        <span>{rightLabel}</span>
        {!isCaptain && (
          <motion.div
            layoutId="mode-indicator"
            className="absolute inset-0 rounded-lg border border-[#6366f1]/30"
            initial={false}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        )}
      </motion.button>
    </div>
  );
}

export default ModeToggle;
