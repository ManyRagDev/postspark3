import {
  applyMediaOperation,
  pendingMediaCount,
  targetExists,
  type MediaUpdate,
} from "./lib/mediaSlots";
import {
  applyCompositionAppearancePatch,
  shouldDeleteCanvasSelection,
} from "./lib/compositionEditing";
import { applyFamilyPreset } from "./lib/familyPreset";
import { aspectRatioHeight } from "@shared/aspectRatios";
import { ensureArsenalCompositionFonts } from "./lib/arsenalAssets";
import { arsenalApi } from "@/lib/arsenalApi";
import { applyArsenalFormatVariant } from "./lib/arsenalGenerationCompiler";
import ArsenalCompositionInspector from "./components/ArsenalCompositionInspector";
import type { ArsenalComposition } from "@shared/designArsenal";
import { applyContentText } from "@shared/arsenalContent";
import {
  putArsenalComposition,
  restoreArsenalVariant,
  editArsenalContent,
  editArsenalElementText,
  setArsenalCustomBackground,
  setArsenalLogo,
  addArsenalAuthorialLayer,
  updateArsenalAuthorialLayer,
  removeArsenalAuthorialLayer,
  hideArsenalInstance,
} from "./lib/arsenalComposition";
import { GuidedEditorDialog } from "./components/GuidedEditor";
import CanvasEditorChrome, {
  CanvasAddPanel,
  type CanvasEditorTool,
} from "./components/CanvasEditorChrome";
import {
  CanvasEditorLayers,
  CanvasCaptionPanel,
} from "./components/CanvasEditorPanel";
import {
  CanvasAppearancePanel,
  CanvasBrandPanel,
  CanvasMediaPanel,
} from "./components/CanvasEditorContent";
import { CanvasSelectionPanel } from "./components/CanvasSelectionPanel";
import {
  projectEditorLayers,
  resolveEditorSelection,
  executeEditorCommand,
  applyEditorTypography,
  applyEditorPalette,
  setEditorLogo,
  resolveEditorProperties,
  COMPOSITION_BACKGROUND_ID,
  type EditorCommand,
  type EditorTarget,
} from "./lib/editorController";
import {
  captureInitialVisuals,
  composePost,
  fitPostToAspectRatio,
} from "./lib/guidedComposition";
import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Check, Crop } from "lucide-react";
import { toast } from "sonner";
import {
  CanvasPostStage,
  type CanvasPostStageRef,
} from "./components/CanvasPostStage";
import CanvasTopBar from "./components/CanvasTopBar";
import CanvasToolRail from "./components/CanvasToolRail";
import SlideReplicationDialog from "./components/SlideReplicationDialog";
import CarouselFilmstrip from "./components/CarouselFilmstrip";
import {
  ConfirmDialog,
  PendingMediaExportDialog,
  SaveChoiceDialog,
  readSavePreference,
  writeSavePreference,
} from "./components/CanvasLabDialogs";
import {
  INITIAL_POST,
  type AspectRatioType,
  type CanvasPostModel,
  type ElementPosition,
  type BgImageTransform,
  type CanvasCustomText,
  type CanvasCustomImage,
  type CanvasRichTextChunk,
} from "./components/types";
import {
  applyPatchToCurrentSlide,
  duplicateSlide,
  removeSlide,
  reorderSlides,
  freshId,
  resolveSlideExtraTexts,
  resolveSlideExtraImages,
} from "./lib/documentCommands";
import {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
  setHistoryPresent,
} from "./lib/canvasHistory";
import { AutoSaveManager, type AutoSaveState } from "./lib/autoSaveManager";
import {
  applyCurrentSlideAppearancePatch,
  replicateSlideAppearance,
  resolveSlideAppearance,
  replicateCarouselComposition,
  type ReplicationGroup,
} from "./lib/slideReplication";

export type PostUpdateAction =
  | {
      kind: "document";
      document: CanvasPostModel;
      composition?: ArsenalComposition;
    }
  | {
      kind: "patch";
      patch: Partial<CanvasPostModel>;
      composition?: ArsenalComposition;
    }
  | { kind: "updater"; update: (prev: CanvasPostModel) => CanvasPostModel };

export type PostUpdateInput =
  | PostUpdateAction
  | Partial<CanvasPostModel>
  | ((prev: CanvasPostModel) => CanvasPostModel);

interface CanvasLabPageProps {
  initialPost?: CanvasPostModel;
  onBackToGallery?: (post: CanvasPostModel) => void;
  /** Item 6: recomeçar do zero — limpa a sessão e volta à tela de criação. */
  onRestart?: () => void;
  /** Item 7: persiste o post ("new" = INSERT, "update" = UPDATE do salvo). */
  onSave?: (
    post: CanvasPostModel,
    mode: "new" | "update",
    source: "manual" | "auto",
    galleryPreview?: string
  ) => Promise<boolean>;
  /** Existe um post salvo vinculado à sessão (habilita "Atualizar"). */
  hasSavedPost?: boolean;
  isSaving?: boolean;
  [key: string]: any;
}

const AUTO_SAVE_PREF_KEY = "postspark.canvasAutoSaveEnabled";

function readAutoSavePreference(): boolean {
  try {
    const val = window.localStorage.getItem(AUTO_SAVE_PREF_KEY);
    return val !== "false";
  } catch {
    return true;
  }
}

function syncPostCaptionWithCompositions(
  post: CanvasPostModel
): CanvasPostModel {
  if (typeof post.caption !== "string") return post;
  let changed = false;
  const slides = post.slides.map(slide => {
    if (
      slide.composition &&
      slide.composition.content.caption !== post.caption
    ) {
      changed = true;
      return {
        ...slide,
        composition: editArsenalContent(slide.composition, {
          ...slide.composition.content,
          caption: post.caption,
        }),
      };
    }
    return slide;
  });
  return changed ? { ...post, slides } : post;
}

export default function CanvasLabPage({
  initialPost,
  onBackToGallery,
  onRestart,
  onSave,
  hasSavedPost = false,
  isSaving = false,
}: CanvasLabPageProps = {}) {
  const [activeTool, setActiveTool] = useState<CanvasEditorTool | null>(null);
  const [restorePreview, setRestorePreview] = useState<{
    slideId: string;
    composition: ArsenalComposition;
  } | null>(null);
  const [mobileChromeHeight, setMobileChromeHeight] = useState(60);
  const [isTextEditing, setIsTextEditing] = useState(false);
  const [canvasToolsOpen, setCanvasToolsOpen] = useState(false);
  const [pendingTextEdit, setPendingTextEdit] = useState<string | null>(null);
  const [guidedAction, setGuidedAction] = useState<"visual" | "recover" | null>(
    null
  );
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [brandScopeOpen, setBrandScopeOpen] = useState(false);
  const [brandDestinations, setBrandDestinations] = useState<string[]>([]);
  const freeEditing = true;
  const [formatPreview, setFormatPreview] = useState<CanvasPostModel | null>(
    null
  );
  const [nativeFormatPreview, setNativeFormatPreview] =
    useState<CanvasPostModel | null>(null);
  const [formatLoading, setFormatLoading] = useState(false);
  const formatRequest = useRef(0);
  const [mediaPreview, setMediaPreview] = useState<string>();
  const [isEditingBackground, setIsEditingBackground] = useState(false);
  const [history, setHistory] = useState(() =>
    createHistory<CanvasPostModel>(
      captureInitialVisuals(
        syncPostCaptionWithCompositions(initialPost || INITIAL_POST)
      )
    )
  );
  const post = history.present;
  const arsenalComposition = post.slides[post.currentSlideIndex]?.composition;
  const currentViewPost = useMemo(
    () => resolveSlideAppearance(post, post.currentSlideIndex),
    [post]
  );

  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(
    readAutoSavePreference
  );
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const isExitingRef = useRef(false);
  const autoSaveManagerRef = useRef<AutoSaveManager<CanvasPostModel> | null>(
    null
  );
  const onSaveRef = useRef(onSave);
  const hasSavedPostRef = useRef(hasSavedPost);
  const postRef = useRef(post);
  const editSessionRef = useRef<{
    target: EventTarget;
    started: boolean;
  } | null>(null);
  onSaveRef.current = onSave;
  hasSavedPostRef.current = hasSavedPost;
  postRef.current = post;

  // O gerenciador só existe enquanto o usuário mantém o salvamento automático ativo.
  useEffect(() => {
    if (!isAutoSaveEnabled || !onSaveRef.current) return;
    const manager = new AutoSaveManager<CanvasPostModel>({
      onSave: async docToSave => {
        const mode = hasSavedPostRef.current ? "update" : "new";
        const preview = await captureSavePreview(docToSave);
        return (
          (preview
            ? onSaveRef.current?.(docToSave, mode, "auto", preview)
            : onSaveRef.current?.(docToSave, mode, "auto")) ?? false
        );
      },
      debounceMs: 1000,
      onStateChange: (state, savedAt) => {
        setAutoSaveState(state);
        if (savedAt) setLastSavedAt(savedAt);
      },
    });
    autoSaveManagerRef.current = manager;
    if (autoSaveState === "dirty") manager.triggerChange(postRef.current);
    return () => {
      manager.destroy();
      if (autoSaveManagerRef.current === manager)
        autoSaveManagerRef.current = null;
    };
  }, [isAutoSaveEnabled]);

  const handleAutoSaveChange = (enabled: boolean) => {
    if (!enabled) {
      autoSaveManagerRef.current?.destroy();
      autoSaveManagerRef.current = null;
    }
    setIsAutoSaveEnabled(enabled);
    try {
      window.localStorage.setItem(AUTO_SAVE_PREF_KEY, String(enabled));
    } catch {
      // Preferência apenas nesta sessão quando o armazenamento está indisponível.
    }
  };

  // Função centralizadora de mutações com histórico de Undo/Redo e agendamento de AutoSave
  const setPost = (
    updater: CanvasPostModel | ((prev: CanvasPostModel) => CanvasPostModel)
  ) => {
    const current = postRef.current;
    const proposed = typeof updater === "function" ? updater(current) : updater;
    const next = captureInitialVisuals(
      syncPostCaptionWithCompositions(proposed)
    );
    if (next === current) return;
    postRef.current = next;
    const session = editSessionRef.current;
    const coalesce = Boolean(session?.started);
    if (session) session.started = true;
    setHistory(prevHistory => {
      if (next === prevHistory.present) return prevHistory;
      return coalesce
        ? { ...prevHistory, present: next, future: [] }
        : pushHistory(prevHistory, next);
    });
    autoSaveManagerRef.current?.triggerChange(next);
    if (!autoSaveManagerRef.current) setAutoSaveState("dirty");
  };

  const handleUndo = () => {
    editSessionRef.current = null;
    stageRef.current?.commitDraft?.();
    setHistory(prev => {
      if (!canUndo(prev)) return prev;
      const currentActiveId =
        prev.present.slides[prev.present.currentSlideIndex]?.id;
      const nextHistory = undoHistory(prev);
      let doc = nextHistory.present;
      const preservedIndex = currentActiveId
        ? doc.slides.findIndex(s => s.id === currentActiveId)
        : -1;
      if (preservedIndex >= 0) {
        doc = { ...doc, currentSlideIndex: preservedIndex };
      } else {
        doc = {
          ...doc,
          currentSlideIndex: Math.min(
            Math.max(0, doc.currentSlideIndex),
            Math.max(0, doc.slides.length - 1)
          ),
        };
      }
      const finalHistory = { ...nextHistory, present: doc };
      autoSaveManagerRef.current?.triggerChange(doc);
      if (!autoSaveManagerRef.current) setAutoSaveState("dirty");
      return finalHistory;
    });
  };

  const handleRedo = () => {
    editSessionRef.current = null;
    stageRef.current?.commitDraft?.();
    setHistory(prev => {
      if (!canRedo(prev)) return prev;
      const currentActiveId =
        prev.present.slides[prev.present.currentSlideIndex]?.id;
      const nextHistory = redoHistory(prev);
      let doc = nextHistory.present;
      const preservedIndex = currentActiveId
        ? doc.slides.findIndex(s => s.id === currentActiveId)
        : -1;
      if (preservedIndex >= 0) {
        doc = { ...doc, currentSlideIndex: preservedIndex };
      } else {
        doc = {
          ...doc,
          currentSlideIndex: Math.min(
            Math.max(0, doc.currentSlideIndex),
            Math.max(0, doc.slides.length - 1)
          ),
        };
      }
      const finalHistory = { ...nextHistory, present: doc };
      autoSaveManagerRef.current?.triggerChange(doc);
      if (!autoSaveManagerRef.current) setAutoSaveState("dirty");
      return finalHistory;
    });
  };

  const handleSelectSlide = (index: number) => {
    if (index === post.currentSlideIndex) return;
    if (index < 0 || index >= post.slides.length) return;
    stageRef.current?.commitDraft?.();
    setIsEditingBackground(false);
    setSelectedElementId(null);
    setHistory(prev => {
      if (index === prev.present.currentSlideIndex) return prev;
      return setHistoryPresent(prev, {
        ...prev.present,
        currentSlideIndex: index,
      });
    });
  };

  // Atalhos canônicos de teclado: Ctrl+Z / Cmd+Z (Undo) e Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y (Redo)
  useEffect(() => {
    const handleHistoryKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const isMac =
        typeof navigator !== "undefined" &&
        /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleHistoryKeyDown);
    return () => window.removeEventListener("keydown", handleHistoryKeyDown);
  }, []);

  const handleReorderSlide = (sourceIndex: number, targetIndex: number) => {
    handleUpdatePost({
      kind: "updater",
      update: prev => reorderSlides(prev, sourceIndex, targetIndex),
    });
  };

  const [zoom, setZoom] = useState(1);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [pendingExport, setPendingExport] = useState<"png" | "zip" | null>(
    null
  );
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isRestartConfirmOpen, setIsRestartConfirmOpen] = useState(false);
  const [isReplicationOpen, setIsReplicationOpen] = useState(false);
  const stageRef = useRef<CanvasPostStageRef>(null);
  const captureSavePreview = async (
    doc: CanvasPostModel
  ): Promise<string | undefined> => {
    if (
      !import.meta.env.DEV ||
      doc.currentSlideIndex !== 0 ||
      postRef.current !== doc
    )
      return;
    try {
      const image = await stageRef.current?.exportThumbnail();
      if (postRef.current === doc && image && image.length <= 100000)
        return image;
    } catch {
      /* Save the document even when preview capture fails. */
    }
  };

  const [selectedElementTarget, setSelectedElementTarget] = useState<{
    slideId: string;
    elementId: string;
  } | null>(null);

  const curActiveSlide = post.slides[post.currentSlideIndex];

  const editorLayers = useMemo(
    () => projectEditorLayers(post, curActiveSlide.id),
    [post, curActiveSlide.id]
  );
  const editorSelection = useMemo(
    () =>
      selectedElementTarget?.slideId === curActiveSlide.id
        ? resolveEditorSelection(post, selectedElementTarget)
        : undefined,
    [post, selectedElementTarget, curActiveSlide.id]
  );
  const isElementInCurrentSlide = Boolean(editorSelection);
  const selectedElementId = editorSelection?.id ?? null;

  const setSelectedElementId = useCallback(
    (
      elementIdOrUpdater:
        | string
        | null
        | ((prev: string | null) => string | null)
    ) => {
      setSelectedElementTarget(prevTarget => {
        const curSlide =
          postRef.current.slides[postRef.current.currentSlideIndex];
        const curSlideId = curSlide?.id;
        const prevId =
          prevTarget && curSlideId && prevTarget.slideId === curSlideId
            ? prevTarget.elementId
            : null;
        const nextId =
          typeof elementIdOrUpdater === "function"
            ? elementIdOrUpdater(prevId)
            : elementIdOrUpdater;
        if (!nextId || !curSlideId) return null;
        return { slideId: curSlideId, elementId: nextId };
      });
    },
    []
  );
  const mobileStageAreaRef = useRef<HTMLElement>(null);
  const [measuredStageHeight, setMeasuredStageHeight] = useState<number | null>(
    null
  );
  const [measuredStageWidth, setMeasuredStageWidth] = useState<number | null>(
    null
  );

  // Monitoramento dinâmico da resolução da tela para responsividade matemática
  const [windowDimensions, setWindowDimensions] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 390,
    height: typeof window !== "undefined" ? window.innerHeight : 844,
    bottomInset: 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
        bottomInset: window.visualViewport
          ? Math.max(
              0,
              window.innerHeight -
                window.visualViewport.height -
                window.visualViewport.offsetTop
            )
          : 0,
      });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  }, []);

  // Mede a altura real após o layout (inclusive safe area e teclado), evitando
  // estimativas fixas quando a faixa de slides entra ou sai.
  useLayoutEffect(() => {
    const stageArea = mobileStageAreaRef.current;
    if (!stageArea) return;
    const measure = () => {
      const rect = stageArea.getBoundingClientRect();
      const height = rect.height;
      const width = rect.width;
      setMeasuredStageHeight(previous =>
        previous === height ? previous : height
      );
      setMeasuredStageWidth(previous =>
        previous === width ? previous : width
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(stageArea);
    return () => observer.disconnect();
  }, [activeTool, post.slides.length, mobileChromeHeight, isTextEditing]);

  const isMobile = windowDimensions.width < 768;
  const baseWidth = 360;
  const baseHeight = aspectRatioHeight(post.aspectRatio);

  // Fit uses the actual free rectangle. The mobile chrome reserves space in the
  // flex layout, so the art is never translated underneath a sheet.
  const fittedScale = useMemo(() => {
    const width =
      measuredStageWidth ??
      (isMobile ? windowDimensions.width : windowDimensions.width - 80);
    const height = measuredStageHeight ?? windowDimensions.height - 180;
    const padding = isMobile ? 16 : 48;
    return Math.max(
      0.05,
      Math.min(
        Math.max(1, width - padding) / baseWidth,
        Math.max(1, height - padding) / baseHeight
      )
    );
  }, [
    isMobile,
    measuredStageWidth,
    measuredStageHeight,
    windowDimensions.width,
    windowDimensions.height,
    baseHeight,
  ]);

  useEffect(() => {
    if (!pendingTextEdit || !selectedElementId) return;
    const frame = requestAnimationFrame(() => {
      stageRef.current?.beginTextEdit?.(pendingTextEdit);
      setPendingTextEdit(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingTextEdit, selectedElementId]);

  const applyPatchCommit = (
    patch: Partial<CanvasPostModel>,
    comp?: ArsenalComposition
  ) => {
    if (comp) {
      setPost(prev => ({
        ...putArsenalComposition({ ...prev, ...patch }, comp),
        aspectRatio: comp.effectiveAspectRatio,
      }));
      return;
    }
    setPost(prev => {
      const curIdx = prev.currentSlideIndex;
      const currentSlide = prev.slides[curIdx];
      let next = applyCurrentSlideAppearancePatch(prev, patch);
      if (currentSlide?.composition) {
        const c = applyCompositionAppearancePatch(prev, patch);
        if (c) next = putArsenalComposition(next, c);
      }
      if (patch.familyId && patch.familyId !== currentViewPost.familyId) {
        return {
          ...next,
          slides: next.slides.map((slide, index) =>
            index === next.currentSlideIndex
              ? { ...slide, guidedComposition: undefined }
              : slide
          ),
        };
      }
      return next;
    });
  };

  const handleUpdatePost = (
    input: PostUpdateInput,
    composition?: ArsenalComposition
  ) => {
    if (typeof input === "function") {
      setPost(input);
      return;
    }

    if (input && typeof input === "object" && "kind" in input) {
      if (input.kind === "document") {
        const doc = input.document;
        const comp =
          input.composition ??
          composition ??
          doc.slides[doc.currentSlideIndex]?.composition;
        if (comp) {
          setPost(() => ({
            ...putArsenalComposition(doc, comp),
            aspectRatio: comp.effectiveAspectRatio,
          }));
        } else {
          setPost(doc);
        }
        return;
      }
      if (input.kind === "updater") {
        setPost(input.update);
        return;
      }
      if (input.kind === "patch") {
        applyPatchCommit(input.patch, input.composition ?? composition);
        return;
      }
    }

    const isFullDocument =
      input &&
      typeof input === "object" &&
      typeof (input as any).id === "string" &&
      Array.isArray((input as any).slides) &&
      typeof (input as any).aspectRatio === "string" &&
      typeof (input as any).currentSlideIndex === "number" &&
      (input as any).palette &&
      typeof (input as any).familyId === "string";

    if (isFullDocument) {
      const doc = input as CanvasPostModel;
      const comp =
        composition ?? doc.slides[doc.currentSlideIndex]?.composition;
      if (comp) {
        setPost(() => ({
          ...putArsenalComposition(doc, comp),
          aspectRatio: comp.effectiveAspectRatio,
        }));
      } else {
        setPost(doc);
      }
      return;
    }

    applyPatchCommit(input as Partial<CanvasPostModel>, composition);
  };

  const handleMediaUpdate: MediaUpdate = (target, operation) => {
    editSessionRef.current = null;
    const next = applyMediaOperation(postRef.current, target, operation);
    if (!next) {
      if (operation.kind === "apply") {
        setMediaPreview(operation.url);
        toast.info(
          "O destino foi removido ou bloqueado. A imagem está disponível no painel Imagem para outro espaço."
        );
      }
      return false;
    }
    handleUpdatePost({ kind: "document", document: next });
    return true;
  };

  const handleReplicate = (groups: ReplicationGroup[], targets: number[]) => {
    let next = replicateSlideAppearance(
      post,
      post.currentSlideIndex,
      targets,
      groups
    );
    const composition = post.slides[post.currentSlideIndex]?.guidedComposition;
    const sourceComp = post.slides[post.currentSlideIndex]?.composition;
    if (groups.includes("composition") && composition) {
      for (const index of targets) {
        const proposal = composePost(
          { ...next, currentSlideIndex: index },
          composition.id,
          { preserveColors: true }
        );
        if (!proposal.post) {
          toast.error(
            `Slide ${index + 1}: ${proposal.error} Nenhuma alteração foi aplicada.`
          );
          return;
        }
        next = { ...proposal.post, currentSlideIndex: post.currentSlideIndex };
      }
    } else if (groups.includes("composition") && sourceComp) {
      next = replicateCarouselComposition(
        next,
        post.currentSlideIndex,
        targets
      );
    } else if (groups.includes("composition")) {
      next = {
        ...next,
        slides: next.slides.map((slide, index) =>
          targets.includes(index)
            ? { ...slide, guidedComposition: undefined, composition: undefined }
            : slide
        ),
      };
    }
    handleUpdatePost({ kind: "document", document: next });
    setIsReplicationOpen(false);
    toast.success(
      `Formatação aplicada em ${targets.length} slide${targets.length === 1 ? "" : "s"}.`
    );
  };

  const handleAspectRatioChange = async (ratio: AspectRatioType) => {
    if (arsenalComposition) {
      try {
        await ensureArsenalCompositionFonts(arsenalComposition);
      } catch (error) {
        toast.error((error as Error).message);
        return;
      }
    }
    const proposal = fitPostToAspectRatio(post, ratio);
    if (!proposal.post) {
      toast.error(proposal.error);
      return;
    }
    if (arsenalComposition) {
      const request = ++formatRequest.current;
      setFormatPreview(proposal.post);
      setNativeFormatPreview(null);
      setFormatLoading(true);
      try {
        if (arsenalComposition.origin.componentAssembly) return;
        const offer =
          await arsenalApi.designCatalog.resolveArsenalVariant.mutate(
            {
              versionId: arsenalComposition.origin.versionId,
              aspectRatio: ratio,
            },
            { signal: AbortSignal.timeout(8000) }
          );
        if (offer) {
          const preview = await applyArsenalFormatVariant(post, offer);
          if (request === formatRequest.current)
            setNativeFormatPreview(preview);
        }
      } catch {
        if (request === formatRequest.current)
          toast.info(
            "Variante indisponível; a projeção preserva seus ajustes."
          );
      } finally {
        if (request === formatRequest.current) setFormatLoading(false);
      }
      return;
    }
    handleUpdatePost({ kind: "document", document: proposal.post });
  };

  const handleToggleSnap = () => {
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const next = prev.isSnapEnabled === false ? true : false;
        return { ...prev, isSnapEnabled: next };
      },
    });
  };

  // Salva posições individuais arrastadas no slide ativo
  const handleUpdateRichText = (
    field: "headline" | "subtext",
    chunks: any[]
  ) => {
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const curIdx = prev.currentSlideIndex;
        const currentSlide = prev.slides[curIdx];
        const updatedSlides = [...prev.slides];
        if (currentSlide) {
          updatedSlides[curIdx] = { ...currentSlide, [`${field}Rich`]: chunks };
        }
        return currentSlide
          ? { ...prev, slides: updatedSlides }
          : { ...prev, [`${field}Rich`]: chunks };
      },
    });
  };

  const handleUpdateTextTransform = (
    elementKey: "headline" | "subtext",
    props: { x?: number; y?: number; width?: number; scale?: number },
    layoutPositions?: {
      headlinePos: ElementPosition;
      subtextPos: ElementPosition;
      barPos: ElementPosition;
    }
  ) => {
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const currentSlide = prev.slides[prev.currentSlideIndex];
        if (!currentSlide) return prev;

        const updatedSlide = { ...currentSlide };

        if (props.x !== undefined && props.y !== undefined) {
          (updatedSlide as any)[`${elementKey}Pos`] = {
            x: props.x,
            y: props.y,
          };
        }
        if (props.width !== undefined) {
          (updatedSlide as any)[`${elementKey}Width`] = props.width;
        }
        if (props.scale !== undefined) {
          (updatedSlide as any)[`${elementKey}Scale`] = props.scale;
        }
        if (layoutPositions) {
          updatedSlide.headlinePos = layoutPositions.headlinePos;
          updatedSlide.subtextPos = layoutPositions.subtextPos;
          updatedSlide.barPos = layoutPositions.barPos;
        }

        const updatedSlides = [...prev.slides];
        updatedSlides[prev.currentSlideIndex] = updatedSlide;
        return { ...prev, slides: updatedSlides };
      },
    });
  };

  const handleUpdateElementPosition = (
    elementKey:
      | "headlinePos"
      | "subtextPos"
      | "badgePos"
      | "barPos"
      | "logoPos",
    pos: ElementPosition
  ) => {
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const curIdx = prev.currentSlideIndex;
        const currentSlide = prev.slides[curIdx];
        if (!currentSlide) return prev;

        const updatedSlides = [...prev.slides];
        updatedSlides[curIdx] = {
          ...currentSlide,
          [elementKey]: pos,
        };

        return {
          ...prev,
          slides: updatedSlides,
        };
      },
    });
  };

  const handleUpdateDecorationTransform = (
    target: "logo" | "badge" | "bar",
    transform: { scaleX: number; scaleY: number; rotation: number }
  ) => {
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const curIdx = prev.currentSlideIndex;
        const currentSlide = prev.slides[curIdx];
        if (!currentSlide) return prev;

        const updatedTransforms = {
          ...(currentSlide.nativeDecorationTransforms || {}),
          [target]: transform,
        };

        const updatedSlides = [...prev.slides];
        updatedSlides[curIdx] = {
          ...currentSlide,
          nativeDecorationTransforms: updatedTransforms,
        };

        return {
          ...prev,
          slides: updatedSlides,
        };
      },
    });
  };

  // Salva enquadramento (posição e escala) do plano de fundo — somente no
  // slide atual (Etapa 2 §7.3): nunca vaza para o default global nem para
  // outros slides.
  const handleUpdateBgTransform = (transform: BgImageTransform) => {
    handleUpdatePost({
      kind: "updater",
      update: prev =>
        applyPatchToCurrentSlide(prev, { bgTransform: transform }),
    });
  };

  const handleResetBgTransform = () => {
    handleUpdateBgTransform({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    });
    toast.info("Enquadramento do fundo resetado para o padrão.");
  };

  // Edição direta no canvas (duplo clique / duplo toque)
  const handleUpdateText = (
    field: "headline" | "subtext" | "badgeText",
    value: string
  ) => {
    if (field === "badgeText") {
      const slide = postRef.current.slides[postRef.current.currentSlideIndex];
      runEditorCommand(
        { slideId: slide.id, elementId: "badge" },
        { type: "text", text: value }
      );
      return;
    }
    handleUpdatePost(prev => ({
      ...prev,
      slides: prev.slides.map((slide, index) =>
        index === prev.currentSlideIndex ? { ...slide, [field]: value } : slide
      ),
    }));
  };

  // Texto e marcações rich-text formam uma única mutação do documento. Assim,
  // concluir uma edição cria exatamente uma entrada no histórico/autosave.
  const handleCommitTextEdit = (
    field: "headline" | "subtext",
    value: string,
    chunks: CanvasRichTextChunk[],
    layoutPositions?: {
      headlinePos: ElementPosition;
      subtextPos: ElementPosition;
      barPos: ElementPosition;
    }
  ) => {
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const curIdx = prev.currentSlideIndex;
        const currentSlide = prev.slides[curIdx];
        const richField = `${field}Rich` as "headlineRich" | "subtextRich";
        const updatedSlides = [...prev.slides];

        if (currentSlide) {
          updatedSlides[curIdx] = {
            ...currentSlide,
            [field]: value,
            [richField]: chunks,
            ...(layoutPositions || {}),
          };
        }

        return currentSlide
          ? { ...prev, slides: updatedSlides }
          : { ...prev, [field]: value, [richField]: chunks };
      },
    });
  };

  // Atualiza posição de caixa de texto extra arrastada no slide ativo
  const handleUpdateExtraTextPosition = (id: string, pos: ElementPosition) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = updateArsenalAuthorialLayer(
        currentSlide.composition,
        id,
        pos
      );
      handleUpdatePost({}, updatedComp);
      return;
    }
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const curTexts = resolveSlideExtraTexts(prev, curIdx);
        const updatedExtra = curTexts.map(item =>
          item.id === id ? { ...item, x: pos.x, y: pos.y } : item
        );
        return {
          ...prev,
          slides: prev.slides.map((s, i) =>
            i === curIdx ? { ...s, extraTexts: updatedExtra } : s
          ),
        };
      },
    });
  };

  // Edição de texto da caixa extra via duplo clique inline no canvas
  const handleUpdateExtraTextContent = (id: string, value: string) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = editArsenalElementText(
        currentSlide.composition,
        id,
        value
      );
      handleUpdatePost({}, updatedComp);
      return;
    }
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const curTexts = resolveSlideExtraTexts(prev, curIdx);
        const updatedExtra = curTexts.map(item =>
          item.id === id ? { ...item, text: value } : item
        );
        return {
          ...prev,
          slides: prev.slides.map((s, i) =>
            i === curIdx ? { ...s, extraTexts: updatedExtra } : s
          ),
        };
      },
    });
  };

  // Adiciona nova caixa de texto livre no slide ativo
  const handleAddExtraText = () => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    const slideExtra = resolveSlideExtraTexts(post, curIdx);
    const count = slideExtra.length + 1;
    const newId = freshId("tx");
    const newExtraText: CanvasCustomText = {
      id: newId,
      text: "Novo Texto",
      x: Math.round((baseWidth - 220) / 2),
      y: Math.min(
        baseHeight - 80,
        Math.round(baseHeight * 0.45 + (count - 1) * 35)
      ),
      width: 220,
      fontSize: 20,
      align: "center",
      color: post.palette.text,
    };

    if (currentSlide?.composition) {
      const updatedComp = addArsenalAuthorialLayer(currentSlide.composition, {
        id: newId,
        kind: "text",
        text: "Novo Texto",
        zIndex:
          Math.max(
            0,
            ...[
              ...currentSlide.composition.elements,
              ...currentSlide.composition.groups,
            ]
              .filter(e => !e.parentId)
              .map(e => e.zIndex)
          ) + 1,
        parentId: null,
        x:
          ((newExtraText.x ?? 0) * currentSlide.composition.artboard.width) /
          baseWidth,
        y:
          ((newExtraText.y ?? 0) * currentSlide.composition.artboard.width) /
          baseWidth,
        width: (220 * currentSlide.composition.artboard.width) / baseWidth,
        height: (40 * currentSlide.composition.artboard.width) / baseWidth,
        fontSize: (20 * currentSlide.composition.artboard.width) / baseWidth,
        fontFamily: "Arial",
        fontWeight: 400,
        fill: post.palette.text || "#FFFFFF",
        align: "center",
        rotation: 0,
        opacity: 1,
      });
      handleUpdatePost({}, updatedComp);
      setSelectedElementId(newId);
      setActiveTool(null);
      setPendingTextEdit(newId);
      return;
    }

    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const curTexts = resolveSlideExtraTexts(prev, prev.currentSlideIndex);
        const updatedExtra = [...curTexts, newExtraText];
        return {
          ...prev,
          slides: prev.slides.map((s, i) =>
            i === prev.currentSlideIndex
              ? { ...s, extraTexts: updatedExtra }
              : s
          ),
        };
      },
    });

    setSelectedElementId(newId);
    setActiveTool(null);
    setPendingTextEdit(newId);
  };

  // Atualiza propriedades de uma caixa de texto extra (cor, tamanho, texto, alinhamento)
  const handleUpdateExtraText = (
    id: string,
    patch: Partial<CanvasCustomText>
  ) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = updateArsenalAuthorialLayer(
        currentSlide.composition,
        id,
        {
          ...(patch.text !== undefined ? { text: patch.text } : {}),
          ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
          ...(patch.color !== undefined ? { fill: patch.color } : {}),
          ...(patch.fontFamily !== undefined
            ? { fontFamily: patch.fontFamily }
            : {}),
          ...(patch.align !== undefined ? { align: patch.align } : {}),
          ...(patch.width !== undefined ? { width: patch.width } : {}),
          ...(patch.x !== undefined ? { x: patch.x } : {}),
          ...(patch.y !== undefined ? { y: patch.y } : {}),
          ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
        }
      );
      handleUpdatePost({}, updatedComp);
      return;
    }
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const activeIdx = prev.currentSlideIndex;
        const curTexts = resolveSlideExtraTexts(prev, activeIdx);
        const updatedExtra = curTexts.map(item =>
          item.id === id ? { ...item, ...patch } : item
        );
        return {
          ...prev,
          slides: prev.slides.map((s, i) =>
            i === activeIdx ? { ...s, extraTexts: updatedExtra } : s
          ),
        };
      },
    });
  };

  // Remove uma caixa de texto extra
  const handleRemoveExtraText = (id: string) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = removeArsenalAuthorialLayer(
        currentSlide.composition,
        id
      );
      handleUpdatePost({}, updatedComp);
      if (selectedElementId === id) setSelectedElementId(null);
      toast.info("Caixa de texto removida.");
      return;
    }
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const activeIdx = prev.currentSlideIndex;
        const curTexts = resolveSlideExtraTexts(prev, activeIdx);
        const updatedExtra = curTexts.filter(item => item.id !== id);
        return {
          ...prev,
          slides: prev.slides.map((s, i) =>
            i === activeIdx ? { ...s, extraTexts: updatedExtra } : s
          ),
        };
      },
    });
    if (selectedElementId === id) {
      setSelectedElementId(null);
    }
    toast.info("Caixa de texto removida.");
  };

  // ─── GERENCIAMENTO DE IMAGENS LIVRES ADICIONAIS (FOTOS / ADESIVOS) ───
  const handleAddExtraImage = async (
    sourceUrl: string,
    naturalWidth?: number,
    naturalHeight?: number,
    targetSlideId?: string
  ) => {
    const sourcePostId = postRef.current.id;
    const slideId =
      targetSlideId ??
      postRef.current.slides[postRef.current.currentSlideIndex]?.id;
    let url = sourceUrl;
    if (sourceUrl.startsWith("data:image/")) {
      try {
        url = (
          await arsenalApi.post.saveMediaAsset.mutate({ imageData: sourceUrl })
        ).url;
      } catch (error) {
        toast.error((error as Error).message);
        return;
      }
    }
    if (
      postRef.current.id !== sourcePostId ||
      !postRef.current.slides.some(s => s.id === slideId)
    ) {
      toast.info(
        "O slide foi removido. A imagem enviada não foi aplicada em outro slide."
      );
      return;
    }
    const newId = freshId("im");
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const index = prev.slides.findIndex(s => s.id === slideId);
        if (prev.id !== sourcePostId || index < 0) return prev;
        const slide = prev.slides[index];
        let width = 140,
          height = 140;
        if (
          naturalWidth &&
          naturalHeight &&
          naturalWidth > 0 &&
          naturalHeight > 0
        ) {
          const ratio = naturalWidth / naturalHeight;
          if (ratio >= 1) {
            width = Math.min(180, Math.round(baseWidth * 0.45));
            height = Math.round(width / ratio);
          } else {
            height = Math.min(180, Math.round(baseHeight * 0.45));
            width = Math.round(height * ratio);
          }
        }
        const image: CanvasCustomImage = {
          id: newId,
          url,
          x: Math.round((baseWidth - width) / 2),
          y: Math.round((baseHeight - height) / 2),
          width,
          height,
          rotation: 0,
          opacity: 1,
          cornerRadius: 0,
        };
        if (slide.composition) {
          const c = slide.composition,
            factor = c.artboard.width / baseWidth;
          const zIndex =
            Math.max(
              0,
              ...[...c.elements, ...c.groups]
                .filter(e => !e.parentId)
                .map(e => e.zIndex)
            ) + 1;
          const next = addArsenalAuthorialLayer(c, {
            ...image,
            rotation: 0,
            opacity: 1,
            cornerRadius: 0,
            kind: "image",
            zIndex,
            parentId: null,
            x: image.x * factor,
            y: image.y * factor,
            width: width * factor,
            height: height * factor,
          });
          const projected = putArsenalComposition(
            { ...prev, currentSlideIndex: index },
            next
          );
          return index === prev.currentSlideIndex
            ? { ...projected, caption: prev.caption, hashtags: prev.hashtags }
            : { ...prev, slides: projected.slides };
        }
        const images = [...resolveSlideExtraImages(prev, index), image];
        return {
          ...prev,
          slides: prev.slides.map((s, i) =>
            i === index ? { ...s, extraImages: images } : s
          ),
        };
      },
    });
    if (
      postRef.current.slides[postRef.current.currentSlideIndex]?.id === slideId
    )
      setSelectedElementId(newId);
    toast.success(
      "Imagem adicionada ao post! Use as alças para redimensionar ou mover."
    );
  };

  const handleUpdateExtraImage = (
    id: string,
    patch: Partial<CanvasCustomImage>
  ) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = updateArsenalAuthorialLayer(
        currentSlide.composition,
        id,
        {
          ...(patch.url !== undefined ? { url: patch.url } : {}),
          ...(patch.width !== undefined ? { width: patch.width } : {}),
          ...(patch.height !== undefined ? { height: patch.height } : {}),
          ...(patch.x !== undefined ? { x: patch.x } : {}),
          ...(patch.y !== undefined ? { y: patch.y } : {}),
          ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
          ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
          ...(patch.cornerRadius !== undefined
            ? { cornerRadius: patch.cornerRadius }
            : {}),
        }
      );
      handleUpdatePost({}, updatedComp);
      return;
    }
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const activeIdx = prev.currentSlideIndex;
        const slideImages = resolveSlideExtraImages(prev, activeIdx);
        const updatedImages = slideImages.map(item =>
          item.id === id ? { ...item, ...patch } : item
        );
        return {
          ...prev,
          slides: prev.slides.map((s, i) =>
            i === activeIdx ? { ...s, extraImages: updatedImages } : s
          ),
        };
      },
    });
  };

  const handleRemoveExtraImage = (id: string) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = removeArsenalAuthorialLayer(
        currentSlide.composition,
        id
      );
      handleUpdatePost({}, updatedComp);
      if (selectedElementId === id) setSelectedElementId(null);
      toast.info("Imagem removida do post.");
      return;
    }
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const activeIdx = prev.currentSlideIndex;
        const slideImages = resolveSlideExtraImages(prev, activeIdx);
        const updatedImages = slideImages.filter(item => item.id !== id);
        return {
          ...prev,
          slides: prev.slides.map((s, i) =>
            i === activeIdx ? { ...s, extraImages: updatedImages } : s
          ),
        };
      },
    });
    if (selectedElementId === id) {
      setSelectedElementId(null);
    }
    toast.info("Imagem removida do post.");
  };

  const runEditorCommand = (target: EditorTarget, command: EditorCommand) => {
    const geometry =
      command.type === "duplicate" ||
      command.type === "align" ||
      command.type === "properties"
        ? (stageRef.current?.getElementGeometry?.(target.elementId) ??
          undefined)
        : undefined;
    const result = executeEditorCommand(
      postRef.current,
      target,
      geometry ? ({ ...command, geometry } as EditorCommand) : command
    );
    if (!result.ok) {
      toast.info(result.reason || "Não foi possível alterar o objeto.");
      return;
    }
    handleUpdatePost({ kind: "document", document: result.post });
    if (result.selection !== undefined)
      setSelectedElementTarget(result.selection);
  };
  const removeSelectedElement = () => {
    if (selectedElementTarget)
      runEditorCommand(selectedElementTarget, { type: "remove" });
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        !selectedElementId ||
        !freeEditing ||
        !shouldDeleteCanvasSelection(event, event.target as HTMLElement | null)
      )
        return;
      event.preventDefault();
      removeSelectedElement();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [post, selectedElementId, freeEditing]);

  // Limpa a seleção quando o elemento selecionado deixar de existir no slide ativo ou o slide mudar
  useEffect(() => {
    if (selectedElementTarget && !isElementInCurrentSlide) {
      setSelectedElementTarget(null);
    }
  }, [selectedElementTarget, isElementInCurrentSlide]);

  // ─── Item 7: fluxo de salvamento com decisão memorizável ───
  const saveManually = async (mode: "new" | "update") => {
    if (!onSave) return;
    if (stageRef.current?.hasActiveDraft?.()) {
      stageRef.current.commitDraft?.();
    }
    const docToSave = postRef.current;
    const manager = autoSaveManagerRef.current;
    manager?.pauseForManualSave();
    try {
      const preview = await captureSavePreview(docToSave);
      const saved = await (preview
        ? onSave(docToSave, mode, "manual", preview)
        : onSave(docToSave, mode, "manual"));
      if (saved && postRef.current === docToSave) {
        setAutoSaveState("saved");
        setLastSavedAt(new Date());
      }
    } finally {
      manager?.resumeAfterManualSave();
    }
  };

  const handleSaveClick = () => {
    if (!onSave) {
      toast.error("Salvamento indisponível nesta tela.");
      return;
    }
    if (stageRef.current?.hasActiveDraft?.()) {
      stageRef.current.commitDraft?.();
    }
    const pref = readSavePreference();
    if (pref === "new") {
      void saveManually("new");
      return;
    }
    if (pref === "update" && hasSavedPost) {
      void saveManually("update");
      return;
    }
    setIsSaveDialogOpen(true);
  };

  const handleSaveNew = (remember: boolean) => {
    if (remember) writeSavePreference("new");
    setIsSaveDialogOpen(false);
    void saveManually("new");
  };

  const handleSaveUpdate = (remember: boolean) => {
    if (remember) writeSavePreference("update");
    setIsSaveDialogOpen(false);
    void saveManually("update");
  };

  // Teclado: Escape ou Enter concluem o modo de edição do fundo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditingBackground && (e.key === "Escape" || e.key === "Enter")) {
        setIsEditingBackground(false);
        toast.success("Enquadramento do fundo concluído!");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditingBackground]);

  const exportPng = () => {
    if (!stageRef.current) return;
    if (stageRef.current.hasActiveDraft?.()) {
      stageRef.current.commitDraft?.();
    }
    let dataUrl: string;
    try {
      dataUrl = stageRef.current.exportPng4K();
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }
    if (!dataUrl) {
      toast.error("Erro ao gerar imagem 4K.");
      return;
    }
    const link = document.createElement("a");
    link.download = `postspark-${post.familyId}-${post.aspectRatio.replace(":", "x")}.png`;
    link.href = dataUrl;
    link.click();
    toast.success("Post 4K exportado com sucesso!");
  };

  const exportZip = async () => {
    if (!stageRef.current || isExportingZip) return;
    if (stageRef.current.hasActiveDraft?.()) {
      stageRef.current.commitDraft?.();
    }
    setIsExportingZip(true);
    toast.info(
      "Compilando todos os slides em arquivo ZIP de alta resolução..."
    );

    try {
      const blob = await stageRef.current.exportZip4K((current, total) => {
        toast.loading(`Renderizando slide ${current} de ${total}...`, {
          id: "zip-progress",
        });
      });
      toast.dismiss("zip-progress");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `carrossel-postspark-${Date.now()}.zip`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Carrossel completo baixado em ZIP!");
    } catch (err) {
      toast.error("Erro ao gerar arquivo ZIP.");
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportPng = () => {
    if (!stageRef.current || isExportingZip) return;
    if (pendingMediaCount(post, false)) setPendingExport("png");
    else exportPng();
  };

  const handleExportZip = () => {
    if (!stageRef.current || isExportingZip) return;
    if (pendingMediaCount(post)) setPendingExport("zip");
    else void exportZip();
  };

  const confirmPendingExport = () => {
    const format = pendingExport;
    setPendingExport(null);
    if (format === "png") exportPng();
    else if (format === "zip") void exportZip();
  };

  const handleAddSlide = () => {
    handleUpdatePost({
      kind: "updater",
      update: prev => {
        const nextIdx = prev.slides.length + 1;
        const newSlide = {
          id: `s-${Date.now()}`,
          step: `SLIDE 0${nextIdx} // CONTINUAÇÃO`,
          headline: "Novo ponto importante da narrativa",
          subtext:
            "Explique este conceito com clareza para manter o público engajado até a chamada para ação.",
          visualStyle: prev.slides[prev.currentSlideIndex]?.visualStyle,
        };
        return {
          ...prev,
          slides: [...prev.slides, newSlide],
          currentSlideIndex: prev.slides.length,
        };
      },
    });
  };

  const handleDuplicateSlide = (index: number) => {
    if (!post.slides[index]) return;
    handleUpdatePost({
      kind: "updater",
      update: prev => duplicateSlide(prev, index),
    });
    setSelectedElementId(null);
  };

  const handleDeleteSlide = (index: number) => {
    if (post.slides.length <= 1) {
      toast.error("O carrossel precisa ter no mínimo 1 slide.");
      return;
    }
    handleUpdatePost({
      kind: "updater",
      update: prev => removeSlide(prev, index),
    });
    setSelectedElementId(null);
  };

  const handleBackToGallery = async () => {
    if (isExitingRef.current) return;

    const hadActiveDraft = stageRef.current?.hasActiveDraft?.() ?? false;
    if (hadActiveDraft) {
      stageRef.current?.commitDraft?.();
    }

    const isDirty =
      hadActiveDraft ||
      autoSaveState === "dirty" ||
      autoSaveState === "error" ||
      autoSaveState === "saving";

    if (!isAutoSaveEnabled) {
      if (isDirty) {
        setIsExitConfirmOpen(true);
        return;
      }
      onBackToGallery?.(postRef.current);
      return;
    }

    if (autoSaveManagerRef.current) {
      isExitingRef.current = true;
      try {
        const ok = await autoSaveManagerRef.current.flushNow();
        if (!ok) {
          toast.error("Não foi possível salvar o post antes de sair.");
          return;
        }
        onBackToGallery?.(postRef.current);
      } finally {
        isExitingRef.current = false;
      }
    } else {
      onBackToGallery?.(postRef.current);
    }
  };

  const handleRestartClick = () => {
    if (stageRef.current?.hasActiveDraft?.()) {
      stageRef.current.commitDraft?.();
    }
    setIsRestartConfirmOpen(true);
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (stageRef.current?.hasActiveDraft?.()) {
        stageRef.current.commitDraft?.();
      }
      const isPending =
        autoSaveState === "dirty" ||
        autoSaveState === "saving" ||
        autoSaveState === "error" ||
        isSaving ||
        Boolean(autoSaveManagerRef.current?.saving) ||
        Boolean(stageRef.current?.hasActiveDraft?.());
      if (isPending) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [autoSaveState, isSaving]);

  const editSelectedText = () => {
    if (!editorSelection?.capabilities.editText) return;
    setActiveTool(null);
    setPendingTextEdit(editorSelection.id);
  };
  const changeTool = (tool: CanvasEditorTool | null) => {
    stageRef.current?.commitDraft?.();
    setActiveTool(
      tool === "selection" && editorSelection?.kind === "background"
        ? "background"
        : tool
    );
  };
  const updateAppearance = (patch: Partial<CanvasPostModel>) => {
    if (patch.palette) {
      const result = applyEditorPalette(
        postRef.current,
        [curActiveSlide.id],
        patch.palette
      );
      if (result.ok)
        handleUpdatePost({ kind: "document", document: result.post });
      else toast.info(result.reason);
      return;
    }
    handleUpdatePost(patch);
  };
  const editorChrome = (
    <CanvasEditorChrome
      isTextEditing={isTextEditing}
      mobile={isMobile}
      mobileBottomInset={windowDimensions.bottomInset}
      mobileViewportHeight={windowDimensions.height}
      activeTool={activeTool}
      onToolChange={changeTool}
      onPanelHeightChange={setMobileChromeHeight}
      selectionLabel={!isTextEditing ? editorSelection?.label : undefined}
      selectionActions={
        editorSelection?.capabilities.editText ? (
          <button
            type="button"
            className="min-h-11 px-2 text-xs font-semibold text-orange-300"
            onClick={editSelectedText}
          >
            Editar texto
          </button>
        ) : editorSelection &&
          ["image", "background"].includes(editorSelection.kind) ? (
          <button
            type="button"
            className="min-h-11 px-2 text-xs font-semibold text-orange-300"
            onClick={() =>
              changeTool(
                editorSelection.kind === "background" ? "background" : "media"
              )
            }
          >
            Trocar imagem
          </button>
        ) : undefined
      }
      contents={{
        add: (
          <div className="space-y-3">
            <CanvasAddPanel
              onAddText={handleAddExtraText}
              onAddImage={() => changeTool("insert-image")}
            />
            <button
              className="min-h-11 w-full rounded-lg border border-white/15 px-3 text-sm"
              onClick={handleAddSlide}
            >
              Adicionar slide
            </button>
          </div>
        ),
        background: (() => {
          const target = {
            slideId: curActiveSlide.id,
            elementId: curActiveSlide.composition
              ? COMPOSITION_BACKGROUND_ID
              : "background",
          };
          const layer = resolveEditorSelection(post, target);
          if (!layer) return null;
          return (
            <CanvasMediaPanel
              post={post}
              mode="background"
              onMediaUpdate={handleMediaUpdate}
              mediaPreview={mediaPreview}
              onMediaPreview={setMediaPreview}
              backgroundColor={String(
                resolveEditorProperties(post, target).values.fill ||
                  currentViewPost.palette.background
              )}
              onBackgroundColorChange={fill =>
                runEditorCommand(target, {
                  type: "properties",
                  patch: { fill },
                })
              }
            >
              <CanvasSelectionPanel
                post={post}
                layer={layer}
                hideColor
                onEditOnCanvas={() => {}}
                onCommand={command => runEditorCommand(target, command)}
              />
            </CanvasMediaPanel>
          );
        })(),
        "insert-image": (
          <CanvasMediaPanel
            post={post}
            mode="add"
            onMediaUpdate={handleMediaUpdate}
            mediaPreview={mediaPreview}
            onMediaPreview={setMediaPreview}
            onAddExtraImage={(url, width, height, slideId) => {
              if (postRef.current.id === post.id)
                return handleAddExtraImage(url, width, height, slideId);
              return false;
            }}
          />
        ),
        appearance: (
          <div className="space-y-4">
            <CanvasAppearancePanel
              post={currentViewPost}
              onUpdatePost={updateAppearance}
              onApplyTypography={(role, font, ids) => {
                const result = applyEditorTypography(
                  postRef.current,
                  ids,
                  role,
                  font
                );
                if (result.ok)
                  handleUpdatePost({ kind: "document", document: result.post });
                else toast.info(result.reason);
              }}
              onReorganize={() => setGuidedAction("recover")}
              onRestore={
                curActiveSlide.composition
                  ? () => {
                      const slide =
                        postRef.current.slides[
                          postRef.current.currentSlideIndex
                        ];
                      if (slide.composition)
                        void ensureArsenalCompositionFonts(slide.composition)
                          .then(() => {
                            const current = postRef.current.slides.find(
                              item => item.id === slide.id
                            );
                            if (current?.composition)
                              setRestorePreview({
                                slideId: slide.id,
                                composition: restoreArsenalVariant(
                                  current.composition
                                ),
                              });
                          })
                          .catch(error =>
                            toast.error((error as Error).message)
                          );
                    }
                  : undefined
              }
              onApplyFamily={familyId => {
                handleUpdatePost(prev => {
                  const view = resolveSlideAppearance(
                    prev,
                    prev.currentSlideIndex
                  );
                  const preset = applyFamilyPreset(view, familyId);
                  const next = applyCurrentSlideAppearancePatch(prev, {
                    familyId: preset.familyId,
                    familyName: preset.familyName,
                    fontFamily: preset.fontFamily,
                  });
                  return {
                    ...next,
                    slides: next.slides.map((slide, index) =>
                      index === next.currentSlideIndex
                        ? {
                            ...slide,
                            guidedComposition: undefined,
                            visualStyle: {
                              ...slide.visualStyle,
                              palette: { ...view.palette },
                            },
                          }
                        : slide
                    ),
                  };
                });
              }}
            />
            {post.slides.length > 1 && (
              <button
                className="min-h-11 w-full rounded-lg border border-white/15 text-xs"
                onClick={() => setIsReplicationOpen(true)}
              >
                Aplicar aparência a outros slides
              </button>
            )}
          </div>
        ),
        brand: (
          <CanvasBrandPanel
            post={currentViewPost}
            onUpdatePost={updateAppearance}
            onSetLogo={(slideId, patch) => {
              const result = setEditorLogo(postRef.current, [slideId], {
                ...patch,
                ...(Object.hasOwn(patch, "url")
                  ? { url: patch.url ?? "" }
                  : {}),
              });
              if (result.ok) {
                handleUpdatePost({ kind: "document", document: result.post });
                if (result.selection)
                  setSelectedElementTarget(result.selection);
              } else toast.error(result.reason);
            }}
            onReplicate={
              post.slides.length > 1
                ? () => {
                    setBrandDestinations([]);
                    setBrandScopeOpen(true);
                  }
                : undefined
            }
          />
        ),
        layers: (
          <CanvasEditorLayers
            key={curActiveSlide.id}
            layers={editorLayers}
            selectedId={selectedElementId}
            onSelect={setSelectedElementTarget}
            onAdjust={target => {
              setSelectedElementTarget(target);
              const layer = resolveEditorSelection(postRef.current, target);
              stageRef.current?.commitDraft?.();
              setActiveTool(
                layer?.kind === "background" ? "background" : "selection"
              );
            }}
            onAction={(target, action, layer) =>
              runEditorCommand(
                target,
                action === "forward" || action === "backward"
                  ? { type: "reorder", direction: action }
                  : action === "visibility"
                    ? { type: "visibility", visible: !layer.visible }
                    : action === "lock"
                      ? { type: "lock", locked: !layer.locked }
                      : { type: action }
              )
            }
          />
        ),
        caption: (
          <CanvasCaptionPanel
            value={post.caption}
            onChange={caption => handleUpdatePost({ caption })}
          />
        ),
        selection: editorSelection ? (
          <CanvasSelectionPanel
            post={post}
            layer={editorSelection}
            onCommand={command =>
              runEditorCommand(editorSelection.target, command)
            }
            onEditOnCanvas={editSelectedText}
            onChangeImage={() =>
              changeTool(
                editorSelection.kind === "background" ? "background" : "media"
              )
            }
          />
        ) : (
          <p className="text-sm text-white/60">
            Selecione um objeto na arte ou em Camadas.
          </p>
        ),
        media: (
          <CanvasMediaPanel
            post={post}
            onMediaUpdate={handleMediaUpdate}
            selectedId={selectedElementId}
            mediaPreview={mediaPreview}
            onMediaPreview={setMediaPreview}
            onAddExtraImage={handleAddExtraImage}
          />
        ),
      }}
    />
  );

  return (
    <div
      onFocusCapture={event => {
        const target = event.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          editSessionRef.current = { target, started: false };
        } else editSessionRef.current = null;
      }}
      onBlurCapture={event => {
        if (editSessionRef.current?.target === event.target)
          editSessionRef.current = null;
      }}
      style={{ height: windowDimensions.height }}
      className="h-[100dvh] w-full bg-[#07090E] text-white flex flex-col overflow-hidden select-none font-sans"
    >
      {/* 1. Top Bar */}
      <CanvasTopBar
        aspectRatio={post.aspectRatio}
        onAspectRatioChange={handleAspectRatioChange}
        zoom={zoom}
        onZoomIn={() => setZoom(z => Math.min(1.8, z + 0.1))}
        onZoomOut={() => setZoom(z => Math.max(0.6, z - 0.1))}
        onResetZoom={() => setZoom(1)}
        onExportPng={handleExportPng}
        onExportZip={handleExportZip}
        onBackToGallery={onBackToGallery ? handleBackToGallery : undefined}
        isSnapEnabled={post.isSnapEnabled !== false}
        onToggleSnap={handleToggleSnap}
        isExportingZip={isExportingZip}
        slideCount={post.slides.length}
        onAddSlide={handleAddSlide}
        onRestart={onRestart ? handleRestartClick : undefined}
        onSave={onSave ? handleSaveClick : undefined}
        isSaving={isSaving}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        autoSaveState={autoSaveState}
        lastSavedAt={lastSavedAt}
        isAutoSaveEnabled={isAutoSaveEnabled}
        onAutoSaveChange={handleAutoSaveChange}
        onSaveCopy={onSave ? () => handleSaveNew(false) : undefined}
        onTechnical={() => setTechnicalOpen(true)}
        onCanvasTools={
          isMobile ? () => setCanvasToolsOpen(open => !open) : undefined
        }
      />

      {!isTextEditing && (!isMobile || canvasToolsOpen) && (
        <CanvasToolRail
          aspectRatio={post.aspectRatio}
          onAspectRatioChange={handleAspectRatioChange}
          isSnapEnabled={post.isSnapEnabled !== false}
          onToggleSnap={handleToggleSnap}
          zoom={zoom}
          onZoomIn={() => setZoom(z => Math.min(3, z + 0.1))}
          onZoomOut={() => setZoom(z => Math.max(0.25, z - 0.1))}
          onResetZoom={() => setZoom(1)}
        />
      )}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {!isMobile && editorChrome}
        {/* Palco da Prancheta com Viewport Adaptativo (Mobile & Desktop) */}
        <main
          ref={mobileStageAreaRef}
          style={{ justifyContent: "safe center", alignItems: "safe center" }}
          className="min-w-0 min-h-0 flex-1 bg-[#040508] relative overflow-auto flex items-center justify-center p-2 sm:p-6 custom-scrollbar"
        >
          {/* BARRA FLUTUANTE DE MODO DE EDIÇÃO DO FUNDO (ESTILO CANVA) */}
          <AnimatePresence>
            {isEditingBackground && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-[#10141D]/95 backdrop-blur-2xl border border-[oklch(0.78_0.22_48)]/50 shadow-[0_20px_50px_rgba(0,0,0,0.8)] px-4 py-2.5 rounded-full flex items-center gap-3 text-xs"
              >
                <div className="flex items-center gap-2 text-white/90">
                  <span className="w-2.5 h-2.5 rounded-full bg-[oklch(0.78_0.22_48)] animate-pulse" />
                  <span className="font-bold text-white">
                    Editando Enquadramento do Fundo
                  </span>
                  <span className="text-white/40 hidden lg:inline">
                    | Arraste para reposicionar ou use os controladores para
                    redimensionar
                  </span>
                </div>

                <div className="flex items-center gap-2 pl-3 border-l border-white/12">
                  <button
                    type="button"
                    onClick={handleResetBgTransform}
                    className="px-2.5 py-1 rounded-lg bg-white/6 hover:bg-white/12 text-white/70 hover:text-white transition-all text-[11px] flex items-center gap-1.5 cursor-pointer font-medium"
                    title="Resetar para o enquadramento padrão"
                  >
                    <RotateCcw size={12} />
                    <span>Resetar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingBackground(false);
                      toast.success("Enquadramento do fundo salvo!");
                    }}
                    className="px-3.5 py-1 rounded-lg bg-[oklch(0.78_0.22_48)] hover:brightness-110 text-black font-bold transition-all text-[11px] flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Check size={13} strokeWidth={3} />
                    <span>Concluir</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            className="shrink-0"
            style={{
              width: baseWidth * fittedScale * zoom,
              height: baseHeight * fittedScale * zoom,
            }}
          >
            <div
              style={{
                width: baseWidth,
                height: baseHeight,
                transform: `scale(${fittedScale * zoom})`,
                transformOrigin: "top left",
              }}
            >
              <CanvasPostStage
                ref={stageRef}
                post={post}
                onUpdateComposition={c => handleUpdatePost({}, c)}
                onEditingChange={setIsTextEditing}
                isReadOnly={false}
                isMobile={isMobile}
                zoom={1}
                displayScale={fittedScale * zoom}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                onUpdateElementPosition={handleUpdateElementPosition}
                onUpdateDecorationTransform={handleUpdateDecorationTransform}
                onUpdateTextTransform={handleUpdateTextTransform}
                isEditingBackground={isEditingBackground}
                onUpdateBgTransform={handleUpdateBgTransform}
                onEnterBackgroundEdit={() => setIsEditingBackground(true)}
                onUpdateText={handleUpdateText}
                onCommitTextEdit={handleCommitTextEdit}
                onUpdateRichText={handleUpdateRichText}
                onUpdateExtraText={handleUpdateExtraText}
                onUpdateExtraTextPosition={handleUpdateExtraTextPosition}
                onUpdateExtraTextContent={handleUpdateExtraTextContent}
                onUpdateExtraImage={handleUpdateExtraImage}
                onUpdateExtraShape={(id, patch) =>
                  handleUpdatePost(prev => ({
                    ...prev,
                    slides: prev.slides.map((slide, index) =>
                      index === prev.currentSlideIndex
                        ? {
                            ...slide,
                            extraShapes: slide.extraShapes?.map(shape =>
                              shape.id === id ? { ...shape, ...patch } : shape
                            ),
                          }
                        : slide
                    ),
                  }))
                }
                onUpdateLogo={patch => {
                  const result = setEditorLogo(
                    postRef.current,
                    [curActiveSlide.id],
                    patch
                  );
                  if (result.ok)
                    handleUpdatePost({
                      kind: "document",
                      document: result.post,
                    });
                  else toast.error(result.reason);
                }}
              />
            </div>
          </div>
        </main>
      </div>
      {post.slides.length > 1 &&
        (!isMobile || (!activeTool && !isTextEditing)) && (
          <CarouselFilmstrip
            post={post}
            slides={post.slides}
            currentIndex={post.currentSlideIndex}
            onSelectSlide={handleSelectSlide}
            onAddSlide={handleAddSlide}
            onDuplicateSlide={handleDuplicateSlide}
            onRemoveSlide={handleDeleteSlide}
            onReorderSlide={handleReorderSlide}
          />
        )}
      {isMobile && (
        <>
          <div
            style={{ height: mobileChromeHeight }}
            className="shrink-0"
            aria-hidden="true"
          />
          {editorChrome}
        </>
      )}
      {guidedAction && (
        <GuidedEditorDialog
          key={`${curActiveSlide.id}-${guidedAction}`}
          post={post}
          action={guidedAction}
          onClose={() => setGuidedAction(null)}
          onApply={next => {
            handleUpdatePost({ kind: "document", document: next });
            setGuidedAction(null);
          }}
          onImageTools={() => {
            setGuidedAction(null);
            setActiveTool("media");
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(restorePreview)}
        title="Restaurar o layout original?"
        description="Confira a prévia. Textos, imagens, cores e fontes são preservados; posições e ajustes do layout serão restaurados. Você pode desfazer."
        confirmLabel="Restaurar layout"
        onCancel={() => setRestorePreview(null)}
        onConfirm={() => {
          if (restorePreview) {
            handleUpdatePost(prev => {
              const index = prev.slides.findIndex(
                slide => slide.id === restorePreview.slideId
              );
              const composition = prev.slides[index]?.composition;
              if (!composition) return prev;
              const view = putArsenalComposition(
                { ...prev, currentSlideIndex: index },
                restoreArsenalVariant(composition)
              );
              return { ...prev, slides: view.slides };
            });
          }
          setRestorePreview(null);
        }}
      >
        {restorePreview && (
          <div className="flex justify-center py-3">
            <CanvasPostStage
              post={putArsenalComposition(
                {
                  ...post,
                  currentSlideIndex: post.slides.findIndex(
                    slide => slide.id === restorePreview.slideId
                  ),
                },
                restorePreview.composition
              )}
              zoom={Math.max(
                0.2,
                Math.min(
                  0.75,
                  (windowDimensions.width - 80) / baseWidth,
                  (windowDimensions.height - 300) / baseHeight
                )
              )}
              isReadOnly
            />
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={technicalOpen}
        title="Ferramentas avançadas do design"
        description="Ajustes técnicos de relações e arquivo portátil."
        confirmLabel="Concluir"
        onConfirm={() => setTechnicalOpen(false)}
        onCancel={() => setTechnicalOpen(false)}
      >
        {arsenalComposition ? (
          <ArsenalCompositionInspector
            composition={arsenalComposition}
            onChange={c => handleUpdatePost({}, c)}
            selectedId={selectedElementId}
            onSelect={setSelectedElementId}
            section="design"
          />
        ) : (
          <p>
            As ferramentas de relações são específicas dos designs com
            composição. Posição e tamanho estão em Ajustar.
          </p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={brandScopeOpen}
        title="Aplicar logo a outros slides"
        description="Escolha os slides que receberão este logo. Textos e fotos serão preservados."
        confirmLabel="Aplicar logo"
        onCancel={() => setBrandScopeOpen(false)}
        onConfirm={() => {
          const source =
            curActiveSlide.composition?.version === 3
              ? curActiveSlide.composition.logo
              : (curActiveSlide.logo ?? {
                  url: post.logoUrl ?? "",
                  position: post.logoPosition,
                });
          const result = setEditorLogo(
            postRef.current,
            brandDestinations,
            source ?? { url: "" }
          );
          if (result.ok) {
            handleUpdatePost({ kind: "document", document: result.post });
            setBrandScopeOpen(false);
          } else toast.info(result.reason);
        }}
      >
        <div className="space-y-2">
          {post.slides
            .filter(slide => slide.id !== curActiveSlide.id)
            .map(slide => (
              <label
                key={slide.id}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={brandDestinations.includes(slide.id)}
                  onChange={event =>
                    setBrandDestinations(ids =>
                      event.target.checked
                        ? [...ids, slide.id]
                        : ids.filter(id => id !== slide.id)
                    )
                  }
                />
                Slide {post.slides.indexOf(slide) + 1} · {slide.headline}
              </label>
            ))}
        </div>
      </ConfirmDialog>
      <PendingMediaExportDialog
        format={pendingExport}
        count={pendingMediaCount(post, pendingExport === "zip")}
        onConfirm={confirmPendingExport}
        onCancel={() => setPendingExport(null)}
      />
      {/* ── Diálogos: Salvar (item 7) e Recomeçar (item 6) ── */}
      <ConfirmDialog
        open={Boolean(formatPreview)}
        title="Aplicar novo formato?"
        description="Confira a projeção do seu layout. A variante do catálogo é opcional e redefine somente a geometria."
        confirmLabel="Aplicar formato"
        onCancel={() => {
          formatRequest.current++;
          setFormatPreview(null);
          setNativeFormatPreview(null);
        }}
        onConfirm={() => {
          if (formatPreview)
            handleUpdatePost({ kind: "document", document: formatPreview });
          formatRequest.current++;
          setFormatPreview(null);
          setNativeFormatPreview(null);
        }}
      >
        {formatLoading && (
          <p role="status">Consultando formatos da mesma versão…</p>
        )}
        {nativeFormatPreview && nativeFormatPreview !== formatPreview && (
          <button
            className="rounded border border-white/20 p-2"
            onClick={() => setFormatPreview(nativeFormatPreview)}
          >
            Pré-visualizar variante do catálogo · redefinir geometria
          </button>
        )}
        {formatPreview && (
          <div className="my-3 flex justify-center">
            <CanvasPostStage post={formatPreview} zoom={0.4} isReadOnly />
          </div>
        )}
      </ConfirmDialog>
      <SaveChoiceDialog
        open={isSaveDialogOpen}
        hasSavedPost={hasSavedPost}
        isSaving={isSaving}
        onCancel={() => setIsSaveDialogOpen(false)}
        onSaveNew={handleSaveNew}
        onUpdate={handleSaveUpdate}
      />
      <ConfirmDialog
        open={isRestartConfirmOpen}
        title="Recomeçar do zero?"
        description="Este post atual será descartado e você voltará à tela de criação para gerar novas direções de arte."
        confirmLabel="Recomeçar"
        onConfirm={async () => {
          if (isExitingRef.current) return;
          isExitingRef.current = true;
          try {
            if (stageRef.current?.hasActiveDraft?.()) {
              stageRef.current.commitDraft?.();
            }
            if (isAutoSaveEnabled && autoSaveManagerRef.current) {
              const ok = await autoSaveManagerRef.current.flushNow();
              if (ok === false) {
                toast.error(
                  "Não foi possível salvar o post antes de recomeçar."
                );
                return;
              }
            }
            setIsRestartConfirmOpen(false);
            onRestart?.();
          } finally {
            isExitingRef.current = false;
          }
        }}
        onCancel={() => setIsRestartConfirmOpen(false)}
      />
      <ConfirmDialog
        open={isExitConfirmOpen}
        title="Sair sem salvar?"
        description="Você possui alterações não salvas e o salvamento automático está desativado. Deseja salvar antes de sair, sair mantendo o rascunho na galeria ou cancelar para continuar editando?"
        confirmLabel="Sair sem salvar"
        onConfirm={() => {
          setIsExitConfirmOpen(false);
          onBackToGallery?.(postRef.current);
        }}
        onCancel={() => setIsExitConfirmOpen(false)}
      >
        {onSave && (
          <div className="mb-3">
            <button
              type="button"
              onClick={async () => {
                if (isExitingRef.current) return;
                isExitingRef.current = true;
                try {
                  const mode = hasSavedPost ? "update" : "new";
                  const ok = await onSave(postRef.current, mode, "manual");
                  if (ok !== false) {
                    setIsExitConfirmOpen(false);
                    onBackToGallery?.(postRef.current);
                  } else {
                    toast.error("Falha ao salvar o post.");
                  }
                } catch {
                  toast.error("Falha ao salvar o post.");
                } finally {
                  isExitingRef.current = false;
                }
              }}
              className="w-full py-2.5 px-4 rounded-2xl bg-[oklch(0.78_0.22_48)] hover:bg-[oklch(0.82_0.22_48)] text-black text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
            >
              Salvar e sair
            </button>
          </div>
        )}
      </ConfirmDialog>
      <SlideReplicationDialog
        open={isReplicationOpen}
        post={post}
        onOpenChange={setIsReplicationOpen}
        onApply={handleReplicate}
      />
    </div>
  );
}
