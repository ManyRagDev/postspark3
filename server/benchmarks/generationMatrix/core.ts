import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { generationMatrixCorpus } from "./corpus";

export type CatalogReference = { revision: string } | { snapshot: string };
export interface MatrixOptions {
  live: boolean;
  resume: boolean;
  includeDrafts: boolean;
  validateCatalogs: boolean;
  output: string;
  seed: string;
  repeats: number;
  caseIds: string[];
  baseline?: CatalogReference;
  revised?: CatalogReference;
  maxUsd?: number;
  maxCalls?: number;
  imageFile?: string;
  sourceUrl?: string;
  continueFrom?: string;
  sharedBudget?: string;
  campaignId?: string;
  arms?: string[];
  proposalConcurrency?: 1 | 3;
  selectionReplay?: string;
}
export function parseMatrixArgs(args: string[]): MatrixOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const flagNames = new Set([
    "live",
    "resume",
    "include-drafts",
    "validate-catalogs",
  ]);
  const valueNames = new Set([
    "out",
    "seed",
    "repeats",
    "cases",
    "baseline-revision",
    "revised-revision",
    "baseline-snapshot",
    "revised-snapshot",
    "max-usd",
    "max-calls",
    "image-file",
    "source-url",
    "continue-from",
    "shared-budget",
    "campaign-id",
    "arms",
    "proposal-concurrency",
    "selection-replay",
  ]);
  for (let i = 0; i < args.length; i++) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
    if (!match) throw new Error(`Invalid argument: ${args[i]}`);
    const [, name, inline] = match;
    if (flagNames.has(name)) {
      if (inline !== undefined || flags.has(name))
        throw new Error(`Invalid flag: ${name}`);
      flags.add(name);
    } else {
      if (!valueNames.has(name) || values.has(name))
        throw new Error(`Unknown or duplicate argument: ${name}`);
      const value = inline ?? args[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`Missing value: ${name}`);
      values.set(name, value);
    }
  }
  const positive = (key: string, integer = false) => {
    if (!values.has(key)) return undefined;
    const n = Number(values.get(key));
    if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isInteger(n)))
      throw new Error(`Invalid positive number: ${key}`);
    return n;
  };
  const catalog = (strategy: string): CatalogReference | undefined => {
    const revision = values.get(`${strategy}-revision`),
      snapshot = values.get(`${strategy}-snapshot`);
    if (revision && snapshot)
      throw new Error(`Choose one catalog source: ${strategy}`);
    if (revision && !/^\d+$/.test(revision))
      throw new Error("Invalid catalog revision");
    return revision
      ? { revision }
      : snapshot
        ? { snapshot: resolve(snapshot) }
        : undefined;
  };
  const options: MatrixOptions = {
    live: flags.has("live"),
    resume: flags.has("resume"),
    includeDrafts: flags.has("include-drafts"),
    validateCatalogs: flags.has("validate-catalogs"),
    output: resolve(
      values.get("out") ?? "artifacts/verification/generation-matrix"
    ),
    seed: values.get("seed") ?? "postspark-generation-matrix-v1",
    repeats: positive("repeats", true) ?? 1,
    caseIds:
      values.get("cases")?.split(",") ?? generationMatrixCorpus.map(c => c.id),
    baseline: catalog("baseline"),
    revised: catalog("revised"),
    maxUsd: positive("max-usd"),
    maxCalls: positive("max-calls", true),
    imageFile: values.get("image-file") && resolve(values.get("image-file")!),
    sourceUrl: values.get("source-url"),
    continueFrom:
      values.get("continue-from") && resolve(values.get("continue-from")!),
    sharedBudget:
      values.get("shared-budget") && resolve(values.get("shared-budget")!),
    campaignId: values.get("campaign-id"),
    arms: values.get("arms")?.split(","),
    proposalConcurrency: positive("proposal-concurrency", true) as
      | 1
      | 3
      | undefined,
    selectionReplay:
      values.get("selection-replay") &&
      resolve(values.get("selection-replay")!),
  };
  if (
    options.arms &&
    (!options.arms.length ||
      new Set(options.arms).size !== options.arms.length ||
      options.arms.some(
        a => !["s1-gemini", "s1-gpt", "s2-gemini", "s2-gpt"].includes(a)
      ))
  )
    throw new Error("Unknown or duplicate matrix arm");
  if (
    options.proposalConcurrency !== undefined &&
    ![1, 3].includes(options.proposalConcurrency)
  )
    throw new Error("proposal-concurrency must be 1 or 3");
  if (
    !options.caseIds.length ||
    new Set(options.caseIds).size !== options.caseIds.length ||
    options.caseIds.some(id => !generationMatrixCorpus.some(c => c.id === id))
  )
    throw new Error("Unknown or duplicate corpus case");
  if (options.sourceUrl && !/^https?:\/\//.test(options.sourceUrl))
    throw new Error("source-url must be HTTP(S)");
  if (
    options.live &&
    (!options.maxUsd ||
      !options.maxCalls ||
      !options.baseline ||
      !options.revised)
  )
    throw new Error(
      "Live requires --max-usd, --max-calls and both pinned catalogs"
    );
  if (
    options.live &&
    options.caseIds.includes("image-highlight") &&
    !options.imageFile
  )
    throw new Error(
      "image-highlight requires --image-file for a real image source"
    );
  if (options.validateCatalogs && (!options.baseline || !options.revised))
    throw new Error("catalog_validation_requires_both_pinned_catalogs");
  if (
    options.continueFrom &&
    (options.continueFrom === options.output ||
      options.output.startsWith(options.continueFrom + "/"))
  )
    throw new Error("continuation_requires_a_new_output_directory");
  if (options.sharedBudget && (options.continueFrom || !options.campaignId))
    throw new Error(
      "shared_budget_requires_new_campaign_id_without_continuation"
    );
  if (
    options.campaignId &&
    !/^[a-z0-9][a-z0-9_-]{2,80}$/.test(options.campaignId)
  )
    throw new Error("invalid_campaign_id");
  if (
    options.selectionReplay &&
    (!options.sharedBudget ||
      options.continueFrom ||
      options.resume ||
      options.caseIds.join(",") !== "five-items" ||
      options.arms?.join(",") !== "s2-gpt" ||
      options.repeats !== 1)
  )
    throw new Error(
      "selection_replay_requires_one_new_shared_budget_five_items_gpt_phase"
    );
  return options;
}
export function matrixPlan(options: MatrixOptions) {
  return options.caseIds
    .flatMap(caseId =>
      Array.from({ length: options.repeats }, (_, repeat) =>
        ([1, 2] as const).flatMap(strategy =>
          (["gemini", "gpt"] as const).map(choice => {
            const id = `${caseId}-${repeat + 1}-s${strategy}-${choice}`;
            const hash = createHash("sha256")
              .update(
                `${options.campaignId ? options.campaignId + ":" : ""}${options.seed}:${id}`
              )
              .digest("hex");
            return {
              id,
              caseId,
              repeat: repeat + 1,
              strategy,
              choice,
              blindId: `Peça-${hash.slice(0, 10)}`,
              runId: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`,
              catalog: strategy === 1 ? options.baseline : options.revised,
            };
          })
        )
      ).flat()
    )
    .filter(
      entry =>
        !options.arms ||
        options.arms.includes(`s${entry.strategy}-${entry.choice}`)
    )
    .sort((a, b) => a.blindId.localeCompare(b.blindId));
}
export type MatrixEntry = ReturnType<typeof matrixPlan>[number];
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
export interface BlindPiece {
  id: string;
  caseId: string;
  prompt: string;
  caption: string;
  images: string[];
  ready: boolean;
}
export function blindReport(pieces: BlindPiece[]): string {
  const criteria = [
    "Cobertura do pedido",
    "Tom e naturalidade",
    "Identidade visual",
    "Ritmo e progressão",
    "Legibilidade",
  ];
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Comparação de posts</title><style>body{font:16px system-ui;background:#f5f5f1;color:#242424;max-width:1250px;margin:40px auto;padding:20px}article{background:white;border:1px solid #ddd;padding:24px;margin:24px 0}img{max-width:300px;max-height:430px}.images{display:flex;overflow:auto;gap:12px}label{display:block;margin:8px 0}textarea{width:100%;min-height:70px}button{padding:12px}</style><h1>Avaliação das peças</h1><p>Modelos e estratégias estão ocultos. Avalie as artes e a cobertura do pedido; o veredito automático não substitui sua avaliação. Notas de 1 (fraco) a 5 (forte); deixe vazio quando não se aplicar.</p><button id="export">Exportar avaliações</button>${pieces.map(p => `<article data-id="${escapeHtml(p.id)}"><h2>${escapeHtml(p.caseId)} · ${escapeHtml(p.id)}</h2><p>${escapeHtml(p.prompt)}</p><div class="images">${p.images.map(src => `<img src="${escapeHtml(src)}" alt="Slide da peça ${escapeHtml(p.id)}">`).join("")}</div><p>${p.ready ? escapeHtml(p.caption) : "Nenhuma arte pronta nesta execução."}</p>${criteria.map((c, i) => `<label>${c} <select data-field="criterion-${i}"><option value=""></option>${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`).join("")}</select></label>`).join("")}<label>Observações<textarea data-field="notes"></textarea></label></article>`).join("")}<script>const key='postspark-blind-matrix:'+location.pathname;let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{};document.querySelectorAll('article').forEach(a=>{a.querySelectorAll('[data-field]').forEach(e=>{e.value=saved[a.dataset.id]?.[e.dataset.field]||'';e.addEventListener('change',()=>{saved[a.dataset.id]??={};saved[a.dataset.id][e.dataset.field]=e.value;try{localStorage.setItem(key,JSON.stringify(saved))}catch{}})})});document.querySelector('#export').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({version:1,ratings:saved},null,2)],{type:'application/json'}));a.download='human-ratings.json';a.click();URL.revokeObjectURL(a.href)};</script></html>`;
}
