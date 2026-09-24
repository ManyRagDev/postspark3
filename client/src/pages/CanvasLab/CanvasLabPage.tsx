import CanvasMobileDrawer from "./components/CanvasMobileDrawer";
import { useRef, useState, useEffect, useLayoutEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Check, Crop } from "lucide-react";
import { toast } from "sonner";
import { CanvasPostStage, type CanvasPostStageRef } from "./components/CanvasPostStage";
import CanvasTopBar from "./components/CanvasTopBar";
import CanvasToolRail from "./components/CanvasToolRail";
import CanvasMobileQuickActions from "./components/CanvasMobileQuickActions";
import CanvasSidebar from "./components/CanvasSidebar";
import CarouselFilmstrip from "./components/CarouselFilmstrip";
import { ConfirmDialog, SaveChoiceDialog, readSavePreference, writeSavePreference } from "./components/CanvasLabDialogs";
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
import { applyContrastGuard, patchTouchesContrast } from "./lib/contrast";
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

interface CanvasLabPageProps {
  initialPost?: CanvasPostModel;
  onBackToGallery?: () => void;
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
  const [isEditingBackground, setIsEditingBackground] = useState(false);
  const [history, setHistory] = useState(() => createHistory<CanvasPostModel>(initialPost || INITIAL_POST));
  const post = history.present;

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
      const next = typeof updater === "function" ? updater(current) : updater;
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
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isRestartConfirmOpen, setIsRestartConfirmOpen] = useState(false);
  const [applyBackgroundToAllSlides, setApplyBackgroundToAllSlides] = useState(false);
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
  const baseHeight = post.aspectRatio === "9:16" ? 640 : post.aspectRatio === "5:6" ? 432 : 360;

  // A área útil mobile acompanha o dock, a faixa de slides e o painel flutuante.
  const mobileDockHeight = 74;
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

  const handleUpdatePost = (patch: Partial<CanvasPostModel>) => {
    setPost((prev) => {
      const next = { ...prev, ...patch };
      // Guardião de contraste (regra mandatória): toda mudança de fundo,
      // acento, família ou limpeza de cor manual re-resolve as cores de
      // texto — fundo escuro ⇄ texto claro, e vice-versa, por metade no split.
      return patchTouchesContrast(prev, patch) ? applyContrastGuard(next) : next;
    });
  };

  const handleAspectRatioChange = (ratio: AspectRatioType) => {
    setPost((prev) => ({ ...prev, aspectRatio: ratio }));
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
      return {
        ...prev,
        [`${field}Rich`]: chunks,
        slides: updatedSlides,
      };
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

      return {
        ...prev,
        [field]: value,
        slides: updatedSlides,
      };
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

      return {
        ...prev,
        [field]: value,
        [richField]: chunks,
        slides: updatedSlides,
      };
    });
  };

  // Atualiza posição de caixa de texto extra arrastada no slide ativo
  const handleUpdateExtraTextPosition = (id: string, pos: ElementPosition) => {
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
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
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
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
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
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
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
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
  const handleAddExtraImage = (url: string, naturalWidth?: number, naturalHeight?: number) => {
    const curIdx = post.currentSlideIndex;
    const currentSlide = post.slides[curIdx];
    const slideImages = currentSlide?.extraImages || post.extraImages || [];
    const count = slideImages.length + 1;
    const newId = freshId("im");

    // Dimensões proporcionais contidas na prancheta
    let targetWidth = 140;
    let targetHeight = 140;
    if (naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0) {
      const ratio = naturalWidth / naturalHeight;
      if (ratio >= 1) {
        targetWidth = Math.min(180, Math.round(baseWidth * 0.45));
        targetHeight = Math.round(targetWidth / ratio);
      } else {
        targetHeight = Math.min(180, Math.round(baseHeight * 0.45));
        targetWidth = Math.round(targetHeight * ratio);
      }
    }

    const newExtraImage: CanvasCustomImage = {
      id: newId,
      url,
      x: Math.round((baseWidth - targetWidth) / 2),
      y: Math.round((baseHeight - targetHeight) / 2),
      width: targetWidth,
      height: targetHeight,
      rotation: 0,
      opacity: 1,
      cornerRadius: 0,
    };

    const updatedImages = [...slideImages, newExtraImage];
    const updatedSlides = [...post.slides];
    if (currentSlide) {
      updatedSlides[curIdx] = {
        ...currentSlide,
        extraImages: updatedImages,
      };
    }

    setPost((prev) => ({
      ...prev,
      extraImages: updatedImages,
      slides: updatedSlides,
    }));

    setSelectedElementId(newId);
    toast.success("Imagem adicionada ao post! Use as alças para redimensionar ou mover.");
  };

  const handleUpdateExtraImage = (id: string, patch: Partial<CanvasCustomImage>) => {
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
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
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
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

  const handleExportPng = () => {
    if (!stageRef.current) return;
    const dataUrl = stageRef.current.exportPng4K();
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

  const handleExportZip = async () => {
    if (!stageRef.current) return;
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

  const handleAddSlide = () => {
    const nextIdx = post.slides.length + 1;
    const newSlide = {
      id: `s-${Date.now()}`,
      step: `SLIDE 0${nextIdx} // CONTINUAÇÃO`,
      headline: "Novo ponto importante da narrativa",
      subtext: "Explique este conceito com clareza para manter o público engajado até a chamada para ação.",
    };
    setPost((prev) => ({
      ...prev,
      slides: [...prev.slides, newSlide],
      currentSlideIndex: prev.slides.length,
    }));
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
        onBackToGallery={onBackToGallery}
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
      />

      {!isMobileDrawerOpen && (
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
      )}

      {/* 2. Área Central */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop: Barra Lateral Fixa à Esquerda (Intocada) */}
        <div className="hidden md:flex h-full">
          <CanvasSidebar
            post={post}
            onUpdatePost={handleUpdatePost}
            applyToAllSlides={applyBackgroundToAllSlides}
            onToggleApplyToAll={setApplyBackgroundToAllSlides}
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
          post={post}
          onUpdatePost={handleUpdatePost}
          applyToAllSlides={applyBackgroundToAllSlides}
          onToggleApplyToAll={setApplyBackgroundToAllSlides}
          onExportPng={handleExportPng}
          onExportZip={handleExportZip}
          isExportingZip={isExportingZip}
          isOpen={isMobileDrawerOpen}
          onToggleOpen={setIsMobileDrawerOpen}
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
      <div className="h-[calc(74px+env(safe-area-inset-bottom))] shrink-0 md:hidden" aria-hidden="true" />

      {/* ── Diálogos: Salvar (item 7) e Recomeçar (item 6) ── */}
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
    </div>
  );
}
