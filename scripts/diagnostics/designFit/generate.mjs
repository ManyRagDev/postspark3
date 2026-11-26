// Isolated execution of the pinned worker. Only OpenRouter can receive a network request.
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  readFileSync,
  existsSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";

const [n, arm] = process.argv.slice(2);
assert(["2", "7", "10"].includes(n) && ["A", "B"].includes(arm));
const root = process.env.DESIGN_FIT_OUTPUT;
const worker = process.env.DESIGN_FIT_WORKER;
const dir = join(root, "geracoes", n + "-" + arm);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const read = path => JSON.parse(readFileSync(path));
const write = (name, value) => {
  const file = join(dir, name + ".json");
  writeFileSync(file + ".tmp", JSON.stringify(value), { mode: 0o600 });
  renameSync(file + ".tmp", file);
};
if (existsSync(join(dir, "final.json"))) {
  console.log("Execução anterior concluída", n, arm);
  process.exit(0);
}
const runPlan = read(join(root, "plano-" + n + "-" + arm + ".json"));
const { r } = JSON.parse(
  gunzipSync(readFileSync(join(root, "recibos", runPlan.source + ".json.gz")))
);
const p = r.prepared;
const state = new AsyncLocalStorage();
const digest = data => createHash("sha256").update(data).digest("hex");
const http = globalThis.fetch;
globalThis.fetch = async (request, init) => {
  assert.equal(
    String(request),
    "https://openrouter.ai/api/v1/chat/completions"
  );
  assert.equal(init.method, "POST");
  const body = JSON.parse(init.body);
  assert(
    ["anthropic/claude-haiku-5.5", "deepseek/deepseek-v4.1-flash"].includes(
      body.model
    )
  );
  const key = state.getStore();
  assert(key, "provider operation missing");
  const wire = "wire-" + digest(key + init.body);
  const file = join(dir, wire + ".json");
  if (existsSync(file)) {
    const cached = read(file);
    return new Response(JSON.stringify(cached.response), {
      status: cached.status,
      headers: { "content-type": "application/json" },
    });
  }
  writeFileSync(
    file + ".pending",
    JSON.stringify({ key, requestHash: digest(init.body) }),
    { flag: "wx", mode: 0o600 }
  );
  const start = Date.now();
  const response = await http(request, { ...init, redirect: "error" });
  const result = await response.clone().json();
  write(wire, {
    key,
    start,
    elapsedMs: Date.now() - start,
    status: response.status,
    model: body.model,
    requestHash: digest(init.body),
    response: result,
  });
  unlinkSync(file + ".pending");
  console.log(
    n,
    arm,
    key.split(":").slice(1, 3).join(":"),
    response.status,
    result.usage?.cost ?? "custo desconhecido"
  );
  return response;
};
const assetDir = resolve(
  "artifacts/acervo82/full/acervo82-fidelidade-20261119/assets"
);
const req = createRequire(join(resolve(worker), "package.json"));
// The pinned worker resolves its log filename once, when this module loads.
const projectDirectory = process.cwd();
try {
  process.chdir(dir);
  req("./server/_core/operationalLog.ts");
} finally {
  process.chdir(projectDirectory);
}
const { GenerationCoordinator } = req(
  "./server/ai/workflows/generationCoordinator.ts"
);
const { recoverGenerationDelivery, deliveryRecoveryHistory } = req(
  "./server/ai/workflows/generationDeliveryRecovery.ts"
);
const { proposalRecoveryCopyFromOperations, proposalRecoveryOperationKeys } =
  req("./server/ai/workflows/generationRuntime.ts");
const { invokeLLM } = req("./server/_core/llm.ts");
const {
  renderReviewScenes,
  closeReviewRenderer,
  assertReviewRendererAvailable,
} = req("./server/ai/workflows/proposalRenderer.ts");
const { createComponentTextMeasurer } = req(
  "./server/ai/componentTextMeasurer.ts"
);
const { componentDefinitionV1Schema } = req("./shared/componentAssembly.ts");
const { slots, offers, deliveryReserves } = runPlan;
const idFile = join(dir, "admissao.json");
if (!existsSync(idFile))
  write("admissao", {
    id: randomUUID(),
    source: r.id,
    arm,
    n,
    start: Date.now(),
  });
const { id } = read(idFile);
const defFolder = join(root, "definicoes");
const byId = new Map(
  readdirSync(defFolder).map(file => {
    const def = componentDefinitionV1Schema.parse(read(join(defFolder, file)));
    assert.equal(file, def.hash + ".json");
    return [def.id, def];
  })
);
const definitions = offers.map(offer =>
  offer.slides.map(slide => {
    const def = byId.get(slide.componentId);
    assert.equal(def.hash, slide.componentHash);
    return def;
  })
);
const bytes = async asset => {
  const local = join(assetDir, asset.sha256);
  const data = readFileSync(
    existsSync(local) ? local : join(root, "assets", asset.sha256)
  );
  assert.equal(digest(data), asset.sha256);
  return data;
};
const journal = new Map();
for (const file of readdirSync(dir).filter(
  f => f.startsWith("op-") && f.endsWith(".json")
)) {
  const row = read(join(dir, file));
  journal.set(row.operationKey, row);
}
const operations = () => [...journal.values()];
async function operation(key, work) {
  const cached = journal.get(key);
  if (cached) return cached.result;
  const result = await state.run(key, work);
  const row = { operationKey: key, state: "completed", result };
  write("op-" + digest(key), row);
  journal.set(key, row);
  return result;
}
const planning = { ...p.planning, slots, offers, deliveryReserves };
const graphDeps = {
  createTextMeasurer: assets => createComponentTextMeasurer(assets, bytes),
};
const pilotFile = join(dir, "pilote-asset-manquant.json");
const pilot = existsSync(pilotFile) ? read(pilotFile) : null;
if (pilot) assert(n === "2" && arm === "A" && pilot.id === id);
const savedProposals = pilot?.snapshot.proposals.filter(
  s =>
    !s.diagnostics?.some(
      d => d.evidence === "proposal_review_renderer_unavailable"
    )
);
const run = new GenerationCoordinator(
  {
    ...p,
    ...r.input,
    planning,
    savedProposals,
    requestId: id,
    runId: id,
    actor: "design-fit",
    prompt: r.input.content,
    selectedDefinitions: definitions,
    generationConfig: read(join(root, "configuracoes.json"))[r.id],
    reviewLenientDelivery: true,
    experimental: true,
    deadlineMs: Date.now() + 360000,
    selectionReasons: slots.map(s => s.reason),
    editorialApproaches: slots.map(s => s.editorialApproach ?? null),
  },
  {
    ...graphDeps,
    actor: "design-fit",
    generateText: params => invokeLLM({ ...params, disableFallback: true }),
    renderReviewScenes: input =>
      renderReviewScenes({ ...input, loadAssetBytes: bytes }),
    recoveryOperationKeys: (proposalId, attemptId) =>
      proposalRecoveryOperationKeys(
        { listOperations: operations },
        { id, ownerId: "design-fit" },
        proposalId,
        attemptId
      ),
    reviewRepairOperationKeys: async proposalId =>
      operations()
        .map(o => o.operationKey)
        .filter(
          k =>
            k.startsWith(proposalId + ":review_evidence_repair:") ||
            (k.startsWith(proposalId + "-fb") &&
              k.includes(":review_evidence_repair:"))
        )
        .map(k => k.slice(proposalId.length + 1)),
    reviewOperations: async pid =>
      operations()
        .filter(
          o =>
            o.operationKey.startsWith(pid + ":review:") ||
            o.operationKey.startsWith(pid + ":review_evidence_repair:")
        )
        .map(o => ({
          ...o,
          operationKey: o.operationKey.slice(pid.length + 1),
        })),
    operationForProposal:
      pid =>
      ({ operationKey }, work) =>
        operation(pid + ":" + operationKey, work),
    recoverDelivery: async (input, reuseOriginal, context) => {
      const history = deliveryRecoveryHistory(
        operations(),
        input.proposalId,
        context.recoveryAttempt
      );
      const previous = history.previous;
      return recoverGenerationDelivery({
        planning,
        input,
        reuseOriginal,
        graphDeps,
        sourceDefinitions: previous
          ? previous.plan.pages.map(pg => byId.get(pg.componentId))
          : context.sourceDefinitions,
        recoveryAttempt: context.recoveryAttempt,
        excludedCandidateIds: [
          ...context.excludedCandidateIds,
          ...history.candidateIds,
        ],
        excludedFamilies: context.excludedFamilies,
        claimFamily: context.claimFamily,
        readOriginalCopy: async () =>
          proposalRecoveryCopyFromOperations(
            operations(),
            previous?.attemptId ?? context.sourceAttemptId,
            input.reviewExecutionConfig.visualTextRepairVersion
          ) ?? previous?.copy,
        hydrate: async ids => ids.map(i => byId.get(i)),
        operation: (key, work) => operation(input.proposalId + ":" + key, work),
      });
    },
  }
);
try {
  await assertReviewRendererAvailable();
  const started = Date.now();
  run.onUpdate(snapshot => write("progresso", snapshot));
  const snapshot = await run.start();
  write("final", {
    id,
    n,
    arm,
    source: r.id,
    started,
    finished: Date.now(),
    snapshot,
  });
  console.log(
    n,
    arm,
    snapshot.overallStatus,
    snapshot.proposals.map(s => [s.status, s.bundle?.family, s.failure?.code])
  );
} finally {
  await closeReviewRenderer();
}
