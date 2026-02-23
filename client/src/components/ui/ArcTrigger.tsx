/**
 * ArcTrigger - Handle dourado para abrir o Arc Drawer (mobile)
 * 
 * Design minimalista com animação de pulsação sutil.
 * Ao arrastar para cima (>100px), dispara a ação onDrag.
 */

import { motion } from 'framer-motion';

interface ArcTriggerProps {
  onDrag: () => void;
  className?: string;
}

export function ArcTrigger({ onDrag, className = '' }: ArcTriggerProps) {
  return (
    <motion.div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.3 }}
    >
      <motion.div
        className="w-20 h-1 rounded-full cursor-grab active:cursor-grabbing"
        style={{
          background: 'rgba(212, 175, 55, 0.6)',
          boxShadow: '0 0 20px rgba(212, 175, 55, 0.3)',
        }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          if (info.offset.y < -100) {
            onDrag();
          }
        }}
        animate={{
          scale: [1, 1.02, 1],
          opacity: [0.6, 0.8, 0.6],
        }}
        transition={{
          repeat: Infinity,
          duration: 5,
          ease: 'easeInOut',
        }}
        whileHover={{
          scale: 1.05,
          opacity: 0.9,
        }}
        whileTap={{
          scale: 0.95,
        }}
      />
      {/* Label sutil abaixo */}
      <motion.p
        className="text-[10px] text-center mt-2 tracking-wider uppercase"
        style={{ color: 'rgba(148, 163, 184, 0.5)' }}
        animate={{ opacity: [0.3, 0.5, 0.3] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
      >
        Arraste para cima
      </motion.p>
    </motion.div>
  );
}

export default ArcTrigger;
