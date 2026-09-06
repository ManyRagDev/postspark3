import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { loadFontByName } from "@/lib/fonts";
import SparkLogo from "@/components/SparkLogo";
import UserTopMenu from "@/components/UserTopMenu";
import {
  STUDIO,
  MONO,
  URL_REGEX,
  SPECIMEN_FONTS,
  FormatSelector,
  buildSpecimens,
  SpecimenCard,
  ProductionOverlay,
  type Specimen,
} from "./shared";

/**
 * StudioCreateViewV2B — iteração regularizada e polida da tela de criação.
 *
 * Contrato preservado: onSubmit(prompt, mode) + isLoading + declaredFamilyId + onDeclareFamily.
 */

interface StudioCreateViewV2BProps {
  onSubmit: (prompt: string, mode: "static" | "carousel") => void;
  isLoading: boolean;
  declaredFamilyId: string | null;
  onDeclareFamily: (familyId: string | null) => void;
}

export default function StudioCreateViewV2B({
  onSubmit,
  isLoading,
  declaredFamilyId,
  onDeclareFamily,
}: StudioCreateViewV2BProps) {
  const [prompt, setPrompt] = useState("");
  const [postMode, setPostMode] = useState<"static" | "carousel">("static");
  const [isFocused, setIsFocused] = useState(false);
  // Inicia recolhido por padrão conforme solicitado
  const [isSpecimensOpen, setIsSpecimensOpen] = useState(false);
  // Estado para a Lente de Inspeção Rápida no Desktop
  const [hoveredSpecimenIndex, setHoveredSpecimenIndex] = useState<number | null>(null);
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const specimens = buildSpecimens();

  useEffect(() => {
    SPECIMEN_FONTS.forEach(loadFontByName);
  }, []);

  // Autoresize com teto: texto longo rola DENTRO do campo — a página nunca rola.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [prompt]);

  const isEmpty = prompt.trim().length === 0;
  const isUrl = URL_REGEX.test(prompt.trim());
  const canSubmit = !isEmpty && !isLoading;
  const declaredSpecimen = specimens.find((s) => s.id === declaredFamilyId) ?? null;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setLastSubmittedPrompt(prompt.trim());
    onSubmit(prompt.trim(), postMode);
  };

  // Toque no espécime: traz a copy e alterna o gosto (liga/desliga/migra).
  const handleSpecimenPick = (specimen: Specimen) => {
    setPrompt(specimen.prompt);
    onDeclareFamily(declaredFamilyId === specimen.id ? null : specimen.id);
  };

  return (
    <div className="flex h-[100svh] flex-col overflow-hidden" style={{ background: STUDIO.bg, color: STUDIO.ink }}>
      <style>{`
        .psv2b-prompt::placeholder {
          font-family: 'Playfair Display', serif;
          font-style: italic;
          color: rgba(242,237,228,0.4);
          font-size: 1.35rem;
          line-height: 1.35;
        }
        @media (min-width: 768px) {
          .psv2b-prompt::placeholder {
            font-size: 1.65rem;
          }
        }
      `}</style>

      {/* MENU DO USUÁRIO NO CANTO SUPERIOR DIREITO (SPARKS, SALVOS, PERFIL) */}
      <UserTopMenu />

      {/* ÁREA PRINCIPAL CENTRALIZADA VERTICALMENTE */}
      <main className="min-h-0 flex-1 flex flex-col justify-center px-4 py-4 md:px-8 md:py-6 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto flex w-full max-w-2xl flex-col my-auto space-y-4">
          
          {/* 1. BRANDING OFICIAL POSTSPARK (SÍMBOLO 2X + DISTANCIAMENTO NOBRE) */}
          <section className="text-center">
            <div className="flex flex-col items-center justify-center gap-2 mb-6 md:mb-8">
              <SparkLogo size={152} />
              <div
                className="text-3xl md:text-4xl font-black tracking-tight select-none mt-1"
                style={{ fontFamily: "var(--font-display, sans-serif)" }}
              >
                <span className="text-white">Post</span>
                <span className="text-[#FF5C00]">Spark</span>
              </div>
            </div>

            <h1
              className="text-[1.45rem] leading-tight tracking-[-0.02em] md:text-3xl text-white font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              O que vamos{" "}
              <span
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontStyle: "italic",
                  fontWeight: 500,
                }}
              >
                dirigir
              </span>{" "}
              hoje?
            </h1>
            <p
              className="mt-1 text-[12px] md:text-[13px] leading-relaxed text-white/50"
            >
              Digite uma ideia — ou cole o link do seu site.
            </p>
          </section>

          {/* 2. A FOLHA DE ESCRITA / PROMPT */}
          <section>
            <div
              className="rounded-2xl border transition-all duration-200 shadow-2xl backdrop-blur-md"
              style={{
                background: isFocused ? "rgba(242,237,228,0.06)" : "rgba(242,237,228,0.03)",
                borderColor: isFocused ? "rgba(255,92,0,0.4)" : STUDIO.hairline,
                boxShadow: isFocused ? "0 0 24px rgba(255,92,0,0.18), inset 0 -1.5px 0 #FF5C00" : "none",
              }}
            >
              <div className="flex items-end gap-1 p-1.5">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Conte a ideia…"
                  rows={1}
                  disabled={isLoading}
                  aria-label="Tema ou ideia do post"
                  className="psv2b-prompt w-full min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2.5 pl-3.5 pr-1 outline-none"
                  style={{
                    fontFamily: "var(--font-sans)",
                    color: STUDIO.ink,
                    fontSize: 16,
                    lineHeight: 1.45,
                    minHeight: isEmpty ? 76 : 48,
                    transition: "min-height 200ms ease",
                  }}
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  aria-label={declaredSpecimen ? "Criar com este gosto" : "Criar direções de arte"}
                  className="mb-1.5 mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-95 cursor-pointer"
                  style={{
                    background: canSubmit ? "#FF5C00" : "rgba(242,237,228,0.06)",
                    color: canSubmit ? "#FFFFFF" : STUDIO.ink40,
                    border: canSubmit ? "none" : `1px solid ${STUDIO.hairline}`,
                    boxShadow: canSubmit ? "0 4px 16px rgba(255,92,0,0.4)" : "none",
                  }}
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin text-white" /> : <ArrowRight size={16} />}
                </button>
              </div>
            </div>

            {/* Micro-labels abaixo do campo */}
            <div className="mt-1.5 flex items-baseline justify-between px-1">
              <span
                className="min-w-0"
                style={{
                  ...MONO,
                  fontSize: 8.5,
                  letterSpacing: "0.14em",
                  color: isUrl ? STUDIO.urlSignal : STUDIO.ink40,
                  transition: "color 200ms",
                }}
              >
                {isUrl
                  ? declaredSpecimen
                    ? "Fonte — Site ↗ a identidade do site prevalece sobre o gosto"
                    : "Fonte — Site ↗ a identidade visual será extraída"
                  : "Fonte — Texto livre"}
              </span>
              <span
                className="ml-2 shrink-0 text-right font-medium"
                style={{
                  ...MONO,
                  fontSize: 8.5,
                  letterSpacing: "0.14em",
                  color: declaredSpecimen ? "#FF5C00" : STUDIO.ink40,
                  transition: "color 200ms",
                }}
              >
                {declaredSpecimen ? "Criar com este gosto" : "Criar direções de arte"}
              </span>
            </div>
          </section>

          {/* 3. SELETOR DE FORMATO (POST ÚNICO / CARROSSEL) */}
          <section>
            <FormatSelector value={postMode} onChange={setPostMode} />
          </section>

          {/* 4. PAINEL DE SUGESTÕES (INICIA RECOLHIDO COM DESTAQUE DISCRETO E NOBRE) */}
          <section className="pt-1 relative">
            {/* Lente Flutuante de Zoom Óptico 2x (Desktop Only — Renderizada fora de qualquer overflow-hidden) */}
            <AnimatePresence>
              {isSpecimensOpen && hoveredSpecimenIndex !== null && specimens[hoveredSpecimenIndex] && (
                <motion.div
                  key={`quick-look-${hoveredSpecimenIndex}`}
                  initial={{
                    opacity: 0,
                    y: 10,
                    scale: 0.94,
                    x: hoveredSpecimenIndex === 0 ? "0%" : hoveredSpecimenIndex === 5 ? "0%" : "-50%",
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    x: hoveredSpecimenIndex === 0 ? "0%" : hoveredSpecimenIndex === 5 ? "0%" : "-50%",
                  }}
                  exit={{
                    opacity: 0,
                    y: 6,
                    scale: 0.94,
                    x: hoveredSpecimenIndex === 0 ? "0%" : hoveredSpecimenIndex === 5 ? "0%" : "-50%",
                  }}
                  transition={{ type: "spring", stiffness: 450, damping: 30 }}
                  className={`hidden md:block absolute bottom-full mb-3 z-50 pointer-events-none ${
                    hoveredSpecimenIndex === 0
                      ? "left-0"
                      : hoveredSpecimenIndex === 5
                      ? "right-0"
                      : ""
                  }`}
                  style={
                    hoveredSpecimenIndex !== 0 && hoveredSpecimenIndex !== 5
                      ? { left: `${((hoveredSpecimenIndex + 0.5) / 6) * 100}%` }
                      : undefined
                  }
                >
                  <div className="w-[214px] p-2.5 rounded-2xl border border-white/20 bg-[#07090E]/98 backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95),0_0_35px_rgba(255,92,0,0.3)] flex flex-col gap-2">
                    {/* O post em escala óptica de 2x (exatamente idêntico à miniatura) */}
                    <div className="relative w-[194px] h-[242.5px] rounded-xl overflow-hidden shadow-inner border border-white/15 bg-black">
                      <div
                        style={{
                          width: 97,
                          height: 121.25,
                          transform: "scale(2)",
                          transformOrigin: "top left",
                        }}
                        className="relative"
                      >
                        {specimens[hoveredSpecimenIndex].art}
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[9.5px] font-mono uppercase font-bold text-white tracking-wider truncate max-w-[120px]">
                        {specimens[hoveredSpecimenIndex].familyLabel}
                      </span>
                      <span className="text-[8.5px] font-mono text-[#FF5C00] font-bold shrink-0">
                        ✦ Usar Ideia
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={() => {
                setIsSpecimensOpen(!isSpecimensOpen);
                setHoveredSpecimenIndex(null);
              }}
              className={`w-full flex items-center justify-between p-2.5 rounded-2xl border transition-all duration-200 cursor-pointer shadow-sm active:scale-[0.99] ${
                isSpecimensOpen
                  ? "bg-white/[0.06] border-white/20 text-white"
                  : "bg-gradient-to-r from-white/[0.04] via-white/[0.06] to-white/[0.03] hover:bg-white/[0.08] border-white/12 hover:border-[#FF5C00]/40 text-white/85"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#FF5C00]/15 border border-[#FF5C00]/30 flex items-center justify-center">
                  <Sparkles size={13} className="text-[#FF5C00] animate-pulse" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span style={{ ...MONO, fontSize: 9.5, fontWeight: 700 }} className="text-white/90">
                      Ideias & Direções de Arte
                    </span>
                    {/* Exibido apenas em telas maiores que mobile conforme solicitado */}
                    <span className="hidden sm:inline-block text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-[#FF5C00]/20 text-[#FF5C00] border border-[#FF5C00]/30">
                      06 Modelos
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {declaredSpecimen && (
                  <span
                    className="hidden sm:inline-block px-2 py-0.5 rounded text-[8.5px] font-mono font-bold"
                    style={{ background: "rgba(255,92,0,0.15)", color: "#FF5C00" }}
                  >
                    Gosto: {declaredSpecimen.familyLabel}
                  </span>
                )}
                <span style={{ ...MONO, fontSize: 8.5 }} className="text-white/50">
                  {isSpecimensOpen ? "Recolher" : "Ver Sugestões"}
                </span>
                <div className="w-5 h-5 rounded-full bg-white/8 flex items-center justify-center text-white/60">
                  {isSpecimensOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>
              </div>
            </button>

            {/* Fita de Espécimes Animada */}
            <AnimatePresence>
              {isSpecimensOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="relative overflow-visible"
                >
                  <div
                    onMouseLeave={() => setHoveredSpecimenIndex(null)}
                    className="flex md:grid md:grid-cols-6 gap-2 md:gap-2.5 min-h-0 snap-x snap-mandatory overflow-x-auto md:overflow-x-visible overflow-y-hidden pb-1 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {specimens.map((specimen, index) => (
                      <SpecimenCard
                        key={specimen.id}
                        specimen={specimen}
                        index={index}
                        onPick={() => handleSpecimenPick(specimen)}
                        onHover={setHoveredSpecimenIndex}
                        withDisclaimer
                        selected={declaredFamilyId === specimen.id}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

        </div>
      </main>

      {/* OVERLAY DE CARREGAMENTO COM BARRA DE CORRIDA */}
      <AnimatePresence>
        {isLoading && <ProductionOverlay prompt={lastSubmittedPrompt || prompt} />}
      </AnimatePresence>
    </div>
  );
}
