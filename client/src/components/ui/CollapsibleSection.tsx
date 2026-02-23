/**
 * CollapsibleSection - Seção colapsável para sidebar
 * 
 * Cada seção pode ser expandida/colapsada mantendo o conteúdo
 * sempre no mesmo lugar visual, eliminando o ping-pong de navegação.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  /** Título da seção */
  title: string;
  /** Ícone da seção */
  icon: React.ReactNode;
  /** Se a seção está expandida */
  isExpanded: boolean;
  /** Callback para toggle */
  onToggle: () => void;
  /** Badge de status (ex: "5 hashtags") */
  statusBadge?: string;
  /** Cor de destaque quando ativo */
  accentColor?: string;
  /** Conteúdo da seção */
  children: React.ReactNode;
  /** Classe adicional */
  className?: string;
}

export function CollapsibleSection({
  title,
  icon,
  isExpanded,
  onToggle,
  statusBadge,
  accentColor = '#a855f7',
  children,
  className,
}: CollapsibleSectionProps) {
  return (
    <div
      className={cn(
        'rounded-xl overflow-hidden transition-all',
        isExpanded ? 'bg-white/[0.02]' : 'bg-transparent',
        className
      )}
      style={{
        border: isExpanded ? `1px solid ${accentColor}20` : '1px solid transparent',
      }}
    >
      {/* Header - Sempre visível */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-3 transition-all group"
        style={{
          background: isExpanded ? `${accentColor}08` : 'transparent',
        }}
      >
        {/* Ícone */}
        <span
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{
            background: isExpanded ? `${accentColor}20` : 'rgba(255, 255, 255, 0.04)',
            color: isExpanded ? accentColor : 'var(--text-tertiary)',
          }}
        >
          {icon}
        </span>

        {/* Título e Badge */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium"
              style={{
                color: isExpanded ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {title}
            </span>
            {statusBadge && !isExpanded && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: 'var(--text-tertiary)',
                }}
              >
                {statusBadge}
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 0 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {isExpanded ? (
            <ChevronDown size={16} style={{ color: accentColor }} />
          ) : (
            <ChevronRight size={16} className="text-[var(--text-tertiary)]" />
          )}
        </motion.div>
      </button>

      {/* Conteúdo Colapsável */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CollapsibleSection;