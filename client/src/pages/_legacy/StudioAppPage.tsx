import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import StudioCreateView from "@/pages/StudioApp/components/StudioCreateView";
import StudioGalleryView from "@/pages/StudioApp/components/StudioGalleryView";
import CanvasLabPage from "@/pages/CanvasLab/CanvasLabPage";
import { INITIAL_POST, ensureDistinctFamilies, type CanvasPostModel } from "@/pages/CanvasLab/components/types";
import {
  variationToCanvasModel,
  buildInitialFallbackVariations,
  buildExtraFallbackVariations,
} from "@/pages/StudioApp/lib/studioGeneration";

type ScreenStage = "create" | "gallery" | "editor";



export default function StudioAppPage() {
  const [stage, setStage] = useState<ScreenStage>("create");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");
  const [lastMode, setLastMode] = useState<"static" | "carousel">("static");
  const [generatedVariations, setGeneratedVariations] = useState<CanvasPostModel[]>([]);
  const [selectedPost, setSelectedPost] = useState<CanvasPostModel>(INITIAL_POST);

  const generateMutation = trpc.post.generate.useMutation();

  const handleCreateSubmit = async (promptText: string, mode: "static" | "carousel") => {
    setIsLoading(true);
    setLastPrompt(promptText);
    setLastMode(mode);
    toast.info("A IA está sintetizando copies e direções de arte oficiais...");

    try {
      const isUrl = promptText.startsWith("http://") || promptText.startsWith("https://");
      const result = await generateMutation.mutateAsync({
        inputType: isUrl ? "url" : "text",
        content: promptText,
        platform: "instagram",
        postMode: mode,
        model: "llama",
      });

      if (result?.variations && result.variations.length > 0) {
        const distinctVars = ensureDistinctFamilies(result.variations as any[]);
        const mapped = distinctVars.map((v: any, i: number) => variationToCanvasModel(v, i, promptText));
        setGeneratedVariations(mapped);
        setStage("gallery");
        toast.success(`${mapped.length} direções de arte criadas com IA!`);
      } else {
        throw new Error("Nenhuma variação gerada.");
      }
    } catch (err: any) {
      console.warn("[StudioApp] Fallback acionado:", err);
      // Fallback rico com 3 ângulos de copy genuinamente diferentes
      setGeneratedVariations(buildInitialFallbackVariations(promptText));
      setStage("gallery");
      toast.success("Direções de arte geradas!");
    } finally {
      setIsLoading(false);
    }
  };

  // Gerar mais 3 variações com IA e novas famílias oficiais
  const handleGenerateMore = async () => {
    setIsGeneratingMore(true);
    toast.info("A IA está criando 3 novos ângulos criativos...");

    try {
      // Chama a IA solicitando novas variações baseadas no tema
      const isUrl = lastPrompt.startsWith("http://") || lastPrompt.startsWith("https://");
      const result = await generateMutation.mutateAsync({
        inputType: isUrl ? "url" : "text",
        content: `Crie 3 novos ganchos criativos e direções de arte alternativas sobre: ${lastPrompt}`,
        platform: "instagram",
        postMode: lastMode,
        model: "llama",
      });

      if (result?.variations && result.variations.length > 0) {
        const offset = generatedVariations.length;
        const newMapped = result.variations.map((v, i) => variationToCanvasModel(v, offset + i, lastPrompt));
        setGeneratedVariations((prev) => [...prev, ...newMapped]);
        toast.success("3 novas direções de arte criadas com IA!");
      } else {
        throw new Error("Sem resposta da IA");
      }
    } catch (err: any) {
      console.warn("[StudioApp] Fallback inteligente de novas variações acionado:", err);
      // Fallback inteligente com 3 famílias complementares e 3 novos ganchos criativos
      setGeneratedVariations((prev) => [...prev, ...buildExtraFallbackVariations(lastPrompt)]);
      toast.success("3 novas direções de arte adicionadas à galeria!");
    } finally {
      setIsGeneratingMore(false);
    }
  };

  const handleSelectVariation = (post: CanvasPostModel) => {
    setSelectedPost(post);
    setStage("editor");
  };

  return (
    <div className="min-h-screen w-full bg-[#07090E] text-white flex flex-col overflow-hidden font-sans">
      {stage === "create" && (
        <StudioCreateView onSubmit={handleCreateSubmit} isLoading={isLoading} />
      )}

      {stage === "gallery" && (
        <StudioGalleryView
          variations={generatedVariations}
          onSelectVariation={handleSelectVariation}
          onBackToCreate={() => setStage("create")}
          onGenerateMore={handleGenerateMore}
          isGeneratingMore={isGeneratingMore}
        />
      )}

      {stage === "editor" && (
        <CanvasLabPage
          initialPost={selectedPost}
          onBackToGallery={() => setStage("gallery")}
        />
      )}
    </div>
  );
}
