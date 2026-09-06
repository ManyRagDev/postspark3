import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import StudioCreateViewV2B from "./components/v2/StudioCreateViewV2B";
import StudioGalleryView from "./components/StudioGalleryView";
import CanvasLabPage from "@/pages/CanvasLab/CanvasLabPage";
import { INITIAL_POST, ensureDistinctFamilies, type CanvasPostModel } from "@/pages/CanvasLab/components/types";
import { normalizeCanvasModel } from "@/pages/CanvasLab/lib/saveAdapter";
import {
  canvasModelToSavePayload,
  canvasModelToUpdatePayload,
  type SaveInputType,
} from "@/pages/CanvasLab/lib/saveAdapter";
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
  const [, setLocation] = useLocation();
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
  const [selectedPost, setSelectedPost] = useState<CanvasPostModel>(INITIAL_POST);
  const [declaredFamilyId, setDeclaredFamilyId] = useState<string | null>(null);
  /** Item 7: id do post salvo vinculado à sessão do editor (habilita "Atualizar"). */
  const [savedPostId, setSavedPostId] = useState<number | null>(null);

  const generateMutation = trpc.post.generate.useMutation();
  const saveMutation = trpc.post.save.useMutation();
  const updateMutation = trpc.post.update.useMutation();

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
        setSavedPostId(typeof payload.postId === "number" ? payload.postId : null);
        setLastInputMeta({
          inputType: payload.inputType === "url" ? "url" : payload.inputType === "image" ? "image" : "text",
          inputContent: payload.inputContent || "",
        });
      }
    } catch {
      /* payload corrompido — ignora e segue para a tela de criação */
    } finally {
      sessionStorage.removeItem("postspark.open_canvas_post");
    }
  }, []);

  const handleCreateSubmit = async (promptText: string, mode: "static" | "carousel") => {
    setIsLoading(true);
    setLastPrompt(promptText);
    setLastMode(mode);
    const isUrl = promptText.startsWith("http://") || promptText.startsWith("https://");
    setLastInputMeta({ inputType: isUrl ? "url" : "text", inputContent: promptText });
    setSavedPostId(null);

    try {
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
        const distinctVars = ensureDistinctFamilies(result.variations as any[], promptText);
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
        const distinctVars = ensureDistinctFamilies(result.variations as any[], `${lastPrompt}:${offset}`);
        const newMapped = distinctVars.map((v, i) => variationToCanvasModel(v, offset + i, lastPrompt));
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

  // ─── Item 7: salvar / atualizar ───
  const handleSavePost = async (post: CanvasPostModel, mode: "new" | "update"): Promise<boolean> => {
    if (isSaving) return false;
    setIsSaving(true);
    try {
      if (mode === "update" && savedPostId) {
        await updateMutation.mutateAsync({ id: savedPostId, ...canvasModelToUpdatePayload(post) });
        toast.success("Post atualizado na sua biblioteca!", {
          action: { label: "Ver salvos", onClick: () => setLocation("/saved-posts") },
        });
      } else {
        const result = await saveMutation.mutateAsync(
          canvasModelToSavePayload(post, lastInputMeta),
        );
        setSavedPostId(result.id);
        toast.success("Post salvo na sua biblioteca!", {
          action: { label: "Ver salvos", onClick: () => setLocation("/saved-posts") },
        });
      }
      return true;
    } catch (err: any) {
      const message = err?.message || "Não foi possível salvar o post agora.";
      toast.error(message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Item 6: recomeçar do zero ───
  const handleRestart = () => {
    setStage("create");
    setGeneratedVariations([]);
    setSelectedPost(INITIAL_POST);
    setDeclaredFamilyId(null);
    setSavedPostId(null);
    setLastInputMeta({ inputType: "text", inputContent: "" });
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
          onRestart={handleRestart}
          onSave={handleSavePost}
          hasSavedPost={savedPostId !== null}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
