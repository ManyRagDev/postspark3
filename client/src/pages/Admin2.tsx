import ComponentArsenalPanel from "./Admin2/ComponentArsenalPanel";
import { createArsenalFixturePost } from "./CanvasLab/lib/arsenalFixture";
import MatrixPanel from "./Admin2/MatrixPanel";
import ArsenalPanel from "./Admin2/ArsenalPanel";
import { compileMatrix, type MatrixInputs } from "./Admin2/matrixCompiler";
import {
  loadMatrixMedia,
  type ReferenceMediaImage,
} from "./Admin2/matrixMedia";
import CatalogPanel from "./Admin2/CatalogPanel";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Download,
  FileJson,
  ImagePlus,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  CanvasPostStage,
  type CanvasPostStageRef,
} from "@/pages/CanvasLab/components/CanvasPostStage";
import { ensureReferenceFontsLoaded } from "@/pages/CanvasLab/lib/referenceFonts";
import type { RecreationRecipe } from "@shared/designRecreation";
import type { CatalogBlueprint } from "@shared/designCatalog";
import { materializeReferenceDiagnostic } from "./Admin/referenceSceneCompiler";
import { unresolvedReferenceFonts } from "./Admin/referenceFontAssets";
import {
  createTextAdaptation,
  downloadRecipe,
  downloadUrl,
  finalizeRecipe,
  prepareReference,
  readAdmin2File,
  type TextAdaptation,
} from "./Admin2/recipe";
import {
  getRecreation,
  listRecreations,
  saveRecreation,
  type RecreationSummary,
} from "./Admin2/archive";

const card = "rounded-2xl border border-white/10 bg-white/[0.025] p-5";
const errorText = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Não foi possível concluir a operação.";

function RecipePreview({
  recipe,
  width,
  showMedia,
  mediaImages,
}: {
  recipe: RecreationRecipe;
  width: number;
  showMedia: boolean;
  mediaImages: ReferenceMediaImage[];
}) {
  const stage = useRef<CanvasPostStageRef>(null);
  const post = useMemo(
    () => materializeReferenceDiagnostic(recipe.scene),
    [recipe.scene]
  );
  return (
    <>
      <div className="my-4 flex min-h-72 w-full items-center justify-center overflow-hidden">
        <div
          className="relative"
          style={{
            width,
            height:
              (width * recipe.scene.source.heightPx) /
              recipe.scene.source.widthPx,
          }}
        >
          <CanvasPostStage
            ref={stage}
            post={post}
            diagnosticScene={recipe.scene}
            diagnosticTextMode="fixed-lines"
            diagnosticLayerStyles={recipe.adaptation?.layerStyles}
            diagnosticMediaImages={mediaImages}
            diagnosticNeutralFrame
            zoom={width / 360}
            isReadOnly
          />
          {showMedia &&
            !recipe.matrix &&
            recipe.missingElements.map((item, index) =>
              item.box &&
              item.role !== "texture" &&
              !/textura|granulad/i.test(item.description) ? (
                <div
                  key={index}
                  className="pointer-events-none absolute overflow-hidden border-2 border-dashed border-cyan-600 bg-cyan-400/10 p-1 text-[10px] font-medium text-cyan-950"
                  style={{
                    left: `${item.box.x * 100}%`,
                    top: `${item.box.y * 100}%`,
                    width: `${Math.min(item.box.width, 1 - item.box.x) * 100}%`,
                    height: `${Math.min(item.box.height, 1 - item.box.y) * 100}%`,
                  }}
                >
                  <span className="bg-cyan-100 px-1">
                    Área de mídia {index + 1}
                    {item.essential ? " · essencial" : ""}
                  </span>
                </div>
              ) : null
            )}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const png = stage.current?.exportPng4K();
          if (png)
            downloadUrl(png, `postspark-admin2-${recipe.id.slice(0, 8)}.png`);
        }}
      >
        <Download className="size-4" />
        Baixar PNG
      </Button>
    </>
  );
}

export default function Admin2() {
  const [,navigate] = useLocation();
  const [openingArsenal,setOpeningArsenal] = useState(false);
  const [arsenalError,setArsenalError] = useState("");
  const openArsenal = async () => {
    setOpeningArsenal(true);setArsenalError("");
    try { const model=await createArsenalFixturePost();sessionStorage.setItem("postspark.open_canvas_post",JSON.stringify({model,inputType:"text",inputContent:"Piloto administrativo Janelas V2"}));navigate("/thevoid"); }
    catch(error){setArsenalError(errorText(error));}
    finally{setOpeningArsenal(false);}
  };

  const decode = trpc.designDna.decodeRecreation.useMutation();
  const [reference, setReference] = useState<string | null>(null);
  const [originalHash, setOriginalHash] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<RecreationRecipe | null>(null);
  const [catalogImport, setCatalogImport] = useState<{
    id: string;
    blueprint: CatalogBlueprint;
  } | null>(null);
  const catalogSection = useRef<HTMLDivElement>(null);
  const [renderedRecipe, setRenderedRecipe] = useState<RecreationRecipe | null>(
    null
  );
  const [renderRevision, setRenderRevision] = useState(0);
  const [renderedMedia, setRenderedMedia] = useState<ReferenceMediaImage[]>([]);
  const [history, setHistory] = useState<RecreationSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showMedia, setShowMedia] = useState(false);
  const [textEdits, setTextEdits] = useState<TextAdaptation>({});
  const [referenceSize, setReferenceSize] = useState({ width: 1, height: 1 });
  const comparisonViewport = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(300);
  const dimensions = recipe?.scene.source;
  const ratio = dimensions
    ? dimensions.heightPx / dimensions.widthPx
    : referenceSize.height / referenceSize.width;
  const previewWidth = Math.max(1, Math.min(360, availableWidth, 550 / ratio));
  useEffect(() => {
    const observer = new ResizeObserver(entries =>
      setAvailableWidth(entries[0].contentRect.width)
    );
    if (comparisonViewport.current)
      observer.observe(comparisonViewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setTextEdits({});
  }, [recipe]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void listRecreations()
      .then(items => {
        if (mounted.current) setHistory(items);
      })
      .catch(cause => {
        if (mounted.current)
          setSaveMessage(
            `Arquivo local indisponível: ${errorText(cause)} Você ainda pode baixar a receita.`
          );
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const storeRecipe = async (next: RecreationRecipe, source: string | null) => {
    try {
      await saveRecreation({
        id: crypto.randomUUID(),
        recipe: next,
        reference: source,
        savedAt: new Date().toISOString(),
      });
      const items = await listRecreations();
      if (!mounted.current) return;
      setHistory(items);
      setSaveMessage(
        "Receita salva neste navegador. Baixe o JSON para guardar uma cópia portátil."
      );
    } catch (cause) {
      if (mounted.current)
        setSaveMessage(
          `O salvamento local falhou: ${errorText(cause)} Baixe o JSON para preservar esta receita.`
        );
    }
  };

  const upload = async (file: File) => {
    setBusy("Preparando imagem…");
    setError(null);
    try {
      const prepared = await prepareReference(file);
      setReference(prepared.dataUrl);
      setOriginalHash(prepared.originalHash);
      setReferenceSize({ width: prepared.width, height: prepared.height });
      setRecipe(null);
      setRenderedRecipe(null);
      setSaveMessage(null);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const analyze = async () => {
    if (!reference) return;
    setBusy("Decodificando a composição…");
    setError(null);
    setSaveMessage(null);
    try {
      const result = await decode.mutateAsync({ imageDataUrl: reference });
      result.scene.source.originalHash = originalHash;
      // A saída do modelo continua exportável mesmo se a preparação de fontes falhar.
      setRecipe(result);
      setRenderedRecipe(null);
      setBusy("Preparando fontes e receita…");
      let prepared = result;
      try {
        prepared = await finalizeRecipe(result);
      } catch (cause) {
        prepared = {
          ...result,
          notes: [
            ...result.notes,
            `Preparação incompleta: ${errorText(cause).slice(0, 400)}`,
          ],
        };
      }
      if (!mounted.current) return;
      setRecipe(prepared);
      await storeRecipe(prepared, reference);
    } catch (cause) {
      if (mounted.current) setError(errorText(cause));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const importRecipe = async (file: File) => {
    setBusy("Abrindo arquivo…");
    setError(null);
    setSaveMessage(null);
    try {
      const result = await readAdmin2File(file);
      if (result.kind === "blueprint") {
        if (recipe?.matrix) {
          setRecipe(null);
          setRenderedRecipe(null);
          setReference(null);
        }
        setCatalogImport({
          id: crypto.randomUUID(),
          blueprint: result.blueprint,
        });
        setSaveMessage(
          "Blueprint aberto na seção 4. Use Conferir adaptação para visualizar. O rascunho ainda não foi salvo no catálogo."
        );
        catalogSection.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        catalogSection.current?.focus({ preventScroll: true });
        return;
      }
      const imported = result.recipe;
      setRecipe(imported);
      setReference(null);
      setOriginalHash(null);
      setRenderedRecipe(null);
      await storeRecipe(imported, null);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const recreate = async () => {
    if (!recipe) return;
    setBusy("Recriando a partir da receita…");
    setError(null);
    try {
      await ensureReferenceFontsLoaded(recipe.scene);
      const media = await loadMatrixMedia(recipe);
      setRenderedMedia(media);
      setRenderedRecipe(recipe);
      setRenderRevision(value => value + 1);
    } catch (cause) {
      setError(
        `Não foi possível preparar fontes ou mídia: ${errorText(cause)}`
      );
    } finally {
      setBusy(null);
    }
  };

  const applyMatrix = async (input: MatrixInputs) => {
    if (!recipe?.matrix) return;
    setBusy("Aplicando conteúdo à matriz…");
    setError(null);
    try {
      const next = await compileMatrix(recipe, input);
      const media = await loadMatrixMedia(next);
      setRecipe(next);
      setRenderedMedia(media);
      setRenderedRecipe(next);
      setRenderRevision(value => value + 1);
      await storeRecipe(next, reference);
    } finally {
      setBusy(null);
    }
  };

  const prepareAgain = async () => {
    if (!recipe) return;
    setBusy("Preparando fontes…");
    setError(null);
    try {
      const prepared = await finalizeRecipe(createTextAdaptation(recipe, {}));
      setRecipe(prepared);
      setRenderedRecipe(null);
      await storeRecipe(prepared, reference);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const adaptText = async () => {
    if (!recipe) return;
    setBusy("Preparando adaptação…");
    setError(null);
    try {
      const prepared = await finalizeRecipe(
        createTextAdaptation(recipe, textEdits)
      );
      setRecipe(prepared);
      setRenderedRecipe(null);
      await storeRecipe(prepared, reference);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const openSaved = async (id: string) => {
    if (!id) return;
    setBusy("Reabrindo receita…");
    setError(null);
    try {
      const record = await getRecreation(id);
      setRecipe(record.recipe);
      setReference(record.reference);
      setOriginalHash(record.recipe.scene.source.originalHash);
      setRenderedRecipe(null);
      setSaveMessage("Receita reaberta do arquivo local, sem nova análise.");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const missingFonts = recipe ? unresolvedReferenceFonts(recipe.scene) : [];
  const recipePreview = useMemo(
    () =>
      recipe
        ? JSON.stringify(
            {
              ...recipe,
              ...(recipe.matrix
                ? {
                    matrix: {
                      ...recipe.matrix,
                      media: recipe.matrix.media.map(m => ({
                        ...m,
                        asset: m.asset
                          ? {
                              ...m.asset,
                              dataUrl: "[foto incorporada no JSON baixado]",
                            }
                          : null,
                      })),
                    },
                  }
                : {}),
              scene: {
                ...recipe.scene,
                fonts: recipe.scene.fonts.map(font => ({
                  ...font,
                  dataUrl: font.dataUrl
                    ? "[arquivo de fonte incorporado no JSON baixado]"
                    : null,
                })),
              },
            },
            null,
            2
          )
        : "",
    [recipe]
  );

  return (
    <main className="min-h-screen bg-[#080d14] px-4 pb-16 pt-24 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Admin2 · laboratório privado
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Da referência à adaptação
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
              Preserve a hierarquia e a personalidade do design com uma receita
              que você pode reutilizar.
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:text-white"
          >
            Abrir laboratório completo
          </Link>
        </header>

        <section className={card}><h2 className="text-lg font-semibold">Piloto Janelas no CanvasLab</h2><p className="my-2 text-sm text-slate-400">Variante explícita 5:6 em revisão visual. Edite texto, envie sua foto e salve pelo editor oficial.</p><Button disabled={openingArsenal} onClick={openArsenal}>{openingArsenal?"Carregando fontes…":"Abrir piloto de janelas"}</Button>{arsenalError&&<p role="alert" className="mt-2 text-sm text-red-300">{arsenalError}</p>}</section>
        <div
          className="flex flex-wrap items-center gap-2 text-xs text-slate-400"
          aria-label="Etapas"
        >
          <span className="rounded-full bg-white/5 px-3 py-1.5">1. Imagem</span>
          <ArrowRight className="size-3" />
          <span className="rounded-full bg-white/5 px-3 py-1.5">
            2. Receita salva
          </span>
          <ArrowRight className="size-3" />
          <span className="rounded-full bg-white/5 px-3 py-1.5">
            3. Recriação
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-400">
            Reabrir
            <select
              aria-label="Receitas salvas"
              disabled={Boolean(busy)}
              value=""
              onChange={event => void openSaved(event.target.value)}
              className="ml-2 max-w-[260px] rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-slate-100"
            >
              <option value="">
                {history.length
                  ? `${history.length} receitas neste navegador`
                  : "Nenhuma receita salva"}
              </option>
              {history.map(item => (
                <option value={item.id} key={item.id}>
                  {item.title} ·{" "}
                  {new Date(item.savedAt).toLocaleString("pt-BR")}
                </option>
              ))}
            </select>
          </label>
          <label
            className={`relative inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm ${busy ? "opacity-50" : "cursor-pointer hover:bg-white/5"}`}
          >
            <FileJson className="size-4" />
            Importar JSON · receita ou blueprint
            <input
              aria-label="Importar JSON: receita ou blueprint"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
              disabled={Boolean(busy)}
              type="file"
              accept="application/json,.json"
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importRecipe(file);
              }}
            />
          </label>
        </div>
        {busy && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-cyan-300"
          >
            <Loader2 className="size-4 animate-spin" />
            {busy}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className={card}>
            <h2 className="flex min-h-9 items-center text-lg font-semibold">
              1. Referência
            </h2>
            <div
              ref={comparisonViewport}
              className="my-4 flex min-h-72 items-center justify-center overflow-hidden bg-black/20"
            >
              {reference ? (
                <img
                  src={reference}
                  alt="Post original para comparação"
                  style={{ width: previewWidth, height: previewWidth * ratio }}
                  className="block object-contain"
                />
              ) : (
                <p className="max-w-xs text-center text-sm leading-relaxed text-slate-500">
                  {recipe
                    ? "A receita importada pode ser recriada sem a imagem original."
                    : "Escolha uma imagem PNG, JPEG ou WebP de até 12 MB."}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label
                className={`relative inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm ${busy ? "opacity-50" : "cursor-pointer hover:bg-white/5"}`}
              >
                <ImagePlus className="size-4" />
                {reference || recipe ? "Nova imagem" : "Escolher imagem"}
                <input
                  aria-label="Escolher imagem de referência"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
                  disabled={Boolean(busy)}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload(file);
                  }}
                />
              </label>
              <Button
                disabled={!reference || Boolean(busy)}
                onClick={() => void analyze()}
                className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              >
                Decodificar imagem
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </section>

          <section className={card}>
            <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">3. Adaptação da receita</h2>
              <Button
                size="sm"
                variant="outline"
                disabled={!recipe || Boolean(busy)}
                onClick={() => void recreate()}
              >
                <RotateCcw className="size-4" />
                {renderedRecipe ? "Recriar novamente" : "Recriar"}
              </Button>
            </div>
            {renderedRecipe ? (
              <RecipePreview
                key={`${renderedRecipe.id}-${renderRevision}`}
                recipe={renderedRecipe}
                width={previewWidth}
                showMedia={showMedia}
                mediaImages={renderedMedia}
              />
            ) : (
              <div
                className="my-4 flex min-h-72 items-center justify-center text-center text-sm text-slate-500"
                style={recipe ? { height: previewWidth * ratio } : undefined}
              >
                {recipe
                  ? "Receita pronta. Clique em Recriar para desenhá-la no CanvasLab."
                  : "A adaptação aparecerá aqui depois da decodificação."}
              </div>
            )}
            {recipe &&
              !recipe.matrix &&
              recipe.missingElements.some(item => item.box) && (
                <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={showMedia}
                    onChange={event => setShowMedia(event.target.checked)}
                  />
                  Mostrar áreas de mídia · guias fora do PNG
                </label>
              )}
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Recriar usa os dados salvos e não faz outra chamada de IA. Compare
              posição, proporção, fonte e efeitos com a referência.
            </p>
          </section>
        </div>

        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">2. Receita intermediária</h2>
            <Button
              variant="outline"
              size="sm"
              disabled={!recipe || Boolean(busy)}
              onClick={() => recipe && downloadRecipe(recipe)}
            >
              <Download className="size-4" />
              Baixar receita JSON
            </Button>
          </div>
          {recipe ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="font-medium">{recipe.title}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {recipe.scene.source.widthPx} × {recipe.scene.source.heightPx}{" "}
                  px · {recipe.scene.layers.length} camadas ·{" "}
                  {recipe.scene.fonts.filter(font => font.dataUrl).length}{" "}
                  fontes incorporadas
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Modelo: {recipe.model} ·{" "}
                  {recipe.usage.inputTokens + recipe.usage.outputTokens} tokens
                  · {recipe.provider ?? "provedor não informado"}
                </p>
                {recipe.adaptation?.parentRecipeId && (
                  <p className="mt-1 text-xs text-cyan-300">
                    Adaptação local · os tokens acima pertencem à análise de
                    origem.
                  </p>
                )}
              </div>
              {saveMessage && (
                <p role="status" className="text-xs text-slate-400">
                  {saveMessage}
                </p>
              )}
              {recipe.missingElements.length > 0 &&
                !(
                  recipe.matrix?.media.length &&
                  recipe.matrix.media.every(m => m.asset)
                ) && (
                  <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">
                    <p className="font-medium">
                      Recriação parcial · elementos ainda sem representação
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {recipe.missingElements.map((item, index) => (
                        <li key={index}>
                          {item.essential && (
                            <strong>Essencial à composição · </strong>
                          )}
                          {item.description}: {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              {missingFonts.length > 0 && (
                <p className="text-sm text-amber-200">
                  Fontes pendentes: {missingFonts.join("; ")}. A prévia usará
                  substituição do navegador, e a aparência pode variar em outro
                  computador.
                </p>
              )}
              {recipe.matrix ? (
                <MatrixPanel
                  key={recipe.id}
                  recipe={recipe}
                  disabled={Boolean(busy)}
                  onApply={applyMatrix}
                />
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(busy)}
                    onClick={() => void prepareAgain()}
                  >
                    Preparar fontes e encaixe · sem IA
                  </Button>
                  <details className="rounded-xl border border-white/10 p-3">
                    <summary className="cursor-pointer text-sm text-slate-300">
                      Experimentar outros textos e fontes
                    </summary>
                    <p className="my-3 text-xs text-slate-400">
                      Cada campo corresponde a uma linha da composição. Use uma
                      família do Google Fonts e mantenha textos de tamanho
                      parecido. A adaptação será salva como outra receita.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {recipe.scene.layers
                        .filter(layer => layer.text !== null)
                        .map(layer => {
                          const edit = textEdits[layer.id] ?? {
                            text: layer.text ?? "",
                            family: layer.fontFamily ?? "",
                            weight: layer.fontWeight,
                          };
                          return (
                            <div
                              key={layer.id}
                              className="space-y-2 rounded-lg bg-black/20 p-3"
                            >
                              <label className="block text-xs text-slate-400">
                                {layer.role} · {layer.id}
                                <textarea
                                  disabled={Boolean(busy)}
                                  maxLength={1200}
                                  value={edit.text}
                                  onChange={event =>
                                    setTextEdits(current => ({
                                      ...current,
                                      [layer.id]: {
                                        ...edit,
                                        text: event.target.value,
                                      },
                                    }))
                                  }
                                  className="mt-1 block w-full rounded border border-white/15 bg-slate-950 p-2 text-sm text-white"
                                />
                              </label>
                              <label className="block text-xs text-slate-400">
                                Família da fonte
                                <input
                                  disabled={Boolean(busy)}
                                  maxLength={120}
                                  value={edit.family}
                                  onChange={event =>
                                    setTextEdits(current => ({
                                      ...current,
                                      [layer.id]: {
                                        ...edit,
                                        family: event.target.value,
                                      },
                                    }))
                                  }
                                  className="mt-1 block w-full rounded border border-white/15 bg-slate-950 p-2 text-sm text-white"
                                />
                              </label>
                              <label className="block text-xs text-slate-400">
                                Peso disponível na família
                                <select
                                  disabled={Boolean(busy)}
                                  value={edit.weight}
                                  onChange={event =>
                                    setTextEdits(current => ({
                                      ...current,
                                      [layer.id]: {
                                        ...edit,
                                        weight: Number(event.target.value),
                                      },
                                    }))
                                  }
                                  className="ml-2 rounded border border-white/15 bg-slate-950 p-1 text-sm text-white"
                                >
                                  {[
                                    100, 200, 300, 400, 500, 600, 700, 800, 900,
                                  ].map(weight => (
                                    <option key={weight} value={weight}>
                                      {weight}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          );
                        })}
                    </div>
                    <Button
                      className="mt-3"
                      disabled={
                        Boolean(busy) || Object.keys(textEdits).length === 0
                      }
                      onClick={() => void adaptText()}
                    >
                      Criar e salvar adaptação · sem IA
                    </Button>
                  </details>
                </>
              )}
              {recipe.notes.length > 0 && (
                <details className="rounded-xl border border-white/10 p-3">
                  <summary className="cursor-pointer text-sm text-slate-300">
                    Observações da receita ({recipe.notes.length})
                  </summary>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
                    {recipe.notes.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                </details>
              )}
              <details className="rounded-xl border border-white/10 p-3">
                <summary className="cursor-pointer text-sm text-slate-300">
                  Ver estrutura JSON (sem arquivos incorporados)
                </summary>
                <p className="mt-2 text-xs text-slate-500">
                  Esta prévia omite os arquivos de fontes e fotos. Para reabrir
                  a composição, use Baixar receita JSON.
                </p>
                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-400">
                  {recipePreview}
                </pre>
              </details>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              A decodificação produzirá um JSON com a composição e as limitações
              encontradas. Você poderá salvá-lo e importá-lo em outra sessão.
            </p>
          )}
        </section>
        <ComponentArsenalPanel/>
        <ArsenalPanel/>
        <div
          ref={catalogSection}
          tabIndex={-1}
          aria-label="Catálogo para geração"
          className="scroll-mt-24"
        >
          {recipe?.matrix ? (
            <p className="rounded-xl border border-white/10 p-4 text-sm text-slate-400">
              Esta matriz com múltiplos campos e mídia está em validação no
              laboratório. A publicação no catálogo do gerador será uma etapa
              posterior.
            </p>
          ) : (
            <CatalogPanel
              key={catalogImport?.id ?? "catalog"}
              recipe={recipe}
              initialBlueprint={catalogImport?.blueprint}
            />
          )}
        </div>
        <p className="text-xs text-slate-500">
          O arquivo local pertence a este navegador e pode ser removido ao
          limpar os dados do site.
        </p>
      </div>
    </main>
  );
}
