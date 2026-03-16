import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles,
  Link2,
  Image,
  ArrowRight,
  Loader2,
  Layers,
  FileText,
  BriefcaseBusiness,
  ChevronDown,
} from "lucide-react";
import type { CreationMode, InputType, PostMode } from "@shared/postspark";
import { useAIProcessingStages } from "@/hooks/useAIProcessingStages";

interface SmartInputProps {
  onSubmit: (value: string, type: InputType) => void;
  isLoading?: boolean;
  onTextChange?: (text: string) => void;
  postMode?: PostMode;
  onPostModeChange?: (mode: PostMode) => void;
  creationMode?: CreationMode;
  onCreationModeChange?: (mode: CreationMode) => void;
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

const TYPE_CONFIG: Record<
  InputType,
  {
    label: string;
    sublabel: string;
    icon: typeof Sparkles;
    borderColor: string;
    glowColor: string;
    bgColor: string;
  }
> = {
  text: {
    label: "Modo Criativo",
    sublabel: "A IA sintetiza conteudo original",
    icon: Sparkles,
    borderColor: "oklch(0.7 0.22 40)",
    glowColor: "oklch(0.7 0.22 40 / 25%)",
    bgColor: "oklch(0.7 0.22 40 / 8%)",
  },
  url: {
    label: "Modo Extracao",
    sublabel: "Conteudo sera extraido automaticamente",
    icon: Link2,
    borderColor: "oklch(0.75 0.14 200)",
    glowColor: "oklch(0.75 0.14 200 / 25%)",
    bgColor: "oklch(0.75 0.14 200 / 8%)",
  },
  image: {
    label: "Modo Visual",
    sublabel: "Analise visual para compor o post",
    icon: Image,
    borderColor: "oklch(0.45 0.18 290)",
    glowColor: "oklch(0.45 0.18 290 / 25%)",
    bgColor: "oklch(0.45 0.18 290 / 8%)",
  },
};

const EXECUTION_THEME = {
  label: "Modo Briefing",
  sublabel: "Voce chega com direcao e a IA estrutura a execucao",
  icon: BriefcaseBusiness,
  borderColor: "oklch(0.74 0.16 72)",
  glowColor: "oklch(0.74 0.16 72 / 24%)",
  bgColor: "oklch(0.74 0.16 72 / 8%)",
};

const POST_MODE_OPTIONS: Array<{
  id: PostMode;
  label: string;
  icon: typeof FileText;
}> = [
  { id: "static", label: "Estatico", icon: FileText },
  { id: "carousel", label: "Carrossel", icon: Layers },
];

const CREATION_MODE_OPTIONS: Array<{
  id: CreationMode;
  label: string;
}> = [
  { id: "ideation", label: "Crie para mim" },
  { id: "execution", label: "Ja sei o que quero" },
];

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  activeColor,
  compact = false,
}: {
  options: Array<{ id: T; label: string; icon?: typeof FileText }>;
  value: T;
  onChange: (value: T) => void;
  activeColor: string;
  compact?: boolean;
}) {
  const activeIndex = Math.max(options.findIndex((option) => option.id === value), 0);

  return (
    <div
      className={`relative grid rounded-full border p-1 ${compact ? "h-11" : "h-12"}`}
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.018))",
        borderColor: "rgba(255,255,255,0.075)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035), 0 10px 30px rgba(0,0,0,0.16)",
      }}
    >
      <motion.div
        className="absolute top-1 bottom-1 rounded-full"
        animate={{
          left: `calc(${activeIndex * (100 / options.length)}% + 4px)`,
          width: `calc(${100 / options.length}% - 8px)`,
          background: `linear-gradient(180deg, color-mix(in oklab, ${activeColor} 10%, transparent) 0%, color-mix(in oklab, ${activeColor} 4%, transparent) 100%)`,
          boxShadow: `0 0 0 1px color-mix(in oklab, ${activeColor} 70%, white 30%), 0 0 18px color-mix(in oklab, ${activeColor} 30%, transparent), 0 10px 24px color-mix(in oklab, ${activeColor} 18%, transparent), inset 0 1px 0 rgba(255,255,255,0.14)`,
        }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      />
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="relative z-10 flex items-center justify-center gap-2 rounded-full px-3 text-center transition-colors"
            style={{
              color: isActive ? "oklch(0.95 0.03 95)" : "rgba(255,255,255,0.68)",
              textShadow: isActive ? `0 0 14px color-mix(in oklab, ${activeColor} 42%, transparent)` : "none",
            }}
          >
            {Icon ? <Icon size={compact ? 13 : 14} /> : null}
            <span className={`${compact ? "text-[11px]" : "text-[12px]"} font-semibold tracking-[0.06em]`}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function SmartInput({
  onSubmit,
  isLoading = false,
  onTextChange,
  postMode = "static",
  onPostModeChange,
  creationMode = "ideation",
  onCreationModeChange,
}: SmartInputProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [value, setValue] = useState("");
  const [inputType, setInputType] = useState<InputType>("text");
  const [isFocused, setIsFocused] = useState(false);
  const [mobileTextareaHeight, setMobileTextareaHeight] = useState(32);
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

  const isExecutionMode = creationMode === "execution";
  const config = isExecutionMode ? EXECUTION_THEME : TYPE_CONFIG[inputType];
  const Icon = config.icon;
  const currentMode = POST_MODE_OPTIONS.find((option) => option.id === postMode) ?? POST_MODE_OPTIONS[0];
  const ModeIcon = currentMode.icon;
  const effectiveMode = hoveredMode ?? postMode;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setValue(newValue);
      setInputType(detectInputType(newValue));
      onTextChange?.(newValue);
    },
    [onTextChange],
  );

  const handleSubmit = useCallback(() => {
    if (isLoading) return;
    if (isExecutionMode) {
      onSubmit("", "text");
      return;
    }
    if (!value.trim()) return;
    onSubmit(value.trim(), inputType);
  }, [inputType, isExecutionMode, isLoading, onSubmit, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    if (isMobile) {
      textarea.style.height = "auto";
      const nextHeight = Math.max(32, textarea.scrollHeight);
      textarea.style.height = `${nextHeight}px`;
      setMobileTextareaHeight(nextHeight);
      return;
    }

    textarea.style.height = "28px";
    setMobileTextareaHeight(32);
  }, [isMobile, value]);

  useEffect(() => {
    const updateViewportMode = () => setIsMobile(window.innerWidth < 768);
    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

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
    if (showModeMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModeMenu]);

  const statusLine = (
    <div className="relative mt-4 h-5 text-center text-xs">
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
            key={isMobile ? "mobile-idle" : "desktop-idle"}
            style={{ color: "oklch(0.5 0.03 280)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {isExecutionMode
              ? isMobile
                ? "Ative o modo estruturado para seguir com um briefing guiado"
                : "Selecione para executar um briefing estruturado na proxima tela"
              : "Insira uma ideia, texto ou URL para comecar"}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );

  const desktopUi = (
    <div className="mx-auto w-full max-w-2xl px-4">
      <motion.div
        className="relative overflow-hidden rounded-2xl"
        animate={{
          boxShadow:
            isFocused || value || isExecutionMode
              ? `0 0 30px ${config.glowColor}, 0 0 80px ${config.glowColor}`
              : "0 0 0px transparent",
        }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl"
          animate={{
            borderColor: isFocused || value || isExecutionMode ? config.borderColor : "oklch(1 0 0 / 10%)",
          }}
          transition={{ duration: 0.3 }}
          style={{
            border: `1.5px solid ${isFocused || value || isExecutionMode ? config.borderColor : "oklch(1 0 0 / 10%)"}`,
          }}
        />
        <motion.div
          className="absolute inset-0 rounded-2xl"
          animate={{
            background: isFocused || value || isExecutionMode ? config.bgColor : "oklch(1 0 0 / 4%)",
          }}
          transition={{ duration: 0.3 }}
        />
        <div className="relative rounded-2xl p-4 backdrop-blur-xl" style={{ WebkitBackdropFilter: "blur(24px)" }}>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {[
              {
                id: "ideation" as const,
                title: "Quero ideias",
                description: "A IA explora caminhos criativos",
                icon: Sparkles,
                color: "oklch(0.7 0.22 40)",
              },
              {
                id: "execution" as const,
                title: "Ja sei o que criar",
                description: "Voce traz o briefing e a IA executa",
                icon: BriefcaseBusiness,
                color: "oklch(0.74 0.16 72)",
              },
            ].map((item) => {
              const isSelected = creationMode === item.id;
              const ItemIcon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onCreationModeChange?.(item.id)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-all"
                  style={{
                    background: isSelected
                      ? `linear-gradient(180deg, color-mix(in oklab, ${item.color} 18%, transparent) 0%, color-mix(in oklab, ${item.color} 10%, transparent) 100%)`
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isSelected ? `color-mix(in oklab, ${item.color} 62%, white 38%)` : "rgba(255,255,255,0.08)"}`,
                    color: isSelected ? "oklch(0.92 0.03 280)" : "oklch(0.65 0.03 280)",
                    boxShadow: isSelected
                      ? `inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 1px color-mix(in oklab, ${item.color} 28%, transparent), 0 10px 22px color-mix(in oklab, ${item.color} 16%, transparent)`
                      : "inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-lg"
                    style={{ background: isSelected ? `${item.color}26` : "oklch(1 0 0 / 6%)" }}
                  >
                    <ItemIcon size={14} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">{item.title}</span>
                    <span className="text-[10px]" style={{ color: isSelected ? `${item.color}` : "oklch(0.5 0.02 280)" }}>
                      {item.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <AnimatePresence initial={false} mode="wait">
              {!isExecutionMode ? (
                <motion.textarea
                  key="desktop-ideation-input"
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
                  className="flex-1 resize-none overflow-x-auto whitespace-nowrap bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                  style={{ fontFamily: "var(--font-sans)", height: "28px", minHeight: "28px", maxHeight: "28px" }}
                  initial={{ opacity: 0, height: 0, y: 8 }}
                  animate={{ opacity: 1, height: 28, y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                />
              ) : (
                <motion.div
                  key="desktop-execution-copy"
                  className="flex-1 pr-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                >
                  <div className="text-sm font-semibold text-white">Voce vai detalhar o briefing na proxima etapa</div>
                  <div className="mt-1 text-xs text-white/50">
                    Formato, conteudo, intervencao da IA e identidade visual serao configurados em seguida.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                  if (!showModeMenu) setHoveredMode(postMode);
                }}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-all"
                style={{
                  background: `oklch(0.7 0.22 40 / 12%)`,
                  border: `1px solid oklch(0.7 0.22 40 / 40%)`,
                  color: "oklch(0.85 0.15 40)",
                  boxShadow: `0 0 12px oklch(0.7 0.22 40 / 20%), inset 0 1px 0 oklch(1 0 0 / 8%)`,
                }}
              >
                <motion.div animate={{ rotate: hoveredMode === "carousel" ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ModeIcon size={15} />
                </motion.div>
                <span className="text-xs font-medium">{effectiveMode === "static" ? "Estatico" : "Carrossel"}</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${showModeMenu ? "rotate-180" : ""}`} />
              </button>

              {showModeMenu &&
                createPortal(
                  <AnimatePresence>
                    <motion.div
                      ref={dropdownRef}
                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden rounded-2xl"
                      style={{
                        position: "fixed",
                        top: menuPosition.top,
                        right: menuPosition.right,
                        width: "176px",
                        zIndex: 9999,
                        background: "oklch(0.13 0.02 280 / 97%)",
                        border: "1px solid oklch(1 0 0 / 14%)",
                        boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px oklch(1 0 0 / 6%)",
                        backdropFilter: "blur(24px)",
                        WebkitBackdropFilter: "blur(24px)",
                      }}
                    >
                      {POST_MODE_OPTIONS.map((option, i) => {
                        const isSelected = option.id === effectiveMode;
                        const OptionIcon = option.icon;
                        return (
                          <motion.button
                            key={option.id}
                            type="button"
                            data-tour={`void-${option.id}`}
                            onClick={() => {
                              onPostModeChange?.(option.id);
                              setShowModeMenu(false);
                              setHoveredMode(null);
                            }}
                            onMouseEnter={() => setHoveredMode(option.id)}
                            onMouseLeave={() => setHoveredMode(null)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left"
                            style={{
                              background: isSelected ? "oklch(0.7 0.22 40 / 15%)" : "transparent",
                              color: isSelected ? "oklch(0.95 0.02 280)" : "oklch(0.45 0.03 280)",
                              borderBottom: i === 0 ? "1px solid oklch(1 0 0 / 6%)" : "none",
                            }}
                          >
                            <div
                              className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0"
                              style={{ background: isSelected ? "oklch(0.7 0.22 40 / 30%)" : "oklch(1 0 0 / 6%)" }}
                            >
                              <OptionIcon size={14} style={{ color: isSelected ? "oklch(0.9 0.08 40)" : "oklch(0.4 0.03 280)" }} />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-semibold">{option.label}</span>
                              <span className="text-[10px]" style={{ color: isSelected ? "oklch(0.7 0.15 40)" : "oklch(0.35 0.02 280)" }}>
                                {option.id === "static" ? "Um unico post" : "Multiplos slides"}
                              </span>
                            </div>
                          </motion.button>
                        );
                      })}
                    </motion.div>
                  </AnimatePresence>,
                  document.body,
                )}
            </div>

            <motion.button
              onClick={handleSubmit}
              data-tour="void-submit"
              disabled={(!isExecutionMode && !value.trim()) || isLoading}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30"
              style={{
                background: isExecutionMode || value.trim() ? config.borderColor : "oklch(1 0 0 / 8%)",
                color: isExecutionMode || value.trim() ? "oklch(0.08 0.02 280)" : "oklch(0.6 0.03 280)",
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title={isExecutionMode ? "Continuar briefing" : "Gerar ideias"}
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            </motion.button>
          </div>
        </div>
      </motion.div>
      {statusLine}
    </div>
  );

  const mobileUi = (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-0 sm:px-4">
      <SegmentedControl
        options={CREATION_MODE_OPTIONS}
        value={creationMode}
        onChange={(mode) => onCreationModeChange?.(mode)}
        activeColor={isExecutionMode ? EXECUTION_THEME.borderColor : "oklch(0.7 0.22 40)"}
      />
      <motion.div
        className="relative overflow-hidden rounded-2xl"
        animate={{
          boxShadow:
            isFocused || value || isExecutionMode
              ? `0 0 24px ${config.glowColor}, 0 0 56px ${config.glowColor}`
              : "0 0 0px transparent",
        }}
        transition={{ duration: 0.35 }}
      >
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl"
          animate={{
            borderColor: isFocused || value || isExecutionMode ? config.borderColor : "oklch(1 0 0 / 10%)",
          }}
          transition={{ duration: 0.3 }}
          style={{
            border: `1.5px solid ${isFocused || value || isExecutionMode ? config.borderColor : "oklch(1 0 0 / 10%)"}`,
          }}
        />
        <motion.div
          className="absolute inset-0 rounded-2xl"
          animate={{
            background: isFocused || value || isExecutionMode ? config.bgColor : "oklch(1 0 0 / 4%)",
          }}
          transition={{ duration: 0.3 }}
        />
        <div className="relative rounded-2xl p-4 backdrop-blur-xl" style={{ WebkitBackdropFilter: "blur(24px)" }}>
          <AnimatePresence mode="wait">
            {(isExecutionMode || value.trim()) && (
              <motion.div
                key={isExecutionMode ? "execution-badge" : inputType}
                initial={{ opacity: 0, y: -10, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.94 }}
                transition={{ duration: 0.2 }}
                className="mb-3 flex items-center gap-2"
              >
                <div
                  className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
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
          <div className="flex items-start gap-3">
            <AnimatePresence initial={false} mode="wait">
              {!isExecutionMode ? (
                <motion.textarea
                  key="mobile-ideation-input"
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
                  className="flex-1 resize-none overflow-hidden bg-transparent px-1 pt-2 text-base leading-relaxed text-foreground outline-none placeholder:text-white/36 whitespace-pre-wrap break-words"
                  style={{ fontFamily: "var(--font-sans)", minHeight: "32px", height: `${mobileTextareaHeight}px` }}
                  initial={{ opacity: 0, height: 0, y: 8 }}
                  animate={{ opacity: 1, height: mobileTextareaHeight, y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                />
              ) : (
                <motion.div
                  key="mobile-execution-copy"
                  className="flex-1 px-1 pt-1"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                >
                  <div className="text-sm font-semibold text-white">Voce vai detalhar o briefing na proxima etapa</div>
                  <div className="mt-1 text-xs leading-relaxed text-white/50">
                    Formato, conteudo, intervencao da IA e identidade visual serao configurados em seguida.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button
              onClick={handleSubmit}
              data-tour="void-submit"
              disabled={(!isExecutionMode && !value.trim()) || isLoading}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30"
              style={{
                background: isExecutionMode || value.trim() ? config.borderColor : "oklch(1 0 0 / 8%)",
                color: isExecutionMode || value.trim() ? "oklch(0.08 0.02 280)" : "oklch(0.6 0.03 280)",
                boxShadow: isExecutionMode || value.trim() ? `0 10px 26px ${config.glowColor}` : "none",
              }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              title={isExecutionMode ? "Continuar briefing" : "Gerar ideias"}
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            </motion.button>
          </div>
        </div>
      </motion.div>
      <SegmentedControl
        options={POST_MODE_OPTIONS}
        value={postMode}
        onChange={(mode) => onPostModeChange?.(mode)}
        activeColor={isExecutionMode ? "oklch(0.74 0.16 72 / 0.92)" : "oklch(0.7 0.22 40 / 0.92)"}
        compact
      />
      {statusLine}
    </div>
  );

  return isMobile ? mobileUi : desktopUi;
}
