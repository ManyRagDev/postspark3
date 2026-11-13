import React, { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { DesignExtractionReviewModal } from "./DesignExtractionReviewModal";
import type { DesignExtraction } from "@shared/designExtraction";
import {
  Upload,
  Globe,
  Sparkles,
  Loader2,
  Monitor,
  Smartphone,
  FileUp,
} from "lucide-react";

interface TemplateIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string | null;
  onProjectCreatedOrUpdated?: (projectId: string) => void;
}

export function TemplateIngestionModal({
  isOpen,
  onClose,
  projectId: initialProjectId,
  onProjectCreatedOrUpdated,
}: TemplateIngestionModalProps) {
  const [activeTab, setActiveTab] = useState<"url" | "upload">("url");
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState("");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);

  // Armazena a extração resultante para a tela de revisão e aprovação das intenções
  const [reviewData, setReviewData] = useState<{
    extraction: DesignExtraction;
    previewDataUrl: string;
    sourceUrl: string | null;
    projectId: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // tRPC Mutations
  const extractDesignMutation = trpc.templateIngestion?.extractDesign?.useMutation
    ? trpc.templateIngestion.extractDesign.useMutation()
    : { mutateAsync: async (_args: any) => ({ extraction: {} as any, previewDataUrl: "", sourceUrl: null, fontsDetected: [] as string[] }) };

  const upsertProjectMutation = trpc.brandProjects?.upsert?.useMutation
    ? trpc.brandProjects.upsert.useMutation()
    : { mutateAsync: async (_args: any) => ({ success: true, project: { id: "mock-proj" } }) };

  // Suporte a Ctrl+V para colar prints diretamente da área de transferência
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = event => {
              const res = event.target?.result as string;
              setUploadedImageDataUrl(res);
              setActiveTab("upload");
              toast.success("Print colado da área de transferência!");
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem válido (PNG, JPG, WebP).");
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      toast.error("A imagem excede o limite máximo de 12 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      const res = event.target?.result as string;
      setUploadedImageDataUrl(res);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem válido (PNG, JPG, WebP).");
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      const res = event.target?.result as string;
      setUploadedImageDataUrl(res);
    };
    reader.readAsDataURL(file);
  };

  // Garante a existência de um projeto: se o usuário estiver "Sem projeto", cria um automaticamente
  const ensureProjectId = async (inferredName: string): Promise<string> => {
    if (initialProjectId && initialProjectId.trim().length > 0) {
      return initialProjectId;
    }

    // Criar projeto automaticamente
    const created = await upsertProjectMutation.mutateAsync({
      name: inferredName,
      niche: "Geral",
      sourceType: activeTab === "url" ? "website" : "external_prompt",
      structuredData: {
        offerAndTransformation: `Projeto criado via extração de design: ${inferredName}`,
        factualDifferentials: "",
        targetAudience: "",
        painsAndObjections: "",
        voiceTone: "",
        forbiddenTerms: "",
        defaultCta: "",
      },
      compiledDocument: `Projeto de design criado a partir de ${inferredName}`,
      isDefault: false,
    });

    const newId = created.project.id;
    onProjectCreatedOrUpdated?.(newId);
    return newId;
  };

  const handleStartIngestion = async () => {
    setIsProcessing(true);
    setProcessingStep(1);

    const stepInterval = setInterval(() => {
      setProcessingStep(prev => (prev < 3 ? prev + 1 : prev));
    }, 2800);

    try {
      let inferredName = "Novo Projeto Ingerido";
      if (activeTab === "url") {
        if (!targetUrl.trim()) {
          toast.error("Digite o endereço (URL) do site de referência.");
          setIsProcessing(false);
          clearInterval(stepInterval);
          return;
        }
        try {
          const parsed = new URL(targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`);
          inferredName = parsed.hostname.replace(/^www\./, "");
        } catch {
          inferredName = "Website Ingerido";
        }
      } else {
        if (!uploadedImageDataUrl) {
          toast.error("Selecione ou cole uma imagem para continuar.");
          setIsProcessing(false);
          clearInterval(stepInterval);
          return;
        }
        inferredName = "Design Ingerido";
      }

      // Regra de negócio: garante um projeto para isolamento estrito
      const targetProjectId = await ensureProjectId(inferredName);

      if (activeTab === "url") {
        let formattedUrl = targetUrl.trim();
        if (!/^https?:\/\//i.test(formattedUrl)) {
          formattedUrl = `https://${formattedUrl}`;
        }

        const result = await extractDesignMutation.mutateAsync({
          projectId: targetProjectId,
          url: formattedUrl,
          viewport,
        });

        clearInterval(stepInterval);
        setReviewData({
          extraction: result.extraction,
          previewDataUrl: result.previewDataUrl,
          sourceUrl: result.sourceUrl,
          projectId: targetProjectId,
        });
      } else {
        const result = await extractDesignMutation.mutateAsync({
          projectId: targetProjectId,
          imageDataUrl: uploadedImageDataUrl!,
          viewport: "desktop",
        });

        clearInterval(stepInterval);
        setReviewData({
          extraction: result.extraction,
          previewDataUrl: result.previewDataUrl,
          sourceUrl: null,
          projectId: targetProjectId,
        });
      }
    } catch (error) {
      clearInterval(stepInterval);
      toast.error(error instanceof Error ? error.message : "Falha na extração de design.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseAll = () => {
    setReviewData(null);
    setUploadedImageDataUrl(null);
    setTargetUrl("");
    setIsProcessing(false);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen && !reviewData} onOpenChange={open => !open && handleCloseAll()}>
        <DialogContent className="max-w-[580px] sm:max-w-[580px] p-0 gap-0 bg-[#0e1117] border-white/10 text-white overflow-hidden shadow-2xl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10 bg-[#131720]">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <Sparkles className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white">
                  Replicar Design & Extrair DNA
                </DialogTitle>
                <DialogDescription className="text-xs text-white/50 mt-0.5">
                  Informe uma URL ou print: a IA absorve a identidade estética e cria posts prontos com propósitos editoriais.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-5">
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
              <TabsList className="grid grid-cols-2 bg-black/40 border border-white/10 h-10 p-1">
                <TabsTrigger value="url" className="text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                  <Globe className="size-3.5 mr-1.5" />
                  Site ou página
                </TabsTrigger>
                <TabsTrigger value="upload" className="text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                  <Upload className="size-3.5 mr-1.5" />
                  Print ou Imagem
                </TabsTrigger>
              </TabsList>

              {/* ABA 1: URL COM LEITURA REAL DE CSS E FONTES */}
              <TabsContent value="url" className="pt-4 space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/70">
                      Endereço do Site / Landing Page
                    </label>
                    <div className="relative">
                      <Globe className="size-4 absolute left-3 top-2.5 text-white/40" />
                      <Input
                        value={targetUrl}
                        onChange={e => setTargetUrl(e.target.value)}
                        placeholder="https://exemplo.com.br/amigo-secreto"
                        className="pl-9 h-9 text-xs bg-black/40 border-white/15 text-white placeholder:text-white/30"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-white/60">Dispositivo da Captura</span>
                    <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setViewport("desktop")}
                        className={`text-xs px-2.5 py-1 rounded flex items-center gap-1 transition ${
                          viewport === "desktop"
                            ? "bg-orange-500 text-white font-medium"
                            : "text-white/60 hover:text-white"
                        }`}
                      >
                        <Monitor className="size-3" />
                        Desktop
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewport("mobile")}
                        className={`text-xs px-2.5 py-1 rounded flex items-center gap-1 transition ${
                          viewport === "mobile"
                            ? "bg-orange-500 text-white font-medium"
                            : "text-white/60 hover:text-white"
                        }`}
                      >
                        <Smartphone className="size-3" />
                        Mobile
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] text-white/50 leading-relaxed">
                    Vamos identificar as cores, as fontes e o estilo do site para criar de 3 a 5 propostas de posts editáveis.
                  </div>
                </div>
              </TabsContent>

              {/* ABA 2: UPLOAD DE PRINT OU IMAGEM */}
              <TabsContent value="upload" className="pt-4 space-y-4">
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition ${
                    uploadedImageDataUrl
                      ? "border-orange-500/50 bg-orange-500/[0.04]"
                      : "border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                  />

                  {uploadedImageDataUrl ? (
                    <div className="space-y-3">
                      <div className="relative max-h-48 max-w-[280px] mx-auto rounded-lg overflow-hidden border border-white/20 shadow-lg">
                        <img
                          src={uploadedImageDataUrl}
                          alt="Prévia enviada"
                          className="max-h-48 w-auto object-contain mx-auto"
                        />
                      </div>
                      <div className="text-xs text-orange-400 font-medium">
                        Imagem carregada · Clique ou arraste para trocar
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 py-4">
                      <div className="size-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/60">
                        <FileUp className="size-6 text-orange-400/90" />
                      </div>
                      <div className="text-sm font-medium text-white/90">
                        Arraste seu print aqui ou clique para selecionar
                      </div>
                      <div className="text-xs text-white/40">
                        Dica: Pressione <kbd className="px-1 py-0.5 bg-white/10 rounded text-[10px] font-mono">Ctrl+V</kbd> para colar direto da área de transferência.
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* Progresso de análise */}
            {isProcessing && (
              <div className="p-4 rounded-xl border border-orange-500/30 bg-orange-500/10 space-y-2 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-orange-400">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Absorvendo DNA e Desdobrando Intenções...</span>
                  </div>
                  <span className="text-[10px] font-mono text-orange-400/80">Etapa {processingStep}/3</span>
                </div>
                <div className="text-[11px] text-white/70">
                  {processingStep === 1 && (activeTab === "url" ? "Capturando screenshot e inspecionando CSS real..." : "Processando imagem da referência...")}
                  {processingStep === 2 && "Identificando movimento de design, paleta funcional e fontes..."}
                  {processingStep === 3 && "Curando conteúdo e compondo posts de rede social..."}
                </div>
              </div>
            )}

            {/* Botão de Ação */}
            <div className="pt-2">
              <Button
                onClick={handleStartIngestion}
                disabled={isProcessing || (activeTab === "upload" && !uploadedImageDataUrl) || (activeTab === "url" && !targetUrl.trim())}
                className="w-full h-10 bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs shadow-lg shadow-orange-600/20"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Extraindo DNA Criativo...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 mr-2" />
                    Extrair DNA & Criar Variações
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Revisão & Aprovação das Intenções (3 colunas com Konva 2D) */}
      {reviewData && (
        <DesignExtractionReviewModal
          isOpen={Boolean(reviewData)}
          onClose={handleCloseAll}
          extraction={reviewData.extraction}
          previewDataUrl={reviewData.previewDataUrl}
          sourceUrl={reviewData.sourceUrl}
          projectId={reviewData.projectId}
          onExtractionSaved={onProjectCreatedOrUpdated}
        />
      )}
    </>
  );
}
