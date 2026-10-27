import { isStandaloneHttpUrl } from "@shared/generationSources";
import BrandCaptureModal from "./BrandCaptureModal";
import { toast } from "sonner";
export type CreationInputOptions={platform:"instagram"|"twitter"|"linkedin"|"facebook";image?:string;imagePurpose:"content"|"visual_reference"};
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Sparkles, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { loadFontByName } from "@/lib/fonts";
import SparkLogo from "@/components/SparkLogo";
import ProjectSelectorDropdown from "./ProjectSelectorDropdown";
import ProjectCalibrationModal from "./ProjectCalibrationModal";
import UserTopMenu from "@/components/UserTopMenu";
import {
  STUDIO,
  MONO,
  URL_REGEX,
  SPECIMEN_FONTS,
  FormatSelector,
  buildSpecimens,
  SpecimenCard,
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
  initialImage?:string;
  initialImagePurpose?:CreationInputOptions["imagePurpose"];
  initialPrompt?: string;
  initialMode?: "static" | "carousel";
  hasSavedDraft?: boolean;
  onDiscardDraft?: () => void;
  selectedProjectId?: string | null;
  onSelectProjectId?: (id: string | null) => void;
}

export default function StudioCreateViewV2B({
  onSubmit,
  isLoading,
  declaredFamilyId,
  onDeclareFamily,
  initialPlatform="instagram",initialImage,initialImagePurpose="content",
  initialPrompt = "",
  initialMode = "static",
  hasSavedDraft = false,
  onDiscardDraft,
  selectedProjectId = null,
  onSelectProjectId,
}: StudioCreateViewV2BProps) {
  const [captureUrl,setCaptureUrl]=useState<string>();
  const [urlAsContent,setUrlAsContent]=useState(false);
  const [options,setOptions]=useState<CreationInputOptions>({platform:initialPlatform,image:initialImage,imagePurpose:initialImagePurpose});
  useEffect(()=>setOptions({platform:initialPlatform,image:initialImage,imagePurpose:initialImagePurpose}),[initialPlatform,initialImage,initialImagePurpose]);
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
  // Inicia recolhido por padrão conforme solicitado
  const [isSpecimensOpen, setIsSpecimensOpen] = useState(false);
  // Estado para a Lente de Inspeção Rápida no Desktop
  const [hoveredSpecimenIndex, setHoveredSpecimenIndex] = useState<number | null>(null);
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
  const isUrl = isStandaloneHttpUrl(prompt);
  const canSubmit = !isEmpty && !isLoading;
  const declaredSpecimen = specimens.find((s) => s.id === declaredFamilyId) ?? null;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if(isUrl&&!urlAsContent){setCaptureUrl(prompt.trim());return;}
    onSubmit(prompt.trim(), postMode,options);
  };

  const handleDiscardDraft = () => {
    setPrompt("");
    setPostMode("static");
    onDiscardDraft?.();
    textareaRef.current?.focus();
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
              <div className="flex flex-col p-1.5">
                <div className="flex flex-wrap items-center gap-3 px-3 pt-2 text-xs">
                <label>Plataforma <select aria-label="Plataforma" className="rounded bg-black/30 p-2" value={options.platform} onChange={e=>setOptions({...options,platform:e.target.value as CreationInputOptions["platform"]})}>{["instagram","twitter","linkedin","facebook"].map(p=><option key={p} value={p}>{p}</option>)}</select></label>
                <label className="cursor-pointer underline">{options.image?"Trocar imagem":"Adicionar imagem"}<input aria-label="Imagem do pedido" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>8_000_000){toast.error("Use uma imagem de até 8 MB.");return;}const r=new FileReader();r.onload=()=>setOptions({...options,image:String(r.result)});r.readAsDataURL(f);}}/></label>
                {options.image&&<><select aria-label="Finalidade da imagem" value={options.imagePurpose} className="bg-black/30 p-2" onChange={e=>setOptions({...options,imagePurpose:e.target.value as CreationInputOptions["imagePurpose"]})}><option value="content">Imagem como fonte de conteúdo</option><option value="visual_reference">Referência visual</option></select><button onClick={()=>setOptions({...options,image:undefined})}>Remover imagem</button></>}
                {isUrl&&<label><input type="checkbox" checked={urlAsContent} onChange={e=>setUrlAsContent(e.target.checked)}/> Usar página como conteúdo do post</label>}
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
                  aria-label={isUrl&&!urlAsContent?"Capturar marca gratuitamente":declaredSpecimen ? "Criar com este gosto" : "Criar direções de arte"}
                  className="mb-1.5 mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-95 cursor-pointer"
                  style={{
                    background: canSubmit ? "#FF5C00" : "rgba(242,237,228,0.06)",
                    color: canSubmit ? "#FFFFFF" : STUDIO.ink40,
                    border: canSubmit ? "none" : `1px solid ${STUDIO.hairline}`,
                    boxShadow: canSubmit ? "0 4px 16px rgba(255,92,0,0.4)" : "none",
                  }}
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin text-white" /> : <ArrowRight size={16} />}
                </button></div>
              </div>
            </div>

            {hasSavedDraft && onDiscardDraft && (
              <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[11px] text-white/50">
                <span>Rascunho salvo neste navegador</span>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  disabled={isLoading}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-orange-200 transition-colors hover:bg-orange-400/10 hover:text-orange-100 disabled:opacity-40"
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
                  color: isUrl ? STUDIO.urlSignal : STUDIO.ink40,
                  transition: "color 200ms",
                }}
              >
                {isUrl
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
                {declaredSpecimen ? "Criar com este gosto" : "Criar direções de arte"}
              </span>
            </div>
          </section>

          {/* 3. SELETORES: PROJETO DE MARCA & FORMATO */}
          <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
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
            </div>
            <div className="shrink-0">
              <FormatSelector value={postMode} onChange={setPostMode} />
            </div>
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

    </div>
  );
}
