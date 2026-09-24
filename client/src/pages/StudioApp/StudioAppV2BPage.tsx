import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import StudioCreateViewV2B from "./components/v2/StudioCreateViewV2B";
import StudioGalleryView from "./components/StudioGalleryView";
import CanvasLabPage from "@/pages/CanvasLab/CanvasLabPage";
import { INITIAL_POST, ensureDistinctFamilies, type CanvasPostModel } from "@/pages/CanvasLab/components/types";
import { normalizeCanvasModel } from "@/pages/CanvasLab/lib/saveAdapter";
import {
  canvasModelToSavePayload,
  canvasModelToUpdatePayload,
  type SaveInputType,
} from "@/pages/CanvasLab/lib/saveAdapter";
import {
  variationToCanvasModel,
  buildInitialFallbackVariations,
  buildExtraFallbackVariations,
  buildTasteInstruction,
  aiGenerationProvenance,
} from "./lib/studioGeneration";
import { loadCatalogFonts } from "@/lib/fonts";
import { detectFormatIntent, hasFormatMismatch, type FormatIntent } from "@shared/formatIntent";
import { classifyGenerationError, isRetryable, userMessageFor } from "@shared/generationFailure";
import type { GenerationFailureReason, GenerationFailureMetadata } from "@shared/postspark";
import {
  type CreationBrief,
  interpretRawBriefing,
  creationBriefToExecutionBrief,
} from "@shared/postspark";
import { CreationGuardsHost, FormatConfirmModal, GenerationFailureModal } from "./components/v2/CreationGuards";
import BriefReviewModal from "./components/v2/BriefReviewModal";
import {
  saveBriefDraft,
  loadBriefDraft,
  clearBriefDraft,
  hasRecoverableBriefDraft,
} from "./lib/briefDraftStorage";
import { shouldReviewBriefBeforeGeneration } from "./lib/briefReviewPolicy";

type ScreenStage = "create" | "gallery" | "editor";

interface FormatConfirmState {
  prompt: string;
  mode: "static" | "carousel";
  intent: FormatIntent;
}

interface GenerationFailureState {
  reason: GenerationFailureReason;
  userMessage: string;
  retryable: boolean;
  prompt: string;
  mode: "static" | "carousel";
  source: "create" | "more";
}

/** Extrai os metadados estruturados de uma falha tRPC, com fallback local. */
function extractFailureMetadata(err: unknown): GenerationFailureMetadata {
  const data = (err as { data?: { generationFailure?: GenerationFailureMetadata } } | undefined)?.data;
  if (data?.generationFailure) return data.generationFailure;
  const reason = classifyGenerationError(err);
  return {
    generationRunId: "client-unclassified",
    reason,
    retryable: isRetryable(reason),
    userMessage: userMessageFor(reason),
  };
}

/**
 * Rota experimental `/studio-v2b` — mesma máquina de estados do fluxo Studio,
 * com a tela de criação regularizada (StudioCreateViewV2B) e a "direção de
 * gosto": a família declarada na prateleira viaja como instrução dentro do
 * `content` do `post.generate` (apenas para input de texto — em URL, a
 * identidade extraída do site prevalece). O motor não é alterado.
 */
export default function StudioAppV2BPage() {
  const [, setLocation] = useLocation();
  const [stage, setStage] = useState<ScreenStage>("create");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");
  const [lastInputMeta, setLastInputMeta] = useState<{ inputType: SaveInputType; inputContent: string }>({
    inputType: "text",
    inputContent: "",
  });
  const [lastMode, setLastMode] = useState<"static" | "carousel">("static");
  const [generatedVariations, setGeneratedVariations] = useState<CanvasPostModel[]>([]);
  const [selectedPost, setSelectedPost] = useState<CanvasPostModel>(INITIAL_POST);
  const [declaredFamilyId, setDeclaredFamilyId] = useState<string | null>(null);
  /** Item 7: id do post salvo vinculado à sessão do editor (habilita "Atualizar"). */
  const [savedPostId, setSavedPostId] = useState<number | null>(null);

  // Etapa 3 — estado dos bloqueios de UX (confirmação de formato e falha explícita).
  const [formatConfirm, setFormatConfirm] = useState<FormatConfirmState | null>(null);
  const [failure, setFailure] = useState<GenerationFailureState | null>(null);

  // Etapa 4 — Briefing persistente e inteligência de marca
  const [activeBrief, setActiveBrief] = useState<CreationBrief | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [isReviewingBrief, setIsReviewingBrief] = useState(false);
  const brandKitQuery = trpc.brandKit.get.useQuery();

  const generateMutation = trpc.post.generate.useMutation();
  const saveMutation = trpc.post.save.useMutation();
  const updateMutation = trpc.post.update.useMutation();

  const persistBriefDraft = (brief: CreationBrief, stage: "create" | "gallery") => {
    saveBriefDraft(brief, declaredFamilyId, stage);
    setHasSavedDraft(hasRecoverableBriefDraft());
  };

  // Etapa 4 §9.4 — Recuperação de rascunho de briefing após refresh/perda de sessão
  useEffect(() => {
    const draft = loadBriefDraft();
    setHasSavedDraft(Boolean(draft?.brief.rawInput?.trim()));
    if (draft && draft.brief && draft.brief.rawInput) {
      setLastPrompt(draft.brief.rawInput);
      setLastMode(draft.brief.format);
      if (draft.declaredFamilyId) {
        setDeclaredFamilyId(draft.declaredFamilyId);
      }
      setActiveBrief(draft.brief);
    }
  }, []);

  // Pré-carrega antecipadamente todas as 14 fontes oficiais para evitar FOUC na galeria e editor
  useEffect(() => {
    loadCatalogFonts();
  }, []);

  // Item 7: reabertura de post salvo — chega via /saved-posts (sessionStorage).
  useEffect(() => {
    const raw = sessionStorage.getItem("postspark.open_canvas_post");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        postId?: number;
        inputType?: string;
        inputContent?: string;
        model?: unknown;
      };
      if (payload.model && typeof payload.model === "object") {
        const model = normalizeCanvasModel(payload.model as Partial<CanvasPostModel> & { id?: string });
        setSelectedPost(model);
        setStage("editor");
        setSavedPostId(typeof payload.postId === "number" ? payload.postId : null);
        setLastInputMeta({
          inputType: payload.inputType === "url" ? "url" : payload.inputType === "image" ? "image" : "text",
          inputContent: payload.inputContent || "",
        });
      }
    } catch {
      /* payload corrompido — ignora e segue para a tela de criação */
    } finally {
      sessionStorage.removeItem("postspark.open_canvas_post");
    }
  }, []);

  // Etapa 2 §7.5 — restauração de geração a partir do Histórico: contrato
  // versionado `postspark.restore_generation` → reconstrói as variações no
  // fluxo oficial (create → gallery → editor), sem depender do legado.
  useEffect(() => {
    const raw = sessionStorage.getItem("postspark.restore_generation");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        version?: number;
        inputType?: string;
        inputContent?: string;
        postMode?: "static" | "carousel";
        variations?: unknown[];
      };
      if (Array.isArray(payload.variations) && payload.variations.length > 0) {
        setLastPrompt(payload.inputContent || "");
        setLastMode(payload.postMode === "carousel" ? "carousel" : "static");
        setLastInputMeta({
          inputType: payload.inputType === "url" ? "url" : payload.inputType === "image" ? "image" : "text",
          inputContent: payload.inputContent || "",
        });
        const mapped = ensureDistinctFamilies(payload.variations as any[], payload.inputContent || "historico").map(
          (v: any, i: number) => variationToCanvasModel(v, i, payload.inputContent || "historico"),
        );
        setGeneratedVariations(mapped);
        setStage("gallery");
        toast.success("Geração do histórico restaurada no Studio.");
      }
    } catch {
      /* payload corrompido — ignora */
    } finally {
      sessionStorage.removeItem("postspark.restore_generation");
    }
  }, []);

  /** Execução real de geração de texto/URL (sem fallback automático). */
  const doGenerate = async (
    promptText: string,
    mode: "static" | "carousel",
    brief?: CreationBrief | null
  ) => {
    setIsLoading(true);
    setLastPrompt(promptText);
    setLastMode(mode);
    const isUrl = promptText.startsWith("http://") || promptText.startsWith("https://");
    setLastInputMeta({ inputType: isUrl ? "url" : "text", inputContent: promptText });
    setSavedPostId(null);

    try {
      // A instrução de gosto só é injetada em texto livre: em URL, o `content`
      // é usado pelo backend como endereço a raspar — nunca contaminar.
      const tasteInstruction =
        !isUrl && declaredFamilyId ? buildTasteInstruction(declaredFamilyId) : "";

      const executionBrief = brief ? creationBriefToExecutionBrief(brief) : undefined;
      const creationMode = executionBrief ? "execution" : "ideation";

      const result = await generateMutation.mutateAsync({
        inputType: isUrl ? "url" : "text",
        content: `${promptText}${tasteInstruction}`,
        platform: "instagram",
        postMode: mode,
        model: "llama",
        creationMode,
        executionBrief,
      });

      if (result?.variations && result.variations.length > 0) {
        const provenance = aiGenerationProvenance(result.generationRunId);
        const distinctVars = ensureDistinctFamilies(result.variations as any[], promptText);
        const mapped = distinctVars.map((v: any, i: number) => variationToCanvasModel(v, i, promptText, provenance));

        if (declaredFamilyId && !isUrl) {
          const tasteMatched = mapped.some((v) => v.familyId === declaredFamilyId);
          if (!tasteMatched) {
            toast.info("A IA explorou outras direções; seu gosto foi considerado, mas não prevaleceu.");
          }
        }

        if (brief) {
          persistBriefDraft(brief, "gallery");
        }

        setGeneratedVariations(mapped);
        setStage("gallery");
        toast.success(`${mapped.length} direções de arte criadas com IA!`);
      } else {
        throw new Error("Nenhuma variação gerada.");
      }
    } catch (err: any) {
      // Etapa 3 §8.3 — falha explícita: NUNCA gerar fallback automático.
      const meta = extractFailureMetadata(err);
      setFailure({
        reason: meta.reason,
        userMessage: meta.userMessage,
        retryable: meta.retryable,
        prompt: promptText,
        mode,
        source: "create",
      });
    } finally {
      setIsLoading(false);
      setIsReviewingBrief(false);
    }
  };

  const doGenerateMore = async (
    promptText: string,
    mode: "static" | "carousel",
    brief?: CreationBrief | null
  ) => {
    setIsGeneratingMore(true);
    toast.info("A IA está criando 3 novos ângulos criativos...");

    try {
      const isUrl = promptText.startsWith("http://") || promptText.startsWith("https://");
      const executionBrief = brief ? creationBriefToExecutionBrief(brief) : undefined;
      const creationMode = executionBrief ? "execution" : "ideation";

      const result = await generateMutation.mutateAsync({
        inputType: isUrl ? "url" : "text",
        content: `Crie 3 novos ganchos criativos e direções de arte alternativas sobre: ${promptText}`,
        platform: "instagram",
        postMode: mode,
        model: "llama",
        creationMode,
        executionBrief,
      });

      if (result?.variations && result.variations.length > 0) {
        const offset = generatedVariations.length;
        const provenance = aiGenerationProvenance(result.generationRunId);
        const distinctVars = ensureDistinctFamilies(result.variations as any[], `${promptText}:${offset}`);
        const newMapped = distinctVars.map((v: any, i: number) => variationToCanvasModel(v, offset + i, promptText, provenance));
        setGeneratedVariations((prev) => [...prev, ...newMapped]);
        toast.success("3 novas direções de arte criadas com IA!");
      } else {
        throw new Error("Sem resposta da IA");
      }
    } catch (err: any) {
      // Etapa 3 §8.3 — "Gerar mais" também não pode exibir fallback como sucesso de IA.
      const meta = extractFailureMetadata(err);
      setFailure({
        reason: meta.reason,
        userMessage: meta.userMessage,
        retryable: meta.retryable,
        prompt: promptText,
        mode,
        source: "more",
      });
    } finally {
      setIsGeneratingMore(false);
    }
  };

  /**
   * Interpreta e persiste o briefing sem impor uma etapa extra ao post único.
   * Apenas carrosséis precisam da revisão de estrutura/quantidade de slides.
   */
  const prepareBriefAndContinue = (
    promptText: string,
    mode: "static" | "carousel"
  ) => {
    const interpreted = interpretRawBriefing(promptText, {
      selectedFormat: mode,
      brandKit: brandKitQuery.data,
    });
    setActiveBrief(interpreted);
    persistBriefDraft(interpreted, "create");

    if (shouldReviewBriefBeforeGeneration(mode)) {
      setIsReviewingBrief(true);
      return;
    }

    setIsReviewingBrief(false);
    void doGenerate(promptText, mode, interpreted);
  };

  const handleCreateSubmit = (promptText: string, mode: "static" | "carousel") => {
    // Etapa 3 §8.2 — divergência de formato detectável localmente: interrompe
    // e pede confirmação antes de qualquer chamada/reserva de Sparks.
    if (hasFormatMismatch(promptText, mode)) {
      setFormatConfirm({ prompt: promptText, mode, intent: detectFormatIntent(promptText) });
      return;
    }

    prepareBriefAndContinue(promptText, mode);
  };

  const handleGenerateMore = () => {
    void doGenerateMore(lastPrompt, lastMode, activeBrief);
  };

  const handleSelectVariation = (post: CanvasPostModel) => {
    setSelectedPost(post);
    setStage("editor");
  };

  // ─── Fallback local opt-in: só roda após escolha explícita do usuário ───
  const handleUseLocalFallback = () => {
    if (!failure) return;
    const reason = failure.reason;
    if (failure.source === "more") {
      const extra = buildExtraFallbackVariations(failure.prompt, reason);
      setGeneratedVariations((prev) => [...prev, ...extra]);
      toast.warning("Sugestões locais adicionadas à galeria (não são geração de IA).");
    } else {
      setGeneratedVariations(buildInitialFallbackVariations(failure.prompt, declaredFamilyId ?? undefined, reason));
      setStage("gallery");
      toast.warning("Exibindo sugestões locais — não são geração de IA.");
    }
    setFailure(null);
  };

  // ─── Item 7: salvar / atualizar ───
  const handleSavePost = async (post: CanvasPostModel, mode: "new" | "update", source: "manual" | "auto"): Promise<boolean> => {
    if (isSaving) return false;
    setIsSaving(true);
    try {
      if (mode === "update" && savedPostId) {
        await updateMutation.mutateAsync({ id: savedPostId, ...canvasModelToUpdatePayload(post) });
        if (source === "manual") {
          toast.success("Post atualizado na sua biblioteca!", {
            action: { label: "Ver salvos", onClick: () => setLocation("/saved-posts") },
          });
        }
      } else {
        const result = await saveMutation.mutateAsync(
          canvasModelToSavePayload(post, lastInputMeta),
        );
        setSavedPostId(result.id);
        if (source === "manual") {
          toast.success("Post salvo na sua biblioteca!", {
            action: { label: "Ver salvos", onClick: () => setLocation("/saved-posts") },
          });
        }
      }
      return true;
    } catch (err: any) {
      const message = err?.message || "Não foi possível salvar o post agora.";
      if (source === "manual") toast.error(message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Item 6: recomeçar do zero ───
  const handleRestart = () => {
    clearBriefDraft();
    setHasSavedDraft(false);
    setLastPrompt("");
    setLastMode("static");
    setActiveBrief(null);
    setIsReviewingBrief(false);
    setStage("create");
    setGeneratedVariations([]);
    setSelectedPost(INITIAL_POST);
    setDeclaredFamilyId(null);
    setSavedPostId(null);
    setLastInputMeta({ inputType: "text", inputContent: "" });
    setFailure(null);
    setFormatConfirm(null);
  };

  const handleDiscardDraft = () => {
    clearBriefDraft();
    setHasSavedDraft(false);
    setLastPrompt("");
    setLastMode("static");
    setLastInputMeta({ inputType: "text", inputContent: "" });
    setActiveBrief(null);
    setIsReviewingBrief(false);
    setDeclaredFamilyId(null);
    setFormatConfirm(null);
    setFailure(null);
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0A08] text-white flex flex-col overflow-hidden font-sans">
      {stage === "create" && (
        <StudioCreateViewV2B
          onSubmit={handleCreateSubmit}
          isLoading={isLoading}
          declaredFamilyId={declaredFamilyId}
          onDeclareFamily={setDeclaredFamilyId}
          initialPrompt={lastPrompt}
          initialMode={lastMode}
          hasSavedDraft={hasSavedDraft}
          onDiscardDraft={handleDiscardDraft}
        />
      )}

      {stage === "gallery" && (
        <StudioGalleryView
          variations={generatedVariations}
          onSelectVariation={handleSelectVariation}
          onBackToCreate={() => {
            setStage("create");
            setDeclaredFamilyId(null);
          }}
          onGenerateMore={handleGenerateMore}
          isGeneratingMore={isGeneratingMore}
          declaredFamilyId={declaredFamilyId}
        />
      )}

      {stage === "editor" && (
        <CanvasLabPage
          initialPost={selectedPost}
          onBackToGallery={() => setStage("gallery")}
          onRestart={handleRestart}
          onSave={handleSavePost}
          hasSavedPost={savedPostId !== null}
          isSaving={isSaving}
        />
      )}

      {/* Etapa 3 & 4 — bloqueios de UX e revisão de briefing sobre as telas */}
      <CreationGuardsHost>
        {isReviewingBrief && activeBrief?.format === "carousel" && (
          <BriefReviewModal
            brief={activeBrief}
            brandKit={brandKitQuery.data}
            onUpdateBrief={(updated) => {
              setActiveBrief(updated);
              persistBriefDraft(updated, "create");
            }}
            onConfirmGenerate={() => {
              // Fecha primeiro para revelar imediatamente o ProductionOverlay
              // da tela de criação enquanto a geração acontece.
              setIsReviewingBrief(false);
              void doGenerate(activeBrief.rawInput, activeBrief.format, activeBrief);
            }}
            onBackToEditPrompt={() => {
              setIsReviewingBrief(false);
            }}
            isLoading={isLoading}
          />
        )}

        {formatConfirm && (
          <FormatConfirmModal
            intent={formatConfirm.intent}
            selectedMode={formatConfirm.mode}
            onSwitchToDetected={() => {
              const detected = formatConfirm.intent.detectedFormat;
              const prompt = formatConfirm.prompt;
              setFormatConfirm(null);
              prepareBriefAndContinue(prompt, detected);
            }}
            onKeepSelected={() => {
              const prompt = formatConfirm.prompt;
              const mode = formatConfirm.mode;
              setFormatConfirm(null);
              prepareBriefAndContinue(prompt, mode);
            }}
            onDismiss={() => setFormatConfirm(null)}
          />
        )}

        {failure && (
          <GenerationFailureModal
            reason={failure.reason}
            userMessage={failure.userMessage}
            retryable={failure.retryable}
            onRetry={() => {
              const { prompt, mode, source } = failure;
              setFailure(null);
              if (source === "more") {
                void doGenerateMore(prompt, mode);
              } else {
                void doGenerate(prompt, mode, activeBrief);
              }
            }}
            onReviewBriefing={() => {
              setFailure(null);
              if (activeBrief?.format === "carousel") {
                setIsReviewingBrief(true);
              } else {
                setStage("create");
              }
            }}
            onUseLocalFallback={handleUseLocalFallback}
            onDismiss={() => setFailure(null)}
          />
        )}
      </CreationGuardsHost>
    </div>
  );
}
