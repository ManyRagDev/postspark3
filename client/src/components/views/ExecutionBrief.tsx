import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Layers3, Palette, ShieldCheck, Sparkles } from "lucide-react";
import type {
  CreativeExecutionBrief,
  ExecutionContentSourceType,
  ExecutionInterventionLevel,
  ExecutionSlideInput,
  InputType,
  Platform,
  PostMode,
} from "@shared/postspark";

interface ExecutionBriefProps {
  initialInput: { type: InputType; content: string };
  defaultPostMode: PostMode;
  initialBrief: CreativeExecutionBrief;
  isLoading?: boolean;
  onBack: () => void;
  onSubmit: (brief: CreativeExecutionBrief) => Promise<void> | void;
}

const OBJECTIVE_OPTIONS = [
  { value: "educate", label: "Educar" },
  { value: "authority", label: "Autoridade" },
  { value: "sell", label: "Vender" },
  { value: "engage", label: "Engajar" },
  { value: "lead", label: "Captar leads" },
] as const;

const PLATFORM_OPTIONS: Platform[] = ["instagram", "linkedin", "facebook", "twitter"];

const INTERVENTION_OPTIONS: Array<{ value: ExecutionInterventionLevel; label: string; description: string }> = [
  {
    value: "visual_only",
    label: "So adaptar visualmente",
    description: "Mantem o texto praticamente intacto e trabalha o acabamento visual.",
  },
  {
    value: "light_optimize",
    label: "Otimizar texto levemente",
    description: "Refina clareza e impacto sem mexer forte na estrutura.",
  },
  {
    value: "optimize_structure",
    label: "Otimizar texto e estrutura",
    description: "Pode reorganizar melhor a copy, mantendo a mensagem central.",
  },
] as const;

const CONTENT_SOURCE_OPTIONS: Array<{ value: ExecutionContentSourceType; label: string; description: string }> = [
  {
    value: "freeform",
    label: "Conteudo livre",
    description: "Tenho um briefing ou texto solto e quero organizar isso.",
  },
  {
    value: "carousel_topics",
    label: "Topicos por slide",
    description: "Tenho a ideia de cada slide, mas nao a copy pronta.",
  },
  {
    value: "carousel_slides",
    label: "Texto pronto por slide",
    description: "Ja tenho os slides e quero lapidar sem reescrever tudo.",
  },
  {
    value: "caption_ready",
    label: "Legenda ou copy pronta",
    description: "Tenho um texto consolidado e preciso transformar em peca.",
  },
] as const;

export default function ExecutionBrief({
  initialInput,
  defaultPostMode,
  initialBrief,
  isLoading = false,
  onBack,
  onSubmit,
}: ExecutionBriefProps) {
  const [brief, setBrief] = useState<CreativeExecutionBrief>(initialBrief);

  const buildDefaultSlides = (): ExecutionSlideInput[] =>
    Array.from({ length: 5 }, (_, index) => ({
      slideNumber: index + 1,
      rawText: "",
      role: index === 0 ? "hook" : index === 4 ? "cta" : "development",
      locked: false,
    }));

  const isCarousel = brief.format === "carousel";
  const showSlidesEditor = isCarousel && (brief.contentSourceType === "carousel_topics" || brief.contentSourceType === "carousel_slides");

  const slides = useMemo(() => {
    if (!isCarousel) return [];
    if (brief.slides && brief.slides.length > 0) return brief.slides;

    return buildDefaultSlides();
  }, [brief.slides, isCarousel]);

  const handleSlideTextChange = (slideNumber: number, rawText: string) => {
    setBrief((prev) => ({
      ...prev,
      slides: slides.map((slide) =>
        slide.slideNumber === slideNumber ? { ...slide, rawText } : slide
      ),
    }));
  };

  const handleSlideLockChange = (slideNumber: number, locked: boolean) => {
    setBrief((prev) => ({
      ...prev,
      slides: slides.map((slide) =>
        slide.slideNumber === slideNumber ? { ...slide, locked } : slide
      ),
    }));
  };

  const normalizeList = (value: string) =>
    value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

  const handleSubmit = async () => {
    const nextBrief: CreativeExecutionBrief = {
      ...brief,
      rawInput: brief.rawInput.trim() || initialInput.content,
      slides: showSlidesEditor ? slides : undefined,
      mustKeep: brief.mustKeep ?? [],
      mustInclude: brief.mustInclude ?? [],
      forbiddenTerms: brief.forbiddenTerms ?? [],
      brandInput: brief.brandInput
        ? {
          ...brief.brandInput,
          brandColors: (brief.brandInput.brandColors || []).filter(Boolean),
        }
        : undefined,
    };

    await onSubmit(nextBrief);
  };

  return (
    <motion.div
      className="fixed inset-0 overflow-y-auto bg-[oklch(0.04_0.06_280)] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 md:px-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition-colors hover:bg-white/10"
          >
            <ArrowLeft size={16} />
            Voltar
          </button>

          <div className="flex items-center gap-3 rounded-2xl border border-orange-300/20 bg-orange-400/10 px-4 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-400/15 text-orange-200">
              <BriefcaseBusiness size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-orange-50">Executar briefing</div>
              <div className="text-xs text-orange-100/70">Voce traz a estrutura. O PostSpark executa com fidelidade.</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.45fr_0.85fr]">
          <div className="space-y-6">
            <SectionCard
              icon={<Sparkles size={16} />}
              title="Tipo de peca"
              description="Defina o formato, a plataforma e o objetivo principal."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Formato">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "static", label: "Post" },
                      { value: "carousel", label: "Carrossel" },
                      { value: "story", label: "Story" },
                      { value: "ad", label: "Anuncio" },
                    ].map((option) => (
                      <ChoiceButton
                        key={option.value}
                        active={brief.format === option.value}
                        onClick={() =>
                          setBrief((prev) => ({
                            ...prev,
                            format: option.value as CreativeExecutionBrief["format"],
                            contentSourceType:
                              option.value === "carousel"
                                ? prev.contentSourceType === "freeform" || prev.contentSourceType === "caption_ready"
                                  ? "carousel_topics"
                                  : prev.contentSourceType
                                : prev.contentSourceType === "carousel_topics" || prev.contentSourceType === "carousel_slides"
                                  ? "freeform"
                                  : prev.contentSourceType,
                          }))
                        }
                      >
                        {option.label}
                      </ChoiceButton>
                    ))}
                  </div>
                </Field>

                <Field label="Plataforma">
                  <select
                    value={brief.platform}
                    onChange={(e) => setBrief((prev) => ({ ...prev, platform: e.target.value as Platform }))}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none"
                  >
                    {PLATFORM_OPTIONS.map((platform) => (
                      <option key={platform} value={platform} className="bg-slate-900">
                        {platform}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Objetivo">
                  <div className="grid grid-cols-2 gap-2">
                    {OBJECTIVE_OPTIONS.map((option) => (
                      <ChoiceButton
                        key={option.value}
                        active={brief.objective === option.value}
                        onClick={() => setBrief((prev) => ({ ...prev, objective: option.value }))}
                      >
                        {option.label}
                      </ChoiceButton>
                    ))}
                  </div>
                </Field>

                <Field label="CTA principal">
                  <input
                    value={brief.callToAction || ""}
                    onChange={(e) => setBrief((prev) => ({ ...prev, callToAction: e.target.value }))}
                    placeholder="Ex: Agende uma consultoria"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard
              icon={<Layers3 size={16} />}
              title="Conteudo base"
              description="Defina se voce vai colar um briefing livre, topicos ou o texto de cada slide."
            >
              <div className="mb-4 grid gap-2 md:grid-cols-2">
                {CONTENT_SOURCE_OPTIONS
                  .filter((option) => (isCarousel ? true : option.value !== "carousel_topics" && option.value !== "carousel_slides"))
                  .map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setBrief((prev) => ({ ...prev, contentSourceType: option.value }))}
                      className="rounded-2xl border px-4 py-3 text-left transition-all"
                      style={{
                        background: brief.contentSourceType === option.value ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.03)",
                        borderColor: brief.contentSourceType === option.value ? "rgba(251,146,60,0.4)" : "rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="text-sm font-semibold text-white">{option.label}</div>
                      <div className="mt-1 text-xs text-white/60">{option.description}</div>
                    </button>
                  ))}
              </div>

              <Field label={showSlidesEditor ? "Briefing geral" : "Conteudo base"}>
                <textarea
                  value={brief.rawInput}
                  onChange={(e) => setBrief((prev) => ({ ...prev, rawInput: e.target.value }))}
                  placeholder={
                    showSlidesEditor
                      ? "Descreva o contexto geral, oferta, publico e qualquer orientacao que valha para todos os slides."
                      : initialInput.content || "Cole aqui o briefing, copy ou roteiro base."
                  }
                  className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                />
              </Field>

              <AnimatePresence>
                {showSlidesEditor && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="mt-5 space-y-3"
                  >
                    {slides.map((slide) => (
                      <div key={slide.slideNumber} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                        <div className="mb-2 flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-white">Slide {slide.slideNumber}</div>
                            <div className="text-xs text-white/45">
                              {slide.role === "hook" ? "Gancho" : slide.role === "cta" ? "CTA" : "Desenvolvimento"}
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-white/65">
                            <input
                              type="checkbox"
                              checked={Boolean(slide.locked)}
                              onChange={(e) => handleSlideLockChange(slide.slideNumber, e.target.checked)}
                            />
                            Travar conteudo
                          </label>
                        </div>
                        <textarea
                          value={slide.rawText}
                          onChange={(e) => handleSlideTextChange(slide.slideNumber, e.target.value)}
                          placeholder={`Conteudo base do slide ${slide.slideNumber}`}
                          className="min-h-[100px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                        />
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </SectionCard>

            <SectionCard
              icon={<ShieldCheck size={16} />}
              title="Nivel de intervencao"
              description="Controle quanto a IA pode mexer no texto e na estrutura."
            >
              <div className="space-y-2">
                {INTERVENTION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setBrief((prev) => ({ ...prev, interventionLevel: option.value }))}
                    className="w-full rounded-2xl border px-4 py-3 text-left transition-all"
                    style={{
                      background: brief.interventionLevel === option.value ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.03)",
                      borderColor: brief.interventionLevel === option.value ? "rgba(251,146,60,0.4)" : "rgba(255,255,255,0.08)",
                    }}
                  >
                    <div className="text-sm font-semibold text-white">{option.label}</div>
                    <div className="mt-1 text-xs text-white/60">{option.description}</div>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              icon={<Palette size={16} />}
              title="Identidade visual e restricoes"
              description="Informe referencias visuais e proteja termos que nao podem ser alterados."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Site da marca">
                  <input
                    value={brief.brandInput?.websiteUrl || ""}
                    onChange={(e) =>
                      setBrief((prev) => ({
                        ...prev,
                        brandInput: { adaptationMode: prev.brandInput?.adaptationMode || "adaptive", ...prev.brandInput, websiteUrl: e.target.value },
                      }))
                    }
                    placeholder="https://sua-marca.com"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                </Field>

                <Field label="URL de referencia visual">
                  <input
                    value={brief.brandInput?.referenceImageUrl || ""}
                    onChange={(e) =>
                      setBrief((prev) => ({
                        ...prev,
                        brandInput: { adaptationMode: prev.brandInput?.adaptationMode || "adaptive", ...prev.brandInput, referenceImageUrl: e.target.value },
                      }))
                    }
                    placeholder="https://..."
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                </Field>

                <Field label="Cores da marca">
                  <input
                    value={(brief.brandInput?.brandColors || []).join(", ")}
                    onChange={(e) =>
                      setBrief((prev) => ({
                        ...prev,
                        brandInput: {
                          adaptationMode: prev.brandInput?.adaptationMode || "adaptive",
                          ...prev.brandInput,
                          brandColors: e.target.value.split(",").map((color) => color.trim()).filter(Boolean),
                        },
                      }))
                    }
                    placeholder="#111111, #F97316"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                </Field>

                <Field label="Modo de adaptacao">
                  <select
                    value={brief.brandInput?.adaptationMode || "adaptive"}
                    onChange={(e) =>
                      setBrief((prev) => ({
                        ...prev,
                        brandInput: {
                          adaptationMode: e.target.value as NonNullable<CreativeExecutionBrief["brandInput"]>["adaptationMode"],
                          ...prev.brandInput,
                        },
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none"
                  >
                    <option value="strict" className="bg-slate-900">Respeitar ao maximo</option>
                    <option value="adaptive" className="bg-slate-900">Adaptar com liberdade</option>
                    <option value="reference_clone" className="bg-slate-900">Clonar referencia</option>
                  </select>
                </Field>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Nao alterar">
                  <textarea
                    value={(brief.mustKeep || []).join("\n")}
                    onChange={(e) => setBrief((prev) => ({ ...prev, mustKeep: normalizeList(e.target.value) }))}
                    placeholder="CTA, dados, termos, claims..."
                    className="min-h-[110px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                </Field>

                <Field label="Conteudo obrigatorio">
                  <textarea
                    value={(brief.mustInclude || []).join("\n")}
                    onChange={(e) => setBrief((prev) => ({ ...prev, mustInclude: normalizeList(e.target.value) }))}
                    placeholder="Itens que precisam aparecer"
                    className="min-h-[110px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                </Field>

                <Field label="Termos proibidos">
                  <textarea
                    value={(brief.forbiddenTerms || []).join("\n")}
                    onChange={(e) => setBrief((prev) => ({ ...prev, forbiddenTerms: normalizeList(e.target.value) }))}
                    placeholder="Palavras ou expressoes a evitar"
                    className="min-h-[110px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                </Field>
              </div>

              <Field label="Observacoes adicionais" className="mt-4">
                <textarea
                  value={brief.notes || ""}
                  onChange={(e) => setBrief((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ex: tom premium, sem emojis, manter linguagem acessivel"
                  className="min-h-[100px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                />
              </Field>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard
              icon={<BriefcaseBusiness size={16} />}
              title="Resumo do briefing"
              description="Revise o contrato que sera enviado para a IA."
              sticky
            >
              <div className="space-y-4 text-sm">
                <SummaryRow label="Input inicial" value={initialInput.type} />
                <SummaryRow label="Formato" value={brief.format} />
                <SummaryRow label="Plataforma" value={brief.platform} />
                <SummaryRow label="Objetivo" value={brief.objective} />
                <SummaryRow label="CTA" value={brief.callToAction || "Nao definido"} />
                <SummaryRow label="Intervencao" value={INTERVENTION_OPTIONS.find((option) => option.value === brief.interventionLevel)?.label || brief.interventionLevel} />
                <SummaryRow label="Fonte de conteudo" value={CONTENT_SOURCE_OPTIONS.find((option) => option.value === brief.contentSourceType)?.label || brief.contentSourceType} />
                <SummaryRow label="Slides preenchidos" value={showSlidesEditor ? `${slides.filter((slide) => slide.rawText.trim()).length}/${slides.length}` : "Nao se aplica"} />
                <SummaryRow label="Site da marca" value={brief.brandInput?.websiteUrl || "Nao informado"} />
                <SummaryRow label="Restricoes" value={`${brief.mustKeep?.length || 0} travas · ${brief.mustInclude?.length || 0} obrigatorios`} />
              </div>

              <div className="mt-6 rounded-2xl border border-orange-300/15 bg-orange-400/8 p-4 text-xs text-orange-50/80">
                No modo execution, a IA vai priorizar fidelidade ao briefing, preservacao da estrutura e adaptacao visual a marca.
              </div>

              <button
                onClick={handleSubmit}
                disabled={isLoading || !brief.rawInput.trim()}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-400 px-4 py-3 text-sm font-semibold text-slate-950 transition-opacity disabled:opacity-50"
              >
                {isLoading ? "Executando briefing..." : "Gerar pecas"}
                {!isLoading && <ArrowRight size={16} />}
              </button>
            </SectionCard>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
  sticky = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <div
      className={`rounded-[28px] border border-white/8 bg-white/5 p-5 backdrop-blur-xl ${sticky ? "lg:sticky lg:top-6" : ""}`}
      style={{ WebkitBackdropFilter: "blur(24px)" }}
    >
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/8 text-orange-100">
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs text-white/60">{description}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-white/45">{label}</div>
      {children}
    </div>
  );
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border px-3 py-3 text-sm font-medium transition-all"
      style={{
        background: active ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.03)",
        borderColor: active ? "rgba(251,146,60,0.38)" : "rgba(255,255,255,0.08)",
        color: active ? "rgb(255 237 213)" : "rgba(255,255,255,0.7)",
      }}
    >
      {children}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/6 pb-2">
      <span className="text-white/45">{label}</span>
      <span className="max-w-[60%] text-right text-white/85">{value}</span>
    </div>
  );
}
