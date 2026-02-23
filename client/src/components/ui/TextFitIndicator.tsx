/**
 * TextFitIndicator — Indica visualmente se o texto cabe no aspect ratio
 *
 * Mostra:
 * - Status ideal/tight/overflow para título e corpo
 * - Sugestões de ajuste
 * - Contagem de caracteres vs limite
 */

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, MinusCircle } from 'lucide-react';
import type { AspectRatio } from '@shared/postspark';
import { analyzeTextFit } from '@/hooks/useTextAutoFit';

interface TextFitIndicatorProps {
  headline: string;
  body: string;
  aspectRatio: AspectRatio;
  accentColor?: string;
  showSuggestions?: boolean;
}

export function TextFitIndicator({
  headline,
  body,
  aspectRatio,
  accentColor = '#a855f7',
  showSuggestions = true,
}: TextFitIndicatorProps) {
  const { headlineStatus, bodyStatus, suggestions } = analyzeTextFit(
    headline,
    body,
    aspectRatio
  );

  const getStatusIcon = (status: 'ideal' | 'tight' | 'overflow') => {
    switch (status) {
      case 'ideal':
        return <CheckCircle size={12} className="text-green-400" />;
      case 'tight':
        return <MinusCircle size={12} className="text-yellow-400" />;
      case 'overflow':
        return <AlertTriangle size={12} className="text-red-400" />;
    }
  };

  const getStatusColor = (status: 'ideal' | 'tight' | 'overflow') => {
    switch (status) {
      case 'ideal':
        return 'rgba(34, 197, 94, 0.15)';
      case 'tight':
        return 'rgba(234, 179, 8, 0.15)';
      case 'overflow':
        return 'rgba(239, 68, 68, 0.15)';
    }
  };

  const limits = {
    '1:1': { headline: 60, body: 120 },
    '5:6': { headline: 80, body: 180 },
    '9:16': { headline: 120, body: 300 },
  };

  const limit = limits[aspectRatio];

  return (
    <div className="space-y-2">
      {/* Status badges */}
      <div className="flex gap-2">
        {/* Headline status */}
        <motion.div
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium"
          style={{
            background: getStatusColor(headlineStatus),
            border: `1px solid ${getStatusColor(headlineStatus)}`,
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          {getStatusIcon(headlineStatus)}
          <span className="text-white/80">Título</span>
          <span className="font-mono text-white/60">
            {headline.length}/{limit.headline}
          </span>
        </motion.div>

        {/* Body status */}
        <motion.div
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium"
          style={{
            background: getStatusColor(bodyStatus),
            border: `1px solid ${getStatusColor(bodyStatus)}`,
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, delay: 0.05 }}
        >
          {getStatusIcon(bodyStatus)}
          <span className="text-white/80">Corpo</span>
          <span className="font-mono text-white/60">
            {body.length}/{limit.body}
          </span>
        </motion.div>
      </div>

      {/* Suggestions */}
      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="p-2 rounded-lg space-y-1"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              {suggestions.map((suggestion, i) => (
                <p
                  key={i}
                  className="text-[10px] text-red-300/90 flex items-start gap-1"
                >
                  <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                  {suggestion}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * TextFitWarning — Versão compacta para mostrar no preview
 */
export function TextFitWarning({
  headline,
  body,
  aspectRatio,
}: {
  headline: string;
  body: string;
  aspectRatio: AspectRatio;
}) {
  const { headlineStatus, bodyStatus } = analyzeTextFit(
    headline,
    body,
    aspectRatio
  );

  const hasWarning = headlineStatus === 'overflow' || bodyStatus === 'overflow';

  if (!hasWarning) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium bg-red-500/15 text-red-300"
    >
      <AlertTriangle size={10} />
      Texto excede limite para {aspectRatio}
    </motion.div>
  );
}