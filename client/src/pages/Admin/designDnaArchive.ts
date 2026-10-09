import type { DesignDnaAnalysis, DesignEntropyProfile, DesignFontCandidate } from "@shared/designDna";
import { referenceSceneSchema, type ReferenceReconstructionSpecV2 } from "@shared/referenceReconstruction";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";
import JSZip from "jszip";
import type { DesignBlueprintId } from "./designBlueprints";

const DATABASE_NAME = "postspark-design-dna-curadoria";
const STORE_NAME = "decodificacoes";
const DATABASE_VERSION = 2;

export type DesignDnaPieceReview = {
  status: "pending" | "approved" | "rejected" | "auto_approved";
  firstSeenAt: string;
  reviewedAt?: string;
};

export type DesignDnaArchiveRecord = {
  schemaVersion: 1 | 2;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  referenceImageDataUrl: string | null;
  originalAnalysis: DesignDnaAnalysis;
  originalAnalysisCaptured: boolean;
  analysis: DesignDnaAnalysis;
  reviews: Record<string, DesignDnaPieceReview>;
  blueprintId: DesignBlueprintId;
  headline: string;
  subtext: string;
  categoryHint: string;
  entropy: DesignEntropyProfile;
  selectedFontCandidate: DesignFontCandidate | null;
  referenceHeadline: string;
  referenceSupport: string;
  reconstructionAccepted: boolean;
  /** V2: cena autoritativa; V1 continua como evidência histórica. */
  scene?: ReferenceReconstructionSpecV2;
  sceneHash?: string;
  diagnosticPost?: CanvasPostModel;
  diagnosticPostSceneHash?: string;
  baselinePngDataUrl?: string | null;
  acceptedSceneHash?: string | null;
  visualComparison?: {
    sceneHash: string;
    overallSimilarity: number;
    regions: Array<{ layerId: string; similarity: number }>;
    comparedAt: string;
  } | null;
};

export type DesignDnaArchiveSummary = Pick<DesignDnaArchiveRecord, "id" | "title" | "createdAt" | "updatedAt" | "reconstructionAccepted" | "schemaVersion">;

export async function hashReferenceScene(scene: ReferenceReconstructionSpecV2): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(scene));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function createDesignDnaArchiveId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `design-dna-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openArchive(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Este navegador não oferece IndexedDB."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o arquivo local."));
    request.onblocked = () => reject(new Error("O arquivo local está bloqueado por outra aba."));
  });
}

export async function saveDesignDnaRecord(record: DesignDnaArchiveRecord): Promise<void> {
  if (record.schemaVersion === 2) {
    if (!record.scene) throw new Error("Registro V2 sem receita de reconstrução.");
    referenceSceneSchema.parse(record.scene);
    const actualHash = await hashReferenceScene(record.scene);
    if (record.sceneHash !== actualHash || record.diagnosticPostSceneHash !== actualHash || !record.diagnosticPost) {
      throw new Error("Receita e prévia diagnóstica não correspondem à mesma versão.");
    }
  }
  const database = await openArchive();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Não foi possível salvar a decodificação.")); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("O salvamento foi interrompido.")); };
  });
}

export async function listDesignDnaRecords(): Promise<DesignDnaArchiveSummary[]> {
  const database = await openArchive();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const summaries: DesignDnaArchiveSummary[] = [];
    const request = transaction.objectStore(STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as DesignDnaArchiveRecord;
      if ((record?.schemaVersion === 1 || record?.schemaVersion === 2) && typeof record.id === "string") {
        summaries.push({ id: record.id, title: record.title, createdAt: record.createdAt, updatedAt: record.updatedAt, reconstructionAccepted: record.reconstructionAccepted, schemaVersion: record.schemaVersion });
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("Não foi possível listar as decodificações."));
    transaction.oncomplete = () => { database.close(); resolve(summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Não foi possível listar as decodificações.")); };
  });
}

export async function getDesignDnaRecord(id: string): Promise<DesignDnaArchiveRecord | null> {
  const database = await openArchive();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result?.schemaVersion === 1 || request.result?.schemaVersion === 2 ? request.result as DesignDnaArchiveRecord : null);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir a decodificação."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export function downloadDesignDnaEvaluationPacket(packet: unknown, id: string): void {
  const blob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `postspark-dna-avaliacao-${id.slice(0, 8)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.split(",", 2)[1];
  if (!encoded) throw new Error("Asset incorporado inválido.");
  return Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
}

function bytesDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export async function downloadDesignDnaReproductionBundle(record: DesignDnaArchiveRecord): Promise<void> {
  if (record.schemaVersion !== 2 || !record.scene || !record.diagnosticPost || !record.sceneHash) {
    throw new Error("Este registro ainda não possui uma receita V2 reproduzível.");
  }
  const zip = new JSZip();
  const scene = structuredClone(record.scene);
  for (let index = 0; index < scene.fonts.length; index += 1) {
    const font = scene.fonts[index];
    if (!font.dataUrl) continue;
    zip.file(`fonts/${index}-${font.sha256 ?? "font"}.${font.mimeType?.split("/")[1] ?? "woff2"}`, dataUrlBytes(font.dataUrl));
    font.dataUrl = null;
  }
  zip.file("spec.json", JSON.stringify(scene, null, 2));
  zip.file("snapshot.json", JSON.stringify({ sceneHash: record.sceneHash, post: record.diagnosticPost }, null, 2));
  zip.file("evaluation.json", JSON.stringify({
    originalAnalysis: record.originalAnalysis,
    originalAnalysisCaptured: record.originalAnalysisCaptured,
    curatedAnalysis: record.analysis,
    reviews: record.reviews,
    selectedFontCandidate: record.selectedFontCandidate,
    referenceHeadline: record.referenceHeadline,
    referenceSupport: record.referenceSupport,
    entropy: record.entropy,
  }, null, 2));
  zip.file("manifest.json", JSON.stringify({
    format: "postspark.design-dna.reproduction", schemaVersion: 2, archiveId: record.id,
    title: record.title, sceneHash: record.sceneHash, exportedAt: new Date().toISOString(),
    fonts: record.scene.fonts.map((font, index) => ({ index, sha256: font.sha256, embedded: Boolean(font.dataUrl), mimeType: font.mimeType })),
    referenceImageIncluded: false,
  }, null, 2));
  if (record.baselinePngDataUrl) zip.file("baseline.png", dataUrlBytes(record.baselinePngDataUrl));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `postspark-dna-reproducao-${record.id.slice(0, 8)}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importDesignDnaReproductionBundle(file: File): Promise<DesignDnaArchiveRecord> {
  const zip = await JSZip.loadAsync(file);
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("text")) as { format: string; schemaVersion: number; title: string; sceneHash: string };
  if (manifest.format !== "postspark.design-dna.reproduction" || manifest.schemaVersion !== 2) throw new Error("Pacote de reprodução não reconhecido.");
  const scene = referenceSceneSchema.parse(JSON.parse(await zip.file("spec.json")!.async("text")));
  for (let index = 0; index < scene.fonts.length; index += 1) {
    const font = scene.fonts[index];
    const asset = Object.keys(zip.files).find(path => path.startsWith(`fonts/${index}-`));
    if (asset && font.mimeType) font.dataUrl = bytesDataUrl(await zip.file(asset)!.async("uint8array"), font.mimeType);
  }
  const sceneHash = await hashReferenceScene(scene);
  if (sceneHash !== manifest.sceneHash) throw new Error("O hash da receita importada diverge do manifesto.");
  const snapshot = JSON.parse(await zip.file("snapshot.json")!.async("text")) as { sceneHash: string; post: CanvasPostModel };
  if (snapshot.sceneHash !== sceneHash) throw new Error("A prévia do pacote não corresponde à receita.");
  const evaluationFile = zip.file("evaluation.json");
  if (!evaluationFile) throw new Error("O pacote não contém a análise de procedência.");
  const evaluation = JSON.parse(await evaluationFile.async("text")) as Partial<DesignDnaArchiveRecord> & { curatedAnalysis?: DesignDnaAnalysis };
  if (!evaluation.originalAnalysis || !evaluation.curatedAnalysis) throw new Error("A análise do pacote está incompleta.");
  const baselineFile = zip.file("baseline.png");
  const now = new Date().toISOString();
  const record: DesignDnaArchiveRecord = {
    schemaVersion: 2, id: createDesignDnaArchiveId(), title: manifest.title, createdAt: now, updatedAt: now,
    referenceImageDataUrl: null, originalAnalysis: evaluation.originalAnalysis,
    originalAnalysisCaptured: evaluation.originalAnalysisCaptured ?? false,
    analysis: evaluation.curatedAnalysis,
    reviews: evaluation.reviews ?? {}, blueprintId: "reference-derived", headline: "", subtext: "", categoryHint: "",
    entropy: evaluation.entropy ?? { overallScore: 0, asymmetry: 0, gridDeviation: 0, rotation: { degrees: 0, confidence: 0 }, noise: { intensity: 0, scale: 0, kind: "none" }, hardShadow: { intensity: 0, offsetX: 0, offsetY: 0, blur: 0 } },
    selectedFontCandidate: evaluation.selectedFontCandidate ?? null, referenceHeadline: evaluation.referenceHeadline ?? "", referenceSupport: evaluation.referenceSupport ?? "", reconstructionAccepted: false,
    scene, sceneHash, diagnosticPost: snapshot.post, diagnosticPostSceneHash: sceneHash,
    baselinePngDataUrl: baselineFile ? bytesDataUrl(await baselineFile.async("uint8array"), "image/png") : null,
    acceptedSceneHash: null, visualComparison: null,
  };
  await saveDesignDnaRecord(record);
  return record;
}
