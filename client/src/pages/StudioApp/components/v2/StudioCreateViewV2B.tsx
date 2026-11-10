import { isStandaloneHttpUrl } from "@shared/generationSources";
import BrandCaptureModal from "./BrandCaptureModal";
import { TemplateIngestionModal } from "@/pages/TemplateIngestion/TemplateIngestionModal";
import StudioShowcaseModal from "./StudioShowcaseModal";
import type { ShowcaseItem } from "./showcaseData";
import type { OrchestratedGenerationInput } from "@shared/generationRequest";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";
import { toast } from "sonner";
import { GENERATION_MODEL_LABELS, getGenerationModelHint, type GenerationModel } from "@shared/generationModel";
import { detectScriptStructure, type ParsedScriptSlide } from "../../lib/scriptDetector";
export type CreationInputOptions={platform:"instagram"|"twitter"|"linkedin"|"facebook";image?:string;imagePurpose:"content"|"visual_reference";generationModel?:GenerationModel;allowAiImages?:boolean;aspectRatio?: "4:5";fixedDesign?: OrchestratedGenerationInput["fixedDesign"];slideCount?: number;scriptMode?: "preserve"|"rewrite";parsedSlides?: ParsedScriptSlide[]};
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Sparkles, Trash2 } from "lucide-react";
import { loadFontByName } from "@/lib/fonts";
import SparkLogo from "@/components/SparkLogo";
import ProjectSelectorDropdown from "./ProjectSelectorDropdown";
import ProjectCalibrationModal from "./ProjectCalibrationModal";
import UserTopMenu from "@/components/UserTopMenu";
import { Link } from "wouter";
import {
  STUDIO,
  MONO,
  URL_REGEX,
  SPECIMEN_FONTS,
  FormatSelector,
  buildSpecimens,
  type Specimen,
} from "./shared";

/**
 * StudioCreateViewV2B — iteração regularizada e polida da tela de criação.
 *
 * Contrato preservado: onSubmit(prompt, mode) + isLoading + declaredFamilyId + onDeclareFamily.
 */

interface StudioCreateViewV2BProps {
  onSubmit: (prompt: string, mode: "static" | "carousel",options?:CreationInputOptions) => void;
  isLoading: boolean;
  declaredFamilyId: string | null;
  onDeclareFamily: (familyId: string | null) => void;
  initialPlatform?:CreationInputOptions["platform"];
  initialGenerationModel?: GenerationModel;
  initialImage?:string;
  initialImagePurpose?:CreationInputOptions["imagePurpose"];
  initialPrompt?: string;
  initialMode?: "static" | "carousel";
  hasSavedDraft?: boolean;
  onDiscardDraft?: () => void;
  selectedProjectId?: string | null;
  onSelectProjectId?: (id: string | null) => void;
  proposalAspectRatio?: "1:1" | "4:5" | "9:16";
  onProposalAspectRatioChange?: (ratio: "1:1" | "4:5" | "9:16") => void;
  onOpenEditorWithPost?: (post: CanvasPostModel) => void;
}

export default function StudioCreateViewV2B({
  onSubmit,
  isLoading,
  declaredFamilyId,
  onDeclareFamily,
  initialPlatform="instagram",initialImage,initialImagePurpose="content",initialGenerationModel="auto",
  initialPrompt = "",
  initialMode = "static",
  hasSavedDraft = false,
  onDiscardDraft,
  selectedProjectId = null,
  onSelectProjectId,
  proposalAspectRatio,
  onProposalAspectRatioChange,
  onOpenEditorWithPost,
}: StudioCreateViewV2BProps) {
  const [captureUrl,setCaptureUrl]=useState<string>();
  const [urlAsContent,setUrlAsContent]=useState(false);
  const [isTemplateIngestOpen, setIsTemplateIngestOpen] = useState(false);
  const [isShowcaseOpen, setIsShowcaseOpen] = useState(false);
  const [options,setOptions]=useState<CreationInputOptions>({platform:initialPlatform,image:initialImage,imagePurpose:initialImagePurpose,generationModel:initialGenerationModel,allowAiImages:false});
  useEffect(()=>setOptions(prev=>({platform:initialPlatform,image:initialImage,imagePurpose:initialImagePurpose,generationModel:initialGenerationModel,allowAiImages:prev.allowAiImages??false})),[initialPlatform,initialImage,initialImagePurpose,initialGenerationModel]);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [postMode, setPostMode] = useState<"static" | "carousel">(initialMode);

  useEffect(() => {
    if (initialPrompt && !prompt) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  useEffect(() => {
    if (initialMode) {
      setPostMode(initialMode);
    }
  }, [initialMode]);

  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const directory = trpc.catalog.acervo82Directory.useQuery(undefined, {
    enabled: Boolean(declaredFamilyId?.startsWith("acervo82-")),
    retry: false,
    staleTime: 30_000,
  });
  const brandProjectsList = (trpc as any).brandProjects?.list;
  const { data: remoteProjects = [] } = brandProjectsList?.useQuery
    ? brandProjectsList.useQuery(undefined, { retry: false })
    : { data: [] };
  const currentProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return (remoteProjects as any[]).find((p: any) => p.id === selectedProjectId) || null;
  }, [remoteProjects, selectedProjectId]);

  const projectDesignSpecimen = useMemo<Specimen | null>(() => {
    if (!currentProject?.visualPreferences) return null;
    const vp = currentProject.visualPreferences;
    const colors: string[] = vp.colors || [];
    const fonts: string[] = vp.fonts || [];
    const styleName = vp.personality?.[0] || `${currentProject.name} (Design)`;
    const bg = colors[0] || "#FDFBF7";
    const textCol = colors[2] || colors[1] || "#1A1A1A";
    const accentCol = colors[3] || colors[0] || "#FF5E24";
    const font = fonts[0] || "Space Grotesk";

    return {
      id: `project-design-${currentProject.id}`,
      familyLabel: `⭐ ${styleName}`,
      prompt: `Crie um post com foco na oferta e diferenciais de ${currentProject.name}.`,
      isProjectDesign: true,
      colors,
      fonts,
      art: (
        <div className="absolute inset-0 p-2 flex flex-col justify-between" style={{ backgroundColor: bg }}>
          <div className="flex items-center justify-between">
            <span
              className="text-[7px] font-mono font-bold px-1 py-0.5 rounded shadow-sm"
              style={{ backgroundColor: accentCol, color: "#FFFFFF" }}
            >
              DNA
            </span>
            <div className="flex gap-0.5">
              {colors.slice(0, 3).map((c, i) => (
                <div key={i} className="size-2 rounded-full border border-black/20" style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="my-auto">
            <div className="text-[10px] font-bold leading-tight line-clamp-2" style={{ color: textCol, fontFamily: font }}>
              {currentProject.name}
            </div>
            <div className="text-[7.5px] opacity-70 mt-0.5 font-mono line-clamp-1" style={{ color: textCol }}>
              {font}
            </div>
          </div>
          <div
            className="w-full py-1 text-center text-[7px] font-bold font-mono rounded"
            style={{ backgroundColor: accentCol, color: "#FFFFFF" }}
          >
            USAR ESTILO
          </div>
        </div>
      ),
    };
  }, [currentProject]);

  const catalogFamilies = directory.data?.families;
  const catalogSpecimens = catalogFamilies?.map((family): Specimen => ({
    id: family.family,
    familyLabel: `${family.code} · ${family.name}`,
    prompt: `Crie um post sobre [assunto]. Direção visual: ${family.descriptor}.`,
    art: null,
  }));
  const baseSpecimens: Specimen[] = catalogSpecimens ?? (directory.isFetching ? [] : buildSpecimens());
  const allSpecimens = useMemo<Specimen[]>(() => {
    if (projectDesignSpecimen) {
      return [projectDesignSpecimen, ...baseSpecimens];
    }
    return baseSpecimens;
  }, [projectDesignSpecimen, baseSpecimens]);

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

  const scriptDetection = useMemo(() => detectScriptStructure(prompt), [prompt]);
  const [scriptModeOverride, setScriptModeOverride] = useState<"preserve" | "rewrite" | null>(null);

  useEffect(() => {
    if (!scriptDetection.isScript) {
      setScriptModeOverride(null);
    }
  }, [scriptDetection.isScript]);

  const isScriptMode = scriptDetection.isScript && scriptModeOverride !== "rewrite";

  // Sincroniza formato e quantidade de slides quando um roteiro estruturado for detectado
  useEffect(() => {
    if (scriptDetection.isScript && scriptDetection.slideCount >= 2) {
      setPostMode("carousel");
      setOptions(prev => ({
        ...prev,
        slideCount: scriptDetection.slideCount,
      }));
    }
  }, [scriptDetection.isScript, scriptDetection.slideCount]);

  const isEmpty = prompt.trim().length === 0;
  const isUrl = isStandaloneHttpUrl(prompt);
  const canSubmit = !isEmpty && !isLoading;
  const declaredSpecimen = allSpecimens.find((s) => s.id === declaredFamilyId) ?? null;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if(isUrl&&!urlAsContent){setCaptureUrl(prompt.trim());return;}
    const finalOptions: CreationInputOptions = {
      ...options,
      ...(isScriptMode ? {
        slideCount: scriptDetection.slideCount,
        scriptMode: "preserve" as const,
        parsedSlides: scriptDetection.slides,
      } : {}),
    };
    onSubmit(prompt.trim(), postMode, finalOptions);
  };

  const handleDiscardDraft = () => {
    setPrompt("");
    setPostMode("static");
    onDiscardDraft?.();
    textareaRef.current?.focus();
  };

  const handleGenerateFromExample = (item: ShowcaseItem, userTopic: string) => {
    const format = item.slideCount > 1 ? "carousel" : "static";
    setPrompt(userTopic);
    setPostMode(format);
    onProposalAspectRatioChange?.("4:5");
    onSubmit(userTopic, format, { ...options, aspectRatio: "4:5", fixedDesign: { kind: "showcase", id: item.id }, slideCount: item.slideCount });
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
      <div className="fixed left-4 top-4 z-40 hidden md:flex items-center gap-2">
        <Link href="/saved-posts" className="flex min-h-11 items-center rounded-full border border-white/15 bg-[#0a0d16] px-4 text-sm text-white hover:bg-white/10">
          Meus posts
        </Link>
        <button
          type="button"
          onClick={() => setIsTemplateIngestOpen(true)}
          disabled={isLoading}
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 bg-[#0a0d16] px-4 text-sm text-white/85 hover:bg-white/10 hover:text-white transition-colors cursor-pointer disabled:opacity-45"
          title="Replicar arte ou print e transformar em template editável"
        >
          <Sparkles size={14} className="text-[#FF5C00]" />
          <span>Replicar Design</span>
        </button>
      </div>

      <Link href="/saved-posts" className="fixed left-4 top-4 z-40 flex min-h-11 items-center rounded-full border border-white/15 bg-[#0a0d16] px-4 text-sm text-white hover:bg-white/10 md:hidden">
        Meus posts
      </Link>

      {captureUrl&&<BrandCaptureModal url={captureUrl} projectId={selectedProjectId} onClose={()=>setCaptureUrl(undefined)} onSaved={id=>{onSelectProjectId?.(id);setCaptureUrl(undefined);setPrompt("");setUrlAsContent(false);toast.success("Projeto salvo. Agora informe o pedido do post.");}}/>}
      {/* MODAL DE CALIBRAGEM DE PROJETO */}
      {isProjectModalOpen && (
        <ProjectCalibrationModal
          isOpen={isProjectModalOpen}
          onClose={() => {
            setIsProjectModalOpen(false);
            setEditingProject(null);
          }}
          editingProject={editingProject}
          onSuccess={(id) => {
            onSelectProjectId?.(id);
          }}
        />
      )}

      {/* MODAL DE INGESTÃO E REPLICAÇÃO DE TEMPLATES (Print / URL -> 2D Konva) */}
      {isTemplateIngestOpen && (
        <TemplateIngestionModal
          isOpen={isTemplateIngestOpen}
          onClose={() => setIsTemplateIngestOpen(false)}
          projectId={selectedProjectId}
          onProjectCreatedOrUpdated={(newId) => {
            onSelectProjectId?.(newId);
          }}
        />
      )}

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
              className="rounded-2xl border transition-all duration-300 shadow-2xl backdrop-blur-md overflow-hidden"
              style={{
                background: isFocused
                  ? isScriptMode
                    ? "rgba(139,92,246,0.06)"
                    : isUrl
                    ? "rgba(56,189,248,0.06)"
                    : "rgba(242,237,228,0.06)"
                  : isScriptMode
                  ? "rgba(139,92,246,0.03)"
                  : "rgba(242,237,228,0.03)",
                borderColor: isScriptMode
                  ? isFocused
                    ? "rgba(139,92,246,0.7)"
                    : "rgba(139,92,246,0.4)"
                  : isUrl
                  ? isFocused
                    ? "rgba(56,189,248,0.6)"
                    : "rgba(56,189,248,0.3)"
                  : isFocused
                  ? "rgba(255,92,0,0.4)"
                  : STUDIO.hairline,
                boxShadow: isScriptMode
                  ? isFocused
                    ? "0 0 28px rgba(139,92,246,0.3), inset 0 -2px 0 #8b5cf6"
                    : "0 0 14px rgba(139,92,246,0.12)"
                  : isUrl
                  ? isFocused
                    ? "0 0 24px rgba(56,189,248,0.2), inset 0 -1.5px 0 #38bdf8"
                    : "none"
                  : isFocused
                  ? "0 0 24px rgba(255,92,0,0.18), inset 0 -1.5px 0 #FF5C00"
                  : "none",
              }}
            >
              <div className="flex flex-col">
                {/* Barra de Controles Superiores: Modelo, Plataforma e IA */}
                <div className="flex flex-wrap items-center gap-2.5 px-3.5 py-2.5 border-b border-white/[0.06] text-xs">
                  {/* Seletor de Modelo */}
                  <label className="flex items-center gap-1.5 text-white/70">
                    <span className="font-medium text-white/60">Modelo</span>
                    <select
                      aria-label="Modelo de geração"
                      disabled={isLoading}
                      className="h-7 rounded bg-black/40 border border-white/10 px-2 text-xs text-white focus:outline-none focus:border-[#FF5C00]/60 transition-colors cursor-pointer"
                      value={options.generationModel ?? "auto"}
                      onChange={(e) => setOptions({ ...options, generationModel: e.target.value as GenerationModel })}
                      title={getGenerationModelHint(options.generationModel)}
                    >
                      {Object.entries(GENERATION_MODEL_LABELS).map(([value, label]) => (
                        <option key={value} value={value} className="bg-neutral-900 text-white">
                          {label}
                        </option>
                      ))}
                      <option value="gpt" className="hidden">
                        GPT (Descontinuado)
                      </option>
                    </select>
                  </label>

                  {/* Seletor de Plataforma */}
                  <label className="flex items-center gap-1.5 text-white/70">
                    <span className="font-medium text-white/60">Plataforma</span>
                    <select
                      aria-label="Plataforma"
                      disabled={isLoading}
                      className="h-7 rounded bg-black/40 border border-white/10 px-2 text-xs text-white capitalize focus:outline-none focus:border-[#FF5C00]/60 transition-colors cursor-pointer"
                      value={options.platform}
                      onChange={(e) => setOptions({ ...options, platform: e.target.value as CreationInputOptions["platform"] })}
                    >
                      {["instagram", "twitter", "linkedin", "facebook"].map((p) => (
                        <option key={p} value={p} className="bg-neutral-900 text-white capitalize">
                          {p === "instagram" ? "Instagram" : p === "twitter" ? "Twitter / X" : p === "linkedin" ? "LinkedIn" : "Facebook"}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Toggle Gerar Imagens com IA */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(options.allowAiImages)}
                    aria-label="Gerar imagens com IA"
                    disabled={isLoading}
                    onClick={() => setOptions({ ...options, allowAiImages: !options.allowAiImages })}
                    className={`h-7 flex items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors cursor-pointer ${
                      options.allowAiImages
                        ? "border-[#FF5C00]/60 bg-[#FF5C00]/20 text-white"
                        : "border-white/10 bg-black/30 text-white/60 hover:text-white/85"
                    }`}
                  >
                    <span
                      className={`inline-block h-2 w-2 rounded-full transition-colors ${
                        options.allowAiImages ? "bg-[#FF5C00]" : "bg-white/30"
                      }`}
                    />
                    <span>Gerar imagens com IA</span>
                  </button>

                  {/* Opção de adicionar imagem desativada temporariamente conforme fluxo atual (comentada, preservada para retorno futuro) */}
                  {/*
                  <label className="cursor-pointer underline">
                    {options.image ? "Trocar imagem" : "Adicionar imagem"}
                    <input
                      aria-label="Imagem do pedido"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 8_000_000) {
                          toast.error("Use uma imagem de até 8 MB.");
                          return;
                        }
                        const r = new FileReader();
                        r.onload = () => setOptions({ ...options, image: String(r.result) });
                        r.readAsDataURL(f);
                      }}
                    />
                  </label>
                  {options.image && (
                    <>
                      <select
                        aria-label="Finalidade da imagem"
                        value={options.imagePurpose}
                        className="bg-black/30 p-2"
                        onChange={(e) => setOptions({ ...options, imagePurpose: e.target.value as CreationInputOptions["imagePurpose"] })}
                      >
                        <option value="content">Imagem como fonte de conteúdo</option>
                        <option value="visual_reference">Referência visual</option>
                      </select>
                      <button onClick={() => setOptions({ ...options, image: undefined })}>Remover imagem</button>
                    </>
                  )}
                  */}

                  {isUrl && (
                    <label className="flex items-center gap-1.5 text-xs text-white/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={urlAsContent}
                        onChange={(e) => setUrlAsContent(e.target.checked)}
                        className="rounded border-white/20 bg-black/40 text-orange-500 focus:ring-0"
                      />
                      <span>Usar página como conteúdo do post</span>
                    </label>
                  )}
                </div>
              <div className="flex items-end gap-1"><textarea
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
                  className="psv2b-prompt w-full min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2.5 pl-3.5 pr-2 outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  aria-label={
                    isUrl && !urlAsContent
                      ? "Capturar marca gratuitamente"
                      : isScriptMode
                      ? `Diagramar ${scriptDetection.slideCount} slides com fidelidade`
                      : declaredSpecimen
                      ? "Criar com este gosto"
                      : "Criar posts"
                  }
                  className="mb-1.5 mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-95 cursor-pointer"
                  style={{
                    background: canSubmit
                      ? isScriptMode
                        ? "#8b5cf6"
                        : isUrl && !urlAsContent
                        ? "#0284c7"
                        : "#FF5C00"
                      : "rgba(242,237,228,0.06)",
                    color: canSubmit ? "#FFFFFF" : STUDIO.ink40,
                    border: canSubmit ? "none" : `1px solid ${STUDIO.hairline}`,
                    boxShadow: canSubmit
                      ? isScriptMode
                        ? "0 4px 16px rgba(139,92,246,0.45)"
                        : isUrl && !urlAsContent
                        ? "0 4px 16px rgba(2,132,199,0.4)"
                        : "0 4px 16px rgba(255,92,0,0.4)"
                      : "none",
                  }}
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin text-white" /> : <ArrowRight size={16} />}
                </button></div>

                {/* Seletor Inline de Modo Roteiro */}
                {scriptDetection.isScript && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-violet-950/40 border-t border-violet-500/25 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
                      <span className="text-violet-200 font-medium">
                        Roteiro de {scriptDetection.slideCount} slides detectado
                      </span>
                    </div>
                    <div className="flex items-center gap-1 bg-black/50 p-0.5 rounded-lg border border-violet-500/30">
                      <button
                        type="button"
                        onClick={() => setScriptModeOverride("preserve")}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                          isScriptMode
                            ? "bg-violet-600 text-white shadow-sm"
                            : "text-white/60 hover:text-white"
                        }`}
                      >
                        Preservar meu texto ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setScriptModeOverride("rewrite")}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                          !isScriptMode
                            ? "bg-orange-600 text-white shadow-sm"
                            : "text-white/60 hover:text-white"
                        }`}
                      >
                        Reescrever com IA
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {hasSavedDraft && onDiscardDraft && (
              <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[11px] text-white/50">
                <span>Rascunho salvo neste navegador</span>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  disabled={isLoading}
                  className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-orange-200 transition-colors hover:bg-orange-400/10 hover:text-orange-100 disabled:opacity-40"
                  aria-label="Apagar rascunho salvo e limpar o prompt"
                  title="Apagar o rascunho salvo neste navegador e limpar o campo"
                >
                  <Trash2 size={13} aria-hidden="true" />
                  Apagar rascunho
                </button>
              </div>
            )}

            {/* Micro-labels abaixo do campo */}
            <div className="mt-1.5 flex items-baseline justify-between px-1">
              <span
                className="min-w-0"
                style={{
                  ...MONO,
                  fontSize: 8.5,
                  letterSpacing: "0.14em",
                  color: isScriptMode
                    ? "#a78bfa"
                    : isUrl
                    ? STUDIO.urlSignal
                    : STUDIO.ink40,
                  transition: "color 200ms",
                }}
              >
                {isScriptMode
                  ? `Roteiro Pro — ${scriptDetection.slideCount} slides preservados`
                  : isUrl
                  ? declaredSpecimen
                    ? urlAsContent?"Fonte — página de conteúdo":"Marca — revisão antes de salvar"
                    : urlAsContent?"Fonte — página de conteúdo":"Marca — análise gratuita e revisão"
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
                {declaredSpecimen ? "Criar com este gosto" : "Criar posts"}
              </span>
            </div>
          </section>

          {/* 3. CONTROLES: FORMATO (LINHA 1) & PROJETO (LINHA 2) */}
          <section className="flex flex-col gap-3 pt-0.5">
            {/* Linha 1: Formato da Peça & Proporção (Próximo à caixa de texto) */}
            <div className="w-full">
              <FormatSelector
                value={postMode}
                onChange={setPostMode}
                proposalAspectRatio={proposalAspectRatio}
                onProposalAspectRatioChange={onProposalAspectRatioChange}
              />
            </div>

            {/* Linha 2: Contexto do Projeto & Identidade Visual Extraída */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span style={{ ...MONO, color: STUDIO.ink40, fontSize: 10 }} className="mr-0.5">
                PROJETO
              </span>
              <ProjectSelectorDropdown
                selectedProjectId={selectedProjectId}
                onSelectProject={(id) => onSelectProjectId?.(id)}
                onOpenNewProjectModal={() => {
                  setEditingProject(null);
                  setIsProjectModalOpen(true);
                }}
                onEditProjectModal={(proj) => {
                  setEditingProject(proj);
                  setIsProjectModalOpen(true);
                }}
                disabled={isLoading}
              />

              {/* Pílula de Estilo Visual do Projeto Ativo (Opcional & Clicável) */}
              {projectDesignSpecimen && (
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition cursor-pointer select-none ${
                    declaredFamilyId === projectDesignSpecimen.id
                      ? "border-orange-500 bg-orange-500/15 text-orange-200 shadow-sm shadow-orange-500/10"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/80"
                  }`}
                  onClick={() => {
                    onDeclareFamily(
                      declaredFamilyId === projectDesignSpecimen.id ? null : projectDesignSpecimen.id
                    );
                  }}
                  title={
                    declaredFamilyId === projectDesignSpecimen.id
                      ? "Estilo do projeto ATIVO na criação de posts. Clique para desativar e usar estilo livre."
                      : "Estilo visual extraído salvo no projeto. Clique para ativar na criação de posts."
                  }
                >
                  <span className="text-[11px]">🎨</span>
                  <span className="font-semibold text-[11px] truncate max-w-[160px]">
                    {currentProject?.visualPreferences?.personality?.[0] || "Estilo do Projeto"}
                  </span>
                  <div className="flex gap-0.5 ml-0.5">
                    {currentProject?.visualPreferences?.colors?.slice(0, 3).map((col: string, idx: number) => (
                      <span
                        key={idx}
                        className="size-2 rounded-full border border-black/30 shrink-0"
                        style={{ backgroundColor: col }}
                      />
                    ))}
                  </div>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ml-1 ${
                      declaredFamilyId === projectDesignSpecimen.id
                        ? "bg-orange-500 text-white"
                        : "bg-white/10 text-white/50"
                    }`}
                  >
                    {declaredFamilyId === projectDesignSpecimen.id ? "ATIVO" : "USAR"}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* 4. BOTÃO DE INSPIRAÇÃO / SHOWCASE: O QUE DÁ PRA FAZER COM O POSTSPARK */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => setIsShowcaseOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.03] hover:border-orange-500/40 hover:bg-orange-500/10 text-white/75 hover:text-orange-200 text-xs font-medium transition-all duration-200 shadow-sm cursor-pointer active:scale-95 group"
              title="Veja exemplos reais do que você pode criar no PostSpark"
            >
              <Sparkles className="size-3.5 text-orange-400 group-hover:scale-110 transition-transform" />
              <span>✨ O que dá pra fazer com o PostSpark?</span>
            </button>
          </div>

        </div>
      </main>

      {/* MODAL MURAL SHOWCASE: O QUE DÁ PRA FAZER COM O POSTSPARK */}
      {isShowcaseOpen && (
        <StudioShowcaseModal
          onClose={() => setIsShowcaseOpen(false)}
          currentPrompt={prompt}
          onOpenEditor={(model) => onOpenEditorWithPost?.(model)}
          onGenerateFromExample={handleGenerateFromExample}
        />
      )}

    </div>
  );
}
