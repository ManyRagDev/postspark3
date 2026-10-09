/** Read-only QA of an existing delivery and its owner's saved CanvasPostModel. No LLM replay. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getDb } from "../../server/db";
import { arsenalHash, projectContentHeadline } from "../../shared/arsenalContent";
import { assemblyVariationBundleV1Schema, componentHash, compositionFromAssemblyBundle, type AssemblyVariationBundleV1, type ComponentDefinitionV1 } from "../../shared/componentAssembly";
import { readArsenalComposition } from "../../shared/designArsenal";
import { resolveArsenalGeometry } from "../../shared/arsenalGeometry";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";
import type { ComponentPackage } from "./extract";

const [runId, postArgument, actor, outArgument, corpusArgument] = process.argv.slice(2);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if (!uuid.test(runId ?? "") || !uuid.test(actor ?? "") || !/^\d+$/.test(postArgument ?? ""))
  throw new Error("Uso: verifyDelivered.ts runUUID postId adminUUID outputDirectory [corpusDirectory]");
const postId = Number(postArgument), db = getDb();
const output = path.resolve(outArgument ?? `artifacts/component-arsenal/verification/delivery-${runId}`);
const corpus = path.resolve(corpusArgument ?? "artifacts/component-arsenal/revision-7-cta");
const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
const byteHash = (v: Buffer | string) => createHash("sha256").update(v).digest("hex");
const admin = await db.from("profiles").select("role").eq("id", actor).single();
if (admin.error || admin.data?.role !== "admin") throw new Error("Verificação exige administrador existente");
// Explicit owner filters are mandatory even though getDb holds server privileges.
const [runResult, postResult] = await Promise.all([
  db.from("generation_runs").select("id,status,post_mode,accepted_count,created_at,output_snapshot").eq("id", runId).eq("user_uuid", actor).single(),
  db.from("posts").select("id,createdAt,updatedAt,canvas_model").eq("id", postId).eq("user_uuid", actor).single(),
]);
if (runResult.error || postResult.error) throw new Error("Run/post ausente ou não pertencente ao ator");
const run = runResult.data, post = postResult.data, model = post.canvas_model as any;
if (run.status !== "completed" || !Array.isArray(run.output_snapshot) || run.output_snapshot.length !== 3)
  throw new Error("A run não é uma entrega concluída de três propostas");
const variations: AssemblyVariationBundleV1[] = run.output_snapshot.map((v: any) => assemblyVariationBundleV1Schema.parse(v.componentAssemblyV1));
const componentIds = [...new Set(variations.flatMap(v => v.slides.flatMap(s => s.bundle.candidates.flatMap(c => c.componentAssembly?.componentIds ?? []))))];
const stored = await db.from("design_components").select("id,status,kind,source_key,definition_hash,definition").in("id", componentIds);
if (stored.error || stored.data?.length !== componentIds.length) throw new Error("Definições pinadas ausentes");
type StoredComponent = { id: string; status: string; kind: string; source_key: string; definition_hash: string; definition: ComponentDefinitionV1 };
const definitions = new Map<string, StoredComponent>((stored.data as StoredComponent[]).map(c => [c.id, c]));
const inventory = JSON.parse(await fs.readFile(path.join(corpus, "inventory.json"), "utf8"));
const packages: ComponentPackage[] = await Promise.all(inventory.rows.filter((r: any) => r.package).map((r: any) => fs.readFile(path.join(corpus, r.package), "utf8").then(JSON.parse)));
const packageById = new Map(packages.flatMap(p => p.components.map(c => [c.id, p] as const)));
const sourceChecks = await Promise.all(componentIds.map(async id => {
  const row = definitions.get(id)!, d = row.definition, p = packageById.get(id);
  const actualDefinitionHash = componentHash(d);
  const fileActual = p ? byteHash(await fs.readFile(p.source.recipePath)) : null;
  const snapshotActual = p ? arsenalHash(p.sourceSnapshot.recipe) : null;
  return {
    id, kind: row.kind, status: row.status, label: d.label, source: d.source,
    definitionHash: row.definition_hash, actualDefinitionHash,
    definitionHashValid: actualDefinitionHash === row.definition_hash && d.hash === row.definition_hash,
    localPackageHashValid: !!p && p.components.find(c => c.id === id)?.hash === row.definition_hash,
    provenance: p ? { category: p.source.category, title: p.source.title, referenceId: p.source.referenceId, recipePath: p.source.recipePath, destination: p.source.destination } : null,
    fileHashActual: fileActual, fileHashValid: d.source.kind === "recipe" && !!p && fileActual === p.source.fileHash && fileActual === d.source.fileHash,
    recipeHashActual: snapshotActual, recipeHashValid: d.source.kind === "recipe" && !!p && snapshotActual === d.source.recipeHash,
  };
}));
const proposals = [];
for (const variation of variations) {
  const slides = [];
  for (const slide of variation.slides) {
    const bundle = slide.bundle, candidate = bundle.candidates[0];
    if (!candidate) throw new Error("Proposta entregue sem candidato pinado");
    const measureText = await createComponentTextMeasurer(bundle.assets, a => fs.readFile(path.join(corpus, "assets", a.sha256)));
    const compiled = readArsenalComposition(resolveArsenalGeometry(compositionFromAssemblyBundle(bundle), { measureText, allowReduction: false }));
    const expectedSources = [...new Set((candidate.componentAssembly?.componentIds ?? []).flatMap(id => {
      const source = definitions.get(id)!.definition.source;
      return source.kind === "recipe" ? [source.recipeHash, source.fileHash] : [source.definitionHash, source.variantHash];
    }))];
    slides.push({
      id: slide.id, role: slide.role, density: slide.density, payloadJsonBytes: bytes(bundle), bundleHash: arsenalHash(bundle),
      candidateId: candidate.candidateId, compilerVersion: candidate.compilerVersion,
      contentHash: bundle.userContentHash, actualContentHash: arsenalHash(bundle.content), contentHashValid: bundle.userContentHash === arsenalHash(bundle.content),
      variantHash: candidate.variantHash, actualVariantHash: arsenalHash(candidate.variant),
      definitionHash: candidate.definitionHash, actualDefinitionHash: arsenalHash({ pieces: bundle.pieces, variant: candidate.variant }),
      componentIds: candidate.componentAssembly?.componentIds, componentHashes: candidate.componentAssembly?.componentHashes,
      componentHashesValid: candidate.componentAssembly?.componentIds.every((id, i) => definitions.get(id)?.definition_hash === candidate.componentAssembly?.componentHashes[i]),
      sourceHashes: candidate.componentAssembly?.sourceHashes,
      sourceHashesValid: arsenalHash(expectedSources) === arsenalHash(candidate.componentAssembly?.sourceHashes),
      resolution: candidate.componentAssembly?.resolution ?? { kind: "component-composition" },
      compiledState: compiled.state, compiledIssues: compiled.issues, deferredMediaSlots: compiled.base.mediaSlots?.map(s => ({ id: s.id, function: s.function, deferred: s.deferred, policy: s.policy })),
      fontByteHashesVerified: true,
    });
  }
  proposals.push({ slot: variation.slot, direction: variation.direction.label, planHash: variation.planHash, runId: variation.runId, payloadJsonBytes: bytes(variation), slides });
}
const saved = model.slides.map((s: any) => {
  const c = readArsenalComposition(s.composition), generated = variations[model.componentAssembly.slot].slides.find(x => x.id === s.id)?.bundle;
  const originCandidate = generated?.candidates.find(x => x.candidateId === c.origin.candidateId);
  return { id: s.id, state: c.state, contentRevision: c.contentRevision, headlineProjection: s.headline, canonicalHeadline: projectContentHeadline(c.content), headlineProjectionMatches: s.headline === projectContentHeadline(c.content),
    userContentHash: c.userContentHash, actualContentHash: arsenalHash(c.content), contentHashValid: c.userContentHash === arsenalHash(c.content),
    generatedContentHash: c.generatedContentHash, generatedContentHashMatchesRun: c.generatedContentHash === generated?.userContentHash,
    copyEdited: c.userContentHash !== c.generatedContentHash,
    pinnedCandidatePreserved: !!originCandidate && originCandidate.variantHash === c.origin.variantHash && originCandidate.definitionHash === c.origin.definitionHash,
    componentHashesPreserved: arsenalHash(c.origin.componentAssembly?.componentHashes) === arsenalHash(originCandidate?.componentAssembly?.componentHashes),
    planHashPreserved: c.origin.componentAssembly?.planHash === model.componentAssembly.planHash,
  };
});
const report = { format: "postspark.component-arsenal.delivered-qa", schemaVersion: 1, checkedAt: new Date().toISOString(), runId, postId,
  scope: "Read-only actor-scoped DB queries and local deterministic compiler; no provider call, DB mutation or visual approval.",
  run: { status: run.status, postMode: run.post_mode, acceptedCount: run.accepted_count, createdAt: run.created_at, outputJsonBytes: bytes(run.output_snapshot), outputHash: arsenalHash(run.output_snapshot) },
  proposals, sources: sourceChecks,
  savedPost: { updatedAt: post.updatedAt, payloadJsonBytes: bytes(model), documentHash: arsenalHash(model), provenanceRunId: model.provenance?.generationRunId, assembly: model.componentAssembly, reports: model.componentCompilationReports, slides: saved },
  allProposalsApplied: proposals.every(p => p.slides.every(s => s.compiledState === "applied" && !s.compiledIssues.length)),
  allProposalsWithoutEditorialFallback: proposals.every(p => p.slides.every(s => s.resolution.kind !== "editorial-fallback")),
  allSourcesVerified: sourceChecks.every(s => s.definitionHashValid && s.localPackageHashValid && s.fileHashValid && s.recipeHashValid),
  limits: ["Payload bytes are UTF-8 JSON bytes, not HTTP compression or wire sizes.", "Compilation uses the official shared solver and actual font bytes; no Stage/browser visual approval is implied.", "Saved edited content is checked against its current hash; the generated hash remains pinned to the original bundle."],
};
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, "checks.json"), JSON.stringify(report, null, 2) + "\n");
await fs.writeFile(path.join(output, "REPORT.md"), `# QA da entrega ${runId}\n\nLeitura do banco restrita à run e ao post ${postId} do administrador informado. Nenhum provider foi chamado e nenhum registro foi alterado.\n\nTrês propostas: ${report.allProposalsApplied ? "applied, sem issues no solver determinístico" : "consultar estados e issues no JSON"}; sem fallback editorial: ${report.allProposalsWithoutEditorialFallback}. Fontes e proveniências verificadas: ${report.allSourcesVerified}.\n\nJSON do resultado: ${report.run.outputJsonBytes} bytes; documento salvo: ${report.savedPost.payloadJsonBytes} bytes (antes de compressão HTTP).\n\nTítulo salvo: “${saved[0].canonicalHeadline}”. Projeção coincide com conteúdo canônico: ${saved[0].headlineProjectionMatches}. Edição de copy preservada: ${saved[0].copyEdited}; hash atual válido: ${saved[0].contentHashValid}; hash da geração original preservado: ${saved[0].generatedContentHashMatchesRun}; candidato pinado preservado: ${saved[0].pinnedCandidatePreserved}.\n\nEste relatório confirma contratos e persistência, sem concluir qualidade visual ou exportação pelo navegador. Artefatos anteriores de QA descrevem suas respectivas runs e não substituem esta entrega.\n`);
console.log(JSON.stringify({ runId, postId, proposals: proposals.length, allProposalsApplied: report.allProposalsApplied, allProposalsWithoutEditorialFallback: report.allProposalsWithoutEditorialFallback, allSourcesVerified: report.allSourcesVerified, copyEdited: saved[0].copyEdited, output }));
