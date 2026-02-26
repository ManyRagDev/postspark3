import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Link2, Image, ArrowRight, Loader2, Layers, FileText, ChevronDown } from "lucide-react";
import type { InputType, PostMode, AiModel } from "@shared/postspark";
import { useAIProcessingStages } from "@/hooks/useAIProcessingStages";

interface SmartInputProps {
  onSubmit: (value: string, type: InputType) => void;
  isLoading?: boolean;
  onTextChange?: (text: string) => void;
  postMode?: PostMode;
  onPostModeChange?: (mode: PostMode) => void;
  selectedModel: AiModel;
  onModelChange: (model: AiModel) => void;
}

const URL_REGEX = /^(https?:\/\/|www\.)[^\s]+\.[^\s]{2,}/i;
const IMAGE_URL_REGEX = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i;

function detectInputType(value: string): InputType {
  const trimmed = value.trim();
  if (!trimmed) return "text";
  if (IMAGE_URL_REGEX.test(trimmed)) return "image";
  if (URL_REGEX.test(trimmed)) return "url";
  return "text";
}

const TYPE_CONFIG: Record<InputType, {
  label: string;
  sublabel: string;
  icon: typeof Sparkles;
  borderColor: string;
  glowColor: string;
  bgColor: string;
}> = {
  text: {
    label: "Modo Criativo",
    sublabel: "A IA sintetiza conteúdo original",
    icon: Sparkles,
    borderColor: "oklch(0.7 0.22 40)",
    glowColor: "oklch(0.7 0.22 40 / 25%)",
    bgColor: "oklch(0.7 0.22 40 / 8%)",
  },
  url: {
    label: "Modo Extração",
    sublabel: "Conteúdo será extraído automaticamente",
    icon: Link2,
    borderColor: "oklch(0.75 0.14 200)",
    glowColor: "oklch(0.75 0.14 200 / 25%)",
    bgColor: "oklch(0.75 0.14 200 / 8%)",
  },
  image: {
    label: "Modo Visual",
    sublabel: "Análise visual para compor o post",
    icon: Image,
    borderColor: "oklch(0.45 0.18 290)",
    glowColor: "oklch(0.45 0.18 290 / 25%)",
    bgColor: "oklch(0.45 0.18 290 / 8%)",
  },
};

export default function SmartInput({
  onSubmit,
  isLoading = false,
  onTextChange,
  postMode = 'static',
  onPostModeChange,
  selectedModel,
  onModelChange,
}: SmartInputProps) {
  const [value, setValue] = useState("");
  const [inputType, setInputType] = useState<InputType>("text");
  const [isFocused, setIsFocused] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [hoveredMode, setHoveredMode] = useState<PostMode | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const modeBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { stageText } = useAIProcessingStages({
    isActive: isLoading,
    preset: "generation",
  });

  const config = TYPE_CONFIG[inputType];
  const Icon = config.icon;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    setInputType(detectInputType(newValue));
    onTextChange?.(newValue);
  }, [onTextChange]);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isLoading) return;
    onSubmit(value.trim(), inputType);
  }, [value, inputType, onSubmit, isLoading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "28px";
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideButton = modeMenuRef.current?.contains(target);
      const isInsideDropdown = dropdownRef.current?.contains(target);

      if (!isInsideButton && !isInsideDropdown) {
        setShowModeMenu(false);
        setHoveredMode(null);
      }
    };
    if (showModeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModeMenu]);

  const modeConfig = {
    static: { icon: FileText, label: 'Estático' },
    carousel: { icon: Layers, label: 'Carrossel' },
  };
  const currentMode = modeConfig[postMode];
  const ModeIcon = currentMode.icon;

  // Handle selection: use hovered mode if hovering, otherwise use current postMode
  const effectiveMode = hoveredMode ?? postMode;

  const handleModeClick = useCallback((mode: PostMode) => {
    onPostModeChange?.(mode);
    setShowModeMenu(false);
    setHoveredMode(null);
  }, [onPostModeChange]);

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <motion.div
        className="relative rounded-2xl overflow-hidden"
        animate={{
          boxShadow: isFocused || value
            ? `0 0 30px ${config.glowColor}, 0 0 80px ${config.glowColor}`
            : "0 0 0px transparent",
        }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none z-10"
          style={{
            border: `1.5px solid ${isFocused || value ? config.borderColor : "oklch(1 0 0 / 10%)"}`,
          }}
          animate={{
            borderColor: isFocused || value ? config.borderColor : "oklch(1 0 0 / 10%)",
          }}
          transition={{ duration: 0.3 }}
        />

        <motion.div
          className="absolute inset-0 rounded-2xl"
          animate={{
            background: isFocused || value
              ? config.bgColor
              : "oklch(1 0 0 / 4%)",
          }}
          transition={{ duration: 0.3 }}
        />

        <div
          className="relative backdrop-blur-xl rounded-2xl p-4"
          style={{ WebkitBackdropFilter: "blur(24px)" }}
        >
          <AnimatePresence mode="wait">
            {value.trim() && (
              <motion.div
                key={inputType}
                initial={{ opacity: 0, y: -10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 mb-3"
              >
                <div
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: config.bgColor,
                    color: config.borderColor,
                    border: `1px solid ${config.borderColor}`,
                  }}
                >
                  <Icon size={12} />
                  {config.label}
                </div>
                <span className="text-xs" style={{ color: "oklch(0.6 0.03 280)" }}>
                  {config.sublabel}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <textarea
              ref={inputRef}
              data-tour="void-input"
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="O que vamos criar hoje?"
              rows={1}
              disabled={isLoading}
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-base resize-none outline-none leading-relaxed overflow-x-auto whitespace-nowrap"
              style={{
                fontFamily: "var(--font-sans)",
                height: "28px",
                minHeight: "28px",
                maxHeight: "28px",
              }}
            />

            <button
              type="button"
              onClick={() => onModelChange(selectedModel === 'gemini' ? 'llama' : 'gemini')}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all mr-1"
              style={{
                background: selectedModel === 'gemini' ? `oklch(0.5 0.15 250 / 12%)` : `oklch(0.65 0.20 25 / 12%)`,
                border: `1px solid ${selectedModel === 'gemini' ? 'oklch(0.5 0.15 250 / 40%)' : 'oklch(0.65 0.20 25 / 40%)'}`,
                color: selectedModel === 'gemini' ? 'oklch(0.65 0.15 250)' : 'oklch(0.75 0.20 25)',
                boxShadow: `0 0 12px ${selectedModel === 'gemini' ? 'oklch(0.5 0.15 250 / 20%)' : 'oklch(0.65 0.20 25 / 20%)'}, inset 0 1px 0 oklch(1 0 0 / 8%)`,
              }}
              title={selectedModel === 'gemini' ? "Usando Gemini (Rápido)" : "Usando Llama (Detalhado)"}
            >
              <Sparkles size={13} className={selectedModel === 'gemini' ? 'text-blue-400' : 'text-orange-400'} />
              <span className="text-xs font-semibold tracking-wide">{selectedModel === 'gemini' ? 'GEMINI' : 'LLAMA'}</span>
            </button>

            <div className="flex-shrink-0" ref={modeMenuRef}>
              <button
                ref={modeBtnRef}
                type="button"
                onClick={() => {
                  if (!showModeMenu && modeBtnRef.current) {
                    const rect = modeBtnRef.current.getBoundingClientRect();
                    setMenuPosition({
                      top: rect.bottom + 8,
                      right: window.innerWidth - rect.right,
                    });
                  }
                  setShowModeMenu(!showModeMenu);
                  if (!showModeMenu) {
                    setHoveredMode(postMode);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all"
                style={{
                  background: `oklch(0.7 0.22 40 / 12%)`,
                  border: `1px solid oklch(0.7 0.22 40 / 40%)`,
                  color: 'oklch(0.85 0.15 40)',
                  boxShadow: `0 0 12px oklch(0.7 0.22 40 / 20%), inset 0 1px 0 oklch(1 0 0 / 8%)`,
                }}
              >
                <motion.div
                  animate={{ rotate: hoveredMode === 'carousel' ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ModeIcon size={15} />
                </motion.div>
                <span className="text-xs font-medium">{modeConfig[effectiveMode].label}</span>
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${showModeMenu ? 'rotate-180' : ''}`}
                  style={{ opacity: 0.7 }}
                />
              </button>

              {showModeMenu && createPortal(
                <AnimatePresence>
                  <motion.div
                    ref={dropdownRef}
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="rounded-2xl overflow-hidden"
                    style={{
                      position: 'fixed',
                      top: menuPosition.top,
                      right: menuPosition.right,
                      width: '176px',
                      zIndex: 9999,
                      background: 'oklch(0.13 0.02 280 / 97%)',
                      border: '1px solid oklch(1 0 0 / 14%)',
                      boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px oklch(1 0 0 / 6%)',
                      backdropFilter: 'blur(24px)',
                      WebkitBackdropFilter: 'blur(24px)',
                    }}
                  >
                    {(['static', 'carousel'] as PostMode[]).map((mode, i) => {
                      const cfg = modeConfig[mode];
                      const IconComponent = cfg.icon;
                      const isSelected = mode === effectiveMode;

                      return (
                        <motion.button
                          key={mode}
                          type="button"
                          data-tour={`void-${mode}`}
                          onClick={() => handleModeClick(mode)}
                          onMouseEnter={() => setHoveredMode(mode)}
                          onMouseLeave={() => setHoveredMode(null)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left"
                          style={{
                            background: isSelected
                              ? 'oklch(0.7 0.22 40 / 15%)'
                              : 'transparent',
                            color: isSelected
                              ? 'oklch(0.95 0.02 280)'
                              : 'oklch(0.45 0.03 280)',
                            borderBottom: i === 0 ? '1px solid oklch(1 0 0 / 6%)' : 'none',
                          }}
                          whileHover={{ x: 4 }}
                          transition={{ duration: 0.15 }}
                        >
                          <motion.div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{
                              background: isSelected
                                ? 'oklch(0.7 0.22 40 / 30%)'
                                : 'oklch(1 0 0 / 6%)',
                            }}
                            animate={{
                              scale: isSelected ? 1.15 : 1,
                              background: isSelected
                                ? 'oklch(0.7 0.22 40 / 35%)'
                                : 'oklch(1 0 0 / 6%)',
                            }}
                            transition={{ duration: 0.15 }}
                          >
                            <IconComponent
                              size={14}
                              style={{
                                color: isSelected
                                  ? 'oklch(0.9 0.08 40)'
                                  : 'oklch(0.4 0.03 280)'
                              }}
                            />
                          </motion.div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-semibold">{cfg.label}</span>
                            <span className="text-[10px]" style={{ color: isSelected ? 'oklch(0.7 0.15 40)' : 'oklch(0.35 0.02 280)' }}>
                              {mode === 'static' ? 'Um único post' : 'Múltiplos slides'}
                            </span>
                          </div>
                          {isSelected && (
                            <motion.div
                              className="ml-auto w-2 h-2 rounded-full flex-shrink-0"
                              style={{
                                background: 'oklch(0.85 0.12 40)',
                                boxShadow: '0 0 10px oklch(0.7 0.22 40 / 90%)',
                              }}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.15 }}
                            />
                          )}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </AnimatePresence>,
                document.body
              )}
            </div>

            <motion.button
              onClick={handleSubmit}
              data-tour="void-submit"
              disabled={!value.trim() || isLoading}
              className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-colors disabled:opacity-30"
              style={{
                background: value.trim() ? config.borderColor : "oklch(1 0 0 / 8%)",
                color: value.trim() ? "oklch(0.08 0.02 280)" : "oklch(0.6 0.03 280)",
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ArrowRight size={18} />
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>

      <div className="text-center text-xs mt-4 h-5 relative">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.p
              key={stageText}
              className="ai-pulse"
              style={{ color: "oklch(0.62 0.12 40)" }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              {stageText}
            </motion.p>
          ) : (
            <motion.p
              key="idle"
              style={{ color: "oklch(0.5 0.03 280)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Insira uma ideia, texto ou URL para começar
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
