/**
 * GlassCard - Componente base glassmorphism premium
 * 
 * Usado como fundo para todos os painéis e cards da interface.
 * Suporta diferentes elevações e estados interativos.
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type GlassElevation = 'resting' | 'elevated' | 'floating';
export type GlassMode = 'default' | 'captain' | 'architect';

interface GlassCardProps {
  children: React.ReactNode;
  elevation?: GlassElevation;
  interactive?: boolean;
  mode?: GlassMode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

const elevationStyles: Record<GlassElevation, string> = {
  resting: '',
  elevated: 'shadow-2xl',
  floating: 'shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)]',
};

const modeStyles: Record<GlassMode, string> = {
  default: '',
  captain: 'border-[var(--accent-gold)]/20',
  architect: 'border-[var(--accent-architect)]/20',
};

export function GlassCard({
  children,
  elevation = 'resting',
  interactive = false,
  mode = 'default',
  className,
  style,
  onClick,
}: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        'rounded-2xl backdrop-blur-xl',
        'bg-gradient-to-br from-white/10 to-white/5',
        'border border-white/[0.08]',
        'shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]',
        elevationStyles[elevation],
        modeStyles[mode],
        interactive && 'hover:-translate-y-1 hover:border-white/15 transition-all duration-300',
        className
      )}
      style={{
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        ...style,
      }}
      onClick={onClick}
      whileHover={
        interactive
          ? {
              y: -4,
              boxShadow: '0 25px 50px rgba(0,0,0,0.6)',
            }
          : undefined
      }
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {children}
    </motion.div>
  );
}

export default GlassCard;
