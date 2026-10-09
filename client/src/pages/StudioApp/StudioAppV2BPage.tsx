import StudioArtPreferences from "./components/StudioArtPreferences";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import StudioCreateViewV2B from "./components/v2/StudioCreateViewV2B";
import StudioGalleryView from "./components/StudioGalleryView";
import CanvasLabPage from "@/pages/CanvasLab/CanvasLabPage";
import { INITIAL_POST, ensureDistinctFamilies, type CanvasPostModel, type CanvasPostProvenance } from "@/pages/CanvasLab/components/types";
import { normalizeCanvasModel } from "@/pages/CanvasLab/lib/saveAdapter";
import {
  canvasModelToSavePayload,
  canvasModelToUpdatePayload,
  type SaveInputType,
} from "@/pages/CanvasLab/lib/saveAdapter";
import { fitSavePayload } from "@/pages/CanvasLab/lib/fitSavePayload";
import {
  materializeCatalogVariationsDetailed,
  type CatalogMaterializationFailure,
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
import type { OrchestratedGenerationInput } from "@shared/generationRequest";
import type { GenerationCoordinatorSnapshot, ProposalDelivery } from "@shared/generationContracts";
import {
  claimProposalDelivery,
  clearActiveV5RequestId,
  clearPendingV5Start,
  labelV5CapabilityReason,
  labelV5Status,
  messageV5ProposalFailure,
  newV5IdempotencyKey,
  persistActiveV5RequestId,
  persistPendingV5Start,
  readPendingV5Start,
  readActiveV5RequestId,
  type PendingV5Start,
} from "./lib/studioGenerationV5State";

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
  formatConfirmed: boolean;
  pipeline: "v4" | "v5";
}

type ReadyV5Proposal = Extract<ProposalDelivery, { status: "ready" }>;

interface V5MaterializationFailure {
  key: string;
  delivery: ReadyV5Proposal;
  message: string;
}

interface MaterializationIssueState {
  failures: CatalogMaterializationFailure[];
  requestedCount: number;
  materializedCount: number;
  prompt: string;
  offset: number;
  provenance?: CanvasPostProvenance;
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
function showArsenalAvailability(state?: { reason: string }) {
  if (!state || state.reason === "ready" || state.reason === "unsupported_post_mode") return;
  const messages: Record<string, string> = {
    disabled: "A seleção do novo arsenal está desligada. Esta geração usou os designs atuais.",
    catalog_not_installed: "O catálogo do novo arsenal ainda não foi instalado. Esta geração usou os designs atuais.",
    no_eligible_candidate: "Nenhum design publicado do arsenal é compatível com este pedido. Foram usados os designs atuais.",
    catalog_unavailable: "O arsenal está indisponível nesta geração. Foram usados os designs atuais.",
    brand_contract_pending: "Esta identidade de marca foi preservada usando os designs atuais.",
  };
  // The backend sends this diagnostic only to the authenticated administrator.
  if (messages[state.reason]) toast.info(messages[state.reason], { duration: 8000 });
}

export default function StudioAppV2BPage() {
  const [, setLocation] = useLocation();
  const [pendingV5Start, setPendingV5Start] = useState<PendingV5Start | null>(() => {
    try { return readPendingV5Start(window.sessionStorage); } catch { return null; }
  });
  const [pendingV5StartError, setPendingV5StartError] = useState<string | null>(null);
  const [activeV5RequestId, setActiveV5RequestId] = useState<string | null>(() => {
    try { return readPendingV5Start(window.sessionStorage) ? null : readActiveV5RequestId(window.sessionStorage); } catch { return null; }
  });
  const [useGenerationV5, setUseGenerationV5] = useState(Boolean(activeV5RequestId || pendingV5Start));
  const [v5Snapshot, setV5Snapshot] = useState<GenerationCoordinatorSnapshot | null>(null);
  const [v5MaterializationFailures, setV5MaterializationFailures] = useState<V5MaterializationFailure[]>([]);
  const [retryingV5Keys, setRetryingV5Keys] = useState<Set<string>>(() => new Set());
  const retryingV5KeysRef = useRef(new Set<string>());
  const processedV5Deliveries = useRef(new Set<string>());
  const pendingAdmissionAttempt = useRef<string | null>(null);
  const generationEpoch = useRef(0);
  const restoredV5ContextRequestId = useRef<string | null>(null);
  const lastAppliedV5QueryData = useRef<typeof activeV5Query.data>(undefined);
  const activeRequestEpoch = useRef<Map<string, number>>(new Map(activeV5RequestId ? [[activeV5RequestId, 0]] : []));
  const v5InputMetaByRunId = useRef(new Map<string, { inputType: SaveInputType; inputContent: string }>());
  const generationCapabilities = trpc.generation.capabilities.useQuery(undefined, {
    retry: false,
    staleTime: 5000,
    refetchInterval: useGenerationV5 ? 5000 : false,
  });
  const generationStart = trpc.generation.start.useMutation();
  const generationCancel = trpc.generation.cancel.useMutation();
  const activeV5Query = trpc.generation.get.useQuery(
    { requestId: activeV5RequestId ?? "00000000-0000-0000-0000-000000000000" },
    {
      enabled: Boolean(activeV5RequestId),
      refetchInterval: (query) => query.state.data?.snapshot.overallStatus === "running" ? 1500 : false,
      retry: false,
    },
  );
  const arsenalReadiness = trpc.designCatalog.generationReadiness.useQuery(undefined, { retry: false, staleTime: 30000 });
  const [reviewModelChoice, setAssemblyPilot] = useState<boolean | undefined>(undefined);
  const assemblyPilot = reviewModelChoice ?? Boolean(arsenalReadiness.data?.draftCandidateCount && !arsenalReadiness.data?.candidateCount);
  const [assemblyAspectRatio, setAssemblyAspectRatio] = useState<"1:1"|"4:5"|"9:16">("4:5");
  const compilationReport = trpc.designCatalog.reportCompilation.useMutation();
  const arsenalReport = trpc.designCatalog.reportArsenalCompilation.useMutation();
  const componentReport = trpc.designCatalog.reportComponentCompilation.useMutation();
  const reportCompilation = (post: CanvasPostModel, slot: number, durationMs: number) => {
    if(post.componentCompilationReports?.length){
      for(const {slideId,report} of post.componentCompilationReports) void componentReport.mutateAsync({runId:report.runId,slot:report.slot,slideId,report}).catch(()=>console.warn("[components.trace] Falha ao enviar relatório do slide"));
      if(post.componentCompilationReports.some(r=>r.report.status==="needs_adjustment"))toast.info("Um slide precisa de ajuste de espaço. Todo o conteúdo foi preservado para edição.");
      return;
    }
    if (post.arsenalCompilation) {
      void arsenalReport.mutateAsync(post.arsenalCompilation).then(result => {
        if (!result.persisted) console.warn("[arsenal.trace] Persistência indisponível");
      }).catch(() => console.warn("[arsenal.trace] Falha ao enviar relatório"));
      if (post.arsenalCompilation.status === "needs_adjustment")
        toast.info("Um design precisa de ajuste de espaço. Todo o conteúdo foi preservado para edição.");
      return;
    }
    if (!post.catalogCompilation) return;
    void compilationReport.mutateAsync({ report: post.catalogCompilation, slot, durationMs }).then(result => {
      if (!result.persisted) console.warn("[catalog.trace] Persistência indisponível", post.catalogCompilation?.traceId);
    }).catch(() => console.warn("[catalog.trace] Falha ao enviar relatório", post.catalogCompilation?.traceId));
  };
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
  const [materializationIssue, setMaterializationIssue] = useState<MaterializationIssueState | null>(null);
  const [selectedPost, setSelectedPost] = useState<CanvasPostModel>(INITIAL_POST);
  const [declaredFamilyId, setDeclaredFamilyId] = useState<string | null>(null);
  /** Item 7: mapa de ids de posts salvos indexados por post.id/proposta (evita colisão cruzada entre propostas). */
  const [savedPostIdsByDocId, setSavedPostIdsByDocId] = useState<Record<string, number>>({});

  // Etapa 3 — estado dos bloqueios de UX (confirmação de formato e falha explícita).
  const [formatConfirm, setFormatConfirm] = useState<FormatConfirmState | null>(null);
  const [formatChoiceConfirmed, setFormatChoiceConfirmed] = useState(false);
  const [failure, setFailure] = useState<GenerationFailureState | null>(null);

  // Etapa 4 — Briefing persistente e inteligência de marca
  const [activeBrief, setActiveBrief] = useState<CreationBrief | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [isReviewingBrief, setIsReviewingBrief] = useState(false);
  const brandKitQuery = trpc.brandKit.get.useQuery();

  const acceptV5Admission = (pending: PendingV5Start, admitted: Awaited<ReturnType<typeof generationStart.mutateAsync>>, epoch: number) => {
    if (epoch !== generationEpoch.current) return;
    clearPendingV5Start(window.sessionStorage);
    setPendingV5Start(null);
    setPendingV5StartError(null);
    pendingAdmissionAttempt.current = null;
    persistActiveV5RequestId(window.sessionStorage, admitted.snapshot.requestId);
    activeRequestEpoch.current.set(admitted.snapshot.requestId, epoch);
    restoredV5ContextRequestId.current = admitted.snapshot.requestId;
    setActiveV5RequestId(admitted.snapshot.requestId);
    setV5Snapshot(admitted.snapshot);
    setUseGenerationV5(true);
    if (stage !== "editor") setStage("gallery");
    setLastPrompt(pending.promptText);
    setLastMode(pending.mode);
    v5InputMetaByRunId.current.set(admitted.snapshot.runId, { inputType: pending.inputType, inputContent: pending.promptText });
    if (stage !== "editor") setLastInputMeta({ inputType: pending.inputType, inputContent: pending.promptText });
    if (pending.source === "create") {
      setGeneratedVariations([]);
      setV5MaterializationFailures([]);
      processedV5Deliveries.current.clear();
      setMaterializationIssue(null);
    }
    setFailure(null);
    if (admitted.created) toast.info("Geração progressiva iniciada. As propostas serão exibidas conforme ficarem prontas.");
    else toast.info("Retomando a geração já admitida.");
  };

  const submitPendingV5Start = async (pending: PendingV5Start, epoch: number) => {
    if (!generationCapabilities.data?.ownerId || pending.input.ownerId !== generationCapabilities.data.ownerId) {
      throw new Error("O pedido pendente pertence a outra sessão.");
    }
    const key = pending.input.idempotencyKey;
    if (pendingAdmissionAttempt.current === key) return;
    pendingAdmissionAttempt.current = key;
    try {
      const startTime = Date.now();
      const admitted = await generationStart.mutateAsync(pending.input);

      // Calibragem da sensibilidade estética: quando a geração parte da tela de criação,
      // permite que a animação de preparação, barra de corrida e microetapas sejam apreciadas
      // com cadência orgânica antes de transicionar para a galeria de propostas.
      // Em ambiente de teste (NODE_ENV === "test"), roda instantaneamente sem timers.
      const isTestEnv = typeof process !== "undefined" && process.env?.NODE_ENV === "test";
      const minTransitionMs = isTestEnv ? 0 : 2600;
      const elapsed = Date.now() - startTime;
      if (pending.source === "create" && elapsed < minTransitionMs) {
        await new Promise((resolve) => setTimeout(resolve, minTransitionMs - elapsed));
      }

      acceptV5Admission(pending, admitted, epoch);
      return admitted;
    } catch (error) {
      if (pendingAdmissionAttempt.current === key) pendingAdmissionAttempt.current = null;
      if (epoch === generationEpoch.current) setPendingV5StartError("Não foi possível confirmar o início agora. Tente retomar a mesma solicitação.");
      throw error;
    }
  };

  const retryPendingV5Admission = async () => {
    const pending = pendingV5Start ?? readPendingV5Start(window.sessionStorage);
    if (!pending) return;
    setPendingV5StartError(null);
    try { await submitPendingV5Start(pending, generationEpoch.current); } catch { /* the exact pending request stays available */ }
  };

  const startV5Generation = async (
    promptText: string,
    mode: "static" | "carousel",
    brief: CreationBrief | null | undefined,
    formatConfirmed: boolean,
    source: "create" | "more",
    retryAdmission: boolean,
    epoch: number,
  ) => {
    if (!generationCapabilities.data?.enabled) {
      throw new Error(labelV5CapabilityReason(generationCapabilities.data?.reason));
    }
    const previousPending = retryAdmission ? pendingV5Start ?? readPendingV5Start(window.sessionStorage) : null;
    if (previousPending) {
      setPendingV5StartError(null);
      await submitPendingV5Start(previousPending, epoch);
      return;
    }
    clearPendingV5Start(window.sessionStorage);
    setPendingV5Start(null);
    setPendingV5StartError(null);
    const executionBrief = brief ? creationBriefToExecutionBrief(brief) : undefined;
    const isUrl = promptText.startsWith("http://") || promptText.startsWith("https://");
    const tasteInstruction = !isUrl && declaredFamilyId ? buildTasteInstruction(declaredFamilyId) : "";
    const content = source === "more" && !isUrl
      ? `Crie 3 novos ganchos criativos e direções de arte alternativas sobre: ${promptText}${tasteInstruction}`
      : `${promptText}${tasteInstruction}`;
    const input: OrchestratedGenerationInput = {
      ownerId: generationCapabilities.data.ownerId,
      inputType: isUrl ? "url" : "text",
      content,
      platform: "instagram",
      postMode: mode,
      formatIntentConfirmed: formatConfirmed,
      includeDraftDesigns: assemblyPilot,
      aspectRatio: assemblyAspectRatio,
      slideCount: mode === "carousel" ? brief?.slideCount ?? 5 : undefined,
      model: "llama",
      creationMode: executionBrief ? "execution" : "ideation",
      executionBrief,
      idempotencyKey: newV5IdempotencyKey(),
    };
    const pending: PendingV5Start = {
      input,
      source,
      promptText,
      mode,
      inputType: input.inputType,
    };
    persistPendingV5Start(window.sessionStorage, pending);
    setPendingV5Start(pending);
    setPendingV5StartError(null);
    await submitPendingV5Start(pending, epoch);
  };

  const generateMutation = trpc.post.generate.useMutation();
  const saveMutation = trpc.post.save.useMutation();
  const updateMutation = trpc.post.update.useMutation();

  useEffect(() => {
    const ownerId = generationCapabilities.data?.ownerId;
    if (!pendingV5Start || !ownerId) return;
    if (pendingV5Start.input.ownerId !== ownerId) {
      generationEpoch.current += 1;
      clearPendingV5Start(window.sessionStorage);
      setPendingV5Start(null);
      setPendingV5StartError(null);
      pendingAdmissionAttempt.current = null;
      toast.info("O pedido pendente pertence a outra conta. Inicie uma nova geração nesta sessão.");
      return;
    }
    void submitPendingV5Start(pendingV5Start, generationEpoch.current).catch(() => {});
  }, [pendingV5Start, generationCapabilities.data?.ownerId]);

  useEffect(() => {
    const response = activeV5Query.data;
    if (!response || response.snapshot.requestId !== activeV5RequestId || lastAppliedV5QueryData.current === response) return;
    const requestEpoch = activeRequestEpoch.current.get(response.snapshot.requestId);
    if (requestEpoch !== undefined && requestEpoch !== generationEpoch.current) return;
    lastAppliedV5QueryData.current = response;
    activeRequestEpoch.current.set(response.snapshot.requestId, requestEpoch ?? generationEpoch.current);
    setV5Snapshot(response.snapshot);
    setUseGenerationV5(true);
    // Restore the gallery once on refresh, while later deliveries leave the user's current editor/stage alone.
    if (!v5Snapshot && stage !== "editor") setStage("gallery");
    if (response.input && restoredV5ContextRequestId.current !== response.snapshot.requestId) {
      restoredV5ContextRequestId.current = response.snapshot.requestId;
      const restoredPrompt = response.input.executionBrief?.rawInput
        ?? (response.input.inputType === "url"
          ? response.input.content
          : response.input.content
              .replace(/^Crie 3 novos ganchos criativos e direções de arte alternativas sobre:\s*/i, "")
              .replace(/\n\n\[INSTRUÇÃO DE DIREÇÃO DE ARTE[\s\S]*$/, ""));
      setLastPrompt(restoredPrompt);
      setLastMode(response.input.postMode);
      v5InputMetaByRunId.current.set(response.snapshot.runId, { inputType: response.input.inputType, inputContent: restoredPrompt });
      // Keep saved-document metadata intact while its editor is open.
      if (stage !== "editor") setLastInputMeta({ inputType: response.input.inputType, inputContent: restoredPrompt });
    }
  }, [activeV5Query.data, activeV5RequestId, stage, v5Snapshot]);

  useEffect(() => {
    if (!activeV5Query.error || !activeV5RequestId) return;
    const code = (activeV5Query.error as { data?: { code?: string } }).data?.code;
    if (code === "NOT_FOUND" || code === "UNAUTHORIZED") {
      generationEpoch.current += 1;
      clearActiveV5RequestId(window.sessionStorage);
      setActiveV5RequestId(null);
      setV5Snapshot(null);
      setUseGenerationV5(false);
      toast.info("Esta geração não está disponível nesta sessão. Você pode iniciar uma nova.");
      return;
    }
    toast.error("Não foi possível atualizar o progresso agora. Tente novamente para retomar o mesmo pedido.");
  }, [activeV5Query.error, activeV5RequestId]);

  useEffect(() => {
    if (!v5Snapshot) return;
    const snapshotToMaterialize = v5Snapshot;
    for (const delivery of snapshotToMaterialize.proposals) {
      if (delivery.status !== "ready" || !claimProposalDelivery(processedV5Deliveries.current, delivery.proposalId, delivery.revision)) continue;
      const epoch = activeRequestEpoch.current.get(snapshotToMaterialize.requestId) ?? generationEpoch.current;
      activeRequestEpoch.current.set(snapshotToMaterialize.requestId, epoch);
      if (epoch !== generationEpoch.current) continue;
      const key = `${delivery.proposalId}:${delivery.revision}`;
      void materializeCatalogVariationsDetailed(
        [{ completeDesignV1: delivery.bundle }],
        lastPrompt || "Geração orquestrada V5",
        aiGenerationProvenance(delivery.runId),
        delivery.slot,
        reportCompilation,
      ).then((result) => {
        if (epoch !== generationEpoch.current) return;
        if (result.posts.length) {
          setGeneratedVariations((previous) => {
            const knownIds = new Set(previous.map((post) => post.id));
            return [...previous, ...result.posts.filter((post) => !knownIds.has(post.id))];
          });
        }
        if (result.failures.length) {
          setV5MaterializationFailures((previous) => previous.some((failure) => failure.key === key)
            ? previous
            : [...previous, { key, delivery, message: result.failures[0]?.message ?? "Falha ao montar a proposta." }]);
        }
      }).catch((error) => {
        if (epoch !== generationEpoch.current) return;
        setV5MaterializationFailures((previous) => previous.some((failure) => failure.key === key)
          ? previous
          : [...previous, { key, delivery, message: error instanceof Error ? error.message : "Falha ao montar a proposta." }]);
      });
    }
  }, [v5Snapshot]);

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
        if (model.id && typeof payload.postId === "number") {
          setSavedPostIdsByDocId(prev => ({ ...prev, [model.id!]: payload.postId as number }));
        }
        setLastInputMeta({
          inputType: payload.inputType === "url" ? "url" : payload.inputType === "image" ? "image" : "text",
          inputContent: payload.inputContent || "",
        });
      }
    } catch {
      toast.error("Não foi possível abrir o documento salvo. Confira a integridade e a versão da composição.");
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
    const restoreEpoch = generationEpoch.current;
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
        const variations = ensureDistinctFamilies(payload.variations as any[], payload.inputContent || "historico");
        void materializeCatalogVariationsDetailed(variations, payload.inputContent || "historico").then(result => {
          if (restoreEpoch !== generationEpoch.current) return;
          setGeneratedVariations(result.posts);
          setStage("gallery");
          if (result.failures.length) {
            setMaterializationIssue({ failures: result.failures, requestedCount: result.requestedCount, materializedCount: result.materializedCount, prompt: payload.inputContent || "historico", offset: 0 });
            if (result.posts.length) toast.warning(`${result.posts.length} resultado(s) do histórico foram restaurados; ${result.failures.length} precisam ser montados novamente.`);
          } else {
            toast.success("Geração do histórico restaurada no Studio.");
          }
        }).catch(() => {
          if (restoreEpoch === generationEpoch.current) toast.error("Não foi possível restaurar a composição do histórico.");
        });
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
    brief?: CreationBrief | null,
    formatConfirmed = false,
    pipelineOverride?: "v4" | "v5",
    retryAdmission = false,
  ) => {
    const requestEpoch = retryAdmission ? generationEpoch.current : ++generationEpoch.current;
    setIsLoading(true);
    setLastPrompt(promptText);
    setLastMode(mode);
    const isUrl = promptText.startsWith("http://") || promptText.startsWith("https://");
    setLastInputMeta({ inputType: isUrl ? "url" : "text", inputContent: promptText });
    setSavedPostIdsByDocId({});

    try {
      if (pipelineOverride === "v5" || useGenerationV5) {
        await startV5Generation(promptText, mode, brief, formatConfirmed, "create", retryAdmission, requestEpoch);
        return;
      }
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
        formatIntentConfirmed: formatConfirmed,
        designContractVersion: 4,
        idempotencyKey: crypto.randomUUID(),
        includeDraftDesigns: assemblyPilot,
        aspectRatio: assemblyAspectRatio,
        slideCount: mode === "carousel" ? brief?.slideCount ?? 5 : undefined,
        model: "llama",
        creationMode,
        executionBrief,
      });

      if (result?.variations && result.variations.length > 0) {
        showArsenalAvailability(result.arsenalAvailability);
        const provenance = aiGenerationProvenance(result.generationRunId);
        const distinctVars = ensureDistinctFamilies(result.variations as any[], promptText);
        const materialized = await materializeCatalogVariationsDetailed(distinctVars, promptText, provenance, 0, reportCompilation);
        if (requestEpoch !== generationEpoch.current) return;
        if (!materialized.posts.length) {
          setGeneratedVariations([]);
          setMaterializationIssue({ failures: materialized.failures, requestedCount: materialized.requestedCount, materializedCount: materialized.materializedCount, prompt: promptText, offset: 0, provenance });
          setStage("gallery");
          throw new Error("MATERIALIZATION_ONLY");
        }
        const mapped = materialized.posts;
        setMaterializationIssue(materialized.failures.length
          ? { failures: materialized.failures, requestedCount: materialized.requestedCount, materializedCount: materialized.materializedCount, prompt: promptText, offset: 0, provenance }
          : null);

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
        if (materialized.failures.length) {
          toast.warning(`${mapped.length} de ${materialized.requestedCount} direções foram montadas. Os resultados prontos foram preservados; você pode tentar montar as restantes novamente.`);
        } else {
          toast.success(`${mapped.length} direções de arte criadas com IA!`);
        }
      } else {
        throw new Error("Nenhuma variação gerada.");
      }
    } catch (err: any) {
      if (requestEpoch !== generationEpoch.current) return;
      if (err?.message === "MATERIALIZATION_ONLY") return;
      // Etapa 3 §8.3 — falha explícita: NUNCA gerar fallback automático.
      const meta = extractFailureMetadata(err);
      setFailure({
        reason: meta.reason,
        userMessage: meta.userMessage,
        retryable: meta.retryable,
        prompt: promptText,
        mode,
        source: "create",
        formatConfirmed,
        pipeline: pipelineOverride ?? (useGenerationV5 ? "v5" : "v4"),
      });
    } finally {
      if (requestEpoch === generationEpoch.current) {
        setIsLoading(false);
        setIsReviewingBrief(false);
      }
    }
  };

  const doGenerateMore = async (
    promptText: string,
    mode: "static" | "carousel",
    brief?: CreationBrief | null,
    formatConfirmed = formatChoiceConfirmed,
    pipelineOverride?: "v4" | "v5",
    retryAdmission = false,
  ) => {
    const requestEpoch = generationEpoch.current;
    setIsGeneratingMore(true);
    toast.info("A IA está criando 3 novos ângulos criativos...");

    try {
      const isUrl = promptText.startsWith("http://") || promptText.startsWith("https://");
      if (pipelineOverride === "v5" || useGenerationV5) {
        await startV5Generation(promptText, mode, brief, formatConfirmed, "more", retryAdmission, requestEpoch);
        return;
      }
      const executionBrief = brief ? creationBriefToExecutionBrief(brief) : undefined;
      const creationMode = executionBrief ? "execution" : "ideation";

      const result = await generateMutation.mutateAsync({
        inputType: isUrl ? "url" : "text",
        content: isUrl ? promptText : `Crie 3 novos ganchos criativos e direções de arte alternativas sobre: ${promptText}`,
        platform: "instagram",
        postMode: mode,
        formatIntentConfirmed: formatConfirmed,
        designContractVersion: 4,
        idempotencyKey: crypto.randomUUID(),
        includeDraftDesigns: assemblyPilot,
        aspectRatio: assemblyAspectRatio,
        slideCount: mode === "carousel" ? brief?.slideCount ?? 5 : undefined,
        model: "llama",
        creationMode,
        executionBrief,
      });

      if (result?.variations && result.variations.length > 0) {
        showArsenalAvailability(result.arsenalAvailability);
        const offset = generatedVariations.length;
        const provenance = aiGenerationProvenance(result.generationRunId);
        const distinctVars = ensureDistinctFamilies(result.variations as any[], `${promptText}:${offset}`);
        const materialized = await materializeCatalogVariationsDetailed(distinctVars, promptText, provenance, offset, reportCompilation);
        if (requestEpoch !== generationEpoch.current) return;
        if (!materialized.posts.length) {
          setMaterializationIssue({ failures: materialized.failures, requestedCount: materialized.requestedCount, materializedCount: materialized.materializedCount, prompt: promptText, offset, provenance });
          throw new Error("MATERIALIZATION_ONLY");
        }
        setGeneratedVariations((prev) => [...prev, ...materialized.posts]);
        setMaterializationIssue(materialized.failures.length
          ? { failures: materialized.failures, requestedCount: materialized.requestedCount, materializedCount: materialized.materializedCount, prompt: promptText, offset, provenance }
          : null);
        if (materialized.failures.length) {
          toast.warning(`${materialized.posts.length} de ${materialized.requestedCount} novas direções foram montadas. As prontas estão disponíveis e as restantes podem ser recuperadas sem gerar novamente.`);
        } else {
          toast.success(`${materialized.posts.length} novas direções de arte criadas com IA!`);
        }
      } else {
        throw new Error("Sem resposta da IA");
      }
    } catch (err: any) {
      if (requestEpoch !== generationEpoch.current) return;
      if (err?.message === "MATERIALIZATION_ONLY") return;
      // Etapa 3 §8.3 — "Gerar mais" também não pode exibir fallback como sucesso de IA.
      const meta = extractFailureMetadata(err);
      setFailure({
        reason: meta.reason,
        userMessage: meta.userMessage,
        retryable: meta.retryable,
        prompt: promptText,
        mode,
        source: "more",
        formatConfirmed,
        pipeline: pipelineOverride ?? (useGenerationV5 ? "v5" : "v4"),
      });
    } finally {
      if (requestEpoch === generationEpoch.current) setIsGeneratingMore(false);
    }
  };

  /**
   * Interpreta e persiste o briefing sem impor uma etapa extra ao post único.
   * Apenas carrosséis precisam da revisão de estrutura/quantidade de slides.
   */
  const prepareBriefAndContinue = (
    promptText: string,
    mode: "static" | "carousel",
    formatConfirmed = false,
  ) => {
    setFormatChoiceConfirmed(formatConfirmed);
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
    void doGenerate(promptText, mode, interpreted, formatConfirmed);
  };

  const handleCreateSubmit = (promptText: string, mode: "static" | "carousel") => {
    setFormatChoiceConfirmed(false);
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

  const [isRetryingMaterialization, setIsRetryingMaterialization] = useState(false);
  const retryMaterialization = async () => {
    if (!materializationIssue || isRetryingMaterialization) return;
    const epoch = generationEpoch.current;
    const current = materializationIssue;
    setIsRetryingMaterialization(true);
    try {
      const retried = await Promise.all(current.failures.map(async (failure) => {
        const result = await materializeCatalogVariationsDetailed(
          [failure.variation], current.prompt, current.provenance, current.offset + failure.index, reportCompilation,
        );
        return { original: failure, result };
      }));
      const recovered = retried.flatMap(({ result }) => result.posts);
      const remaining = retried.flatMap(({ original, result }) => result.failures.map((failure) => ({
        ...original,
        message: failure.message,
        cause: failure.cause,
      })));
      if (epoch !== generationEpoch.current) return;
      if (recovered.length) setGeneratedVariations((previous) => [...previous, ...recovered]);
      if (remaining.length) {
        setMaterializationIssue({ ...current, failures: remaining, materializedCount: current.materializedCount + recovered.length });
        toast.warning(`${recovered.length} direção(ões) recuperada(s); ${remaining.length} ainda precisam de atenção.`);
      } else {
        setMaterializationIssue(null);
        toast.success(`${recovered.length} resultado(s) recuperado(s) usando a geração já existente.`);
      }
    } catch (error) {
      if (epoch !== generationEpoch.current) return;
      toast.error("A montagem local falhou. A resposta original continua disponível para tentar novamente.");
      console.error("[materialization.recovery] retry failed", error);
    } finally {
      if (epoch === generationEpoch.current) setIsRetryingMaterialization(false);
    }
  };

  const retryV5Materialization = async (failure: V5MaterializationFailure) => {
    if (retryingV5KeysRef.current.has(failure.key)) return;
    retryingV5KeysRef.current.add(failure.key);
    setRetryingV5Keys(new Set(retryingV5KeysRef.current));
    const epoch = generationEpoch.current;
    try {
      const result = await materializeCatalogVariationsDetailed(
        [{ completeDesignV1: failure.delivery.bundle }],
        lastPrompt || "Geração orquestrada V5",
        aiGenerationProvenance(failure.delivery.runId),
        failure.delivery.slot,
        reportCompilation,
      );
      if (epoch !== generationEpoch.current) return;
      if (!result.posts.length) {
        const message = result.failures[0]?.message ?? "Falha ao montar a proposta.";
        setV5MaterializationFailures((previous) => previous.map((item) => item.key === failure.key ? { ...item, message } : item));
        toast.error(`A proposta ${failure.delivery.slot + 1} ainda não pôde ser montada.`);
        return;
      }
      setGeneratedVariations((previous) => {
        const knownIds = new Set(previous.map((post) => post.id));
        return [...previous, ...result.posts.filter((post) => !knownIds.has(post.id))];
      });
      setV5MaterializationFailures((previous) => previous.filter((item) => item.key !== failure.key));
      toast.success(`Proposta ${failure.delivery.slot + 1} recuperada da mesma geração.`);
    } catch (error) {
      if (epoch !== generationEpoch.current) return;
      toast.error("Não foi possível montar a proposta. O bundle V5 continua disponível para tentar novamente.");
      console.error("[generation.v5.materialization] retry failed", error);
    } finally {
      retryingV5KeysRef.current.delete(failure.key);
      if (epoch === generationEpoch.current) setRetryingV5Keys(new Set(retryingV5KeysRef.current));
    }
  };

  const cancelActiveV5Generation = async () => {
    if (!activeV5RequestId || v5Snapshot?.overallStatus !== "running") return;
    try {
      const result = await generationCancel.mutateAsync({ requestId: activeV5RequestId });
      setV5Snapshot(result.snapshot);
      toast.info("O cancelamento foi solicitado. Resultados já prontos continuam disponíveis.");
    } catch {
      toast.error("Não foi possível cancelar o pedido V5 agora.");
    }
  };

  const stopResumingV5 = () => {
    if (v5Snapshot?.overallStatus === "running") return;
    clearActiveV5RequestId(window.sessionStorage);
    setActiveV5RequestId(null);
    setV5Snapshot(null);
    setUseGenerationV5(false);
    setStage("create");
  };

  const handleSelectVariation = (post: CanvasPostModel) => {
    setSelectedPost(post);
    const runId = post.provenance?.generationRunId;
    const generationInput = runId ? v5InputMetaByRunId.current.get(runId) : undefined;
    if (generationInput) setLastInputMeta(generationInput);
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
    const existingSavedId = post.id ? savedPostIdsByDocId[post.id] : undefined;
    try {
      if (mode === "update" && existingSavedId) {
        const payload = await fitSavePayload({ id: existingSavedId, ...canvasModelToUpdatePayload(post) });
        await updateMutation.mutateAsync(payload);
        if (source === "manual") {
          toast.success("Post atualizado na sua biblioteca!", {
            action: { label: "Ver salvos", onClick: () => setLocation("/saved-posts") },
          });
        }
      } else {
        const payload = await fitSavePayload(canvasModelToSavePayload(post, lastInputMeta));
        const result = await saveMutation.mutateAsync(payload);
        if (post.id) {
          setSavedPostIdsByDocId(prev => ({ ...prev, [post.id]: result.id }));
        }
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
    generationEpoch.current += 1;
    clearPendingV5Start(window.sessionStorage);
    clearActiveV5RequestId(window.sessionStorage);
    setPendingV5Start(null);
    setPendingV5StartError(null);
    pendingAdmissionAttempt.current = null;
    setActiveV5RequestId(null);
    setV5Snapshot(null);
    setV5MaterializationFailures([]);
    processedV5Deliveries.current.clear();
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
    setSavedPostIdsByDocId({});
    setLastInputMeta({ inputType: "text", inputContent: "" });
    setFailure(null);
    setFormatConfirm(null);
    setFormatChoiceConfirmed(false);
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
    setFormatChoiceConfirmed(false);
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0A08] text-white flex flex-col overflow-hidden font-sans">
      {stage === "create" && (
        <div className="mx-auto mt-4 w-[min(92%,64rem)] rounded-lg border border-violet-300/25 bg-violet-300/5 p-4 text-sm text-violet-100">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              aria-label="Usar geração progressiva V5"
              className="mt-1"
              checked={useGenerationV5}
              disabled={!generationCapabilities.data?.selectable || v5Snapshot?.overallStatus === "running" || (Boolean(activeV5RequestId) && !v5Snapshot)}
              onChange={(event) => event.target.checked ? setUseGenerationV5(true) : stopResumingV5()}
            />
            <span>
              <strong>Usar geração progressiva V5</strong><br />
              {generationCapabilities.data?.enabled
                ? "As propostas aparecerão na galeria conforme ficarem prontas."
                : labelV5CapabilityReason(generationCapabilities.data?.reason)}
            </span>
          </label>
          {activeV5Query.error && activeV5RequestId && (
            <div className="mt-3 flex items-center justify-between gap-3 text-amber-100">
              <span>O pedido V5 salvo na sessão não pôde ser consultado agora.</span>
              <button type="button" onClick={() => void activeV5Query.refetch()} className="rounded border border-violet-200/40 px-3 py-2">Retomar pedido</button>
            </div>
          )}
          {pendingV5Start && (
            <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-violet-100/15 pt-3 text-amber-100">
              <span>{pendingV5StartError ?? "Confirmando o início da solicitação salva. Uma nova tentativa reutiliza o mesmo briefing e a mesma chave."}</span>
              <button type="button" disabled={generationStart.isPending} onClick={() => void retryPendingV5Admission()} className="rounded border border-violet-200/40 px-3 py-2 disabled:opacity-50">
                {generationStart.isPending ? "Confirmando…" : "Retomar solicitação"}
              </button>
            </div>
          )}
        </div>
      )}
      {stage === "create" && arsenalReadiness.data && (
        <label className="mx-auto mt-4 flex w-[min(92%,64rem)] items-start gap-3 rounded-lg border border-cyan-300/30 bg-cyan-300/5 p-4 text-sm text-cyan-100">
          <input type="checkbox" className="mt-1" checked={assemblyPilot} onChange={e=>setAssemblyPilot(e.target.checked)} />
          <span><strong>Incluir modelos em revisão</strong><br />Prévia administrativa com designs completos ainda em curadoria. A copy é personalizada no modelo; as imagens podem ser preenchidas depois no editor.</span>
        </label>
      )}
      {stage === "create" && assemblyPilot && <div className="mx-auto mt-3 w-[min(92%,64rem)]"><StudioArtPreferences /></div>}
      {stage === "create" && arsenalReadiness.data && (
        <label className="mx-auto mt-2 flex items-center gap-3 text-sm text-cyan-100">
          Formato das propostas
          <select aria-label="Formato das propostas" value={assemblyAspectRatio} onChange={e=>setAssemblyAspectRatio(e.target.value as "1:1"|"4:5"|"9:16")} className="rounded border border-cyan-300/30 bg-[#0B0A08] px-3 py-2">
            <option value="4:5">Retrato 4:5</option><option value="1:1">Quadrado 1:1</option><option value="9:16">Vertical 9:16</option>
          </select>
        </label>
      )}
      {stage === "create" && !assemblyPilot && arsenalReadiness.data && arsenalReadiness.data.reason !== "ready" && (
        <div role="status" className="mx-auto mt-4 w-[min(92%,64rem)] rounded-lg border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100">
          <strong>Novos designs em catálogo ainda indisponíveis.</strong>{" "}
          {arsenalReadiness.data.reason === "disabled"
            ? "A seleção do arsenal está desativada no ambiente."
              : arsenalReadiness.data.reason === "catalog_unavailable"
                ? "Não foi possível consultar o catálogo compartilhado no momento."
                : "Ainda não há designs completos publicados para este formato."}{" "}
          {arsenalReadiness.data.draftCandidateCount ? "Ative Incluir modelos em revisão para conferir o acervo completo antes da publicação." : "Importe e revise designs completos no Admin2. Aviso exibido apenas para administradores."}
        </div>
      )}
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
        <>
          {v5Snapshot && (
            <section role="status" className="mx-auto mt-4 w-[min(92%,64rem)] rounded-xl border border-violet-300/30 bg-violet-300/10 p-4 text-violet-50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <strong>Geração progressiva · {labelV5Status(v5Snapshot.overallStatus)}</strong>
                  <p className="mt-1 text-sm text-violet-100/80">
                    {v5Snapshot.proposals.filter((proposal) => proposal.status === "ready").length} prontas de {v5Snapshot.proposals.length} propostas.
                    {v5Snapshot.overallStatus === "running" ? " A galeria será atualizada conforme cada proposta terminar." : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {activeV5Query.error && <button type="button" onClick={() => void activeV5Query.refetch()} className="rounded-lg border border-violet-200/40 px-3 py-2 text-sm">Atualizar progresso</button>}
                  {v5Snapshot.overallStatus === "running" && (
                    <button type="button" disabled={generationCancel.isPending} onClick={() => void cancelActiveV5Generation()} className="rounded-lg border border-violet-200/40 px-3 py-2 text-sm disabled:opacity-50">{generationCancel.isPending ? "Cancelando…" : "Cancelar geração"}</button>
                  )}
                  {v5Snapshot.overallStatus !== "running" && (
                    <button type="button" onClick={stopResumingV5} className="rounded-lg border border-violet-200/40 px-3 py-2 text-sm">Voltar à criação</button>
                  )}
                </div>
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {v5Snapshot.proposals.map((proposal) => {
                  const key = `${proposal.proposalId}:${proposal.revision}`;
                  const failed = v5MaterializationFailures.find((item) => item.key === key);
                  return (
                    <li key={key} className="rounded-lg border border-violet-100/15 bg-black/15 p-3 text-xs">
                      <div className="font-semibold">Proposta {proposal.slot + 1} · {labelV5Status(proposal.status)}</div>
                      {proposal.status === "failed" && <div className="mt-1 text-rose-200">{messageV5ProposalFailure(proposal.errorReason)}</div>}
                      {failed && (
                        <div className="mt-2 text-amber-200">
                          {failed.message}
                          <button type="button" disabled={retryingV5Keys.has(failed.key)} onClick={() => void retryV5Materialization(failed)} className="ml-2 underline disabled:opacity-50">
                            {retryingV5Keys.has(failed.key) ? "Montando…" : "Tentar montar este resultado"}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {materializationIssue && (
            <section role="alert" className="mx-auto mt-4 w-[min(92%,64rem)] rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-amber-50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <strong>{materializationIssue.materializedCount} de {materializationIssue.requestedCount} resultados disponíveis</strong>
                  <p className="mt-1 text-sm text-amber-100/80">A resposta da geração foi preservada. As direções abaixo falharam ao montar e podem ser recuperadas sem nova chamada de IA.</p>
                </div>
                <button type="button" disabled={isRetryingMaterialization} onClick={() => void retryMaterialization()} className="rounded-lg border border-amber-200/40 px-3 py-2 text-sm font-semibold disabled:opacity-50">
                  {isRetryingMaterialization ? "Montando…" : "Recuperar resultados"}
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-amber-100/75">
                {materializationIssue.failures.map((failure, index) => (
                  <li key={`${failure.slot ?? failure.index}-${index}`}>Direção {failure.slot ?? failure.index + 1}: {failure.message}</li>
                ))}
              </ul>
            </section>
          )}
          <StudioGalleryView
            variations={generatedVariations}
            initialAspectRatio={generatedVariations[0]?.aspectRatio ?? selectedPost.aspectRatio}
            onSelectVariation={handleSelectVariation}
            onBackToCreate={() => {
              setStage("create");
              setDeclaredFamilyId(null);
            }}
            onGenerateMore={handleGenerateMore}
            isGeneratingMore={isGeneratingMore || (useGenerationV5 && v5Snapshot?.overallStatus === "running")}
            declaredFamilyId={declaredFamilyId}
            v5SnapshotProposals={v5Snapshot?.proposals}
            expectedCount={3}
          />
        </>
      )}

      {stage === "editor" && (
        <CanvasLabPage
          initialPost={selectedPost}
          onBackToGallery={(editedPost) => {
            setSelectedPost(editedPost);
            setGeneratedVariations(previous => previous.some(item => item.id === editedPost.id)
              ? previous.map(item => item.id === editedPost.id ? editedPost : item)
              : [...previous, editedPost]);
            setStage("gallery");
          }}
          onRestart={handleRestart}
          onSave={handleSavePost}
          hasSavedPost={Boolean(selectedPost.id && savedPostIdsByDocId[selectedPost.id])}
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
              void doGenerate(activeBrief.rawInput, activeBrief.format, activeBrief, formatChoiceConfirmed);
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
              prepareBriefAndContinue(prompt, mode, true);
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
              const { prompt, mode, source, formatConfirmed, pipeline } = failure;
              setFailure(null);
              if (source === "more") {
                void doGenerateMore(prompt, mode, activeBrief, formatConfirmed, pipeline, pipeline === "v5");
              } else {
                void doGenerate(prompt, mode, activeBrief, formatConfirmed, pipeline, pipeline === "v5");
              }
            }}
            onReviewBriefing={() => {
              setFailure(null);
              setIsReviewingBrief(false);
              setStage("create");
            }}
            onUseLocalFallback={handleUseLocalFallback}
            onDismiss={() => setFailure(null)}
          />
        )}
      </CreationGuardsHost>
    </div>
  );
}
