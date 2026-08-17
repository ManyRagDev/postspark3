import { trpc } from "@/lib/trpc";
import { AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import TheVoid from "@/components/views/TheVoid";
import HoloDeck from "@/components/views/HoloDeck";
import WorkbenchV2 from "@/components/views/WorkbenchV2/WorkbenchV2";
import ExecutionBrief from "@/components/views/ExecutionBrief";
import { useExtractedStyles } from "@/hooks/useExtractedStyles";
import type { InputType, PostVariation, PostVisualSnapshot, AppState, AiModel, PostMode, CreationMode, CreativeExecutionBrief } from "@shared/postspark";
import { useUpgradePrompt, UpgradePromptModal } from "@/components/UpgradePrompt";
import { useEditorStore } from "@/store/editorStore";
import { createPostVisualSnapshot } from "@/lib/variationSnapshot";
import type { GenerationDebugTrace } from "@shared/postspark";

/**
 * Fase 2: o servidor agora retorna PostVisualSnapshot frozen (snapshotVersion
 * 3 ou 4 — SPEC-001 acrescenta `resolvedTypography` sem invalidar o v3).
 * Pass-through direto quando já é v3/v4; normaliza apenas variações legadas.
 */
function ensureSnapshot(variation: PostVariation | PostVisualSnapshot): PostVisualSnapshot {
  const version = (variation as PostVisualSnapshot).snapshotVersion;
  return version === 3 || version === 4
    ? variation as PostVisualSnapshot
    : createPostVisualSnapshot(variation as PostVariation);
}

export default function Home() {
  const [appState, setAppState] = useState<AppState>("void");
  const [creationMode, setCreationMode] = useState<CreationMode>("ideation");
  const [postMode, setPostMode] = useState<PostMode>("static");
  const [selectedModel, setSelectedModel] = useState<AiModel>("llama");
  const [inputMeta, setInputMeta] = useState<{ type: InputType; content: string }>({
    type: "text",
    content: "",
  });
  const [executionBriefDraft, setExecutionBriefDraft] = useState<CreativeExecutionBrief | null>(null);
  const { showUpgradePrompt, open: upgradeOpen, setOpen: setUpgradeOpen } = useUpgradePrompt();
  const [variations, setVariations] = useState<PostVisualSnapshot[]>([]);
  const [loadingImageId, setLoadingImageId] = useState<string | null>(null);
  const [isGenerationActive, setIsGenerationActive] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationDebug, setGenerationDebug] = useState<GenerationDebugTrace | undefined>();
  const activeVariation = useEditorStore((state) => state.activeVariation);

  const generateMutation = trpc.post.generate.useMutation();
  const generateImageMutation = trpc.post.generateBackground.useMutation();
  const saveMutation = trpc.post.save.useMutation();
  const debugRequested =
    import.meta.env.DEV ||
    import.meta.env.VITE_AI_UI_DEBUG_ENABLED === "true";
  const mergeDebugTraces = useCallback(
    (
      extraction: GenerationDebugTrace | undefined,
      generation: GenerationDebugTrace | undefined,
    ): GenerationDebugTrace | undefined => {
      if (!extraction) return generation;
      if (!generation) return extraction;
      return {
        ...generation,
        startedAt: extraction.startedAt,
        durationMs: extraction.durationMs + generation.durationMs,
        effectiveModels: Array.from(
          new Set([...extraction.effectiveModels, ...generation.effectiveModels]),
        ),
        calls: [...extraction.calls, ...generation.calls],
        events: [...extraction.events, ...generation.events],
      };
    },
    [],
  );

  // Extracted styles hook
  const {
    extractedThemes,
    isExtracting,
    extractStyles,
    clearExtractedStyles,
  } = useExtractedStyles();

  // State 1 → State 2: Generate variations
  const handleVoidSubmit = useCallback(
    async (value: string, type: InputType, detectedState?: string) => {
      setInputMeta({ type, content: value });

      if (creationMode === "execution") {
        setExecutionBriefDraft({
          creationMode: "execution",
          format: postMode === "carousel" ? "carousel" : "static",
          platform: "instagram",
          objective: "engage",
          interventionLevel: "light_optimize",
          contentSourceType: postMode === "carousel" ? "carousel_slides" : "freeform",
          rawInput: value,
          callToAction: "",
          notes: detectedState,
          slides: postMode === "carousel"
            ? Array.from({ length: 5 }, (_, index) => ({
              slideNumber: index + 1,
              rawText: "",
              role: index === 0 ? "hook" : index === 4 ? "cta" : "development",
              locked: false,
            }))
            : undefined,
          brandInput: {
            adaptationMode: "adaptive",
          },
        });
        setAppState("execution-brief");
        return;
      }

      setGenerationError(null);
      setGenerationDebug(undefined);
      setIsGenerationActive(true);

      // If URL, extract styles before generation so both steps share one snapshot.
      let siteIntelligencePromise: ReturnType<typeof extractStyles> | null = null;
      if (type === "url") {
        clearExtractedStyles();
        // Keep extraction visible and reuse its persisted snapshot in generation.
        (siteIntelligencePromise = extractStyles(value))
          .then((result) => {
            console.log("[Home] Style extraction complete:", result?.themes?.length, "themes");
            if (result && result.themes.length > 0) {
              toast.success(`${result.themes.length} estilos extraídos do site!`);
            }
          })
          .catch((err) => {
            console.error("[Home] Style extraction error:", err);
          });
      }

      try {
        const siteResult = siteIntelligencePromise
          ? await siteIntelligencePromise.catch(() => undefined)
          : undefined;
        const resolvedSiteIntelligenceId = siteResult?.siteIntelligence.id;
        const result = await generateMutation.mutateAsync({
          inputType: type,
          content: value,
          platform: "instagram",
          imageUrl: type === "image" ? value : undefined,
          tone: detectedState,
          postMode: postMode,
          model: selectedModel,
          siteIntelligenceId: resolvedSiteIntelligenceId,
          debug: debugRequested,
        });

        if (result?.variations.length === 3) {
          setVariations(result.variations.map(variation => ensureSnapshot(variation)));
          setGenerationDebug(mergeDebugTraces(siteResult?.debug, result.debug));
          setAppState("holodeck");
        } else {
          setGenerationError("A IA não retornou variações utilizáveis.");
          toast.error("Não foi possível sintetizar variações. Tente novamente.");
        }
      } catch (err: any) {
        console.error("Generation error:", err);
        if (err?.data?.httpStatus === 402 || err?.message?.includes("Sparks insuficientes")) {
          showUpgradePrompt();
        } else {
          setGenerationError(
            err?.message || "Houve uma falha temporária durante a síntese.",
          );
          toast.error(err?.message || "Falha na síntese. Verifique o conteúdo e tente novamente.");
        }
      } finally {
        setIsGenerationActive(false);
      }
    },
    [
      clearExtractedStyles,
      creationMode,
      extractStyles,
      generateMutation,
      postMode,
      selectedModel,
      showUpgradePrompt,
      mergeDebugTraces,
    ]
  );

  const handleExecutionBriefSubmit = useCallback(
    async (brief: CreativeExecutionBrief) => {
      setExecutionBriefDraft(brief);
      setInputMeta({ type: "text", content: brief.rawInput });
      setGenerationDebug(undefined);
      setIsGenerationActive(true);

      let siteIntelligencePromise: ReturnType<typeof extractStyles> | null = null;
      if (brief.brandInput?.websiteUrl) {
        clearExtractedStyles();
        (siteIntelligencePromise = extractStyles(brief.brandInput.websiteUrl)).catch((err) => {
          console.error("[Home] Style extraction error:", err);
        });
      }

      try {
        const siteResult = siteIntelligencePromise
          ? await siteIntelligencePromise.catch(() => undefined)
          : undefined;
        const resolvedSiteIntelligenceId = siteResult?.siteIntelligence.id;
        const result = await generateMutation.mutateAsync({
          inputType: "text",
          content: brief.rawInput,
          platform: brief.platform,
          postMode: brief.format === "carousel" ? "carousel" : "static",
          model: selectedModel,
          creationMode: "execution",
          executionBrief: brief,
          siteIntelligenceId: resolvedSiteIntelligenceId,
          debug: debugRequested,
        });

        if (result?.variations.length === 3) {
          setVariations(result.variations.map(variation => ensureSnapshot(variation)));
          setGenerationDebug(mergeDebugTraces(siteResult?.debug, result.debug));
          setAppState("holodeck");
        } else {
          toast.error("Nao foi possivel executar o briefing. Tente novamente.");
        }
      } catch (err: any) {
        console.error("Execution generation error:", err);
        if (err?.data?.httpStatus === 402 || err?.message?.includes("Sparks insuficientes")) {
          showUpgradePrompt();
        } else {
          toast.error(err?.message || "Falha ao executar briefing.");
        }
      } finally {
        setIsGenerationActive(false);
      }
    },
    [clearExtractedStyles, extractStyles, generateMutation, selectedModel, showUpgradePrompt, mergeDebugTraces]
  );

  // State 2 → State 3: Select a variation to edit
  const handleSelectVariation = useCallback(() => {
    // Trust that HoloDeck.tsx has already populated useEditorStore
    setAppState("workbench");
  }, []);

  // Generate image for a variation in HoloDeck
  const handleGenerateImageHolo = useCallback(
    async (variation: PostVariation) => {
      setLoadingImageId(variation.id);
      try {
        const result = await generateImageMutation.mutateAsync({
          prompt: variation.imagePrompt,
          provider: 'pollinations_fast', // Default to fast provider in HoloDeck
        });
        if (result.imageData) {
          setVariations((prev) =>
            prev.map((v) =>
              v.id === variation.id
                ? { ...v, imageUrl: result.imageData, bgValue: { type: "ai", url: result.imageData } }
                : v
            )
          );
        }
      } catch {
        toast.error("Ajuste necessário: a imagem não pôde ser sintetizada agora.");
      } finally {
        setLoadingImageId(null);
      }
    },
    [generateImageMutation]
  );

  // Generate image in Workbench
  const handleGenerateImageWorkbench = useCallback(
    async (prompt: string, provider: 'pollinations_fast' | 'pollinations_hd' = 'pollinations_fast'): Promise<string> => {
      try {
        const result = await generateImageMutation.mutateAsync({ prompt, provider });
        return result.imageData || "";
      } catch {
        toast.error("Ajuste necessário na síntese visual.");
        return "";
      }
    },
    [generateImageMutation]
  );

  // Save post from Workbench
  const handleSave = useCallback(
    async (variation: PostVariation) => {
      try {
        const editorState = useEditorStore.getState();
        const variationSnapshot = editorState.visualSnapshot;
        if (!variationSnapshot) {
          throw new Error("O snapshot visual atual não está disponível para persistência.");
        }
        const persistedVariation = variationSnapshot;
        await saveMutation.mutateAsync({
          inputType: inputMeta.type,
          inputContent: inputMeta.content,
          platform: persistedVariation.platform,
          headline: persistedVariation.headline,
          body: persistedVariation.body,
          caption: persistedVariation.caption,
          hashtags: persistedVariation.hashtags,
          callToAction: persistedVariation.callToAction,
          tone: persistedVariation.tone,
          imagePrompt: persistedVariation.imagePrompt,
          imageUrl: persistedVariation.imageUrl,
          backgroundColor: persistedVariation.backgroundColor,
          textColor: persistedVariation.textColor,
          accentColor: persistedVariation.accentColor,
          layout: persistedVariation.layout,
          postMode: editorState.postMode,
          slides: persistedVariation.slides,
          textElements: persistedVariation.textElements,
          imageSettings: persistedVariation.imageSettings,
          layoutSettings: persistedVariation.layoutSettings,
          bgValue: persistedVariation.bgValue,
          bgOverlay: persistedVariation.bgOverlay,
          copyAngle: persistedVariation.copyAngle,
          variationSnapshot: variationSnapshot as any,
        });
        toast.success("Conteúdo consolidado.");
      } catch (err: any) {
        const saveErrorMessage =
          err?.message ||
          err?.shape?.message ||
          err?.data?.message ||
          err?.data?.cause?.message ||
          "Não foi possível consolidar o post.";
        console.error("[Home] Save error:", err);
        toast.error(saveErrorMessage);
      }
    },
    [saveMutation, inputMeta]
  );

  // Navigation
  const goToVoid = useCallback(() => {
    setAppState("void");
      setVariations([]);
      setGenerationDebug(undefined);
  }, []);

  const goToExecutionBrief = useCallback(() => {
    setAppState("execution-brief");
  }, []);

  const goToHoloDeck = useCallback(() => {
    setAppState("holodeck");
  }, []);

  useEffect(() => {
    const restoredGeneration = sessionStorage.getItem("restoredGeneration");
    if (!restoredGeneration) return;

    try {
      const restored = JSON.parse(restoredGeneration) as PostVariation[];
      if (Array.isArray(restored) && restored.length > 0) {
          setVariations(restored.map(variation => ensureSnapshot(variation)));
        setAppState("holodeck");
      }
    } catch (error) {
      console.error("[Home] Failed to restore canonical generation snapshots:", error);
      toast.error("Não foi possível restaurar essa geração.");
    } finally {
      sessionStorage.removeItem("restoredGeneration");
      sessionStorage.removeItem("restoredGenerationMeta");
    }
  }, []);

  useEffect(() => {
    const pendingSavedPost = sessionStorage.getItem("postspark.open_saved_post");
    if (!pendingSavedPost || !activeVariation) return;

    try {
      const parsed = JSON.parse(pendingSavedPost) as { type?: InputType; content?: string };
      setInputMeta({
        type: parsed.type || "text",
        content: parsed.content || "",
      });
      setAppState("workbench");
    } catch {
      setAppState("workbench");
    } finally {
      sessionStorage.removeItem("postspark.open_saved_post");
    }
  }, [activeVariation]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      <AnimatePresence mode="wait">
        {appState === "void" && (
          <TheVoid
            key="void"
            onSubmit={handleVoidSubmit}
            isLoading={isGenerationActive}
            postMode={postMode}
            onPostModeChange={setPostMode}
            creationMode={creationMode}
            onCreationModeChange={setCreationMode}
            generationPhase={
              isExtracting && !generateMutation.isPending
                ? "extracting"
                : "generating"
            }
            generationError={generationError}
            onDismissGenerationError={() => setGenerationError(null)}
          />
        )}

        {appState === "execution-brief" && executionBriefDraft && (
          <ExecutionBrief
            key="execution-brief"
            initialInput={inputMeta}
            defaultPostMode={postMode}
            initialBrief={executionBriefDraft}
            isLoading={isGenerationActive}
            onBack={goToVoid}
            onSubmit={handleExecutionBriefSubmit}
          />
        )}

        {appState === "holodeck" && variations.length > 0 && (
          <HoloDeck
            key="holodeck"
            variations={variations}
            onSelect={handleSelectVariation}
            onBack={goToVoid}
            onGenerateImage={handleGenerateImageHolo}
            loadingImageId={loadingImageId}
            extractedThemes={extractedThemes}
            isExtractingStyles={isExtracting}
            executionBrief={creationMode === "execution" ? executionBriefDraft ?? undefined : undefined}
            onBackToBrief={creationMode === "execution" ? goToExecutionBrief : undefined}
            generationDebug={generationDebug}
          />
        )}

        {appState === "workbench" && (
          <WorkbenchV2
            key="workbench"
            onBack={goToHoloDeck}
            onSave={handleSave}
            isSaving={saveMutation.isPending}
            generationDebug={generationDebug}
          />
        )}
      </AnimatePresence>
      <UpgradePromptModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
