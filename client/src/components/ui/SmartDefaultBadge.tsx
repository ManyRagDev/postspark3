/**
 * SmartDefaultBadge - Indicador de campo gerenciado por IA no modo Captain
 * 
 * Mostra um badge ✨ ao lado do label. Clicar expande para Architect.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

interface SmartDefaultBadgeProps {
  label: string;
  currentValue?: string;
  onExpandToArchitect: () => void;
}

export function SmartDefaultBadge({
  label,
  currentValue,
  onExpandToArchitect,
}: SmartDefaultBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <motion.button
        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
        style={{
          background: 'rgba(212, 175, 55, 0.15)',
          color: '#d4af37',
          border: '1px solid rgba(212, 175, 55, 0.25)',
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Sparkles size={10} />
        <span>Otimizado por IA</span>
      </motion.button>

      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute left-0 top-full mt-2 z-50 p-3 rounded-xl min-w-[200px]"
            style={{
              background: 'linear-gradient(135deg, rgba(19, 20, 28, 0.95) 0%, rgba(19, 20, 28, 0.9) 100%)',
              backdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <p className="text-xs text-[var(--text-secondary)] mb-1">
              <span className="text-[var(--text-primary)] font-medium">{label}</span> está sendo
              gerenciado automaticamente.
            </p>
            {currentValue && (
              <p className="text-[10px] text-[var(--text-tertiary)] mb-2 truncate">
                Valor atual: {currentValue}
              </p>
            )}
            <motion.button
              onClick={() => {
                onExpandToArchitect();
                setShowTooltip(false);
              }}
              className="flex items-center gap-1.5 w-full justify-center px-3 py-1.5 rounded-lg text-[10px] font-medium"
              style={{
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#6366f1',
                border: '1px solid rgba(99, 102, 241, 0.25)',
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <SlidersHorizontal size={10} />
              Ajustar Manualmente
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SmartDefaultBadge;
