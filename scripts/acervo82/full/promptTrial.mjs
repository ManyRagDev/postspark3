import { readFile } from "node:fs/promises";
import path from "node:path";

// The separately authorized round for the five design-directed Studio prompts.
export const promptTrial = Object.freeze({
  session: "design-prompts-01",
  authorization: "user-authorized-acervo82-design-prompts",
  campaign: "acervo82-design-prompts",
  maxUsd: 3,
  maxCalls: 100,
  maxAdmissions: 5,
  casesFile: "designs/acervo82/authored/design-prompt-cases.json",
});

export const manualTrial = Object.freeze({
  session: "manual-01",
  authorization: "user-authorized-acervo82-manual",
  campaign: "acervo82-manual",
  maxUsd: 3,
  maxCalls: 100,
  maxAdmissions: 7,
  previousMaxAdmissions: 5,
});

export async function readTrialCatalog(root, full, trial) {
  const directory = path.join(root, "artifacts/acervo82", full ? "full" : "pilot");
  const original = JSON.parse(await readFile(path.join(directory, "staged.json"), "utf8"));
  if (trial !== manualTrial) return { original, stage: original };
  const updated = await readFile(path.join(directory, "staged-aura.json"), "utf8")
    .then(JSON.parse)
    .catch(error => { if (error.code !== "ENOENT") throw error; });
  if (!updated) return { original, stage: original };
  if (updated.from?.revision !== original.revision || updated.from?.identity !== original.identity ||
    updated.actor !== original.actor || updated.sources !== 82 || updated.replacement?.family !== "acervo82-concept-17" ||
    !/^[1-9]\d*$/.test(updated.revision) || ![updated.identity, updated.indexHash, updated.replacement.hash].every(hash => /^[a-f0-9]{64}$/.test(hash))) {
    throw new Error("acervo82_aura_catalog_scope_invalid");
  }
  return { original, stage: updated };
}
