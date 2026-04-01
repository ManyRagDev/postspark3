import { trpc } from "@/lib/trpc";
import { AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import TheVoid from "@/components/views/TheVoid";
import HoloDeck from "@/components/views/HoloDeck";
import WorkbenchV2 from "@/components/views/WorkbenchV2/WorkbenchV2";
import ExecutionBrief from "@/components/views/ExecutionBrief";
import { useExtractedStyles } from "@/hooks/useExtractedStyles";
import type { InputType, PostVariation, AppState, AiModel, PostMode, CreationMode, CreativeExecutionBrief } from "@shared/postspark";
import { useUpgradePrompt, UpgradePromptModal } from "@/components/UpgradePrompt";
import { useEditorStore } from "@/store/editorStore";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("void");
  const [creationMode, setCreationMode] = useState<CreationMode>("ideation");
  const [postMode, setPostMode] = useState<PostMode>("static");
  const [selectedModel, setSelectedModel] = useState<AiModel>("gemini");
  const [inputMeta, setInputMeta] = useState<{ type: InputType; content: string }>({
    type: "text",
    content: "",
  });
  const [executionBriefDraft, setExecutionBriefDraft] = useState<CreativeExecutionBrief | null>(null);
  const { showUpgradePrompt, open: upgradeOpen, setOpen: setUpgradeOpen } = useUpgradePrompt();
  const [variations, setVariations] = useState<PostVariation[]>([]);
  const [loadingImageId, setLoadingImageId] = useState<string | null>(null);
  const activeVariation = useEditorStore((state) => state.activeVariation);

  const generateMutation = trpc.post.generate.useMutation();
  const generateImageMutation = trpc.post.generateBackground.useMutation();
  const saveMutation = trpc.post.save.useMutation();

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

      // If URL, extract styles in parallel with content generation
      if (type === "url") {
        clearExtractedStyles();
        // Fire and forget with logging
        extractStyles(value)
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
        const result = await generateMutation.mutateAsync({
          inputType: type,
          content: value,
          platform: "instagram",
          imageUrl: type === "image" ? value : undefined,
          tone: detectedState,
          postMode: postMode,
          model: selectedModel,
        });

        if (result && result.length > 0) {
          setVariations(result as PostVariation[]);
          setAppState("holodeck");
        } else {
          toast.error("Não foi possível sintetizar variações. Tente novamente.");
        }
      } catch (err: any) {
        console.error("Generation error:", err);
        if (err?.data?.httpStatus === 402 || err?.message?.includes("Sparks insuficientes")) {
          showUpgradePrompt();
        } else {
          toast.error(err?.message || "Falha na síntese. Verifique o conteúdo e tente novamente.");
        }
      }
    },
    [creationMode, generateMutation, postMode, extractStyles, clearExtractedStyles]
  );

  const handleExecutionBriefSubmit = useCallback(
    async (brief: CreativeExecutionBrief) => {
      setExecutionBriefDraft(brief);
      setInputMeta({ type: "text", content: brief.rawInput });

      if (brief.brandInput?.websiteUrl) {
        clearExtractedStyles();
        extractStyles(brief.brandInput.websiteUrl).catch((err) => {
          console.error("[Home] Style extraction error:", err);
        });
      }

      try {
        const result = await generateMutation.mutateAsync({
          inputType: "text",
          content: brief.rawInput,
          platform: brief.platform,
          postMode: brief.format === "carousel" ? "carousel" : "static",
          model: selectedModel,
          creationMode: "execution",
          executionBrief: brief,
        });

        if (result && result.length > 0) {
          setVariations(result as PostVariation[]);
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
      }
    },
    [clearExtractedStyles, extractStyles, generateMutation, selectedModel, showUpgradePrompt]
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
              v.id === variation.id ? { ...v, imageUrl: result.imageData } : v
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
        const persistedVariation = editorState.baseVariation ?? variation;
        const activeCaption = editorState.activeVariation?.caption ?? persistedVariation.caption;
        await saveMutation.mutateAsync({
          inputType: inputMeta.type,
          inputContent: inputMeta.content,
          platform: persistedVariation.platform,
          headline: persistedVariation.headline,
          body: persistedVariation.body,
          caption: activeCaption,
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
          slides: editorState.slides,
          textElements: persistedVariation.textElements,
          imageSettings: editorState.baseImageSettings,
          layoutSettings: editorState.baseLayoutSettings,
          bgValue: editorState.baseBgValue,
          bgOverlay: editorState.baseBgOverlay,
          copyAngle: persistedVariation.copyAngle,
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
  }, []);

  const goToExecutionBrief = useCallback(() => {
    setAppState("execution-brief");
  }, []);

  const goToHoloDeck = useCallback(() => {
    setAppState("holodeck");
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
            isLoading={generateMutation.isPending}
            postMode={postMode}
            onPostModeChange={setPostMode}
            creationMode={creationMode}
            onCreationModeChange={setCreationMode}
          />
        )}

        {appState === "execution-brief" && executionBriefDraft && (
          <ExecutionBrief
            key="execution-brief"
            initialInput={inputMeta}
            defaultPostMode={postMode}
            initialBrief={executionBriefDraft}
            isLoading={generateMutation.isPending}
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
          />
        )}

        {appState === "workbench" && (
          <WorkbenchV2
            key="workbench"
            onBack={goToHoloDeck}
            onSave={handleSave}
            isSaving={saveMutation.isPending}
          />
        )}
      </AnimatePresence>
      <UpgradePromptModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
