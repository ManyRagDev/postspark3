import fs from "node:fs/promises";
import path from "node:path";
import { readOriginalReference, sha256, type OriginalReference, type SourceRecord } from "../componentArsenal/inventory";
import type { RecreationRecipe } from "../../shared/designRecreation";

export type DesignReferenceEvidence = {
  originalStatus: "verified" | "unavailable" | "not-declared";
  original?: OriginalReference & { relativePath: string };
  historicalPreview?: { sha256: string; relativePath: string };
};

export async function copyDesignReferences(record: SourceRecord, recipe: RecreationRecipe, output: string, options: {
  originalsDirectory?: string; candidatePath?: string; root?: string; inventoryPath?: string; previewIsOriginal?: boolean;
} = {}): Promise<DesignReferenceEvidence> {
  const original = await readOriginalReference(recipe, options);
  const evidence: DesignReferenceEvidence = { originalStatus: original ? "verified" : recipe.scene.source.originalHash ? "unavailable" : "not-declared" };
  if (original) {
    const extension = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[original.metadata.mimeType];
    const relativePath = `references/originals/${original.metadata.sha256}${extension}`;
    await fs.mkdir(path.join(output, "references/originals"), { recursive: true });
    await fs.writeFile(path.join(output, relativePath), original.bytes);
    evidence.original = { ...original.metadata, relativePath };
  }
  if (!options.previewIsOriginal) {
    const bytes = await fs.readFile(path.resolve(options.root ?? process.cwd(), record.previewPath));
    const hash = sha256(bytes), relativePath = `references/historical-previews/${hash}${path.extname(record.previewPath) || ".png"}`;
    await fs.mkdir(path.join(output, "references/historical-previews"), { recursive: true });
    await fs.writeFile(path.join(output, relativePath), bytes);
    evidence.historicalPreview = { sha256: hash, relativePath };
  }
  return evidence;
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export function completeDesignReviewHtml(rows: Array<{
  title: string; status: string; references?: DesignReferenceEvidence; reason?: string;
  previews?: Array<{ id: string; issues: string[]; blockingIssues: string[]; diagnostics: string[]; render: string; renderer?: string }>;
}>): string {
  const image = (src: string, label: string, hash: string) => `<figure><figcaption>${escape(label)}<br><small>SHA-256 ${escape(hash)}</small></figcaption><img src="${escape(src)}" alt="${escape(label)}"></figure>`;
  return `<!doctype html><meta charset="utf-8"><title>Designs completos · evidência</title><style>body{background:#17191e;color:#eee;font:15px system-ui;margin:32px}section{margin-bottom:40px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}img{width:100%;height:auto}figure{margin:0}figcaption{padding:12px;overflow-wrap:anywhere}small{font-size:11px}pre{white-space:pre-wrap}</style><h1>Designs completos · revisão</h1><p>Original verificado, reconstrução histórica e conversão são evidências distintas. Sem aprovação de fidelidade, qualidade visual ou publicação automática. Sobreposição autorada com mídia e contraste inconclusivo exigem revisão renderizada.</p>${rows.map(row => `<section><h2>${escape(row.title)}</h2><p>${escape(row.status)}${row.reason ? ` · ${escape(row.reason)}` : ""}</p><div class="grid">${row.references?.original ? image(row.references.original.relativePath, "Original — bytes verificados", row.references.original.sha256) : `<p>Original ${row.references?.originalStatus === "not-declared" ? "não declarado na receita" : "indisponível; fidelidade ao original não verificada"}.</p>`}${row.references?.historicalPreview ? image(row.references.historicalPreview.relativePath, "Reconstrução histórica da receita — não é o original", row.references.historicalPreview.sha256) : ""}${(row.previews ?? []).map(preview => `<figure><figcaption>Conversão ${escape(preview.id)} · ${escape(preview.renderer === "CanvasPostStage" ? "CanvasPostStage real" : "render diagnóstico; mídia não renderizada")} · ${preview.blockingIssues.length} bloqueios · ${preview.diagnostics.length} diagnósticos</figcaption><img src="${escape(preview.render)}" alt="Conversão completa"><pre>${escape(preview.issues.join("\n"))}</pre></figure>`).join("")}</div></section>`).join("")}`;
}
