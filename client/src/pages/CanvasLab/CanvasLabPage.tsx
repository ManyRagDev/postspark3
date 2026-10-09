import { applyMediaOperation, pendingMediaCount, targetExists, type MediaUpdate } from './lib/mediaSlots';
import { applyCompositionAppearancePatch, shouldDeleteCanvasSelection } from "./lib/compositionEditing";
import { aspectRatioHeight } from "@shared/aspectRatios";
import { ensureArsenalCompositionFonts } from "./lib/arsenalAssets";
import { arsenalApi } from "@/lib/arsenalApi";
import { applyArsenalFormatVariant } from "./lib/arsenalGenerationCompiler";
import ArsenalCompositionInspector from "./components/ArsenalCompositionInspector";
import type { ArsenalComposition } from "@shared/designArsenal";
import { applyContentText } from "@shared/arsenalContent";
import {
  putArsenalComposition,
  editArsenalContent,
  editArsenalElementText,
  setArsenalCustomBackground,
  setArsenalLogo,
  addArsenalAuthorialLayer,
  updateArsenalAuthorialLayer,
  removeArsenalAuthorialLayer,
  hideArsenalInstance,
} from "./lib/arsenalComposition";
import GuidedEditor from "./components/GuidedEditor";
import { captureInitialVisuals, composePost, fitPostToAspectRatio } from "./lib/guidedComposition";
import CanvasMobileDrawer from "./components/CanvasMobileDrawer";
import { useRef, useState, useEffect, useLayoutEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Check, Crop } from "lucide-react";
import { toast } from "sonner";
import { CanvasPostStage, type CanvasPostStageRef } from "./components/CanvasPostStage";
import CanvasTopBar from "./components/CanvasTopBar";
import CanvasToolRail from "./components/CanvasToolRail";
import CanvasMobileQuickActions from "./components/CanvasMobileQuickActions";
import SlideReplicationDialog from "./components/SlideReplicationDialog";
import CanvasSidebar from "./components/CanvasSidebar";
import CarouselFilmstrip from "./components/CarouselFilmstrip";
import { ConfirmDialog, PendingMediaExportDialog, SaveChoiceDialog, readSavePreference, writeSavePreference } from "./components/CanvasLabDialogs";
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
} from "./lib/documentCommands";
import {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
} from "./lib/canvasHistory";
import { AutoSaveManager, type AutoSaveState } from "./lib/autoSaveManager";
import { applyCurrentSlideAppearancePatch, replicateSlideAppearance, resolveSlideAppearance, replicateCarouselComposition, type ReplicationGroup } from "./lib/slideReplication";

interface CanvasLabPageProps {
  initialPost?: CanvasPostModel;
  onBackToGallery?: (post: CanvasPostModel) => void;
  /** Item 6: recomeçar do zero — limpa a sessão e volta à tela de criação. */
  onRestart?: () => void;
  /** Item 7: persiste o post ("new" = INSERT, "update" = UPDATE do salvo). */
  onSave?: (post: CanvasPostModel, mode: "new" | "update", source: "manual" | "auto") => Promise<boolean>;
  /** Existe um post salvo vinculado à sessão (habilita "Atualizar"). */
  hasSavedPost?: boolean;
  isSaving?: boolean;
  [key: string]: any;
}

const AUTO_SAVE_PREF_KEY = "postspark.canvasAutoSaveEnabled";

function readAutoSavePreference(): boolean {
  try {
    return window.localStorage.getItem(AUTO_SAVE_PREF_KEY) === "true";
  } catch {
    return false;
  }
}

export default function CanvasLabPage({ initialPost, onBackToGallery, onRestart, onSave, hasSavedPost = false, isSaving = false }: CanvasLabPageProps = {}) {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [freeEditing, setFreeEditing] = useState(false);
  const [formatPreview,setFormatPreview] = useState<CanvasPostModel|null>(null);
  const [nativeFormatPreview,setNativeFormatPreview]=useState<CanvasPostModel|null>(null);
  const [formatLoading,setFormatLoading]=useState(false);
  const formatRequest=useRef(0);
  const [mediaPreview, setMediaPreview] = useState<string>();
  const [requestedTab, setRequestedTab] = useState<"media" | undefined>();
  const [isEditingBackground, setIsEditingBackground] = useState(false);
  const [history, setHistory] = useState(() => createHistory<CanvasPostModel>(captureInitialVisuals(initialPost || INITIAL_POST)));
  const post = history.present;
  const arsenalComposition = post.slides[post.currentSlideIndex]?.composition;
  const currentViewPost = useMemo(() => resolveSlideAppearance(post, post.currentSlideIndex), [post]);

  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(readAutoSavePreference);
  const autoSaveManagerRef = useRef<AutoSaveManager<CanvasPostModel> | null>(null);
  const onSaveRef = useRef(onSave);
  const hasSavedPostRef = useRef(hasSavedPost);
  const postRef = useRef(post);
  onSaveRef.current = onSave;
  hasSavedPostRef.current = hasSavedPost;
  postRef.current = post;

  // O gerenciador só existe enquanto o usuário mantém o salvamento automático ativo.
  useEffect(() => {
    if (!isAutoSaveEnabled || !onSaveRef.current) return;
    const manager = new AutoSaveManager<CanvasPostModel>({
      onSave: async (docToSave) => {
        const mode = hasSavedPostRef.current ? "update" : "new";
        return onSaveRef.current?.(docToSave, mode, "auto") ?? false;
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
      if (autoSaveManagerRef.current === manager) autoSaveManagerRef.current = null;
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
  const setPost = (updater: CanvasPostModel | ((prev: CanvasPostModel) => CanvasPostModel)) => {
    setHistory((prevHistory) => {
      const current = prevHistory.present;
      const proposed = typeof updater === "function" ? updater(current) : updater;
      const next = captureInitialVisuals(proposed);
      if (next === current) return prevHistory;
      const nextHistory = pushHistory(prevHistory, next);
      autoSaveManagerRef.current?.triggerChange(next);
      if (!autoSaveManagerRef.current) setAutoSaveState("dirty");
      return nextHistory;
    });
  };

  const handleUndo = () => {
    setHistory((prev) => {
      if (!canUndo(prev)) return prev;
      const next = undoHistory(prev);
      autoSaveManagerRef.current?.triggerChange(next.present);
      if (!autoSaveManagerRef.current) setAutoSaveState("dirty");
      return next;
    });
  };

  const handleRedo = () => {
    setHistory((prev) => {
      if (!canRedo(prev)) return prev;
      const next = redoHistory(prev);
      autoSaveManagerRef.current?.triggerChange(next.present);
      if (!autoSaveManagerRef.current) setAutoSaveState("dirty");
      return next;
    });
  };

  // Atalhos canônicos de teclado: Ctrl+Z / Cmd+Z (Undo) e Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y (Redo)
  useEffect(() => {
    const handleHistoryKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
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
    setPost((prev) => reorderSlides(prev, sourceIndex, targetIndex));
  };

  const [zoom, setZoom] = useState(1);
  const [isZoomScrubbing, setIsZoomScrubbing] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [pendingExport, setPendingExport] = useState<"png" | "zip" | null>(null);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isRestartConfirmOpen, setIsRestartConfirmOpen] = useState(false);
  const [isReplicationOpen, setIsReplicationOpen] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const stageRef = useRef<CanvasPostStageRef>(null);
  const mobileStageAreaRef = useRef<HTMLElement>(null);
  const [measuredStageHeight, setMeasuredStageHeight] = useState<number | null>(null);

  // Monitoramento dinâmico da resolução da tela para responsividade matemática
  const [windowDimensions, setWindowDimensions] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 390,
    height: typeof window !== "undefined" ? window.innerHeight : 844,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Mede a altura real após o layout (inclusive safe area e teclado), evitando
  // estimativas fixas quando a faixa de slides entra ou sai.
  useLayoutEffect(() => {
    const stageArea = mobileStageAreaRef.current;
    if (!stageArea) return;
    const measure = () => {
      const height = stageArea.getBoundingClientRect().height;
      setMeasuredStageHeight(previous => previous === height ? previous : height);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(stageArea);
    return () => observer.disconnect();
  }, [isMobileDrawerOpen, post.slides.length]);

  const isMobile = windowDimensions.width < 768;
  const baseWidth = 360;
  const baseHeight = aspectRatioHeight(post.aspectRatio);

  // A área útil mobile acompanha o dock, a faixa de slides e o painel flutuante.
  const mobileDockHeight = freeEditing ? 74 : 0;
  const mobileQuickActionsHeight = isMobileDrawerOpen ? 0 : 64;
  const mobileFilmstripHeight = post.slides.length > 1 && !isMobileDrawerOpen ? 76 : 0;
  const mobilePanelHeight = Math.min(windowDimensions.height * 0.52, 560);

  const mobileAdaptiveScale = useMemo(() => {
    if (!isMobile) return 1;

    const topBarHeight = 56;
    const padding = 16;
    const availableWidth = windowDimensions.width - padding * 2;
    const stageAreaHeight = measuredStageHeight ?? windowDimensions.height - topBarHeight - mobileQuickActionsHeight - mobileDockHeight - mobileFilmstripHeight;
    const visibleHeight = Math.max(100, stageAreaHeight - (isMobileDrawerOpen ? mobilePanelHeight + 8 : 0) - padding * 2);
    return Math.min(availableWidth / baseWidth, visibleHeight / baseHeight, 0.98);
  }, [isMobile, isMobileDrawerOpen, windowDimensions.width, windowDimensions.height, baseWidth, baseHeight, mobileQuickActionsHeight, mobileFilmstripHeight, mobilePanelHeight, measuredStageHeight]);

  const handleUpdatePost = (patch: Partial<CanvasPostModel>, composition?: ArsenalComposition) => {
    if (composition) {
      setPost(prev => ({
        ...putArsenalComposition({ ...prev, ...patch }, composition),
        aspectRatio: composition.effectiveAspectRatio,
      }));
      return;
    }
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
      const currentSlide = prev.slides[curIdx];
      let next = applyCurrentSlideAppearancePatch(prev, patch);
      if (currentSlide?.composition) {
        const comp = applyCompositionAppearancePatch(prev, patch)!;
        next = putArsenalComposition(next, comp);
      }
      if (patch.familyId && patch.familyId !== currentViewPost.familyId) {
        return { ...next, slides: next.slides.map((slide, index) => index === next.currentSlideIndex ? { ...slide, guidedComposition: undefined } : slide) };
      }
      return next;
    });
  };

  const handleMediaUpdate: MediaUpdate = (target, operation) => {
    if (operation.kind === 'apply' && !targetExists(postRef.current, target)) setMediaPreview(operation.url);
    setPost(prev => applyMediaOperation(prev, target, operation) ?? prev);
  };

  const handleReplicate = (groups: ReplicationGroup[], targets: number[]) => {
    let next = replicateSlideAppearance(post, post.currentSlideIndex, targets, groups);
    const composition = post.slides[post.currentSlideIndex]?.guidedComposition;
    const sourceComp = post.slides[post.currentSlideIndex]?.composition;
    if (groups.includes("composition") && composition) {
      for (const index of targets) {
        const proposal = composePost({ ...next, currentSlideIndex: index }, composition.id);
        if (!proposal.post) {
          toast.error(`Slide ${index + 1}: ${proposal.error} Nenhuma alteração foi aplicada.`);
          return;
        }
        next = { ...proposal.post, currentSlideIndex: post.currentSlideIndex };
      }
    } else if (groups.includes("composition") && sourceComp) {
      next = replicateCarouselComposition(next, post.currentSlideIndex, targets);
    } else if (groups.includes("composition")) {
      next = { ...next, slides: next.slides.map((slide, index) => targets.includes(index) ? { ...slide, guidedComposition: undefined, composition: undefined } : slide) };
    }
    setPost(next);
    setIsReplicationOpen(false);
    toast.success(`Formatação aplicada em ${targets.length} slide${targets.length === 1 ? "" : "s"}.`);
  };

  const handleAspectRatioChange = async (ratio: AspectRatioType) => {
    if(arsenalComposition){try{await ensureArsenalCompositionFonts(arsenalComposition);}catch(error){toast.error((error as Error).message);return;}}
    const proposal = fitPostToAspectRatio(post, ratio);
    if (!proposal.post) { toast.error(proposal.error); return; }
    if(arsenalComposition){
      const request=++formatRequest.current;
      setFormatPreview(proposal.post);setNativeFormatPreview(null);setFormatLoading(true);
      try{
        if (arsenalComposition.origin.componentAssembly) return;
        const offer=await arsenalApi.designCatalog.resolveArsenalVariant.mutate({versionId:arsenalComposition.origin.versionId,aspectRatio:ratio},{signal:AbortSignal.timeout(8000)});
        if(offer){const preview=await applyArsenalFormatVariant(post,offer);if(request===formatRequest.current)setNativeFormatPreview(preview);}
      }catch{if(request===formatRequest.current)toast.info("Variante indisponível; a projeção preserva seus ajustes.");}
      finally{if(request===formatRequest.current)setFormatLoading(false);}
      return;
    }
    setPost(proposal.post);
  };

  const handleToggleSnap = () => {
    setPost((prev) => {
      const next = prev.isSnapEnabled === false ? true : false;
      return { ...prev, isSnapEnabled: next };
    });
  };

  // Salva posições individuais arrastadas no slide ativo
  const handleUpdateRichText = (field: "headline" | "subtext", chunks: any[]) => {
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
      const currentSlide = prev.slides[curIdx];
      const updatedSlides = [...prev.slides];
      if (currentSlide) {
        updatedSlides[curIdx] = { ...currentSlide, [`${field}Rich`]: chunks };
      }
      return currentSlide
        ? { ...prev, slides: updatedSlides }
        : { ...prev, [`${field}Rich`]: chunks };
    });
  };

  const handleUpdateTextTransform = (
    elementKey: "headline" | "subtext",
    props: { x?: number; y?: number; width?: number; scale?: number },
    layoutPositions?: { headlinePos: ElementPosition; subtextPos: ElementPosition; barPos: ElementPosition }
  ) => {
    setPost((prev) => {
      const currentSlide = prev.slides[prev.currentSlideIndex];
      if (!currentSlide) return prev;

      const updatedSlide = { ...currentSlide };

      if (props.x !== undefined && props.y !== undefined) {
         (updatedSlide as any)[`${elementKey}Pos`] = { x: props.x, y: props.y };
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
    });
  };

  const handleUpdateElementPosition = (
    elementKey: "headlinePos" | "subtextPos" | "badgePos" | "barPos" | "logoPos",
    pos: ElementPosition
  ) => {
    setPost((prev) => {
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
    });
  };

  // Salva enquadramento (posição e escala) do plano de fundo — somente no
  // slide atual (Etapa 2 §7.3): nunca vaza para o default global nem para
  // outros slides.
  const handleUpdateBgTransform = (transform: BgImageTransform) => {
    setPost((prev) => applyPatchToCurrentSlide(prev, { bgTransform: transform }));
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
  const handleUpdateText = (field: "headline" | "subtext" | "badgeText", value: string) => {
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
      const currentSlide = prev.slides[curIdx];
      const updatedSlides = [...prev.slides];

      if (currentSlide) {
        if (field === "headline") {
          updatedSlides[curIdx] = { ...currentSlide, headline: value };
        } else if (field === "subtext") {
          updatedSlides[curIdx] = { ...currentSlide, subtext: value };
        } else if (field === "badgeText") {
          if (!prev.showBadge && prev.showStep) {
            updatedSlides[curIdx] = { ...currentSlide, step: value };
            return {
              ...prev,
              slides: updatedSlides,
            };
          }
        }
      }

      return currentSlide && field !== "badgeText"
        ? { ...prev, slides: updatedSlides }
        : { ...prev, [field]: value, slides: updatedSlides };
    });
  };

  // Texto e marcações rich-text formam uma única mutação do documento. Assim,
  // concluir uma edição cria exatamente uma entrada no histórico/autosave.
  const handleCommitTextEdit = (
    field: "headline" | "subtext",
    value: string,
    chunks: CanvasRichTextChunk[],
    layoutPositions?: { headlinePos: ElementPosition; subtextPos: ElementPosition; barPos: ElementPosition }
  ) => {
    setPost((prev) => {
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
    });
  };

  // Atualiza posição de caixa de texto extra arrastada no slide ativo
  const handleUpdateExtraTextPosition = (id: string, pos: ElementPosition) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = updateArsenalAuthorialLayer(currentSlide.composition, id, pos);
      handleUpdatePost({}, updatedComp);
      return;
    }
    setPost((prev) => {
      const currentSlide = prev.slides[curIdx];
      const slideExtra = currentSlide?.extraTexts || prev.extraTexts || [];
      const updatedExtra = slideExtra.map((item) =>
        item.id === id ? { ...item, x: pos.x, y: pos.y } : item
      );

      const updatedSlides = [...prev.slides];
      if (currentSlide) {
        updatedSlides[curIdx] = {
          ...currentSlide,
          extraTexts: updatedExtra,
        };
      }

      return {
        ...prev,
        extraTexts: updatedExtra,
        slides: updatedSlides,
      };
    });
  };

  // Edição de texto da caixa extra via duplo clique inline no canvas
  const handleUpdateExtraTextContent = (id: string, value: string) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = editArsenalElementText(currentSlide.composition, id, value);
      handleUpdatePost({}, updatedComp);
      return;
    }
    setPost((prev) => {
      const currentSlide = prev.slides[curIdx];
      const slideExtra = currentSlide?.extraTexts || prev.extraTexts || [];
      const updatedExtra = slideExtra.map((item) =>
        item.id === id ? { ...item, text: value } : item
      );

      const updatedSlides = [...prev.slides];
      if (currentSlide) {
        updatedSlides[curIdx] = {
          ...currentSlide,
          extraTexts: updatedExtra,
        };
      }

      return {
        ...prev,
        extraTexts: updatedExtra,
        slides: updatedSlides,
      };
    });
  };

  // Adiciona nova caixa de texto livre no slide ativo
  const handleAddExtraText = () => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    const slideExtra = currentSlide?.extraTexts || post.extraTexts || [];
    const count = slideExtra.length + 1;
    const newId = freshId("tx");
    const newExtraText: CanvasCustomText = {
      id: newId,
      text: "Novo Texto",
      x: Math.round((baseWidth - 220) / 2),
      y: Math.min(baseHeight - 80, Math.round(baseHeight * 0.45 + (count - 1) * 35)),
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
        zIndex: Math.max(0, ...[...currentSlide.composition.elements, ...currentSlide.composition.groups].filter(e => !e.parentId).map(e => e.zIndex)) + 1,
        parentId: null,
        x: (newExtraText.x ?? 0) * currentSlide.composition.artboard.width / baseWidth,
        y: (newExtraText.y ?? 0) * currentSlide.composition.artboard.width / baseWidth,
        width: 220 * currentSlide.composition.artboard.width / baseWidth,
        height: 40 * currentSlide.composition.artboard.width / baseWidth,
        fontSize: 20 * currentSlide.composition.artboard.width / baseWidth,
        fontFamily: "Arial",
        fontWeight: 400,
        fill: post.palette.text || "#FFFFFF",
        align: "center",
        rotation: 0,
        opacity: 1,
      });
      handleUpdatePost({}, updatedComp);
      setSelectedElementId(newId);
      toast.success("Nova caixa de texto adicionada! Dê dois cliques para editar no palco.");
      return;
    }

    const updatedExtra = [...slideExtra, newExtraText];
    const updatedSlides = [...post.slides];
    if (currentSlide) {
      updatedSlides[curIdx] = {
        ...currentSlide,
        extraTexts: updatedExtra,
      };
    }

    setPost((prev) => ({
      ...prev,
      extraTexts: updatedExtra,
      slides: updatedSlides,
    }));

    setSelectedElementId(newId);
    toast.success("Nova caixa de texto adicionada! Dê dois cliques para editar no palco.");
  };

  // Atualiza propriedades de uma caixa de texto extra (cor, tamanho, texto, alinhamento)
  const handleUpdateExtraText = (id: string, patch: Partial<CanvasCustomText>) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = updateArsenalAuthorialLayer(currentSlide.composition, id, {
        ...(patch.text !== undefined ? { text: patch.text } : {}),
        ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
        ...(patch.color !== undefined ? { fill: patch.color } : {}),
        ...(patch.fontFamily !== undefined ? { fontFamily: patch.fontFamily } : {}),
        ...(patch.align !== undefined ? { align: patch.align } : {}),
        ...(patch.width !== undefined ? { width: patch.width } : {}),
        ...(patch.x !== undefined ? { x: patch.x } : {}),
        ...(patch.y !== undefined ? { y: patch.y } : {}),
        ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
      });
      handleUpdatePost({}, updatedComp);
      return;
    }
    setPost((prev) => {
      const currentSlide = prev.slides[curIdx];
      const slideExtra = currentSlide?.extraTexts || prev.extraTexts || [];
      const updatedExtra = slideExtra.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      );

      const updatedSlides = [...prev.slides];
      if (currentSlide) {
        updatedSlides[curIdx] = {
          ...currentSlide,
          extraTexts: updatedExtra,
        };
      }

      return {
        ...prev,
        extraTexts: updatedExtra,
        slides: updatedSlides,
      };
    });
  };

  // Remove uma caixa de texto extra
  const handleRemoveExtraText = (id: string) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = removeArsenalAuthorialLayer(currentSlide.composition, id);
      handleUpdatePost({}, updatedComp);
      if (selectedElementId === id) setSelectedElementId(null);
      toast.info("Caixa de texto removida.");
      return;
    }
    setPost((prev) => {
      const currentSlide = prev.slides[curIdx];
      const slideExtra = currentSlide?.extraTexts || prev.extraTexts || [];
      const updatedExtra = slideExtra.filter((item) => item.id !== id);

      const updatedSlides = [...prev.slides];
      if (currentSlide) {
        updatedSlides[curIdx] = {
          ...currentSlide,
          extraTexts: updatedExtra,
        };
      }

      toast.info("Caixa de texto removida.");

      return {
        ...prev,
        extraTexts: updatedExtra,
        slides: updatedSlides,
      };
    });
  };

  // ─── GERENCIAMENTO DE IMAGENS LIVRES ADICIONAIS (FOTOS / ADESIVOS) ───
  const handleAddExtraImage = async (sourceUrl: string, naturalWidth?: number, naturalHeight?: number, targetSlideId?: string) => {
    const sourcePostId = postRef.current.id;
    const slideId = targetSlideId ?? postRef.current.slides[postRef.current.currentSlideIndex]?.id;
    let url = sourceUrl;
    if (sourceUrl.startsWith('data:image/')) {
      try { url = (await arsenalApi.post.saveMediaAsset.mutate({ imageData: sourceUrl })).url; }
      catch (error) { toast.error((error as Error).message); return; }
    }
    if (postRef.current.id !== sourcePostId || !postRef.current.slides.some(s => s.id === slideId)) {
      toast.info('O slide foi removido. A imagem enviada não foi aplicada em outro slide.');
      return;
    }
    const newId = freshId('im');
    setPost(prev => {
      const index = prev.slides.findIndex(s => s.id === slideId);
      if (prev.id !== sourcePostId || index < 0) return prev;
      const slide = prev.slides[index];
      let width = 140, height = 140;
      if (naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0) {
        const ratio = naturalWidth / naturalHeight;
        if (ratio >= 1) { width = Math.min(180, Math.round(baseWidth * 0.45)); height = Math.round(width / ratio); }
        else { height = Math.min(180, Math.round(baseHeight * 0.45)); width = Math.round(height * ratio); }
      }
      const image: CanvasCustomImage = { id: newId, url, x: Math.round((baseWidth - width) / 2), y: Math.round((baseHeight - height) / 2), width, height, rotation: 0, opacity: 1, cornerRadius: 0 };
      if (slide.composition) {
        const c = slide.composition, factor = c.artboard.width / baseWidth;
        const zIndex = Math.max(0, ...[...c.elements, ...c.groups].filter(e => !e.parentId).map(e => e.zIndex)) + 1;
        const next = addArsenalAuthorialLayer(c, { ...image, rotation: 0, opacity: 1, cornerRadius: 0, kind: 'image', zIndex, parentId: null, x: image.x * factor, y: image.y * factor, width: width * factor, height: height * factor });
        const projected = putArsenalComposition({ ...prev, currentSlideIndex: index }, next);
        return index === prev.currentSlideIndex ? { ...projected, caption: prev.caption, hashtags: prev.hashtags } : { ...prev, slides: projected.slides };
      }
      const images = [...(slide.extraImages ?? []), image];
      return { ...prev, ...(index === prev.currentSlideIndex ? { extraImages: images } : {}), slides: prev.slides.map((s, i) => i === index ? { ...s, extraImages: images } : s) };
    });
    if (postRef.current.slides[postRef.current.currentSlideIndex]?.id === slideId) setSelectedElementId(newId);
    toast.success('Imagem adicionada ao post! Use as alças para redimensionar ou mover.');
  };

  const handleUpdateExtraImage = (id: string, patch: Partial<CanvasCustomImage>) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = updateArsenalAuthorialLayer(currentSlide.composition, id, {
        ...(patch.url !== undefined ? { url: patch.url } : {}),
        ...(patch.width !== undefined ? { width: patch.width } : {}),
        ...(patch.height !== undefined ? { height: patch.height } : {}),
        ...(patch.x !== undefined ? { x: patch.x } : {}),
        ...(patch.y !== undefined ? { y: patch.y } : {}),
        ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
        ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
        ...(patch.cornerRadius !== undefined ? { cornerRadius: patch.cornerRadius } : {}),
      });
      handleUpdatePost({}, updatedComp);
      return;
    }
    setPost((prev) => {
      const currentSlide = prev.slides[curIdx];
      const slideImages = currentSlide?.extraImages || prev.extraImages || [];
      const updatedImages = slideImages.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      );

      const updatedSlides = [...prev.slides];
      if (currentSlide) {
        updatedSlides[curIdx] = {
          ...currentSlide,
          extraImages: updatedImages,
        };
      }

      return {
        ...prev,
        extraImages: updatedImages,
        slides: updatedSlides,
      };
    });
  };

  const handleRemoveExtraImage = (id: string) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    if (currentSlide?.composition) {
      const updatedComp = removeArsenalAuthorialLayer(currentSlide.composition, id);
      handleUpdatePost({}, updatedComp);
      if (selectedElementId === id) setSelectedElementId(null);
      toast.info("Imagem removida do post.");
      return;
    }
    setPost((prev) => {
      const currentSlide = prev.slides[curIdx];
      const slideImages = currentSlide?.extraImages || prev.extraImages || [];
      const updatedImages = slideImages.filter((item) => item.id !== id);

      const updatedSlides = [...prev.slides];
      if (currentSlide) {
        updatedSlides[curIdx] = {
          ...currentSlide,
          extraImages: updatedImages,
        };
      }

      if (selectedElementId === id) {
        setSelectedElementId(null);
      }

      toast.info("Imagem removida do post.");

      return {
        ...prev,
        extraImages: updatedImages,
        slides: updatedSlides,
      };
    });
  };

  const removeSelectedElement = () => {
    if (!selectedElementId) return;
    if (arsenalComposition) {
      if (selectedElementId === "logo") handleUpdatePost({ logoUrl: undefined });
      else handleUpdatePost({}, hideArsenalInstance(arsenalComposition, selectedElementId));
    } else {
      const slide = post.slides[post.currentSlideIndex];
      if ((slide?.extraImages ?? post.extraImages ?? []).some(e => e.id === selectedElementId)) handleRemoveExtraImage(selectedElementId);
      else if ((slide?.extraTexts ?? post.extraTexts ?? []).some(e => e.id === selectedElementId)) handleRemoveExtraText(selectedElementId);
    }
    setSelectedElementId(null);
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!selectedElementId || !freeEditing || !shouldDeleteCanvasSelection(event, event.target as HTMLElement | null)) return;
      event.preventDefault();
      removeSelectedElement();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [post, selectedElementId, freeEditing]);

  // ─── Item 7: fluxo de salvamento com decisão memorizável ───
  const saveManually = async (mode: "new" | "update") => {
    if (!onSave) return;
    const docToSave = post;
    const manager = autoSaveManagerRef.current;
    manager?.pauseForManualSave();
    try {
      const saved = await onSave(docToSave, mode, "manual");
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
    let dataUrl: string;
    try { dataUrl = stageRef.current.exportPng4K(); } catch(error) { toast.error((error as Error).message); return; }
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
    setIsExportingZip(true);
    toast.info("Compilando todos os slides em arquivo ZIP de alta resolução...");

    try {
      const blob = await stageRef.current.exportZip4K((current, total) => {
        toast.loading(`Renderizando slide ${current} de ${total}...`, { id: "zip-progress" });
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
    setPost((prev) => {
      const nextIdx = prev.slides.length + 1;
      const newSlide = {
        id: `s-${Date.now()}`,
        step: `SLIDE 0${nextIdx} // CONTINUAÇÃO`,
        headline: "Novo ponto importante da narrativa",
        subtext: "Explique este conceito com clareza para manter o público engajado até a chamada para ação.",
        visualStyle: prev.slides[prev.currentSlideIndex]?.visualStyle,
      };
      return { ...prev, slides: [...prev.slides, newSlide], currentSlideIndex: prev.slides.length };
    });
  };

  const handleDuplicateSlide = (index: number) => {
    if (!post.slides[index]) return;
    setPost((prev) => duplicateSlide(prev, index));
    setSelectedElementId(null);
  };

  const handleDeleteSlide = (index: number) => {
    if (post.slides.length <= 1) {
      toast.error("O carrossel precisa ter no mínimo 1 slide.");
      return;
    }
    setPost((prev) => removeSlide(prev, index));
    setSelectedElementId(null);
  };

  return (
    <div className="h-[100dvh] w-full bg-[#07090E] text-white flex flex-col overflow-hidden select-none font-sans">
      {/* 1. Top Bar */}
      <CanvasTopBar
        aspectRatio={post.aspectRatio}
        onAspectRatioChange={handleAspectRatioChange}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(1.8, z + 0.1))}
        onZoomOut={() => setZoom((z) => Math.max(0.6, z - 0.1))}
        onResetZoom={() => setZoom(1)}
        onExportPng={handleExportPng}
        onExportZip={handleExportZip}
        onBackToGallery={onBackToGallery ? () => onBackToGallery(post) : undefined}
        isSnapEnabled={post.isSnapEnabled !== false}
        onToggleSnap={handleToggleSnap}
        isExportingZip={isExportingZip}
        slideCount={post.slides.length}
        onAddSlide={handleAddSlide}
        onRestart={onRestart ? () => setIsRestartConfirmOpen(true) : undefined}
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
        onReplicate={post.slides.length > 1 ? () => setIsReplicationOpen(true) : undefined}
      />

      <GuidedEditor post={post} free={freeEditing}
        onReplicate={post.slides.length > 1 ? () => setIsReplicationOpen(true) : undefined}
        onFreeChange={free => { setFreeEditing(free); setIsMobileDrawerOpen(false); setIsEditingBackground(false); setSelectedElementId(null); setRequestedTab(undefined); }}
        onApply={next => { handleUpdatePost(next, next.slides[next.currentSlideIndex]?.composition); setSelectedElementId(null); }}
        onImageTools={() => { setFreeEditing(true); setRequestedTab("media"); setIsMobileDrawerOpen(true); }} />

      {freeEditing && selectedElementId && (arsenalComposition?.elements.some(e => e.id === selectedElementId) || (post.slides[post.currentSlideIndex]?.extraImages ?? []).some(e => e.id === selectedElementId) || (post.slides[post.currentSlideIndex]?.extraTexts ?? []).some(e => e.id === selectedElementId)) && (
        <div className="flex justify-center border-b border-white/10 py-1">
          <button type="button" className="rounded-lg px-3 py-2 text-xs text-rose-300 hover:bg-white/10" onClick={removeSelectedElement}>Remover elemento selecionado · Del</button>
        </div>
      )}

      {!isMobileDrawerOpen && (
        <div className={isReplicationOpen ? "invisible" : ""} aria-hidden={isReplicationOpen}>
          <CanvasMobileQuickActions
            aspectRatio={post.aspectRatio}
            onAspectRatioChange={handleAspectRatioChange}
            slideCount={post.slides.length}
            onAddSlide={handleAddSlide}
            zoom={zoom}
            onZoomChange={setZoom}
            onZoomScrubChange={setIsZoomScrubbing}
            onResetZoom={() => setZoom(1)}
            isSnapEnabled={post.isSnapEnabled !== false}
            onToggleSnap={handleToggleSnap}
            onRestart={onRestart ? () => setIsRestartConfirmOpen(true) : undefined}
            onExportPng={handleExportPng}
            onExportZip={handleExportZip}
            isExportingZip={isExportingZip}
          />
        </div>
      )}

      {/* 2. Área Central */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop: Barra Lateral Fixa à Esquerda (Intocada) */}
        <div className={freeEditing ? "hidden md:flex h-full" : "hidden"}>
          <CanvasSidebar
            requestedTab={requestedTab}
            post={currentViewPost}
            composition={arsenalComposition}
            onUpdateComposition={c => handleUpdatePost({}, c)}
            onUpdatePost={handleUpdatePost}
            onMediaUpdate={handleMediaUpdate}
            mediaPreview={mediaPreview}
            onMediaPreview={setMediaPreview}
            onReplicate={post.slides.length > 1 ? () => setIsReplicationOpen(true) : undefined}
            isEditingBackground={isEditingBackground}
            onToggleBackgroundEdit={() => setIsEditingBackground((v) => !v)}
            onAddExtraText={handleAddExtraText}
            onUpdateExtraText={handleUpdateExtraText}
            onRemoveExtraText={handleRemoveExtraText}
            onAddExtraImage={handleAddExtraImage}
            onUpdateExtraImage={handleUpdateExtraImage}
            onRemoveExtraImage={handleRemoveExtraImage}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
          />
        </div>

        {/* Palco da Prancheta com Viewport Adaptativo (Mobile & Desktop) */}
        <main
          ref={mobileStageAreaRef}
          onClick={() => {
            if (isMobileDrawerOpen) setIsMobileDrawerOpen(false);
          }}
          className="min-w-0 flex-1 bg-[#040508] relative overflow-hidden flex items-center justify-center p-2 sm:p-8 xl:pr-20 custom-scrollbar"
        >
          <CanvasToolRail
            aspectRatio={post.aspectRatio}
            onAspectRatioChange={handleAspectRatioChange}
            isSnapEnabled={post.isSnapEnabled !== false}
            onToggleSnap={handleToggleSnap}
            zoom={zoom}
            onZoomIn={() => setZoom((z) => Math.min(1.8, z + 0.1))}
            onZoomOut={() => setZoom((z) => Math.max(0.6, z - 0.1))}
            onResetZoom={() => setZoom(1)}
          />
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
                  <span className="font-bold text-white">Editando Enquadramento do Fundo</span>
                  <span className="text-white/40 hidden lg:inline">
                    | Arraste para reposicionar ou use os controladores para redimensionar
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

          <motion.div
            className="flex items-center justify-center cursor-pointer md:cursor-default"
            animate={
              isMobile
                ? {
                    scale: mobileAdaptiveScale * zoom,
                    y: isMobileDrawerOpen ? -(mobilePanelHeight + 8) / 2 : 0,
                  }
                : {
                    scale: zoom,
                    y: 0,
                  }
            }
            transition={isMobile && isZoomScrubbing
              ? { duration: 0 }
              : { type: "spring", stiffness: 280, damping: 26, mass: 0.8 }}
          >
            <CanvasPostStage
              ref={stageRef}
              post={post}
              onUpdateComposition={c=>handleUpdatePost({},c)}
              isReadOnly={!freeEditing}
              isMobile={isMobile}
              zoom={1}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
              onUpdateElementPosition={handleUpdateElementPosition}
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
            />
          </motion.div>
        </main>

        {/* Mobile: Bottom Sheet Drawer Deslizante Nativo */}
        <CanvasMobileDrawer
          post={currentViewPost}
          composition={arsenalComposition}
          onUpdateComposition={c => handleUpdatePost({}, c)}
          onUpdatePost={handleUpdatePost}
          onMediaUpdate={handleMediaUpdate}
            mediaPreview={mediaPreview}
            onMediaPreview={setMediaPreview}
          requestedTab={requestedTab}
          suspended={isReplicationOpen || !freeEditing}
          isOpen={isMobileDrawerOpen}
          onToggleOpen={setIsMobileDrawerOpen}
          onReplicate={post.slides.length > 1 ? () => setIsReplicationOpen(true) : undefined}
          onAddExtraText={handleAddExtraText}
          onUpdateExtraText={handleUpdateExtraText}
          onRemoveExtraText={handleRemoveExtraText}
          onAddExtraImage={handleAddExtraImage}
          onUpdateExtraImage={handleUpdateExtraImage}
          onRemoveExtraImage={handleRemoveExtraImage}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
        />
      </div>

      {/* Mobile: slides visíveis apenas no carrossel e com o painel fechado. Desktop: fita permanente. */}
      <div className={`${post.slides.length > 1 && !isMobileDrawerOpen ? "block" : "hidden"} shrink-0 md:block`}>
        <CarouselFilmstrip
          slides={post.slides}
          currentIndex={post.currentSlideIndex}
          onSelectSlide={(index) => setPost((p) => ({ ...p, currentSlideIndex: index }))}
          onAddSlide={handleAddSlide}
          onDuplicateSlide={handleDuplicateSlide}
          onRemoveSlide={handleDeleteSlide}
          onReorderSlide={handleReorderSlide}
        />
      </div>
      {/* Reserva real para o dock: o canvas não fica escondido atrás de um overlay. */}
      {freeEditing && <div className="h-[calc(74px+env(safe-area-inset-bottom))] shrink-0 md:hidden" aria-hidden="true" />}

      <PendingMediaExportDialog
        format={pendingExport}
        count={pendingMediaCount(post, pendingExport === "zip")}
        onConfirm={confirmPendingExport}
        onCancel={() => setPendingExport(null)}
      />
      {/* ── Diálogos: Salvar (item 7) e Recomeçar (item 6) ── */}
      <ConfirmDialog open={Boolean(formatPreview)} title="Aplicar novo formato?" description="Confira a projeção do seu layout. A variante do catálogo é opcional e redefine somente a geometria." confirmLabel="Aplicar formato" onCancel={()=>{formatRequest.current++;setFormatPreview(null);setNativeFormatPreview(null);}} onConfirm={()=>{if(formatPreview)setPost(formatPreview);formatRequest.current++;setFormatPreview(null);setNativeFormatPreview(null);}}>
        {formatLoading&&<p role="status">Consultando formatos da mesma versão…</p>}{nativeFormatPreview&&nativeFormatPreview!==formatPreview&&<button className="rounded border border-white/20 p-2" onClick={()=>setFormatPreview(nativeFormatPreview)}>Pré-visualizar variante do catálogo · redefinir geometria</button>}{formatPreview&&<div className="my-3 flex justify-center"><CanvasPostStage post={formatPreview} zoom={.4} isReadOnly/></div>}
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
        onConfirm={() => {
          setIsRestartConfirmOpen(false);
          onRestart?.();
        }}
        onCancel={() => setIsRestartConfirmOpen(false)}
      />
      <SlideReplicationDialog
        open={isReplicationOpen}
        post={post}
        onOpenChange={setIsReplicationOpen}
        onApply={handleReplicate}
      />
    </div>
  );
}
