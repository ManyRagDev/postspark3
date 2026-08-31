import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import StudioCreateViewV2B from "./components/v2/StudioCreateViewV2B";
import StudioGalleryView from "./components/StudioGalleryView";
import CanvasLabPage from "@/pages/CanvasLab/CanvasLabPage";
import { INITIAL_POST, ensureDistinctFamilies, type CanvasPostModel } from "@/pages/CanvasLab/components/types";
import {
  variationToCanvasModel,
  buildInitialFallbackVariations,
  buildExtraFallbackVariations,
  buildTasteInstruction,
} from "./lib/studioGeneration";

type ScreenStage = "create" | "gallery" | "editor";

/**
 * Rota experimental `/studio-v2b` — mesma máquina de estados do fluxo Studio,
 * com a tela de criação regularizada (StudioCreateViewV2B) e a "direção de
 * gosto": a família declarada na prateleira viaja como instrução dentro do
 * `content` do `post.generate` (apenas para input de texto — em URL, a
 * identidade extraída do site prevalece). O motor não é alterado.
 */
export default function StudioAppV2BPage() {
  const [stage, setStage] = useState<ScreenStage>("create");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");
  const [lastMode, setLastMode] = useState<"static" | "carousel">("static");
  const [generatedVariations, setGeneratedVariations] = useState<CanvasPostModel[]>([]);
  const [selectedPost, setSelectedPost] = useState<CanvasPostModel>(INITIAL_POST);
  const [declaredFamilyId, setDeclaredFamilyId] = useState<string | null>(null);

  const generateMutation = trpc.post.generate.useMutation();

  const handleCreateSubmit = async (promptText: string, mode: "static" | "carousel") => {
    setIsLoading(true);
    setLastPrompt(promptText);
    setLastMode(mode);

    try {
      const isUrl = promptText.startsWith("http://") || promptText.startsWith("https://");
      // A instrução de gosto só é injetada em texto livre: em URL, o `content`
      // é usado pelo backend como endereço a raspar — nunca contaminar.
      const tasteInstruction =
        !isUrl && declaredFamilyId ? buildTasteInstruction(declaredFamilyId) : "";
      const result = await generateMutation.mutateAsync({
        inputType: isUrl ? "url" : "text",
        content: `${promptText}${tasteInstruction}`,
        platform: "instagram",
        postMode: mode,
        model: "llama",
      });

      if (result?.variations && result.variations.length > 0) {
        const distinctVars = ensureDistinctFamilies(result.variations as any[]);
        const mapped = distinctVars.map((v: any, i: number) => variationToCanvasModel(v, i, promptText));

        if (declaredFamilyId && !isUrl) {
          const tasteMatched = mapped.some((v) => v.familyId === declaredFamilyId);
          if (!tasteMatched) {
            toast.info("A IA explorou outras direções; seu gosto foi considerado, mas não prevaleceu.");
          }
        }

        setGeneratedVariations(mapped);
        setStage("gallery");
        toast.success(`${mapped.length} direções de arte criadas com IA!`);
      } else {
        throw new Error("Nenhuma variação gerada.");
      }
    } catch (err: any) {
      console.warn("[StudioAppV2B] Fallback acionado:", err);
      setGeneratedVariations(buildInitialFallbackVariations(promptText, declaredFamilyId ?? undefined));
      setStage("gallery");
      toast.success("Direções de arte geradas!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateMore = async () => {
    setIsGeneratingMore(true);
    toast.info("A IA está criando 3 novos ângulos criativos...");

    try {
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
      console.warn("[StudioAppV2B] Fallback inteligente de novas variações acionado:", err);
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
    <div className="min-h-screen w-full bg-[#0B0A08] text-white flex flex-col overflow-hidden font-sans">
      {stage === "create" && (
        <StudioCreateViewV2B
          onSubmit={handleCreateSubmit}
          isLoading={isLoading}
          declaredFamilyId={declaredFamilyId}
          onDeclareFamily={setDeclaredFamilyId}
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
        />
      )}
    </div>
  );
}
