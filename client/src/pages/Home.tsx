import { trpc } from "@/lib/trpc";
import { AnimatePresence } from "framer-motion";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import TheVoid from "@/components/views/TheVoid";
import HoloDeck from "@/components/views/HoloDeck";
import WorkbenchRefactored from "@/components/views/WorkbenchRefactored";
import { EditorProvider } from "@/contexts/EditorContext";
import { useExtractedStyles } from "@/hooks/useExtractedStyles";
import type { InputType, PostVariation, AppState, Platform, AspectRatio, PostMode, TemporaryTheme } from "@shared/postspark";
import type { ThemeConfig } from "@/lib/themes";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("void");
  const [postMode, setPostMode] = useState<PostMode>("static");
  const [variations, setVariations] = useState<PostVariation[]>([]);
  const [selectedVariation, setSelectedVariation] = useState<PostVariation | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ThemeConfig | undefined>(undefined);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('1:1');
  const [inputMeta, setInputMeta] = useState<{ type: InputType; content: string }>({
    type: "text",
    content: "",
  });
  const [loadingImageId, setLoadingImageId] = useState<string | null>(null);

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
          platform: "instagram" as Platform,
          imageUrl: type === "image" ? value : undefined,
          tone: detectedState,
          postMode: postMode,
        });

        if (result && result.length > 0) {
          setVariations(result as PostVariation[]);
          setAppState("holodeck");
        } else {
          toast.error("Não foi possível sintetizar variações. Tente novamente.");
        }
      } catch (err: any) {
        console.error("Generation error:", err);
        toast.error(err?.message || "Falha na síntese. Verifique o conteúdo e tente novamente.");
      }
    },
    [generateMutation, postMode, extractStyles, clearExtractedStyles, extractedThemes.length]
  );

  // State 2 → State 3: Select a variation to edit
  // Receives aspectRatio and theme from HoloDeck
  const handleSelectVariation = useCallback((
    variation: PostVariation,
    options?: { aspectRatio?: AspectRatio; theme?: ThemeConfig }
  ) => {
    const enrichedVariation: PostVariation = {
      ...structuredClone(variation),
      aspectRatio: options?.aspectRatio ?? variation.aspectRatio ?? '1:1',
    };

    setSelectedVariation(enrichedVariation);
    setSelectedTheme(options?.theme);
    setSelectedAspectRatio(options?.aspectRatio ?? variation.aspectRatio ?? '1:1');
    setAppState("workbench");
  }, []);

  // Generate image for a variation in HoloDeck
  const handleGenerateImageHolo = useCallback(
    async (variation: PostVariation) => {
      setLoadingImageId(variation.id);
      try {
        const result = await generateImageMutation.mutateAsync({
          prompt: variation.imagePrompt,
          provider: 'pollinations', // Default to fast provider in HoloDeck
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
    async (prompt: string, provider: 'pollinations' | 'gemini' = 'pollinations'): Promise<string> => {
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
        await saveMutation.mutateAsync({
          inputType: inputMeta.type,
          inputContent: inputMeta.content,
          platform: variation.platform,
          headline: variation.headline,
          body: variation.body,
          hashtags: variation.hashtags,
          callToAction: variation.callToAction,
          tone: variation.tone,
          imagePrompt: variation.imagePrompt,
          imageUrl: variation.imageUrl,
          backgroundColor: variation.backgroundColor,
          textColor: variation.textColor,
          accentColor: variation.accentColor,
          layout: variation.layout,
        });
        toast.success("Conteúdo consolidado.");
      } catch {
        toast.error("Não foi possível consolidar o post.");
      }
    },
    [saveMutation, inputMeta]
  );

  // Navigation
  const goToVoid = useCallback(() => {
    setAppState("void");
    setVariations([]);
    setSelectedVariation(null);
  }, []);

  const goToHoloDeck = useCallback(() => {
    setAppState("holodeck");
    setSelectedVariation(null);
  }, []);

  return (
    <EditorProvider>
      <div className="min-h-screen bg-background text-foreground overflow-hidden">
        <AnimatePresence mode="wait">
          {appState === "void" && (
            <TheVoid
              key="void"
              onSubmit={handleVoidSubmit}
              isLoading={generateMutation.isPending}
              postMode={postMode}
              onPostModeChange={setPostMode}
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
            />
          )}


          {appState === "workbench" && selectedVariation && (
            <WorkbenchRefactored
              key="workbench"
              variation={selectedVariation}
              initialTheme={selectedTheme}
              initialAspectRatio={selectedAspectRatio}
              postMode={selectedVariation.postMode}
              slides={
                selectedVariation.slides?.map((slide, index) => ({
                  ...structuredClone(selectedVariation),
                  id: `${selectedVariation.id}-slide-${index}`,
                  headline: slide.headline,
                  body: slide.body,
                  // Preserve other variation properties
                }))
              }
              onBack={goToHoloDeck}
              onSave={handleSave}
              onGenerateImage={handleGenerateImageWorkbench}
              isSaving={saveMutation.isPending}
            />
          )}
        </AnimatePresence>
      </div>
    </EditorProvider>
  );
}
