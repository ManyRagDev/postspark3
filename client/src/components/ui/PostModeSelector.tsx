/**
 * PostModeSelector — Dropdown para selecionar modo de post
 * 
 * Design inspirado em seletores de modelo de chats de IA
 * • Post Estático (padrão) — uma única imagem
 * • Carrossel — múltiplos slides com narrativa
 * 
 * UX: Compacto, não intrusivo, com animação suave
 */

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Layers, Square } from "lucide-react";
import type { PostMode } from "@shared/postspark";
import { POST_MODE_CONFIG } from "@shared/postspark";

interface PostModeSelectorProps {
  value: PostMode;
  onChange: (mode: PostMode) => void;
  disabled?: boolean;
  accentColor?: string;
}

const MODE_ICONS: Record<PostMode, typeof Square> = {
  static: Square,
  carousel: Layers,
};

export default function PostModeSelector({
  value,
  onChange,
  disabled = false,
  accentColor = "oklch(0.7 0.22 40)",
}: PostModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentConfig = POST_MODE_CONFIG[value];
  const CurrentIcon = MODE_ICONS[value];

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const handleSelect = (mode: PostMode) => {
    onChange(mode);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <motion.button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
        style={{
          background: isOpen ? `${accentColor}15` : "oklch(1 0 0 / 5%)",
          border: `1px solid ${isOpen ? `${accentColor}30` : "oklch(1 0 0 / 8%)"}`,
          color: disabled ? "oklch(0.4 0.02 280)" : "oklch(0.65 0.03 280)",
        }}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
      >
        <CurrentIcon size={12} style={{ color: disabled ? undefined : accentColor }} />
        <span>{currentConfig.label}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={12} />
        </motion.div>
      </motion.button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-0 mt-2 w-48 z-50 overflow-hidden rounded-xl"
            style={{
              background: "linear-gradient(135deg, oklch(0.12 0.02 280), oklch(0.08 0.02 280))",
              border: "1px solid oklch(1 0 0 / 10%)",
              boxShadow: `0 8px 32px oklch(0 0 0 / 40%), 0 0 0 1px ${accentColor}10`,
              backdropFilter: "blur(24px)",
            }}
          >
            {/* Glow effect */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse 100% 60% at 50% 0%, ${accentColor}10 0%, transparent 70%)`,
              }}
            />

            {(Object.keys(POST_MODE_CONFIG) as PostMode[]).map((mode) => {
              const config = POST_MODE_CONFIG[mode];
              const Icon = MODE_ICONS[mode];
              const isSelected = mode === value;

              return (
                <motion.button
                  key={mode}
                  onClick={() => handleSelect(mode)}
                  className="relative w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                  style={{
                    background: isSelected ? `${accentColor}12` : "transparent",
                  }}
                  whileHover={{ background: `${accentColor}08` }}
                >
                  {/* Selected indicator */}
                  {isSelected && (
                    <motion.div
                      layoutId="postmode-indicator"
                      className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
                      style={{ background: accentColor }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}

                  <Icon
                    size={16}
                    style={{ color: isSelected ? accentColor : "oklch(0.5 0.03 280)" }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-medium"
                        style={{ color: isSelected ? accentColor : "oklch(0.85 0.01 280)" }}
                      >
                        {config.label}
                      </span>
                      {isSelected && (
                        <Check size={12} style={{ color: accentColor }} />
                      )}
                    </div>
                    <span
                      className="text-[10px]"
                      style={{ color: "oklch(0.45 0.03 280)" }}
                    >
                      {config.description}
                    </span>
                  </div>
                </motion.button>
              );
            })}

            {/* Hint */}
            <div
              className="px-4 py-2 border-t"
              style={{ borderColor: "oklch(1 0 0 / 6%)" }}
            >
              <span
                className="text-[9px]"
                style={{ color: "oklch(0.4 0.03 280)" }}
              >
                {value === "carousel" 
                  ? "A IA criará uma narrativa com múltiplos slides"
                  : "A IA criará variações de um único post"
                }
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}