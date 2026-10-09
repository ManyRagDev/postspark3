import { useEffect, useMemo, useRef, useState } from "react";
import { trpc as trpcHooks } from "@/lib/trpc";
import { CanvasPostStage } from "@/pages/CanvasLab/components/CanvasPostStage";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, CircleAlert, Download, FlaskConical, FolderOpen, HardDrive, ImagePlus, RotateCcw, Sparkles, Type, X } from "lucide-react";
import type { DesignDnaAnalysis, DesignEntropyProfile, DesignFontCandidate, NormalizedDesignBox } from "@shared/designDna";
import { REFERENCE_RENDERER_VERSION, referenceSceneIssues, type ReferenceReconstructionSpecV2 } from "@shared/referenceReconstruction";
import { loadFont } from "@/lib/fonts";
import {
  compileAdminPreview,
  DESIGN_BLUEPRINTS,
  type DesignBlueprintId,
  ZERO_ENTROPY,
} from "./designBlueprints";
import {
  createDesignDnaArchiveId,
  downloadDesignDnaEvaluationPacket,
  downloadDesignDnaReproductionBundle,
  getDesignDnaRecord,
  hashReferenceScene,
  importDesignDnaReproductionBundle,
  listDesignDnaRecords,
  saveDesignDnaRecord,
  type DesignDnaArchiveRecord,
  type DesignDnaArchiveSummary,
  type DesignDnaPieceReview,
} from "./designDnaArchive";
import { ReferenceSceneWorkbench } from "./ReferenceSceneWorkbench";
import { visualComparisonPass } from "./referenceSceneComparison";
import { captureReferenceFonts, unresolvedReferenceFonts } from "./referenceFontAssets";
import { materializeReferenceDiagnostic, sceneFromAnalysis } from "./referenceSceneCompiler";

const STORAGE_KEY = "postspark.admin.design-dna-draft.v1";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type PieceReview = DesignDnaPieceReview;

type StoredDraft = {
  analysis?: DesignDnaAnalysis;
  reviews: Record<string, PieceReview>;
  blueprintId: DesignBlueprintId;
  headline: string;
  subtext: string;
  categoryHint: string;
  entropy: DesignEntropyProfile;
  selectedFontId?: string;
  selectedFontCandidate?: DesignFontCandidate;
  referenceHeadline?: string;
  referenceSupport?: string;
  fontQuery?: string;
  reconstructionAccepted?: boolean;
  archiveId?: string;
  archiveCreatedAt?: string;
  archiveTitle?: string;
  originalAnalysis?: DesignDnaAnalysis;
  originalAnalysisCaptured?: boolean;
};

const DEFAULT_HEADLINE = "Boas ideias precisam de uma forma que sustente a leitura";
const DEFAULT_SUBTEXT = "A estrutura orienta o olhar; a entropia controlada impede que o resultado pareça um template genérico.";

function readDraft(): StoredDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredDraft : null;
  } catch {
    return null;
  }
}

function withAutoApprovals(
  analysis: DesignDnaAnalysis | null,
  reviews: Record<string, PieceReview>,
  reconstructionAccepted: boolean,
): Record<string, PieceReview> {
  if (!analysis) return reviews;
  const now = Date.now();
  return Object.fromEntries(analysis.pieces.map(piece => {
    const current = reviews[piece.id] ?? { status: "pending" as const, firstSeenAt: new Date().toISOString() };
    const shouldAutoApprove = reconstructionAccepted && current.status === "pending"
      && !current.reviewedAt
      && piece.confidenceScore > 0.9
      && now - new Date(current.firstSeenAt).getTime() >= SEVEN_DAYS_MS;
    return [piece.id, shouldAutoApprove ? { ...current, status: "auto_approved" as const, reviewedAt: new Date().toISOString() } : current];
  }));
}

async function prepareImage(file: File): Promise<{ dataUrl: string; previewUrl: string; width: number; height: number; originalHash: string }> {
  if (!file.type.match(/^image\/(png|jpeg|webp)$/)) throw new Error("Use uma imagem PNG, JPEG ou WebP.");
  if (file.size > 12 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 12 MB.");

  const bitmap = await createImageBitmap(file);
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const originalHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("O navegador não conseguiu preparar a imagem.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return { dataUrl, previewUrl: dataUrl, width: canvas.width, height: canvas.height, originalHash };
}

function EntropySlider(props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const { label, value, min = 0, max = 1, step = 0.01, suffix = "%", onChange } = props;
  const shown = suffix === "%" ? Math.round(value * 100) : Number(value.toFixed(1));
  return (
    <label className="block rounded-xl border border-white/10 bg-black/20 p-3">
      <span className="flex items-center justify-between gap-3 text-xs font-medium text-slate-300">
        {label}
        <span className="font-mono text-cyan-300">{shown}{suffix}</span>
      </span>
      <input
        className="mt-3 w-full accent-cyan-400"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function CanvasPreview({ title, post }: { title: string; post: ReturnType<typeof compileAdminPreview>["post"] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <div className="flex min-h-[250px] items-center justify-center overflow-hidden rounded-xl bg-black/30">
        <CanvasPostStage post={post} zoom={0.62} isReadOnly />
      </div>
    </div>
  );
}

function ReferenceImageWithGeometry({ image, analysis }: { image: string; analysis: DesignDnaAnalysis }) {
  const boxes = [
    { label: "Título", box: analysis.geometry.headline, color: "#22d3ee" },
    ...(analysis.geometry.support ? [{ label: "Apoio", box: analysis.geometry.support, color: "#a78bfa" }] : []),
    ...(analysis.geometry.media ? [{ label: "Mídia", box: analysis.geometry.media, color: "#fbbf24" }] : []),
    ...(analysis.additionalTexts ?? []).map((item, index) => ({ label: `Texto ${index + 3}`, box: item.box, color: "#34d399" })),
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Referência e caixas detectadas</p>
      <div className="relative mx-auto max-w-[360px] overflow-hidden rounded-lg">
        <img src={image} alt="Referência original com geometria extraída" className="block w-full" />
        {boxes.map(({ label, box, color }) => (
          <div key={label} className="absolute border-2" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%`, borderColor: color }}>
            <span className="absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[10px] font-bold text-black" style={{ backgroundColor: color }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReferenceTextCrop({ image, analysis }: { image: string; analysis: DesignDnaAnalysis }) {
  const box = analysis.geometry.headline;
  if (box.width < 0.05 || box.height < 0.025) return null;
  return (
    <div className="relative mx-auto max-h-28 w-full overflow-hidden rounded-lg border border-white/10" style={{ aspectRatio: `${analysis.metadata.sourceWidth * box.width} / ${analysis.metadata.sourceHeight * box.height}` }}>
      <img src={image} alt="Recorte visual do título para comparação tipográfica" className="absolute max-w-none" style={{ width: `${100 / box.width}%`, left: `${-box.x / box.width * 100}%`, top: `${-box.y / box.height * 100}%` }} />
    </div>
  );
}

export function DesignDnaWorkbench() {
  const stored = useMemo(readDraft, []);
  const [analysis, setAnalysis] = useState<DesignDnaAnalysis | null>(stored?.analysis ?? null);
  const [originalAnalysis, setOriginalAnalysis] = useState<DesignDnaAnalysis | null>(stored?.originalAnalysis ?? stored?.analysis ?? null);
  const [originalAnalysisCaptured, setOriginalAnalysisCaptured] = useState(stored?.originalAnalysisCaptured ?? false);
  const [archiveId, setArchiveId] = useState<string | null>(stored?.archiveId ?? (stored?.analysis ? createDesignDnaArchiveId() : null));
  const [archiveCreatedAt, setArchiveCreatedAt] = useState(stored?.archiveCreatedAt ?? new Date().toISOString());
  const [archiveTitle, setArchiveTitle] = useState(stored?.archiveTitle ?? stored?.analysis?.referenceText?.headline ?? stored?.analysis?.summary.aesthetic ?? "");
  const [archiveItems, setArchiveItems] = useState<DesignDnaArchiveSummary[]>([]);
  const [archiveReady, setArchiveReady] = useState(false);
  const [archiveStatus, setArchiveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const archiveSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const [reviews, setReviews] = useState<Record<string, PieceReview>>(() => withAutoApprovals(stored?.analysis ?? null, stored?.reviews ?? {}, false));
  const [blueprintId, setBlueprintId] = useState<DesignBlueprintId>(stored?.blueprintId ?? "reference-derived");
  const [headline, setHeadline] = useState(stored?.headline ?? DEFAULT_HEADLINE);
  const [subtext, setSubtext] = useState(stored?.subtext ?? DEFAULT_SUBTEXT);
  const [categoryHint, setCategoryHint] = useState(stored?.categoryHint ?? "");
  const [entropy, setEntropy] = useState<DesignEntropyProfile>(stored?.entropy ?? ZERO_ENTROPY);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [sourceOriginalHash, setSourceOriginalHash] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [selectedFontId, setSelectedFontId] = useState<string | null>(stored?.selectedFontId ?? null);
  const [pinnedFont, setPinnedFont] = useState<DesignFontCandidate | null>(stored?.selectedFontCandidate ?? null);
  const [referenceHeadline, setReferenceHeadline] = useState(stored?.referenceHeadline ?? stored?.analysis?.referenceText?.headline ?? "");
  const [referenceSupport, setReferenceSupport] = useState(stored?.referenceSupport ?? stored?.analysis?.referenceText?.support ?? "");
  const [fontQuery, setFontQuery] = useState(stored?.fontQuery ?? "");
  const [fontRevision, setFontRevision] = useState(0);
  const [reconstructionAccepted, setReconstructionAccepted] = useState(false);
  const [scene, setScene] = useState<ReferenceReconstructionSpecV2 | null>(() => stored?.analysis?.reconstructionScene ? sceneFromAnalysis(stored.analysis) : null);
  const [sceneHash, setSceneHash] = useState<string | null>(null);
  const [diagnosticPost, setDiagnosticPost] = useState<CanvasPostModel | null>(() => stored?.analysis?.reconstructionScene ? materializeReferenceDiagnostic(sceneFromAnalysis(stored.analysis)) : null);
  const [baselinePngDataUrl, setBaselinePngDataUrl] = useState<string | null>(null);
  const [acceptedSceneHash, setAcceptedSceneHash] = useState<string | null>(null);
  const [visualComparison, setVisualComparison] = useState<DesignDnaArchiveRecord["visualComparison"]>(null);
  const [fontCaptureBusy, setFontCaptureBusy] = useState(false);
  const fontSearch = trpcHooks.designDna.searchFonts.useQuery(
    { query: fontQuery.trim() || "aa" },
    { enabled: fontQuery.trim().length >= 2 },
  );
  const analyzeMutation = trpcHooks.designDna.analyze.useMutation({
    onSuccess: result => {
      setArchiveId(createDesignDnaArchiveId());
      setArchiveCreatedAt(new Date().toISOString());
      setArchiveTitle((result.referenceText.headline || result.summary.aesthetic).slice(0, 120));
      setOriginalAnalysis(result);
      setOriginalAnalysisCaptured(true);
      setAnalysis(result);
      setEntropy(result.entropy);
      setReviews(withAutoApprovals(result, {}, false));
      setReconstructionAccepted(false);
      setSelectedFontId(null);
      setPinnedFont(null);
      setReferenceHeadline(result.referenceText.headline ?? "");
      setReferenceSupport(result.referenceText.support ?? "");
      setBlueprintId("reference-derived");
      const proposedScene = sceneFromAnalysis(result);
      const nextScene = { ...proposedScene, source: { ...proposedScene.source, originalHash: sourceOriginalHash } };
      setScene(nextScene);
      setDiagnosticPost(materializeReferenceDiagnostic(nextScene));
      setBaselinePngDataUrl(null);
      setAcceptedSceneHash(null);
      setVisualComparison(null);
    },
  });

  useEffect(() => {
    if (!scene) { setSceneHash(null); return; }
    let active = true;
    setSceneHash(null);
    void hashReferenceScene(scene).then(hash => { if (active) setSceneHash(hash); });
    return () => { active = false; };
  }, [scene]);

  useEffect(() => {
    const draft: StoredDraft = { analysis: analysis ?? undefined, originalAnalysis: originalAnalysis ?? undefined, originalAnalysisCaptured, archiveId: archiveId ?? undefined, archiveCreatedAt, archiveTitle, reviews, blueprintId, headline, subtext, categoryHint, entropy, selectedFontId: selectedFontId ?? undefined, selectedFontCandidate: pinnedFont ?? undefined, referenceHeadline, referenceSupport, fontQuery, reconstructionAccepted };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
      console.warn("[designDna] O rascunho local não pôde ser atualizado", error);
    }
  }, [analysis, originalAnalysis, originalAnalysisCaptured, archiveId, archiveCreatedAt, archiveTitle, reviews, blueprintId, headline, subtext, categoryHint, entropy, selectedFontId, pinnedFont, referenceHeadline, referenceSupport, fontQuery, reconstructionAccepted]);

  useEffect(() => {
    let active = true;
    Promise.all([
      listDesignDnaRecords(),
      stored?.archiveId ? getDesignDnaRecord(stored.archiveId) : Promise.resolve(null),
    ]).then(([items, current]) => {
      if (!active) return;
      setArchiveItems(items);
      if (current) {
        setAnalysis(current.analysis);
        setOriginalAnalysis(current.originalAnalysis);
        setOriginalAnalysisCaptured(current.originalAnalysisCaptured);
        setArchiveTitle(current.title);
        setReviews(current.reviews);
        setImageDataUrl(current.referenceImageDataUrl);
        setSourceOriginalHash(current.scene?.source.originalHash ?? null);
        const archivedScene = current.scene ?? current.analysis.reconstructionScene ?? null;
        setScene(archivedScene);
        setDiagnosticPost(current.diagnosticPost ?? (archivedScene ? materializeReferenceDiagnostic(archivedScene) : null));
        setBaselinePngDataUrl(current.baselinePngDataUrl ?? null);
        setAcceptedSceneHash(current.acceptedSceneHash ?? null);
        setVisualComparison(current.visualComparison ?? null);
        setReconstructionAccepted(Boolean(current.sceneHash && current.acceptedSceneHash === current.sceneHash));
      }
    }).catch(error => {
      if (!active) return;
      setArchiveError(error instanceof Error ? error.message : "Não foi possível abrir o arquivo local.");
      setArchiveStatus("error");
    }).finally(() => {
      if (active) setArchiveReady(true);
    });
    return () => { active = false; };
  }, [stored]);

  useEffect(() => {
    analysis?.fontCandidates?.forEach(candidate => loadFont(candidate.cssUrl));
  }, [analysis]);

  useEffect(() => {
    fontSearch.data?.forEach(candidate => loadFont(candidate.cssUrl));
  }, [fontSearch.data]);

  useEffect(() => {
    if (pinnedFont) loadFont(pinnedFont.cssUrl);
  }, [pinnedFont]);

  const selectedFont = pinnedFont?.id === selectedFontId ? pinnedFont : [...(analysis?.fontCandidates ?? []), ...(fontSearch.data ?? [])].find(candidate => candidate.id === selectedFontId) ?? null;

  useEffect(() => {
    if (!selectedFont || !document.fonts) return;
    let active = true;
    loadFont(selectedFont.cssUrl);
    void document.fonts.load(`700 24px "${selectedFont.family.replace(/["\\]/g, "")}"`).then(() => {
      if (active) setFontRevision(value => value + 1);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [selectedFont?.id, selectedFont?.cssUrl]);

  const compilerInput = useMemo(() => ({
    blueprintId,
    headline,
    subtext,
    entropy,
    analysis,
    referenceImage: imageDataUrl,
    enabledPieceIds: analysis?.pieces
      .filter(piece => reviews[piece.id]?.status !== "rejected")
      .map(piece => piece.id),
    fontCandidate: selectedFont,
  }), [blueprintId, headline, subtext, entropy, analysis, imageDataUrl, reviews, selectedFont, fontRevision]);
  const activePreview = useMemo(() => compileAdminPreview(compilerInput), [compilerInput]);
  const neutralPreview = useMemo(() => compileAdminPreview({ ...compilerInput, entropy: ZERO_ENTROPY }), [compilerInput]);
  const reconstruction = useMemo(() => analysis ? compileAdminPreview({ ...compilerInput, blueprintId: "reference-derived", headline: referenceHeadline || "Título ilegível", subtext: referenceSupport, entropy: analysis.entropy }) : null, [analysis, compilerInput, referenceHeadline, referenceSupport]);

  const currentRecord = useMemo<DesignDnaArchiveRecord | null>(() => {
    if (!analysis || !originalAnalysis || !archiveId) return null;
    if (scene && (!sceneHash || !diagnosticPost)) return null;
    return {
      schemaVersion: scene ? 2 : 1,
      id: archiveId,
      title: archiveTitle.trim().slice(0, 120) || analysis.summary.aesthetic,
      createdAt: archiveCreatedAt,
      updatedAt: new Date().toISOString(),
      referenceImageDataUrl: imageDataUrl,
      originalAnalysis,
      originalAnalysisCaptured,
      analysis,
      reviews,
      blueprintId,
      headline,
      subtext,
      categoryHint,
      entropy,
      selectedFontCandidate: selectedFont,
      referenceHeadline,
      referenceSupport,
      reconstructionAccepted: Boolean(sceneHash && acceptedSceneHash === sceneHash && reconstructionAccepted),
      ...(scene && sceneHash && diagnosticPost ? {
        scene,
        sceneHash,
        diagnosticPost,
        diagnosticPostSceneHash: sceneHash,
        baselinePngDataUrl,
        acceptedSceneHash,
        visualComparison,
      } : {}),
    };
  }, [analysis, originalAnalysis, originalAnalysisCaptured, archiveId, archiveTitle, archiveCreatedAt, imageDataUrl, reviews, blueprintId, headline, subtext, categoryHint, entropy, selectedFont, referenceHeadline, referenceSupport, reconstructionAccepted, scene, sceneHash, diagnosticPost, baselinePngDataUrl, acceptedSceneHash, visualComparison]);

  const persistRecord = (record: DesignDnaArchiveRecord) => {
    const operation = archiveSaveQueue.current.catch(() => undefined).then(() => saveDesignDnaRecord(record));
    archiveSaveQueue.current = operation;
    return operation;
  };

  const reflectSavedRecord = (record: DesignDnaArchiveRecord) => {
    setArchiveItems(current => [
      { id: record.id, title: record.title, createdAt: record.createdAt, updatedAt: record.updatedAt, reconstructionAccepted: record.reconstructionAccepted, schemaVersion: record.schemaVersion },
      ...current.filter(item => item.id !== record.id),
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setArchiveStatus("saved");
    setArchiveError(null);
  };

  useEffect(() => {
    if (!archiveReady || !currentRecord) return;
    let active = true;
    setArchiveStatus("saving");
    const timer = window.setTimeout(() => {
      void persistRecord(currentRecord).then(() => {
        if (active) reflectSavedRecord(currentRecord);
      }).catch(error => {
        if (!active) return;
        setArchiveStatus("error");
        setArchiveError(error instanceof Error ? error.message : "Não foi possível salvar a decodificação.");
      });
    }, 600);
    return () => { active = false; window.clearTimeout(timer); };
  }, [archiveReady, currentRecord]);

  const approvedCount = reconstructionAccepted ? Object.values(reviews).filter(item => item.status === "approved" || item.status === "auto_approved").length : 0;
  const updateGeometry = (key: "headline" | "support" | "media", field: keyof NormalizedDesignBox, percentage: number) => {
    if (field === "confidence") return;
    setAnalysis(current => {
      if (!current || !current.geometry[key]) return current;
      const box = current.geometry[key]!;
      const value = Math.max(0, Math.min(1, percentage / 100));
      const nextBox = { ...box, [field]: value };
      nextBox.width = Math.min(nextBox.width, 1 - nextBox.x);
      nextBox.height = Math.min(nextBox.height, 1 - nextBox.y);
      return { ...current, geometry: { ...current.geometry, [key]: nextBox }, validation: { status: "valid_with_warnings", issues: ["Geometria ajustada manualmente; confira visualmente antes de aprovar."] } };
    });
    setReconstructionAccepted(false);
  };

  const updateAdditionalText = (index: number, field: "text" | "x" | "y" | "width" | "height", value: string) => {
    setAnalysis(current => {
      if (!current) return current;
      const additionalTexts = [...(current.additionalTexts ?? [])];
      const item = additionalTexts[index];
      if (!item) return current;
      if (field === "text") additionalTexts[index] = { ...item, text: value };
      else {
        const box = { ...item.box, [field]: Math.max(0, Math.min(1, Number(value) / 100)) };
        box.width = Math.min(box.width, 1 - box.x);
        box.height = Math.min(box.height, 1 - box.y);
        additionalTexts[index] = { ...item, box };
      }
      return { ...current, additionalTexts, validation: { status: "valid_with_warnings", issues: ["Geometria ajustada manualmente; confira visualmente antes de aprovar."] } };
    });
    setReconstructionAccepted(false);
  };

  const updateTextAppearance = (key: "headline" | "support", field: "color" | "weight" | "alignment", value: string) => {
    setAnalysis(current => {
      if (!current) return current;
      if (field === "alignment") return { ...current, geometry: { ...current.geometry, [key === "headline" ? "headlineAlignment" : "supportAlignment"]: value as "left" | "center" | "right" } };
      if (field === "color") return { ...current, typography: { ...current.typography, [key === "headline" ? "headlineColor" : "supportColor"]: value } };
      const weight = Math.max(100, Math.min(900, Number(value) || 400));
      return key === "headline"
        ? { ...current, typography: { ...current.typography, traits: { ...current.typography.traits, weight } } }
        : { ...current, typography: { ...current.typography, supportWeight: weight } };
    });
    setReconstructionAccepted(false);
  };

  const setEntropyField = (field: "asymmetry" | "gridDeviation" | "noise" | "rotation" | "hardShadow", value: number) => {
    setEntropy(current => {
      if (field === "noise") return { ...current, noise: { ...current.noise, intensity: value, kind: value > 0 ? "grain" : "none" } };
      if (field === "rotation") return { ...current, rotation: { ...current.rotation, degrees: value } };
      if (field === "hardShadow") return { ...current, hardShadow: { ...current.hardShadow, intensity: value } };
      return { ...current, [field]: value };
    });
  };

  const reviewPiece = (id: string, status: PieceReview["status"]) => {
    setReviews(current => ({
      ...current,
      [id]: {
        ...(current[id] ?? { firstSeenAt: new Date().toISOString(), status: "pending" }),
        status,
        reviewedAt: new Date().toISOString(),
      },
    }));
  };

  const updateScene = (next: ReferenceReconstructionSpecV2) => {
    setScene(next);
    setDiagnosticPost(materializeReferenceDiagnostic(next));
    setBaselinePngDataUrl(null);
    setVisualComparison(null);
    setAcceptedSceneHash(null);
    setReconstructionAccepted(false);
  };

  const captureSceneFonts = async () => {
    if (!scene || fontCaptureBusy) return;
    setFontCaptureBusy(true);
    try {
      const result = await captureReferenceFonts(scene);
      updateScene({ ...result.scene, warnings: [...scene.warnings.filter(item => !item.startsWith("Fonte: ")), ...result.failures.map(item => `Fonte: ${item}`)] });
      setArchiveError(result.failures.length ? result.failures.join(" ") : null);
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : "Não foi possível incorporar as fontes.");
    } finally {
      setFontCaptureBusy(false);
    }
  };

  const openArchivedRecord = async (id: string) => {
    if (id === archiveId) return;
    try {
      if (currentRecord) {
        await persistRecord(currentRecord);
        reflectSavedRecord(currentRecord);
      }
      const record = await getDesignDnaRecord(id);
      if (!record) throw new Error("Decodificação não encontrada neste navegador.");
      setArchiveId(record.id);
      setArchiveCreatedAt(record.createdAt);
      setArchiveTitle(record.title);
      setOriginalAnalysis(record.originalAnalysis);
      setOriginalAnalysisCaptured(record.originalAnalysisCaptured);
      setAnalysis(record.analysis);
      setReviews(withAutoApprovals(record.analysis, record.reviews, Boolean(record.schemaVersion === 2 && record.sceneHash && record.acceptedSceneHash === record.sceneHash)));
      setBlueprintId(record.blueprintId);
      setHeadline(record.headline);
      setSubtext(record.subtext);
      setCategoryHint(record.categoryHint);
      setEntropy(record.entropy);
      setImageDataUrl(record.referenceImageDataUrl);
      setSourceOriginalHash(record.scene?.source.originalHash ?? null);
      setSelectedFontId(record.selectedFontCandidate?.id ?? null);
      setPinnedFont(record.selectedFontCandidate);
      setReferenceHeadline(record.referenceHeadline);
      setReferenceSupport(record.referenceSupport);
      const archivedScene = record.scene ?? record.analysis.reconstructionScene ?? null;
      setScene(archivedScene);
      setDiagnosticPost(record.diagnosticPost ?? (archivedScene ? materializeReferenceDiagnostic(archivedScene) : null));
      setBaselinePngDataUrl(record.baselinePngDataUrl ?? null);
      setAcceptedSceneHash(record.acceptedSceneHash ?? null);
      setVisualComparison(record.visualComparison ?? null);
      setReconstructionAccepted(Boolean(record.schemaVersion === 2 && record.sceneHash && record.acceptedSceneHash === record.sceneHash));
      setArchiveStatus("saved");
      setArchiveError(null);
    } catch (error) {
      setArchiveStatus("error");
      setArchiveError(error instanceof Error ? error.message : "Não foi possível abrir a decodificação.");
    }
  };

  const saveCurrentNow = async (): Promise<boolean> => {
    if (!currentRecord) return false;
    setArchiveStatus("saving");
    try {
      await persistRecord(currentRecord);
      reflectSavedRecord(currentRecord);
      return true;
    } catch (error) {
      setArchiveStatus("error");
      setArchiveError(error instanceof Error ? error.message : "Não foi possível salvar a decodificação.");
      return false;
    }
  };

  const exportCurrentEvaluation = async () => {
    if (!currentRecord || !reconstruction) return;
    if (!await saveCurrentNow()) return;
    downloadDesignDnaEvaluationPacket({
      format: "postspark.design-dna.evaluation",
      schemaVersion: currentRecord.schemaVersion,
      exportedAt: new Date().toISOString(),
      archiveId: currentRecord.id,
      title: currentRecord.title,
      referenceImageIncluded: false,
      originalAnalysisCaptured: currentRecord.originalAnalysisCaptured,
      originalAnalysis: currentRecord.originalAnalysis,
      curatedAnalysis: currentRecord.analysis,
      curator: {
        referenceHeadline: currentRecord.referenceHeadline,
        referenceSupport: currentRecord.referenceSupport,
        selectedFontCandidate: currentRecord.selectedFontCandidate,
        reviews: currentRecord.reviews,
        reconstructionAccepted: currentRecord.reconstructionAccepted,
        entropy: currentRecord.entropy,
      },
      reconstruction: {
        post: currentRecord.diagnosticPost ?? reconstruction.post,
        scene: currentRecord.scene ?? null,
        sceneHash: currentRecord.sceneHash ?? null,
        visualComparison: currentRecord.visualComparison ?? null,
        warnings: reconstruction.warnings,
        fallbackLevel: reconstruction.fallbackLevel,
      },
    }, currentRecord.id);
  };

  const exportCurrentBundle = async () => {
    if (!currentRecord || !await saveCurrentNow()) return;
    try {
      await downloadDesignDnaReproductionBundle(currentRecord);
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : "Não foi possível exportar a receita.");
    }
  };

  const importBundle = async (file: File) => {
    try {
      if (currentRecord) await persistRecord(currentRecord);
      const record = await importDesignDnaReproductionBundle(file);
      setArchiveId(record.id);
      setArchiveCreatedAt(record.createdAt);
      setArchiveTitle(record.title);
      setOriginalAnalysis(record.originalAnalysis);
      setOriginalAnalysisCaptured(record.originalAnalysisCaptured);
      setAnalysis(record.analysis);
      setReviews(record.reviews);
      setBlueprintId(record.blueprintId);
      setHeadline(record.headline);
      setSubtext(record.subtext);
      setCategoryHint(record.categoryHint);
      setEntropy(record.entropy);
      setImageDataUrl(null);
      setSourceOriginalHash(record.scene?.source.originalHash ?? null);
      setSelectedFontId(record.selectedFontCandidate?.id ?? null);
      setPinnedFont(record.selectedFontCandidate);
      setReferenceHeadline(record.referenceHeadline);
      setReferenceSupport(record.referenceSupport);
      setScene(record.scene ?? null);
      setDiagnosticPost(record.diagnosticPost ?? null);
      setBaselinePngDataUrl(record.baselinePngDataUrl ?? null);
      setAcceptedSceneHash(null);
      setVisualComparison(null);
      setReconstructionAccepted(false);
      reflectSavedRecord(record);
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : "Não foi possível importar o pacote.");
    }
  };

  const clearDraft = async () => {
    if (currentRecord) {
      try {
        await persistRecord(currentRecord);
        reflectSavedRecord(currentRecord);
      } catch (error) {
        setArchiveStatus("error");
        setArchiveError(error instanceof Error ? error.message : "Exporte o JSON antes de limpar o rascunho.");
        return;
      }
    }
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* O arquivo IndexedDB permanece independente. */ }
    setArchiveId(null);
    setArchiveCreatedAt(new Date().toISOString());
    setArchiveTitle("");
    setOriginalAnalysis(null);
    setOriginalAnalysisCaptured(false);
    setAnalysis(null);
    setReviews({});
    setBlueprintId("reference-derived");
    setHeadline(DEFAULT_HEADLINE);
    setSubtext(DEFAULT_SUBTEXT);
    setCategoryHint("");
    setEntropy(ZERO_ENTROPY);
    setImageDataUrl(null);
    setSourceOriginalHash(null);
    setImageError(null);
    setSelectedFontId(null);
    setPinnedFont(null);
    setReferenceHeadline("");
    setReferenceSupport("");
    setFontQuery("");
    setReconstructionAccepted(false);
    setScene(null);
    setSceneHash(null);
    setDiagnosticPost(null);
    setBaselinePngDataUrl(null);
    setAcceptedSceneHash(null);
    setVisualComparison(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <FlaskConical className="size-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">Laboratório interno</span>
          </div>
          <h2 className="mt-2 text-2xl font-bold text-white">DNA de composição</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Referências entram apenas para estudo. O resultado é um conjunto de peças abstratas e uma prévia do compilador; nada daqui participa da geração dos usuários.
          </p>
        </div>
        <Button variant="outline" onClick={() => void clearDraft()} className="border-white/15 bg-black/20">
          <RotateCcw className="size-4" /> Limpar rascunho
        </Button>
      </div>

      <Card className="border-cyan-400/20 bg-white/5">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2"><HardDrive className="size-5 text-cyan-300" />Arquivo local de decodificações</span>
            <Badge variant="outline" className={archiveStatus === "error" ? "border-red-400/40 text-red-300" : "border-cyan-400/30 text-cyan-300"}>
              {!archiveReady ? "abrindo arquivo" : archiveStatus === "saving" ? "salvando" : archiveStatus === "saved" ? "salvo no navegador" : archiveStatus === "error" ? "falha ao salvar" : "pronto"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-400">Cada análise é arquivada separadamente neste navegador, incluindo a referência para reabrir a comparação. Não entra na biblioteca do produto nem no banco. O arquivo do navegador pode ser apagado com os dados do site.</p>
          {currentRecord && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-52 flex-1 text-xs text-slate-400">Nome desta decodificação
                <Input value={archiveTitle} maxLength={120} onChange={event => setArchiveTitle(event.target.value)} className="mt-1" />
              </label>
              <Button type="button" variant="outline" onClick={() => void saveCurrentNow()} disabled={!archiveReady || archiveStatus === "saving"} className="border-white/15"><HardDrive className="size-4" />Salvar agora</Button>
              <Button type="button" onClick={() => void exportCurrentEvaluation()} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Download className="size-4" />Exportar avaliação JSON</Button>
              {currentRecord.schemaVersion === 2 && <Button type="button" variant="outline" onClick={() => void exportCurrentBundle()}><Download className="size-4" />Exportar reprodução ZIP</Button>}
            </div>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs text-slate-300">Importar reprodução ZIP
            <input type="file" accept=".zip,application/zip" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void importBundle(file); event.currentTarget.value = ""; }} />
          </label>
          <p className="text-xs text-slate-500">Para avaliar a decodificação, anexe o post original e o JSON. O ZIP contém a receita e os assets incorporados para reabrir a reconstrução sem usar a referência como fundo.</p>
          {archiveError && <p className="flex items-start gap-2 text-xs text-red-300"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{archiveError}</p>}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Decodificações guardadas ({archiveItems.length})</p>
            {archiveReady && archiveItems.length === 0 && <p className="text-sm text-slate-500">Nenhuma decodificação arquivada ainda.</p>}
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {archiveItems.map(item => (
                <button key={item.id} type="button" onClick={() => void openArchivedRecord(item.id)} className={`rounded-xl border p-3 text-left transition ${archiveId === item.id ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 bg-black/20 hover:border-white/25"}`}>
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-100"><FolderOpen className="size-4 shrink-0 text-cyan-300" /><span className="truncate">{item.title}</span></span>
                  <span className="mt-1 block text-xs text-slate-400">{item.schemaVersion === 1 ? "Legado V1 · requer nova revisão · " : "Receita V2 · "}Atualizada em {new Date(item.updatedAt).toLocaleString("pt-BR")}{item.reconstructionAccepted ? " · reconstrução validada" : " · aguardando validação"}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-6">
          <Card className="border-white/10 bg-white/5">
            <CardHeader><CardTitle className="flex items-center gap-2"><ImagePlus className="size-5 text-cyan-300" />1. Referência</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-black/20 p-5 text-center transition hover:border-cyan-400/50 hover:bg-cyan-400/5">
                {imageDataUrl ? (
                  <img src={imageDataUrl} alt="Referência temporária" className="max-h-72 rounded-xl object-contain" />
                ) : (
                  <>
                    <ImagePlus className="mb-3 size-8 text-slate-400" />
                    <span className="font-medium text-slate-200">Escolher uma postagem de referência</span>
                    <span className="mt-1 text-xs text-slate-500">PNG, JPEG ou WebP · até 12 MB</span>
                  </>
                )}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      setImageError(null);
                      const prepared = await prepareImage(file);
                      if (scene && !imageDataUrl && prepared.width === scene.source.widthPx && prepared.height === scene.source.heightPx) {
                        if (scene.source.originalHash && scene.source.originalHash !== prepared.originalHash) {
                          throw new Error("A imagem anexada tem dimensões iguais, mas hash diferente da referência desta receita.");
                        }
                        setImageDataUrl(prepared.dataUrl);
                        setSourceOriginalHash(prepared.originalHash);
                        return;
                      }
                      if (currentRecord) {
                        await persistRecord(currentRecord);
                        reflectSavedRecord(currentRecord);
                      }
                      setImageDataUrl(prepared.dataUrl);
                      setSourceOriginalHash(prepared.originalHash);
                      setAnalysis(null);
                      setOriginalAnalysis(null);
                      setOriginalAnalysisCaptured(false);
                      setArchiveId(null);
                      setArchiveTitle("");
                      setArchiveCreatedAt(new Date().toISOString());
                      setReviews({});
                      setSelectedFontId(null);
                      setPinnedFont(null);
                      setReconstructionAccepted(false);
                      setScene(null);
                      setSceneHash(null);
                      setDiagnosticPost(null);
                      setBaselinePngDataUrl(null);
                      setAcceptedSceneHash(null);
                      setVisualComparison(null);
                    } catch (error) {
                      setImageError(error instanceof Error ? error.message : "Não foi possível preparar a imagem.");
                    }
                  }}
                />
              </label>
              {imageError && <p className="text-sm text-red-300">{imageError}</p>}
              <Input value={categoryHint} onChange={event => setCategoryHint(event.target.value)} placeholder="Contexto opcional: editorial, educação, produto…" />
              <Button
                className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                disabled={!imageDataUrl || analyzeMutation.isPending}
                onClick={() => imageDataUrl && analyzeMutation.mutate({ imageDataUrl, categoryHint: categoryHint || undefined })}
              >
                <Sparkles className="size-4" />
                {analyzeMutation.isPending ? "Decodificando referência…" : "Decodificar design"}
              </Button>
              {analyzeMutation.error && <p className="text-sm text-red-300">{analyzeMutation.error.message}</p>}
              {analysis && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-cyan-400/30 text-cyan-300">{analysis.summary.density} density</Badge>
                    <Badge variant="outline" className={analysis.validation.status === "valid" ? "border-emerald-400/30 text-emerald-300" : "border-amber-400/30 text-amber-300"}>
                      caixas: {analysis.validation.status}
                    </Badge>
                  </div>
                  <p className="mt-3 font-medium text-slate-200">{analysis.summary.aesthetic}</p>
                  <p className="mt-1 text-slate-400">{analysis.summary.readingIntent}</p>
                  <p className="mt-2 text-xs text-slate-500">A checagem V2 confronta camadas com pixels de primeiro plano e cor de fundo. A confirmação visual final é feita na receita renderizada ao lado.</p>
                  {analysis.sceneValidation && <p className="mt-1 text-xs text-slate-500">Pixels de primeiro plano sem camada: {Math.round(analysis.sceneValidation.uncoveredForegroundRatio * 100)}% · divergência do fundo: {Math.round(analysis.sceneValidation.backgroundDelta * 100)}%.</p>}
                  <p className="mt-3 text-xs text-slate-500">{analysis.metadata.model} · {analysis.metadata.sourceWidth}×{analysis.metadata.sourceHeight}px · {new Date(analysis.metadata.analyzedAt).toLocaleString("pt-BR")}</p>
                  {analysis.validation.issues.map(issue => <p key={issue} className="mt-2 text-xs text-amber-300">• {issue}</p>)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Type className="size-5 text-cyan-300" />2. Aproximação tipográfica</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!analysis ? (
                  <p className="text-sm text-slate-400">A identificação e as alternativas abertas aparecerão depois da análise multimodal.</p>
                ) : (
                  <>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100">
                      {analysis.typography.identification.guessedFamily ?? "Família exata não confirmada"}
                    </span>
                    <Badge variant="outline" className="border-cyan-400/30 text-cyan-300">
                      hipótese do modelo · {Math.round(analysis.typography.identification.confidence * 100)}%
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{analysis.typography.identification.evidence.join(" · ")}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{analysis.typography.traits.category}</Badge>
                    <Badge variant="outline">{analysis.typography.traits.width}</Badge>
                    <Badge variant="outline">contraste {analysis.typography.traits.contrast}</Badge>
                    <Badge variant="outline">altura-x {analysis.typography.traits.xHeight}</Badge>
                    <Badge variant="outline">peso {analysis.typography.traits.weight}</Badge>
                  </div>
                </div>

                {imageDataUrl && <ReferenceTextCrop image={imageDataUrl} analysis={analysis} />}
                <p className="text-xs leading-relaxed text-slate-400">Compare o desenho das letras acima com as amostras abaixo. O catálogo confirma disponibilidade e licença; não mede semelhança visual. Nenhuma fonte é escolhida automaticamente.</p>
                {scene && selectedFont && <Button type="button" variant="outline" onClick={() => updateScene({ ...scene, layers: scene.layers.map(layer => /headline|tit[uú]lo/i.test(layer.role) && (layer.kind === "text" || layer.kind === "arcText") ? {
                  ...layer,
                  fontFamily: selectedFont.family,
                  fontWeight: selectedFont.weights.reduce((best, weight) => Math.abs(weight - layer.fontWeight) < Math.abs(best - layer.fontWeight) ? weight : best, selectedFont.weights[0] ?? layer.fontWeight),
                  provenance: "curator" as const,
                } : layer) })}>Aplicar {selectedFont.family} às camadas de título</Button>}

                {analysis.fontCatalogStatus === "unavailable" ? (
                  <p className="text-sm text-amber-300">O catálogo Fontsource não respondeu. A análise foi preservada para uma nova tentativa.</p>
                ) : analysis.fontCandidates.length === 0 ? (
                  <p className="text-sm text-amber-300">Nenhuma família sugerida foi encontrada no catálogo com classe e peso compatíveis. A fonte continua sem identificação.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {analysis.fontCandidates.map(candidate => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => { setSelectedFontId(candidate.id); setPinnedFont(candidate); setReconstructionAccepted(false); }}
                        className={`rounded-xl border p-4 text-left transition ${selectedFontId === candidate.id ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 bg-black/20 hover:border-white/25"}`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-lg text-white" style={{ fontFamily: candidate.family }}>{candidate.family}</span>
                          <span className="text-[10px] text-cyan-300">{candidate.matchBasis === "identified-family" ? "nome sugerido" : "alternativa sugerida"}</span>
                        </span>
                        <span className="mt-2 block truncate text-xl text-white" style={{ fontFamily: candidate.family, fontWeight: analysis.typography.traits.weight }}>{referenceHeadline || "Aa Bb Gg Rr 123"}</span>
                        <span className="mt-2 block text-xs leading-relaxed text-slate-400">{candidate.rationale}</span>
                        <span className="mt-2 block text-[10px] uppercase tracking-wider text-emerald-300">Google Fonts · licença aberta</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-2 border-t border-white/10 pt-4">
                  <label htmlFor="design-dna-font-search" className="text-xs font-semibold uppercase tracking-wider text-slate-300">Buscar no catálogo aberto pelo nome</label>
                  <Input id="design-dna-font-search" value={fontQuery} onChange={event => setFontQuery(event.target.value)} placeholder="Ex.: Bodoni, Grotesk, Abril…" />
                  {fontSearch.isFetching && <p className="text-xs text-slate-400">Consultando famílias abertas…</p>}
                  {fontSearch.error && <p className="text-xs text-amber-300">Não foi possível consultar o catálogo agora.</p>}
                  {fontQuery.trim().length >= 2 && !fontSearch.isFetching && fontSearch.data?.length === 0 && <p className="text-xs text-slate-400">Nenhuma família encontrada com esse nome.</p>}
                  {fontQuery.trim().length >= 2 && !!fontSearch.data?.length && (
                    <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                      {fontSearch.data.map(candidate => (
                        <button key={candidate.id} type="button" onClick={() => { setSelectedFontId(candidate.id); setPinnedFont(candidate); setReconstructionAccepted(false); }} className={`rounded-xl border p-3 text-left ${selectedFontId === candidate.id ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 bg-black/20"}`}>
                          <span className="block text-xs text-slate-400">{candidate.family} · {candidate.category}</span>
                          <span className="mt-2 block truncate text-xl text-white" style={{ fontFamily: candidate.family, fontWeight: analysis.typography.traits.weight }}>{referenceHeadline || "Aa Bb Gg Rr 123"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                  </>
                )}
              </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>3. Peças do arsenal</span>
                <Badge variant="outline">{approvedCount} aprovadas</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!analysis && <p className="text-sm text-slate-400">As peças aparecerão aqui depois da análise multimodal.</p>}
              {analysis?.pieces.map(piece => {
                const review = reviews[piece.id] ?? { status: "pending" as const, firstSeenAt: new Date().toISOString() };
                return (
                  <article key={piece.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-100">{piece.name}</h3>
                          <Badge variant="outline" className="text-[10px]">{piece.kind}</Badge>
                          <Badge variant="outline" className="border-cyan-400/30 text-cyan-300">confiança da análise {Math.round(piece.confidenceScore * 100)}%</Badge>
                          {review.status === "auto_approved" && <Badge className="bg-violet-400/15 text-violet-200">auto_approved</Badge>}
                        </div>
                        <p className="mt-2 text-sm text-slate-400">{piece.description}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          {piece.parameter.key}: {piece.parameter.value}{piece.parameter.unit === "degrees" ? "°" : ""}
                          {piece.constraints.requires.length ? ` · requer ${piece.constraints.requires.join(", ")}` : ""}
                          {piece.constraints.conflictsWith.length ? ` · conflita com ${piece.constraints.conflictsWith.join(", ")}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="icon" variant="outline" disabled={!reconstructionAccepted} aria-label={`Aprovar ${piece.name}`} className={review.status === "approved" ? "border-emerald-400 bg-emerald-400/15 text-emerald-300" : "border-white/10"} onClick={() => reviewPiece(piece.id, "approved")}><Check className="size-4" /></Button>
                        <Button size="icon" variant="outline" aria-label={`Rejeitar ${piece.name}`} className={review.status === "rejected" ? "border-red-400 bg-red-400/15 text-red-300" : "border-white/10"} onClick={() => reviewPiece(piece.id, "rejected")}><X className="size-4" /></Button>
                      </div>
                    </div>
                  </article>
                );
              })}
              <p className="text-xs leading-relaxed text-slate-500">
                Primeiro valide a reconstrução. Depois, peças com confiança acima de 90% e sem revisão por 7 dias podem ser marcadas como <code>auto_approved</code> quando este painel volta a ser aberto.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {scene && diagnosticPost && (
            <Card className="border-cyan-400/20 bg-cyan-400/5">
              <CardHeader><CardTitle>4. Reconstrução fiel da referência</CardTitle></CardHeader>
              <CardContent>
                <ReferenceSceneWorkbench
                  scene={scene}
                  post={diagnosticPost}
                  sceneHash={sceneHash}
                  referenceImage={imageDataUrl}
                  baselinePngDataUrl={baselinePngDataUrl}
                  comparison={visualComparison ?? null}
                  acceptedSceneHash={acceptedSceneHash}
                  onSceneChange={updateScene}
                  onCompared={(comparison, png) => { setVisualComparison(comparison); setBaselinePngDataUrl(png); setAcceptedSceneHash(null); setReconstructionAccepted(false); }}
                  onAccept={() => {
                    if (!sceneHash || visualComparison?.sceneHash !== sceneHash || !visualComparisonPass(visualComparison) || referenceSceneIssues(scene).length || unresolvedReferenceFonts(scene).length) return;
                    setAcceptedSceneHash(sceneHash);
                    setReconstructionAccepted(true);
                    setReviews(current => withAutoApprovals(analysis, current, true));
                  }}
                  onReject={() => { setAcceptedSceneHash(null); setReconstructionAccepted(false); }}
                  onCaptureFonts={captureSceneFonts}
                  onRecompile={() => {
                    const currentScene = { ...scene, rendererVersion: REFERENCE_RENDERER_VERSION };
                    setScene(currentScene);
                    setDiagnosticPost(materializeReferenceDiagnostic(currentScene));
                    setVisualComparison(null);
                    setAcceptedSceneHash(null);
                    setReconstructionAccepted(false);
                  }}
                />
              </CardContent>
            </Card>
          )}
          {analysis && !scene && (
            <Card className="border-cyan-400/20 bg-cyan-400/5">
              <CardHeader><CardTitle>4. Registro legado V1 · revisão necessária</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-300">Este registro não contém as camadas necessárias para uma reprodução fiel. Você pode usá-lo como evidência e iniciar uma revisão V2; nenhuma Peça será aprovada automaticamente.</p>
                <Button variant="outline" onClick={() => updateScene(sceneFromAnalysis(analysis))}>Iniciar revisão de camadas V2</Button>
                <div className="grid gap-4 lg:grid-cols-2">
                  {imageDataUrl ? <ReferenceImageWithGeometry image={imageDataUrl} analysis={analysis} /> : <p className="rounded-xl border border-amber-400/20 p-4 text-sm text-amber-300">Reenvie a imagem para comparar lado a lado; ela não é guardada no rascunho.</p>}
                  {reconstruction && <CanvasPreview title="Estrutura medida no CanvasLab" post={reconstruction.post} />}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input value={referenceHeadline} onChange={event => { setReferenceHeadline(event.target.value); setReconstructionAccepted(false); }} placeholder="Transcrição do título visível" aria-label="Transcrição temporária do título da referência" />
                  <Input value={referenceSupport} onChange={event => { setReferenceSupport(event.target.value); setReconstructionAccepted(false); }} placeholder="Transcrição do apoio visível" aria-label="Transcrição temporária do apoio da referência" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["headline", "support", "media"] as const).map(key => {
                    const box = analysis.geometry[key];
                    if (!box) return null;
                    return (
                      <div key={key} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">{key === "headline" ? "Título" : key === "support" ? "Apoio" : "Mídia"} · % da arte</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(["x", "y", "width", "height"] as const).map(field => (
                            <label key={field} className="text-[10px] text-slate-400">
                              {field === "width" ? "largura" : field === "height" ? "altura" : field}
                              <Input type="number" min={0} max={100} step={1} value={Math.round(box[field] * 100)} onChange={event => updateGeometry(key, field, Number(event.target.value))} className="mt-1 h-8 text-xs" />
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["headline", "support"] as const).filter(key => key === "headline" || analysis.geometry.support).map(key => (
                    <div key={key} className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
                      <label className="text-[10px] text-slate-400">{key === "headline" ? "Cor do título" : "Cor do apoio"}
                        <Input type="color" value={(key === "headline" ? analysis.typography.headlineColor : analysis.typography.supportColor) ?? analysis.palette.text} onChange={event => updateTextAppearance(key, "color", event.target.value)} className="mt-1 h-8 p-1" />
                      </label>
                      <label className="text-[10px] text-slate-400">Peso
                        <Input type="number" min={100} max={900} step={100} value={key === "headline" ? analysis.typography.traits.weight : analysis.typography.supportWeight ?? 400} onChange={event => updateTextAppearance(key, "weight", event.target.value)} className="mt-1 h-8 text-xs" />
                      </label>
                      <label className="text-[10px] text-slate-400">Alinhamento
                        <select value={(key === "headline" ? analysis.geometry.headlineAlignment : analysis.geometry.supportAlignment) ?? analysis.geometry.alignment} onChange={event => updateTextAppearance(key, "alignment", event.target.value)} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-slate-900 px-2 text-xs text-white">
                          <option value="left">esquerda</option><option value="center">centro</option><option value="right">direita</option>
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
                {!!analysis.additionalTexts?.length && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Textos secundários detectados</p>
                    {analysis.additionalTexts.map((item, index) => (
                      <div key={index} className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-[2fr_repeat(4,0.7fr)]">
                        <Input value={item.text} onChange={event => updateAdditionalText(index, "text", event.target.value)} aria-label={`Texto secundário ${index + 1}`} className="h-8 text-xs" />
                        {(["x", "y", "width", "height"] as const).map(field => (
                          <label key={field} className="text-[10px] text-slate-400">{field === "width" ? "largura" : field === "height" ? "altura" : field}
                            <Input type="number" min={0} max={100} value={Math.round(item.box[field] * 100)} onChange={event => updateAdditionalText(index, field, event.target.value)} className="mt-1 h-8 text-xs" />
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500">Ajustar a transcrição serve apenas para comparar geometria e tipografia. A referência não entra na biblioteca local.</p>
                {reconstruction?.warnings.map(warning => <p key={warning} className="flex items-start gap-2 text-xs text-amber-300"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{warning}</p>)}
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                  <span className="text-xs text-amber-300">A aprovação fica bloqueada até uma receita V2 salva, comparada e confirmada.</span>
                </div>
              </CardContent>
            </Card>
          )}
          <Card className="border-white/10 bg-white/5">
            <CardHeader><CardTitle>5. Transferência para outro conteúdo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-400">Comece pela estrutura decodificada. Os três blueprints manuais são provas separadas de combinação e podem divergir da referência.</p>
              <div className="grid gap-3 md:grid-cols-3">
                {DESIGN_BLUEPRINTS.map(blueprint => (
                  <button
                    key={blueprint.id}
                    type="button"
                    onClick={() => setBlueprintId(blueprint.id)}
                    className={`rounded-xl border p-4 text-left transition ${blueprintId === blueprint.id ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 bg-black/20 hover:border-white/25"}`}
                  >
                    <span className="font-semibold text-slate-100">{blueprint.name}</span>
                    <span className="mt-2 block text-xs leading-relaxed text-slate-400">{blueprint.description}</span>
                    {blueprint.requiresImage && <Badge variant="outline" className="mt-3 text-[10px]">requer imagem</Badge>}
                  </button>
                ))}
              </div>
              <Input value={headline} maxLength={240} onChange={event => setHeadline(event.target.value)} aria-label="Título da prévia" />
              <Textarea value={subtext} maxLength={420} onChange={event => setSubtext(event.target.value)} aria-label="Texto de apoio da prévia" className="min-h-24" />
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>6. Caos e entropia</span>
                <Button size="sm" variant="ghost" onClick={() => setEntropy(ZERO_ENTROPY)}>Zerar</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <EntropySlider label="Assimetria" value={entropy.asymmetry} onChange={value => setEntropyField("asymmetry", value)} />
                <EntropySlider label="Desvio da grade" value={entropy.gridDeviation} onChange={value => setEntropyField("gridDeviation", value)} />
                <EntropySlider label="Rotação" value={entropy.rotation.degrees} min={-20} max={20} step={0.5} suffix="°" onChange={value => setEntropyField("rotation", value)} />
                <EntropySlider label="Ruído" value={entropy.noise.intensity} onChange={value => setEntropyField("noise", value)} />
                <EntropySlider label="Sombra dura" value={entropy.hardShadow.intensity} onChange={value => setEntropyField("hardShadow", value)} />
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <CanvasPreview title="Base · entropia zero" post={neutralPreview.post} />
                <CanvasPreview title="Aplicada · parâmetros atuais" post={activePreview.post} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
                <Badge variant="outline" className="border-cyan-400/30 text-cyan-300">{activePreview.fallbackLevel}</Badge>
                <span className="text-slate-400">Blueprint efetivo: {DESIGN_BLUEPRINTS.find(item => item.id === activePreview.effectiveBlueprintId)?.name}</span>
              </div>
              {activePreview.warnings.map(warning => (
                <p key={warning} className="mt-2 flex items-start gap-2 text-xs text-amber-300"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{warning}</p>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
