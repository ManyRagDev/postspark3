/**
 * TrinityLayout - Layout Desktop Premium
 * 
 * Estrutura: [Sidebar 18% | Canvas 55% | Panel 27%]
 * Otimizado para telas ≥1024px
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TrinityLayoutProps {
  /** Conteúdo da sidebar esquerda */
  sidebar: React.ReactNode;
  /** Canvas central (preview do post) */
  canvas: React.ReactNode;
  /** Painel de controles direito */
  panel: React.ReactNode;
  /** Classe adicional */
  className?: string;
}

export function TrinityLayout({
  sidebar,
  canvas,
  panel,
  className,
}: TrinityLayoutProps) {
  return (
    <div
      className={cn(
        'hidden lg:flex h-screen w-full overflow-hidden',
        'bg-[var(--bg-void)]',
        className
      )}
    >
      {/* Sidebar - 18% */}
      <motion.aside
        className="w-[18%] min-w-[220px] max-w-[280px] h-full flex flex-col"
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{
          background: 'var(--bg-base)',
          borderRight: '1px solid var(--glass-border)',
        }}
      >
        {sidebar}
      </motion.aside>

      {/* Canvas - 55% */}
      <motion.main
        className="flex-1 h-full flex flex-col items-center justify-center relative overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        style={{
          background: 'var(--bg-void)',
        }}
      >
        {/* Background gradient sutil */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(99, 102, 241, 0.03) 0%, transparent 70%)',
          }}
        />
        {canvas}
      </motion.main>

      {/* Panel - 27% */}
      <motion.aside
        className="w-[27%] min-w-[320px] max-w-[420px] h-full flex flex-col"
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
        style={{
          background: 'var(--bg-base)',
          borderLeft: '1px solid var(--glass-border)',
        }}
      >
        {panel}
      </motion.aside>
    </div>
  );
}

export default TrinityLayout;
