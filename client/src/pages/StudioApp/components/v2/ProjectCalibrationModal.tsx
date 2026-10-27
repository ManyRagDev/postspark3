import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, Sparkles, Building2, ChevronRight, ChevronLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  EXTERNAL_DOSSIER_PROMPT_TEMPLATE,
  parseDossierContract,
  compileProjectDossier,
  type ProjectStructuredData,
} from "@shared/brandProjects";
import { saveLocalProject } from "../../lib/projectStorage";

interface ProjectCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (projectId: string) => void;
  editingProject?: {
    id: string;
    name: string;
    niche: string;
    sourceType: "form" | "external_prompt" | "website";
    structuredData: ProjectStructuredData;
    compiledDocument: string;
    isDefault: boolean;
  } | null;
}

const TONE_ARCHETYPES = [
  "Direto & Pragmático",
  "Científico & Técnico",
  "Acolhedor & Empático",
  "Provocativo & Ousado",
  "Sofisticado & Minimalista",
  "Leve & Bem-humorado",
  "Didático & Acessível",
];

export default function ProjectCalibrationModal({
  isOpen,
  onClose,
  onSuccess,
  editingProject,
}: ProjectCalibrationModalProps) {
  const [activeTab, setActiveTab] = useState<"form" | "external">("form");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Campos do formulário
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [offerAndTransformation, setOfferAndTransformation] = useState("");
  const [factualDifferentials, setFactualDifferentials] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [painsAndObjections, setPainsAndObjections] = useState("");
  const [selectedTones, setSelectedTones] = useState<string[]>([]);
  const [forbiddenTerms, setForbiddenTerms] = useState("");
  const [defaultCta, setDefaultCta] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  // Campos da aba externa
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [externalText, setExternalText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<{
    name: string;
    niche: string;
    structuredData: ProjectStructuredData;
    compiledDocument: string;
  } | null>(null);

  const utils = trpc.useUtils();
  const upsertMutation = (trpc as any).brandProjects?.upsert?.useMutation
    ? (trpc as any).brandProjects.upsert.useMutation()
    : {
        mutateAsync: async () => {
          throw new Error("brandProjects table missing or not configured");
        },
        isPending: false,
      };

  useEffect(() => {
    if (editingProject) {
      setName(editingProject.name || "");
      setNiche(editingProject.niche || "");
      setIsDefault(editingProject.isDefault || false);
      const sd = editingProject.structuredData || {};
      setOfferAndTransformation(sd.offerAndTransformation || "");
      setFactualDifferentials(sd.factualDifferentials || "");
      setTargetAudience(sd.targetAudience || "");
      setPainsAndObjections(sd.painsAndObjections || "");
      setForbiddenTerms(sd.forbiddenTerms || "");
      setDefaultCta(sd.defaultCta || "");

      if (sd.voiceTone) {
        const found = TONE_ARCHETYPES.filter((t) => sd.voiceTone?.includes(t));
        setSelectedTones(found.length ? found : [sd.voiceTone]);
      } else {
        setSelectedTones([]);
      }
      setActiveTab(editingProject.sourceType === "external_prompt" ? "external" : "form");
      if (editingProject.sourceType === "external_prompt" && editingProject.compiledDocument) {
        setExternalText(editingProject.compiledDocument);
      }
    } else {
      setName("");
      setNiche("");
      setOfferAndTransformation("");
      setFactualDifferentials("");
      setTargetAudience("");
      setPainsAndObjections("");
      setSelectedTones([]);
      setForbiddenTerms("");
      setDefaultCta("");
      setIsDefault(false);
      setExternalText("");
      setParsedPreview(null);
      setParseError(null);
      setStep(1);
      setActiveTab("form");
    }
  }, [editingProject, isOpen]);

  // Parsing automático na aba externa quando o usuário cola texto
  useEffect(() => {
    if (activeTab !== "external" || !externalText.trim()) {
      setParsedPreview(null);
      setParseError(null);
      return;
    }
    const result = parseDossierContract(externalText);
    if (result.success && result.name && result.niche && result.structuredData && result.compiledDocument) {
      setParsedPreview({
        name: result.name,
        niche: result.niche,
        structuredData: result.structuredData,
        compiledDocument: result.compiledDocument,
      });
      setParseError(null);
    } else {
      setParsedPreview(null);
      setParseError(result.error || "Estrutura não reconhecida");
    }
  }, [externalText, activeTab]);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(EXTERNAL_DOSSIER_PROMPT_TEMPLATE);
      setCopiedPrompt(true);
      toast.success("Prompt de calibração copiado para a área de transferência!");
      setTimeout(() => setCopiedPrompt(false), 3000);
    } catch {
      toast.error("Falha ao copiar prompt.");
    }
  };

  const toggleTone = (tone: string) => {
    setSelectedTones((prev) => {
      if (prev.includes(tone)) return prev.filter((t) => t !== tone);
      if (prev.length >= 2) return [prev[1], tone];
      return [...prev, tone];
    });
  };

  const handleSaveForm = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do projeto.");
      setStep(1);
      return;
    }
    if (!niche.trim()) {
      toast.error("Informe o nicho ou segmento.");
      setStep(1);
      return;
    }

    const structuredData: ProjectStructuredData = {
      offerAndTransformation: offerAndTransformation.trim(),
      factualDifferentials: factualDifferentials.trim(),
      targetAudience: targetAudience.trim(),
      painsAndObjections: painsAndObjections.trim(),
      voiceTone: selectedTones.join(" | ").trim(),
      forbiddenTerms: forbiddenTerms.trim(),
      defaultCta: defaultCta.trim(),
    };

    const compiledDocument = compileProjectDossier(name, niche, structuredData);

    try {
      const res = await upsertMutation.mutateAsync({
        id: editingProject?.id,
        name: name.trim(),
        niche: niche.trim(),
        sourceType: "form",
        structuredData,
        compiledDocument,
        isDefault,
      });
      await utils.brandProjects.list.invalidate();
      toast.success(`Projeto "${name.trim()}" salvo com sucesso!`);
      onSuccess(res.project.id);
      onClose();
    } catch (err: any) {
      console.warn("[ProjectCalibrationModal] Falha ao persistir no Supabase, salvando localmente:", err);
      const local = saveLocalProject({
        id: editingProject?.id,
        name: name.trim(),
        niche: niche.trim(),
        sourceType: "form",
        structuredData,
        compiledDocument,
        isDefault,
      });
      const isMissingTable =
        err?.message?.includes("0039_brand_projects.sql") ||
        err?.message?.includes("brand_projects") ||
        err?.message?.includes("not found");
      if (isMissingTable) {
        toast.warning(
          `Projeto salvo localmente no navegador! Para sincronizar na nuvem, execute a migration drizzle/0039_brand_projects.sql no Supabase.`
        );
      } else {
        toast.error(err.message || "Erro ao salvar no banco. Projeto salvo localmente no navegador.");
      }
      onSuccess(local.id);
      onClose();
    }
  };

  const handleSaveExternal = async () => {
    if (!parsedPreview) {
      toast.error("Cole o dossiê retornado pela sua IA ou um documento markdown válido.");
      return;
    }

    try {
      const res = await upsertMutation.mutateAsync({
        id: editingProject?.id,
        name: parsedPreview.name.trim() || "Projeto",
        niche: parsedPreview.niche.trim() || "Geral",
        sourceType: "external_prompt",
        structuredData: parsedPreview.structuredData,
        compiledDocument: parsedPreview.compiledDocument,
        isDefault,
      });
      await utils.brandProjects.list.invalidate();
      toast.success(`Projeto "${parsedPreview.name}" configurado com sucesso!`);
      onSuccess(res.project.id);
      onClose();
    } catch (err: any) {
      console.warn("[ProjectCalibrationModal] Falha ao persistir no Supabase, salvando localmente:", err);
      const local = saveLocalProject({
        id: editingProject?.id,
        name: parsedPreview.name.trim() || "Projeto",
        niche: parsedPreview.niche.trim() || "Geral",
        sourceType: "external_prompt",
        structuredData: parsedPreview.structuredData,
        compiledDocument: parsedPreview.compiledDocument,
        isDefault,
      });
      const isMissingTable =
        err?.message?.includes("0039_brand_projects.sql") ||
        err?.message?.includes("brand_projects") ||
        err?.message?.includes("not found");
      if (isMissingTable) {
        toast.warning(
          `Projeto salvo localmente no navegador! Para sincronizar na nuvem, execute a migration drizzle/0039_brand_projects.sql no Supabase.`
        );
      } else {
        toast.error(err.message || "Erro ao salvar no banco. Projeto salvo localmente no navegador.");
      }
      onSuccess(local.id);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative flex flex-col w-full max-w-2xl max-h-[90vh] bg-[#141419] border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-white"
        >
          {/* CABEÇALHO */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#FF5C00]/15 text-[#FF5C00]">
                <Building2 size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold leading-tight">
                  {editingProject ? "Editar Projeto de Marca" : "Novo Projeto de Marca"}
                </h2>
                <p className="text-xs text-white/50">
                  Dê munição de identidade para o agente gerar posts com a sua voz
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* ABAS */}
          <div className="flex border-b border-white/10 bg-black/20">
            <button
              type="button"
              onClick={() => setActiveTab("form")}
              className={`flex-1 py-3 text-xs md:text-sm font-medium border-b-2 transition-all flex items-center justify-center gap-2 ${
                activeTab === "form"
                  ? "border-[#FF5C00] text-white bg-white/[0.03]"
                  : "border-transparent text-white/50 hover:text-white/80"
              }`}
            >
              <span>1. Calibrar Aqui</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                Wizard 3 passos
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("external")}
              className={`flex-1 py-3 text-xs md:text-sm font-medium border-b-2 transition-all flex items-center justify-center gap-2 ${
                activeTab === "external"
                  ? "border-[#FF5C00] text-white bg-white/[0.03]"
                  : "border-transparent text-white/50 hover:text-white/80"
              }`}
            >
              <Sparkles size={14} className="text-[#FF5C00]" />
              <span>2. Trazer da Minha IA</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FF5C00]/20 text-[#FF5C00]">
                ChatGPT / Claude
              </span>
            </button>
          </div>

          {/* CORPO / CONTEÚDO */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === "form" ? (
              <div className="space-y-5">
                {/* Indicador de passos */}
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <span className="text-xs font-mono text-white/40 uppercase tracking-wider">
                    Passo {step} de 3 —{" "}
                    {step === 1
                      ? "Identidade & Oferta"
                      : step === 2
                      ? "Público & Dores"
                      : "Postura & Regras de Ouro"}
                  </span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3].map((s) => (
                      <div
                        key={s}
                        className={`h-1.5 rounded-full transition-all ${
                          s === step ? "w-6 bg-[#FF5C00]" : s < step ? "w-3 bg-white/40" : "w-3 bg-white/10"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* PASSO 1: Identidade & Oferta */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1">
                        Nome da Marca / Projeto <span className="text-[#FF5C00]">*</span>
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: Clínica DermaLuz, Café do Brejo, Studio K..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF5C00]/60 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1">
                        Nicho ou Segmento <span className="text-[#FF5C00]">*</span>
                      </label>
                      <input
                        type="text"
                        value={niche}
                        onChange={(e) => setNiche(e.target.value)}
                        placeholder="Ex: Dermatologia Estética, Moda Sustentável, SaaS Financeiro..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF5C00]/60 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1">
                        O que você vende e qual a transformação principal?
                      </label>
                      <p className="text-[11px] text-white/50 mb-1.5">
                        Em poucas palavras: o que seu negócio entrega e como melhora a vida do cliente?
                      </p>
                      <textarea
                        rows={3}
                        value={offerAndTransformation}
                        onChange={(e) => setOfferAndTransformation(e.target.value)}
                        placeholder="Ex: Vendemos séruns veganos de alta concentração para peles sensíveis, entregando tratamento clínico sem irritação."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF5C00]/60 resize-none transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1">
                        Diferenciais Concretos (Fatos Reais)
                      </label>
                      <p className="text-[11px] text-white/50 mb-1.5">
                        Fatos verdadeiros que a IA pode usar como argumento sem alucinar.
                      </p>
                      <textarea
                        rows={2}
                        value={factualDifferentials}
                        onChange={(e) => setFactualDifferentials(e.target.value)}
                        placeholder="Ex: Fórmulas aprovadas por dermatologistas, embalagens 100% refiláveis, envio em 24h."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF5C00]/60 resize-none transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* PASSO 2: Público & Dores */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1">
                        Quem é o cliente ideal? (Público-alvo)
                      </label>
                      <p className="text-[11px] text-white/50 mb-1.5">
                        Quem compra de você e qual momento de vida ou rotina eles vivem?
                      </p>
                      <textarea
                        rows={3}
                        value={targetAudience}
                        onChange={(e) => setTargetAudience(e.target.value)}
                        placeholder="Ex: Mulheres de 25 a 45 anos que já gastaram com produtos caros que deram alergia e buscam uma rotina descomplicada e confiável."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF5C00]/60 resize-none transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1">
                        Dores, Dúvidas e Objeções Principais
                      </label>
                      <p className="text-[11px] text-white/50 mb-1.5">
                        Quais receios ou crenças erradas impedem o cliente de dar o próximo passo?
                      </p>
                      <textarea
                        rows={3}
                        value={painsAndObjections}
                        onChange={(e) => setPainsAndObjections(e.target.value)}
                        placeholder="Ex: Acham que cosmético vegano é fraco e não dá resultado anti-idade, ou têm medo de comprar pela internet e irritar a pele."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF5C00]/60 resize-none transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* PASSO 3: Postura & Regras de Ouro */}
                {step === 3 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1">
                        Postura e Tom de Voz (escolha até 2)
                      </label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {TONE_ARCHETYPES.map((tone) => {
                          const isSelected = selectedTones.includes(tone);
                          return (
                            <button
                              key={tone}
                              type="button"
                              onClick={() => toggleTone(tone)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                isSelected
                                  ? "bg-[#FF5C00]/20 border-[#FF5C00] text-white"
                                  : "bg-white/[0.03] border-white/10 text-white/70 hover:bg-white/[0.06]"
                              }`}
                            >
                              {tone}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1">
                        Termos e Abordagens Proibidas
                      </label>
                      <p className="text-[11px] text-white/50 mb-1.5">
                        Palavras, clichês ou promessas que a sua marca NUNCA deve falar.
                      </p>
                      <input
                        type="text"
                        value={forbiddenTerms}
                        onChange={(e) => setForbiddenTerms(e.target.value)}
                        placeholder="Ex: milagre, baratinho, 100% garantido, compre já..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF5C00]/60 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1">
                        Chamada para Ação Padrão (CTA)
                      </label>
                      <input
                        type="text"
                        value={defaultCta}
                        onChange={(e) => setDefaultCta(e.target.value)}
                        placeholder="Ex: Converse com nossa equipe no Direct ou acesse o link da bio."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF5C00]/60 transition-colors"
                      />
                    </div>

                    <div className="pt-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isDefault}
                          onChange={(e) => setIsDefault(e.target.checked)}
                          className="w-4 h-4 rounded border-white/20 bg-white/5 text-[#FF5C00] focus:ring-0"
                        />
                        <span className="text-xs text-white/80">
                          Tornar este projeto o padrão no TheVoid
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ABA EXTERNA (PROMPT COPIÁVEL + PARSER) */
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#FF5C00]/10 border border-[#FF5C00]/20 space-y-2.5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-semibold text-[#FF5C00] uppercase tracking-wider">
                        Passo 1: Copie o prompt de calibração
                      </h4>
                      <p className="text-xs text-white/70 mt-0.5">
                        Envie este prompt ao ChatGPT ou Claude. Ele fará perguntas sobre seu negócio ou lerá seus arquivos e devolverá no formato PostSpark.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF5C00] text-white text-xs font-medium hover:bg-[#FF5C00]/90 transition-colors shrink-0 shadow-lg shadow-[#FF5C00]/20"
                    >
                      {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedPrompt ? "Copiado!" : "Copiar Prompt"}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-1.5">
                    Passo 2: Cole aqui a resposta devolvida pela sua IA
                  </h4>
                  <textarea
                    rows={8}
                    value={externalText}
                    onChange={(e) => setExternalText(e.target.value)}
                    placeholder="Cole aqui o bloco completo com [POSTSPARK_DOSSIER_START] e as seções ##..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 font-mono text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#FF5C00]/60 resize-none transition-colors"
                  />
                </div>

                {parseError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
                    <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-400" />
                    <span>{parseError}</span>
                  </div>
                )}

                {parsedPreview && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs space-y-2.5">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                      <Check size={14} />
                      <span>Dossiê reconhecido com sucesso!</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-white/60 mb-1">Nome do Projeto / Marca</label>
                        <input
                          type="text"
                          value={parsedPreview.name}
                          onChange={(e) =>
                            setParsedPreview((prev) => (prev ? { ...prev, name: e.target.value } : null))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-emerald-500/30 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/60 mb-1">Nicho / Segmento</label>
                        <input
                          type="text"
                          value={parsedPreview.niche}
                          onChange={(e) =>
                            setParsedPreview((prev) => (prev ? { ...prev, niche: e.target.value } : null))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-emerald-500/30 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                    </div>
                    {parsedPreview.structuredData.offerAndTransformation && (
                      <div className="text-[11px] text-emerald-200/80 truncate">
                        <strong>Síntese:</strong> {parsedPreview.structuredData.offerAndTransformation}
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-[#FF5C00] focus:ring-0"
                    />
                    <span className="text-xs text-white/80">
                      Tornar este projeto o padrão no TheVoid
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* RODAPÉ / AÇÕES */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-white/[0.02]">
            {activeTab === "form" ? (
              <>
                <button
                  type="button"
                  disabled={step === 1}
                  onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white/60 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <ChevronLeft size={16} />
                  <span>Voltar</span>
                </button>

                {step < 3 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 1 && (!name.trim() || !niche.trim())) {
                        toast.error("Informe o nome e o nicho antes de avançar.");
                        return;
                      }
                      setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                  >
                    <span>Próximo</span>
                    <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={upsertMutation.isPending}
                    onClick={handleSaveForm}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#FF5C00] hover:bg-[#FF5C00]/90 text-white text-xs font-semibold shadow-lg shadow-[#FF5C00]/25 transition-all"
                  >
                    <span>{upsertMutation.isPending ? "Salvando..." : "Salvar Projeto de Marca"}</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-white/60 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!parsedPreview || upsertMutation.isPending}
                  onClick={handleSaveExternal}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#FF5C00] hover:bg-[#FF5C00]/90 text-white text-xs font-semibold shadow-lg shadow-[#FF5C00]/25 transition-all disabled:opacity-40 disabled:pointer-events-none"
                >
                  <span>{upsertMutation.isPending ? "Salvando..." : "Salvar Dossiê da Marca"}</span>
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
