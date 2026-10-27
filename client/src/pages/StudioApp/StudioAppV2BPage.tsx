import { isStandaloneHttpUrl } from "@shared/generationSources";
import type { CreationInputOptions } from "./components/v2/StudioCreateViewV2B";
import { freezeGenerationProject } from "@shared/projectEditorial";
import {cachedCatalog} from "@/lib/catalogCache";
import {useGenerationEvents} from "@/hooks/useGenerationEvents";
import StudioArtPreferences from "./components/StudioArtPreferences";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import StudioCreateViewV2B from "./components/v2/StudioCreateViewV2B";
import StudioGalleryView from "./components/StudioGalleryView";
import { ProductionOverlay } from "./components/v2/shared";
import { ProposalProgress } from "./components/ProposalSkeletonCard";
import { useProposalProgress } from "./lib/useProposalProgress";
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
import { getSelectedProjectId, setSelectedProjectId, getLocalProjectById } from "./lib/projectStorage";
import type { OrchestratedGenerationInput } from "@shared/generationRequest";
import type { GenerationCoordinatorSnapshot, ProposalDelivery } from "@shared/generationContracts";
import {
  claimProposalDelivery,
  clearActiveGenerationRequestId,
  clearPendingGenerationStart,
  labelGenerationCapabilityReason,
  labelGenerationStatus,
  messageGenerationProposalFailure,
  newGenerationIdempotencyKey,
  persistActiveGenerationRequestId,
  persistPendingGenerationStart,
  readPendingGenerationStart,
  readActiveGenerationRequestId,
  sameGenerationAdmissionBody,
  type PendingGenerationStart,
} from "./lib/studioGenerationState";

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
}

type ReadyProposal = Extract<ProposalDelivery, { status: "ready" }>;

interface ProposalMaterializationFailure {
  key: string;
  delivery: ReadyProposal;
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
  const data = (err as { data?: { generationFailure?: GenerationFailureMetadata; code?: string } } | undefined)?.data;
  if (data?.generationFailure) return data.generationFailure;
  const reason = classifyGenerationError(data?.code ? { code: data.code, message: err instanceof Error ? err.message : "" } : err);
  return {
    generationRunId: "client-unclassified",
    reason,
    retryable: isRetryable(reason),
    userMessage: userMessageFor(reason),
  };
}

/** Studio: admission, durable progress and independent proposal delivery. */
export default function StudioAppV2BPage() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  // An explicit History navigation owns this opening. Do not auto-resume an
  // unrelated session request (or admission) over the selected historical run.
  const [historyRestore] = useState(() => {
    try {
      const payload = JSON.parse(sessionStorage.getItem("postspark.restore_generation") ?? "null") as {
        inputType?: string;
        inputContent?: string;
        postMode?: "static" | "carousel";
        variations?: unknown[];
      } | null;
      return Array.isArray(payload?.variations) && payload.variations.length ? payload : null;
    } catch { return null; }
  });
  const [pendingGenerationStart, setPendingGenerationStart] = useState<PendingGenerationStart | null>(() => {
    try { return historyRestore ? null : readPendingGenerationStart(window.sessionStorage); } catch { return null; }
  });
  const [pendingGenerationStartError, setPendingGenerationStartError] = useState<string | null>(null);
  const [activeGenerationRequestId, setActiveGenerationRequestId] = useState<string | null>(() => {
    try { return historyRestore || readPendingGenerationStart(window.sessionStorage) ? null : readActiveGenerationRequestId(window.sessionStorage); } catch { return null; }
  });
  const [generationSnapshot, setGenerationSnapshot] = useState<GenerationCoordinatorSnapshot | null>(null);
  const proposalProgress = useProposalProgress(generationSnapshot?.proposals);
  const [materializedProposalKeys, setMaterializedProposalKeys] = useState<string[]>([]);
  const [proposalMaterializationFailures, setProposalMaterializationFailures] = useState<ProposalMaterializationFailure[]>([]);
  const [retryingGenerationKeys, setRetryingGenerationKeys] = useState<Set<string>>(() => new Set());
  const retryingGenerationKeysRef = useRef(new Set<string>());
  const processedGenerationDeliveries = useRef(new Set<string>());
  const pendingAdmissionAttempt = useRef<string | null>(null);
  const admissionPromises = useRef(new Map<string, Promise<Awaited<ReturnType<typeof generationStart.mutateAsync>>>>());
  const generationEpoch = useRef(0);
  const restoredGenerationContextRequestId = useRef<string | null>(null);
  const lastBillingRefresh=useRef<string|null>(null);
  const lastAppliedGenerationQueryData = useRef<typeof activeGenerationQuery.data>(undefined);
  const currentRequestId = useRef(activeGenerationRequestId);
  const activeRequestEpoch = useRef<Map<string, number>>(new Map(activeGenerationRequestId ? [[activeGenerationRequestId, 0]] : []));
  const lastGenerationInput = useRef<Partial<OrchestratedGenerationInput> | null>(null);
  const inputMetaByRunId = useRef(new Map<string, { inputType: SaveInputType; inputContent: string }>());
  const generationCapabilities = trpc.generation.capabilities.useQuery(undefined, {
    retry: false,
    staleTime: 5000,
    refetchInterval: query => query.state.data && 'progressTransport' in query.state.data && query.state.data?.progressTransport==='events' ? false : import.meta.env.DEV&&!query.state.data ? false : 5000,
  });
  const generationStart = trpc.generation.start.useMutation({onSuccess:()=>{void utils.billing.getProfile.invalidate();}});
  const sourceUpload=trpc.post.saveMediaAsset.useMutation();
  const generationReconcile=trpc.generation.reconcile.useMutation({onSuccess:()=>{void activeGenerationQuery.refetch();}});
  const generationResume=trpc.generation.resume.useMutation({onSuccess:()=>{void activeGenerationQuery.refetch();}});
  const generationCancel = trpc.generation.cancel.useMutation({onSuccess:()=>{void utils.billing.getProfile.invalidate();}});
  const activeGenerationQuery = trpc.generation.get.useQuery(
    { requestId: activeGenerationRequestId ?? "00000000-0000-0000-0000-000000000000" },
    {
      enabled: Boolean(activeGenerationRequestId),
      refetchInterval: query => ['running','awaiting_reconciliation'].includes(query.state.data?.snapshot.overallStatus??'') && (query.state.data?.progressTransport==='poll'||(!import.meta.env.DEV&&query.state.data?.progressTransport!=='events')) ? 1500 : false,
      retry: false,
    },
  );
  const generationEvents = useGenerationEvents(activeGenerationRequestId,
    (activeGenerationQuery.data?.progressTransport==='events'||Boolean(generationCapabilities.data&&'progressTransport' in generationCapabilities.data&&generationCapabilities.data.progressTransport==='events'&&activeGenerationQuery.data?.progressTransport!=='poll')) && Boolean(activeGenerationRequestId) && (['running','awaiting_reconciliation'].includes(generationSnapshot?.overallStatus ?? 'running')||activeGenerationQuery.data?.billingPending===true),
    event=>{
      const hasDelivery=event.proposals.some(p=>p.status==='ready'&&!generationSnapshot?.proposals.some(old=>old.proposalId===p.proposalId&&old.status==='ready'&&old.revision===p.revision));
      if(hasDelivery||event.error||activeGenerationQuery.data?.dispatchError||!['queued','running'].includes(event.status)){void activeGenerationQuery.refetch();}
      else setGenerationSnapshot(previous=>previous?{...previous,proposals:previous.proposals.map(p=>{
        const next=event.proposals.find(n=>n.proposalId===p.proposalId);
        return next&&p.status!=='ready'&&next.status!=='ready'?{...p,status:next.status as typeof p.status}:p;
      })} as typeof previous:previous);
    },()=>{void activeGenerationQuery.refetch();});
  const arsenalReadiness = trpc.designCatalog.generationReadiness.useQuery(undefined, { retry: false, staleTime: 30000 });
  const [catalogChoice, setCatalogChoice] = useState<{ownerId:string;includeDrafts:boolean}|null>(() => {
    try { const saved=JSON.parse(window.sessionStorage.getItem("postspark.catalog-mode.v1")??"null");return typeof saved?.ownerId==="string"&&typeof saved?.includeDrafts==="boolean"?saved:null; } catch { return null; }
  });
  const catalogOwnerId = generationCapabilities.data?.ownerId;
  // Incorporado: acervo completo ativo por padrão para administradores (assemblyPilot = true)
  const assemblyPilot = Boolean(
    arsenalReadiness.data &&
      catalogOwnerId &&
      (catalogChoice?.ownerId === catalogOwnerId ? catalogChoice.includeDrafts : true)
  );
  const setAssemblyPilot = (includeDrafts:boolean) => { if (catalogOwnerId) {
    const choice={ownerId:catalogOwnerId,includeDrafts};setCatalogChoice(choice);
    try { window.sessionStorage.setItem("postspark.catalog-mode.v1",JSON.stringify(choice)); } catch { /* In-memory preference still works. */ }
  } };
  useEffect(() => {
    if(catalogOwnerId && catalogChoice && catalogChoice.ownerId!==catalogOwnerId) {setCatalogChoice(null);try{window.sessionStorage.removeItem("postspark.catalog-mode.v1");}catch{}}
  }, [catalogOwnerId, catalogChoice]);
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
  const [productionIntro, setProductionIntro] = useState<{ prompt: string; startedAt: number } | null>(null);
  useEffect(() => {
    if (!productionIntro || isLoading) return;
    const timer = window.setTimeout(() => setProductionIntro(null), Math.max(0, 5000 - (Date.now() - productionIntro.startedAt)));
    return () => window.clearTimeout(timer);
  }, [productionIntro, isLoading]);
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
  const [selectedProjectId, setLocalSelectedProjectId] = useState<string | null>(() => getSelectedProjectId());
  const handleSelectProjectId = (id: string | null) => {
    setLocalSelectedProjectId(id);
    setSelectedProjectId(id);
  };
  const brandProjectsQuery = (trpc as any).brandProjects?.list?.useQuery
    ? (trpc as any).brandProjects.list.useQuery(undefined, {
        retry: false,
        staleTime: 60_000,
      })
    : { data: [] };
  /** Item 7: mapa de ids de posts salvos indexados por post.id/proposta (evita colisão cruzada entre propostas). */
  const [savedPostIdsByDocId, setSavedPostIdsByDocId] = useState<Record<string, number>>({});
  const savedPostIdsRef = useRef<Record<string, number>>({});
  savedPostIdsRef.current = savedPostIdsByDocId;
  const inFlightSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const saveQueueRef = useRef<Array<{
    post: CanvasPostModel;
    mode: "new" | "update";
    source: "manual" | "auto";
    galleryPreview?:string;
    resolvers: Array<(ok: boolean) => void>;
  }>>([]);
  const isProcessingQueueRef = useRef(false);

  // Etapa 3 — estado dos bloqueios de UX (confirmação de formato e falha explícita).
  const [formatConfirm, setFormatConfirm] = useState<FormatConfirmState | null>(null);
  const [formatChoiceConfirmed, setFormatChoiceConfirmed] = useState(false);
  const [failure, setFailure] = useState<GenerationFailureState | null>(null);

  // Etapa 4 — Briefing persistente e inteligência de marca
  const [activeBrief, setActiveBrief] = useState<CreationBrief | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [isReviewingBrief, setIsReviewingBrief] = useState(false);

  const acceptGenerationAdmission = (pending: PendingGenerationStart, admitted: Awaited<ReturnType<typeof generationStart.mutateAsync>>, epoch: number) => {
    if (epoch !== generationEpoch.current) return;
    clearPendingGenerationStart(window.sessionStorage);
    setPendingGenerationStart(null);
    setPendingGenerationStartError(null);
    pendingAdmissionAttempt.current = null;
    persistActiveGenerationRequestId(window.sessionStorage, admitted.snapshot.requestId);
    activeRequestEpoch.current.set(admitted.snapshot.requestId, epoch);
    restoredGenerationContextRequestId.current = admitted.snapshot.requestId;
    currentRequestId.current = admitted.snapshot.requestId;
    setActiveGenerationRequestId(admitted.snapshot.requestId);
    setGenerationSnapshot(admitted.snapshot);
    if (stage !== "editor") setStage("gallery");
    lastGenerationInput.current = pending.input;
    setLastPrompt(pending.promptText);
    setLastMode(pending.mode);
    inputMetaByRunId.current.set(admitted.snapshot.runId, { inputType: pending.inputType, inputContent: pending.promptText });
    if (stage !== "editor") setLastInputMeta({ inputType: pending.inputType, inputContent: pending.promptText });
    if (pending.source === "create") {
      setGeneratedVariations([]);
      setProposalMaterializationFailures([]);
      setMaterializedProposalKeys([]);
      processedGenerationDeliveries.current.clear();
      setMaterializationIssue(null);
    }
    setFailure(null);
    if (admitted.created) toast.info("Geração progressiva iniciada. As propostas serão exibidas conforme ficarem prontas.");
    else toast.info("Retomando a geração já admitida.");
  };

  const submitPendingGenerationStart = async (pending: PendingGenerationStart, epoch: number) => {
    if (!generationCapabilities.data?.ownerId || pending.input.ownerId !== generationCapabilities.data.ownerId) {
      throw new Error("O pedido pendente pertence a outra sessão.");
    }
    const key = pending.input.idempotencyKey;
    let admission = admissionPromises.current.get(key);
    if (!admission) {
      if (pendingAdmissionAttempt.current === key) return;
      pendingAdmissionAttempt.current = key;
      admission = generationStart.mutateAsync(pending.input);
      admissionPromises.current.set(key, admission);
    }
    try {
      const admitted = await admission;
      acceptGenerationAdmission(pending, admitted, epoch);
      return admitted;
    } catch (error) {
      if (admissionPromises.current.get(key) === admission) admissionPromises.current.delete(key);
      // Keep this attempt claimed until an explicit retry; the restore effect must not repeat a failed fresh start.
      if (epoch === generationEpoch.current) setPendingGenerationStartError("Não foi possível confirmar o início agora. Tente retomar a mesma solicitação.");
      throw error;
    }
  };

  const retryPendingGenerationAdmission = async () => {
    const pending = pendingGenerationStart ?? readPendingGenerationStart(window.sessionStorage);
    if (!pending) return;
    setPendingGenerationStartError(null);
    pendingAdmissionAttempt.current = null;
    try { await submitPendingGenerationStart(pending, generationEpoch.current); } catch { /* the exact pending request stays available */ }
  };

  const creationInputOptions=useRef<CreationInputOptions>({platform:"instagram",imagePurpose:"content"});
  const startGeneration = async (
    promptText: string,
    mode: "static" | "carousel",
    brief: CreationBrief | null | undefined,
    formatConfirmed: boolean,
    source: "create" | "more",
    retryAdmission: boolean,
    epoch: number,
  ) => {
    const previousPending = retryAdmission ? pendingGenerationStart ?? readPendingGenerationStart(window.sessionStorage) : null;
    if (previousPending) {
      setPendingGenerationStartError(null);
      pendingAdmissionAttempt.current = null;
      await submitPendingGenerationStart(previousPending, epoch);
      return;
    }
    const capabilities=(await generationCapabilities.refetch()).data;
    if (!capabilities?.enabled)throw new Error(labelGenerationCapabilityReason(capabilities?.reason));
    if('catalogRevision' in capabilities&&capabilities.catalogRevision&&capabilities.catalogScope&&capabilities.catalogProject){
      const revision=capabilities.catalogRevision;
      await cachedCatalog(capabilities.catalogProject,capabilities.ownerId,capabilities.catalogScope,revision,()=>utils.catalog.snapshot.fetch({revision}));
    }
    const previousInput = source === "more" ? lastGenerationInput.current : null;
    const executionBrief = previousInput?.executionBrief ?? (brief ? {...creationBriefToExecutionBrief(brief),platform:brief.platform??creationInputOptions.current.platform} : undefined);
    const isUrl = isStandaloneHttpUrl(promptText);
    const tasteInstruction = !isUrl && declaredFamilyId ? buildTasteInstruction(declaredFamilyId) : "";
    const content = source === "more" && !isUrl
      ? `Crie 3 novos ganchos criativos e direções de arte alternativas sobre: ${promptText}${tasteInstruction}`
      : `${promptText}${tasteInstruction}`;
    const activeProjId = previousInput ? previousInput.projectId : brief ? brief.projectId : selectedProjectId ?? undefined;
    let projectDossier = previousInput?.projectDossier ?? brief?.projectDossier;
    let projectSnapshot = previousInput?.projectSnapshot ?? brief?.projectSnapshot;
    if (!projectDossier && !projectSnapshot && activeProjId) {
      const fromRemote = (brandProjectsQuery.data ?? []).find((p: any) => p.id === activeProjId);
      if (fromRemote?.compiledDocument?.trim()) {
        projectDossier = fromRemote.compiledDocument.trim();
        projectSnapshot = freezeGenerationProject(fromRemote);
      } else {
        const fromLocal = getLocalProjectById(activeProjId);
        if (fromLocal?.compiledDocument?.trim()) {
          projectDossier = fromLocal.compiledDocument.trim();
          projectSnapshot = freezeGenerationProject(fromLocal);
        }
      }
    }

    const input: OrchestratedGenerationInput = {
      ownerId: capabilities.ownerId,
      inputType: previousInput?.inputType ?? ((brief?.sources?.some(s=>s.kind==="image"&&s.purpose==="content")||creationInputOptions.current.image&&creationInputOptions.current.imagePurpose==="content")?"image":isUrl ? "url" : "text"),
      sources:previousInput?.sources??brief?.sources??(creationInputOptions.current.image?[{id:"image-1",kind:"image",purpose:creationInputOptions.current.imagePurpose,value:creationInputOptions.current.image}]:undefined),
      imageUrl: previousInput?.imageUrl,
      siteIntelligenceId: previousInput?.siteIntelligenceId,
      tone: previousInput?.tone,
      content,
      platform: previousInput?.platform ?? brief?.platform ?? creationInputOptions.current.platform,
      postMode: mode,
      formatIntentConfirmed: formatConfirmed,
      includeDraftDesigns: previousInput?.includeDraftDesigns ?? assemblyPilot,
      aspectRatio: previousInput?.aspectRatio ?? assemblyAspectRatio,
      slideCount: mode === "carousel" ? previousInput?.slideCount ?? brief?.slideCount ?? 5 : undefined,
      ...(previousInput?.model ? { model: previousInput.model } : {}),
      creationMode: executionBrief ? "execution" : "ideation",
      executionBrief,
      projectId: activeProjId,
      projectDossier,
      projectSnapshot,
      idempotencyKey: newGenerationIdempotencyKey(),
    };
    const unacknowledged = pendingGenerationStart ?? readPendingGenerationStart(window.sessionStorage);
    if (unacknowledged && sameGenerationAdmissionBody(unacknowledged.input, input)) {
      pendingAdmissionAttempt.current = null;
      setPendingGenerationStartError(null);
      await submitPendingGenerationStart(unacknowledged, epoch);
      return;
    }
    // A changed briefing/options is an intentional new request. Its fresh key
    // must never replay the older pending content; epoch guards ignore late replies.
    const pending: PendingGenerationStart = {
      input,
      source,
      promptText,
      mode,
      inputType: input.inputType,
    };
    persistPendingGenerationStart(window.sessionStorage, pending);
    setPendingGenerationStart(pending);
    setPendingGenerationStartError(null);
    await submitPendingGenerationStart(pending, epoch);
  };

  const saveMutation = trpc.post.save.useMutation();
  const updateMutation = trpc.post.update.useMutation();

  useEffect(() => {
    const ownerId = generationCapabilities.data?.ownerId;
    if (!pendingGenerationStart || !ownerId) return;
    if (pendingGenerationStart.input.ownerId !== ownerId) {
      generationEpoch.current += 1;
      clearPendingGenerationStart(window.sessionStorage);
      setPendingGenerationStart(null);
      setPendingGenerationStartError(null);
      pendingAdmissionAttempt.current = null;
      toast.info("O pedido pendente pertence a outra conta. Inicie uma nova geração nesta sessão.");
      return;
    }
    void submitPendingGenerationStart(pendingGenerationStart, generationEpoch.current).catch(() => {});
  }, [pendingGenerationStart, generationCapabilities.data?.ownerId]);

  useEffect(() => {
    const response = activeGenerationQuery.data;
    if (!response || response.snapshot.requestId !== activeGenerationRequestId || lastAppliedGenerationQueryData.current === response) return;
    const requestEpoch = activeRequestEpoch.current.get(response.snapshot.requestId);
    if (requestEpoch !== undefined && requestEpoch !== generationEpoch.current) return;
    lastAppliedGenerationQueryData.current = response;
    activeRequestEpoch.current.set(response.snapshot.requestId, requestEpoch ?? generationEpoch.current);
    setGenerationSnapshot(response.snapshot);
    if(response.snapshot.overallStatus!=='running'){
      const key=`${response.snapshot.requestId}:${response.snapshot.overallStatus}:${Boolean(response.billingPending)}`;
      if(lastBillingRefresh.current!==key){lastBillingRefresh.current=key;void utils.billing.getProfile.invalidate();}
    }
    // Restore the gallery once on refresh, while later deliveries leave the user's current editor/stage alone.
    if (!generationSnapshot && stage !== "editor") setStage("gallery");
    if (response.input && restoredGenerationContextRequestId.current !== response.snapshot.requestId) {
      restoredGenerationContextRequestId.current = response.snapshot.requestId;
      lastGenerationInput.current = response.input as Partial<OrchestratedGenerationInput>;
      if (catalogOwnerId) setAssemblyPilot(Boolean(response.input.includeDraftDesigns));
      const restoredPrompt = response.input.executionBrief?.rawInput
        ?? (response.input.inputType === "url"
          ? response.input.content
          : response.input.content
              .replace(/^Crie 3 novos ganchos criativos e direções de arte alternativas sobre:\s*/i, "")
              .replace(/\n\n\[INSTRUÇÃO DE DIREÇÃO DE ARTE[\s\S]*$/, ""));
      setLastPrompt(restoredPrompt);
      setLastMode(response.input.postMode);
      inputMetaByRunId.current.set(response.snapshot.runId, { inputType: response.input.inputType, inputContent: restoredPrompt });
      // Keep saved-document metadata intact while its editor is open.
      if (stage !== "editor") setLastInputMeta({ inputType: response.input.inputType, inputContent: restoredPrompt });
    }
  }, [activeGenerationQuery.data, activeGenerationRequestId, stage, generationSnapshot, catalogOwnerId]);

  useEffect(() => {
    if (!activeGenerationQuery.error || !activeGenerationRequestId) return;
    const code = (activeGenerationQuery.error as { data?: { code?: string } }).data?.code;
    if (code === "NOT_FOUND" || code === "UNAUTHORIZED") {
      generationEpoch.current += 1;
      clearActiveGenerationRequestId(window.sessionStorage);
      setActiveGenerationRequestId(null);
      currentRequestId.current = null;
      setGenerationSnapshot(null);
      toast.info("Esta geração não está disponível nesta sessão. Você pode iniciar uma nova.");
      return;
    }
    toast.error("Não foi possível atualizar o progresso agora. Tente novamente para retomar o mesmo pedido.");
  }, [activeGenerationQuery.error, activeGenerationRequestId]);

  useEffect(() => {
    if (!generationSnapshot) return;
    const snapshotToMaterialize = generationSnapshot;
    for (const delivery of snapshotToMaterialize.proposals) {
      if (delivery.status !== "ready" || !claimProposalDelivery(processedGenerationDeliveries.current, delivery.proposalId, delivery.revision)) continue;
      const epoch = activeRequestEpoch.current.get(snapshotToMaterialize.requestId) ?? generationEpoch.current;
      activeRequestEpoch.current.set(snapshotToMaterialize.requestId, epoch);
      if (epoch !== generationEpoch.current) continue;
      const key = `${delivery.proposalId}:${delivery.revision}`;
      void materializeCatalogVariationsDetailed(
        [{ completeDesignV1: delivery.bundle }],
        lastPrompt || "Geração de posts",
        aiGenerationProvenance(delivery.runId),
        delivery.slot,
        reportCompilation,
      ).then((result) => {
        if (epoch !== generationEpoch.current) return;
        if (result.posts.length) {
          setMaterializedProposalKeys(previous => [...previous.filter(item => item !== key), key]);
          setGeneratedVariations((previous) => {
            const knownIds = new Set(previous.map((post) => post.id));
            return [...previous, ...result.posts.filter((post) => !knownIds.has(post.id))];
          });
        }
        if (result.failures.length) {
          setProposalMaterializationFailures((previous) => previous.some((failure) => failure.key === key)
            ? previous
            : [...previous, { key, delivery, message: result.failures[0]?.message ?? "Falha ao montar a proposta." }]);
        }
      }).catch((error) => {
        if (epoch !== generationEpoch.current) return;
        setProposalMaterializationFailures((previous) => previous.some((failure) => failure.key === key)
          ? previous
          : [...previous, { key, delivery, message: error instanceof Error ? error.message : "Falha ao montar a proposta." }]);
      });
    }
  }, [generationSnapshot]);

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
      const image=draft.brief.sources?.find(s=>s.kind==="image");creationInputOptions.current={platform:draft.brief.platform??"instagram",image:image?.value,imagePurpose:image?.purpose==="visual_reference"?"visual_reference":"content"};
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
    const payload = historyRestore;
    if (!payload) return;
    const restoreEpoch = generationEpoch.current;
    try {
      clearActiveGenerationRequestId(window.sessionStorage);
      lastGenerationInput.current = null;
      setActiveBrief(null);
      setDeclaredFamilyId(null);
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
    retryAdmission = false,
  ) => {
    const requestEpoch = retryAdmission ? generationEpoch.current : ++generationEpoch.current;
    setProductionIntro({ prompt: promptText, startedAt: Date.now() });
    setIsLoading(true);
    setLastPrompt(promptText);
    setLastMode(mode);
    const isUrl = isStandaloneHttpUrl(promptText);
    setLastInputMeta({ inputType: isUrl ? "url" : "text", inputContent: promptText });
    setSavedPostIdsByDocId({});

    try {
      await startGeneration(promptText, mode, brief, formatConfirmed, "create", retryAdmission, requestEpoch);
      if (brief) persistBriefDraft(brief, "gallery");
    } catch (err: any) {
      if (requestEpoch !== generationEpoch.current) return;
      setProductionIntro(null);
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
    retryAdmission = false,
  ) => {
    const requestEpoch = generationEpoch.current;
    setIsGeneratingMore(true);
    toast.info("A IA está criando 3 novos ângulos criativos...");

    try {
      await startGeneration(promptText, mode, brief, formatConfirmed, "more", retryAdmission, requestEpoch);
    } catch (err: any) {
      if (requestEpoch !== generationEpoch.current) return;
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
    const project = selectedProjectId
      ? (brandProjectsQuery.data ?? []).find((p: any) => p.id === selectedProjectId) ?? getLocalProjectById(selectedProjectId)
      : null;
    const interpreted: CreationBrief = {
      ...interpretRawBriefing(promptText, { selectedFormat: mode }),
      platform:creationInputOptions.current.platform,
      sources:[...interpretRawBriefing(promptText,{selectedFormat:mode}).sourceUrls?.map((url,index)=>({id:`page-${index+1}`,kind:"url" as const,purpose:"content" as const,value:url}))??[],...(creationInputOptions.current.image?[{id:"image-1",kind:"image" as const,purpose:creationInputOptions.current.imagePurpose,value:creationInputOptions.current.image}]:[])],
      ...(project ? {
        projectId: project.id,
        projectDossier: project.compiledDocument?.trim() ?? "",
        projectSnapshot: freezeGenerationProject(project),
      } : {}),
    };
    setActiveBrief(interpreted);
    persistBriefDraft(interpreted, "create");

    if (shouldReviewBriefBeforeGeneration(mode)) {
      setIsReviewingBrief(true);
      return;
    }

    setIsReviewingBrief(false);
    void doGenerate(promptText, mode, interpreted, formatConfirmed);
  };

  const handleCreateSubmit = (promptText: string, mode: "static" | "carousel",options?:CreationInputOptions) => {
    if(options?.image?.startsWith("data:")){const selected=options;void sourceUpload.mutateAsync({imageData:options.image}).then(saved=>handleCreateSubmit(promptText,mode,{...selected,image:saved.url})).catch(()=>toast.error("Não foi possível guardar a imagem fonte. Tente novamente."));return;}
    creationInputOptions.current=options??{platform:"instagram",imagePurpose:"content"};
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

  const retryGenerationMaterialization = async (failure: ProposalMaterializationFailure) => {
    if (retryingGenerationKeysRef.current.has(failure.key)) return;
    retryingGenerationKeysRef.current.add(failure.key);
    setRetryingGenerationKeys(new Set(retryingGenerationKeysRef.current));
    const epoch = generationEpoch.current;
    try {
      const result = await materializeCatalogVariationsDetailed(
        [{ completeDesignV1: failure.delivery.bundle }],
        lastPrompt || "Geração de posts",
        aiGenerationProvenance(failure.delivery.runId),
        failure.delivery.slot,
        reportCompilation,
      );
      if (epoch !== generationEpoch.current) return;
      if (!result.posts.length) {
        const message = result.failures[0]?.message ?? "Falha ao montar a proposta.";
        setProposalMaterializationFailures((previous) => previous.map((item) => item.key === failure.key ? { ...item, message } : item));
        toast.error(`A proposta ${failure.delivery.slot + 1} ainda não pôde ser montada.`);
        return;
      }
      setGeneratedVariations((previous) => {
        const knownIds = new Set(previous.map((post) => post.id));
        return [...previous, ...result.posts.filter((post) => !knownIds.has(post.id))];
      });
      setMaterializedProposalKeys(previous => [...previous.filter(item => item !== failure.key), failure.key]);
      setProposalMaterializationFailures((previous) => previous.filter((item) => item.key !== failure.key));
      toast.success(`Proposta ${failure.delivery.slot + 1} recuperada da mesma geração.`);
    } catch (error) {
      if (epoch !== generationEpoch.current) return;
      toast.error("Não foi possível montar a proposta. O resultado gerado continua disponível para tentar novamente.");
      console.error("[generation.materialization] retry failed", error);
    } finally {
      retryingGenerationKeysRef.current.delete(failure.key);
      if (epoch === generationEpoch.current) setRetryingGenerationKeys(new Set(retryingGenerationKeysRef.current));
    }
  };

  const cancelActiveGeneration = async () => {
    if (!activeGenerationRequestId || !["running","awaiting_reconciliation"].includes(generationSnapshot?.overallStatus??"")) return;
    const epoch = generationEpoch.current;
    const requestId = activeGenerationRequestId;
    try {
      const result = await generationCancel.mutateAsync({ requestId });
      if (epoch !== generationEpoch.current || currentRequestId.current !== requestId) return;
      setGenerationSnapshot(result.snapshot);
      toast.info("O cancelamento foi solicitado. Resultados já prontos continuam disponíveis.");
    } catch {
      toast.error("Não foi possível cancelar o pedido agora.");
    }
  };

  const stopResumingGeneration = () => {
    if (generationSnapshot?.overallStatus === "running") return;
    clearActiveGenerationRequestId(window.sessionStorage);
    setActiveGenerationRequestId(null);
    currentRequestId.current = null;
    setGenerationSnapshot(null);
    setStage("create");
  };

  const handleSelectVariation = (post: CanvasPostModel) => {
    setSelectedPost(post);
    const runId = post.provenance?.generationRunId;
    const generationInput = runId ? inputMetaByRunId.current.get(runId) : undefined;
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
  const executeSingleSave = async (post: CanvasPostModel, mode: "new" | "update", source: "manual" | "auto", galleryPreview?:string): Promise<boolean> => {
    setIsSaving(true);
    const docId = post.id;
    const existingSavedId = docId ? (savedPostIdsRef.current[docId] ?? savedPostIdsByDocId[docId]) : undefined;
    const isExplicitCopy = source === "manual" && mode === "new";
    const shouldUpdate = !isExplicitCopy && Boolean(existingSavedId);

    try {
      if (shouldUpdate && existingSavedId) {
        const payload = await fitSavePayload({ id: existingSavedId, ...canvasModelToUpdatePayload(post),galleryPreview });
        await updateMutation.mutateAsync(payload);
        if (source === "manual") {
          toast.success("Post atualizado na sua biblioteca!", {
            action: { label: "Ver salvos", onClick: () => setLocation("/saved-posts") },
          });
        }
      } else {
        const payload = await fitSavePayload({...canvasModelToSavePayload(post, lastInputMeta),galleryPreview});
        const result = await saveMutation.mutateAsync(payload);
        if (docId) {
          savedPostIdsRef.current[docId] = result.id;
          setSavedPostIdsByDocId(prev => ({ ...prev, [docId]: result.id }));
        }
        if (source === "manual") {
          toast.success("Post salvo na sua biblioteca!", {
            action: { label: "Ver salvos", onClick: () => setLocation("/saved-posts") },
          });
        }
      }
      // Refresh both the library and account count after either INSERT or UPDATE.
      // A cache refresh failure must not turn a successful persisted save into a failure.
      await Promise.allSettled([
        utils.post.list.invalidate(),
        utils.post.listSummary.invalidate(),
        utils.billing.getProfile.invalidate(),
      ]);
      return true;
    } catch (err: any) {
      const message = err?.message || "Não foi possível salvar o post agora.";
      if (source === "manual") toast.error(message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const processSaveQueue = async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    try {
      while (saveQueueRef.current.length > 0) {
        const item = saveQueueRef.current.shift()!;
        const promise = executeSingleSave(item.post, item.mode, item.source,item.galleryPreview);
        inFlightSavePromiseRef.current = promise;
        let success = false;
        try {
          success = await promise;
        } finally {
          if (inFlightSavePromiseRef.current === promise) {
            inFlightSavePromiseRef.current = null;
          }
        }
        for (const resolver of item.resolvers) {
          resolver(success);
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  };

  const handleSavePost = async (post: CanvasPostModel, mode: "new" | "update", source: "manual" | "auto", galleryPreview?:string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const isExplicitCopy = source === "manual" && mode === "new";
      const queue = saveQueueRef.current;

      // Se não for cópia explícita e houver um item pendente na fila para o mesmo doc que seja update, coalescemos
      if (!isExplicitCopy && queue.length > 0) {
        const last = queue[queue.length - 1];
        if (last.post.id === post.id && last.mode === "update") {
          last.post = post;
          last.galleryPreview=galleryPreview;
          if (source === "manual") last.source = "manual";
          last.resolvers.push(resolve);
          void processSaveQueue();
          return;
        }
      }

      queue.push({
        post,
        mode,
        source,
        galleryPreview,
        resolvers: [resolve],
      });
      void processSaveQueue();
    });
  };

  // ─── Item 6: recomeçar do zero ───
  const handleRestart = () => {
    generationEpoch.current += 1;
    clearPendingGenerationStart(window.sessionStorage);
    clearActiveGenerationRequestId(window.sessionStorage);
    setPendingGenerationStart(null);
    setPendingGenerationStartError(null);
    pendingAdmissionAttempt.current = null;
    setActiveGenerationRequestId(null);
    currentRequestId.current = null;
    setGenerationSnapshot(null);
    setProposalMaterializationFailures([]);
    setMaterializedProposalKeys([]);
    setIsLoading(false);
    setIsGeneratingMore(false);
    processedGenerationDeliveries.current.clear();
    clearBriefDraft();
    setHasSavedDraft(false);
    setLastPrompt("");
    setLastMode("static");
    lastGenerationInput.current = null;
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
    <>
    <AnimatePresence>{productionIntro && <ProductionOverlay prompt={productionIntro.prompt} />}</AnimatePresence>
    <div inert={productionIntro ? true : undefined} className="min-h-screen w-full bg-[#0B0A08] text-white flex flex-col overflow-hidden font-sans">
      {activeGenerationQuery.data?.dispatchError && (activeGenerationQuery.data.snapshot.overallStatus==='running'||activeGenerationQuery.data.billingPending) && activeGenerationRequestId && <div role="alert">O executor não conseguiu continuar. <button disabled={generationResume.isPending} onClick={()=>generationResume.mutate({requestId:activeGenerationRequestId})}>Retomar geração</button></div>}
      {generationEvents.error && <div role="alert">A conexão com a geração foi interrompida. O trabalho pode continuar no servidor. <button onClick={generationEvents.reconnect}>Reconectar</button></div>}
      {stage === "create" && (!generationCapabilities.data?.enabled || activeGenerationQuery.error || pendingGenerationStart) && (
        <div className="mx-auto mt-4 w-[min(92%,64rem)] rounded-lg border border-violet-300/25 bg-violet-300/5 p-4 text-sm text-violet-100">
          {!generationCapabilities.data?.enabled && (
            <p role="status">{labelGenerationCapabilityReason(generationCapabilities.data?.reason)}</p>
          )}
          {activeGenerationQuery.error && activeGenerationRequestId && (
            <div className="mt-3 flex items-center justify-between gap-3 text-amber-100">
              <span>O pedido salvo na sessão não pôde ser consultado agora.</span>
              <button type="button" onClick={() => void activeGenerationQuery.refetch()} className="rounded border border-violet-200/40 px-3 py-2">Retomar pedido</button>
            </div>
          )}
          {pendingGenerationStart && (
            <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-violet-100/15 pt-3 text-amber-100">
              <span>{pendingGenerationStartError ?? "Confirmando o início da solicitação salva. Uma nova tentativa reutiliza o mesmo briefing e a mesma chave."}</span>
              <button type="button" disabled={generationStart.isPending} onClick={() => void retryPendingGenerationAdmission()} className="rounded border border-violet-200/40 px-3 py-2 disabled:opacity-50">
                {generationStart.isPending ? "Confirmando…" : "Retomar solicitação"}
              </button>
            </div>
          )}
        </div>
      )}
      {/* Mensagem e controle de inclusão de modelos em revisão comentados conforme incorporação (preservados para digestão futura de novos designs) */}
      {/*
      {stage === "create" && arsenalReadiness.data && (
        <label className="mx-auto mt-4 flex w-[min(92%,64rem)] items-start gap-3 rounded-lg border border-cyan-300/30 bg-cyan-300/5 p-4 text-sm text-cyan-100">
          <input type="checkbox" className="mt-1" checked={assemblyPilot} onChange={e=>setAssemblyPilot(e.target.checked)} />
          <span><strong>Incluir modelos em revisão</strong><br />Prévia administrativa com designs completos ainda em curadoria. As propostas passam pelo mesmo processo de geração e revisão.
            <span className="mt-1 block text-xs text-cyan-100/70">Ofertas em 4:5: {assemblyPilot ? arsenalReadiness.data.draftCandidateCount : arsenalReadiness.data.candidateCount} para post único e {assemblyPilot ? (arsenalReadiness.data.draftCarouselCandidateCount ?? 0) : (arsenalReadiness.data.carouselCandidateCount ?? 0)} para carrossel de três slides. A compatibilidade final depende do pedido.</span>
          </span>
        </label>
      )}
      {/* Bloco "Seu jeito de criar" (preferências visuais) comentado para simplificar a interface do Studio */}
      {/*
      {stage === "create" && assemblyPilot && <div className="mx-auto mt-3 w-[min(92%,64rem)]"><StudioArtPreferences /></div>}
      */}
      {stage === "create" && arsenalReadiness.data && (
        <label className="mx-auto mt-2 flex items-center gap-3 text-sm text-cyan-100">
          Formato das propostas
          <select aria-label="Formato das propostas" value={assemblyAspectRatio} onChange={e=>setAssemblyAspectRatio(e.target.value as "1:1"|"4:5"|"9:16")} className="rounded border border-cyan-300/30 bg-[#0B0A08] px-3 py-2">
            <option value="4:5">Retrato 4:5</option><option value="1:1">Quadrado 1:1</option><option value="9:16">Vertical 9:16</option>
          </select>
        </label>
      )}
      {/*
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
      */}
      {stage === "create" && (
        <StudioCreateViewV2B
          onSubmit={handleCreateSubmit}
          isLoading={isLoading||sourceUpload.isPending}
          initialPlatform={activeBrief?.platform}
          initialImage={activeBrief?.sources?.find(s=>s.kind==="image")?.value}
          initialImagePurpose={activeBrief?.sources?.find(s=>s.kind==="image")?.purpose}
          declaredFamilyId={declaredFamilyId}
          onDeclareFamily={setDeclaredFamilyId}
          initialPrompt={lastPrompt}
          initialMode={lastMode}
          hasSavedDraft={hasSavedDraft}
          onDiscardDraft={handleDiscardDraft}
          selectedProjectId={selectedProjectId}
          onSelectProjectId={handleSelectProjectId}
        />
      )}

      {stage === "gallery" && (
        <>
          {generationSnapshot && (
            <section role="status" className="mx-auto mt-4 w-[min(92%,64rem)] rounded-xl border border-violet-300/30 bg-violet-300/10 p-4 text-violet-50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <strong>Geração progressiva · {labelGenerationStatus(generationSnapshot.overallStatus)}</strong>
                  <p className="mt-1 text-sm text-violet-100/80">
                    {generationSnapshot.proposals.filter((proposal) => proposal.status === "ready").length} prontas de {generationSnapshot.proposals.length} propostas.
                    {generationSnapshot.overallStatus === "running" ? " A galeria será atualizada conforme cada proposta terminar." : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {generationSnapshot.overallStatus==="awaiting_reconciliation"&&<><p>O resultado da revisão ainda precisa ser confirmado. O pedido mantém o prazo original.</p><button disabled={generationReconcile.isPending} onClick={()=>activeGenerationRequestId&&generationReconcile.mutate({requestId:activeGenerationRequestId})}>Conferir resultado existente</button></>}
                  {activeGenerationQuery.error && <button type="button" onClick={() => void activeGenerationQuery.refetch()} className="rounded-lg border border-violet-200/40 px-3 py-2 text-sm">Atualizar progresso</button>}
                  {["running","awaiting_reconciliation"].includes(generationSnapshot.overallStatus) && (
                    <button type="button" disabled={generationCancel.isPending} onClick={() => void cancelActiveGeneration()} className="rounded-lg border border-violet-200/40 px-3 py-2 text-sm disabled:opacity-50">{generationCancel.isPending ? "Cancelando…" : "Cancelar geração"}</button>
                  )}
                  {generationSnapshot.overallStatus !== "running" && (
                    <button type="button" onClick={stopResumingGeneration} className="rounded-lg border border-violet-200/40 px-3 py-2 text-sm">Voltar à criação</button>
                  )}
                </div>
              </div>
              {!!activeGenerationQuery.data?.sourceWarnings?.length&&<div className="mt-3 text-sm text-amber-200"><strong>Limitações das fontes</strong>{activeGenerationQuery.data.sourceWarnings.map((warning,index)=><p key={index}>{warning}</p>)}</div>}
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {generationSnapshot.proposals.map((proposal) => {
                  const key = `${proposal.proposalId}:${proposal.revision}`;
                  const failed = proposalMaterializationFailures.find((item) => item.key === key);
                  return (
                    <li key={key} className="rounded-lg border border-violet-100/15 bg-black/15 p-3 text-xs">
                      <div className="font-semibold">Proposta {proposal.slot + 1} · {labelGenerationStatus(proposal.status)}</div>
                      {proposal.status !== "ready" && !failed && <div className="md:hidden"><ProposalProgress slot={proposal.slot + 1} status={proposal.status} value={proposalProgress[key]} /></div>}
                      {proposal.status === "failed" && <div className="mt-1 text-rose-200">{messageGenerationProposalFailure(proposal.errorReason, proposal.failure)}</div>}
                      {failed && (
                        <div className="mt-2 text-amber-200">
                          {failed.message}
                          <button type="button" disabled={retryingGenerationKeys.has(failed.key)} onClick={() => void retryGenerationMaterialization(failed)} className="ml-2 underline disabled:opacity-50">
                            {retryingGenerationKeys.has(failed.key) ? "Montando…" : "Tentar montar este resultado"}
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
            initialAspectRatio={generatedVariations[0]?.aspectRatio ?? lastGenerationInput.current?.aspectRatio ?? assemblyAspectRatio}
            onSelectVariation={handleSelectVariation}
            onBackToCreate={() => {
              setStage("create");
              setDeclaredFamilyId(null);
            }}
            onGenerateMore={handleGenerateMore}
            isGeneratingMore={isGeneratingMore || (generationSnapshot?.overallStatus === "running")}
            declaredFamilyId={declaredFamilyId}
            generationProposals={generationSnapshot?.proposals}
            proposalProgress={proposalProgress}
            materializedProposalKeys={materializedProposalKeys}
            materializationFailureKeys={proposalMaterializationFailures.map(item => item.key)}
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
          hasSavedPost={Boolean(selectedPost.id && (savedPostIdsRef.current[selectedPost.id] || savedPostIdsByDocId[selectedPost.id]))}
          isSaving={isSaving}
        />
      )}

      {/* Etapa 3 & 4 — bloqueios de UX e revisão de briefing sobre as telas */}
      <CreationGuardsHost>
        {isReviewingBrief && activeBrief?.format === "carousel" && (
          <BriefReviewModal
            brief={activeBrief}
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
              const { prompt, mode, source, formatConfirmed } = failure;
              setFailure(null);
              if (source === "more") {
                void doGenerateMore(prompt, mode, activeBrief, formatConfirmed, true);
              } else {
                void doGenerate(prompt, mode, activeBrief, formatConfirmed, true);
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
    </>
  );
}
