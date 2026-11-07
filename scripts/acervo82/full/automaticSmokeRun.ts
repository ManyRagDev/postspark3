/** Explicit live admission only through the bounded automatic smoke launcher. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { automaticSmokeProfile, smokeHash } from "./automaticSmoke.mjs";
import { openLocalApi } from "./localApi";
import { orchestratedGenerationInputSchema } from "../../../shared/generationRequest";
import { getDb } from "../../../server/db";
import { inspectGenerationEvidence } from "../../../server/generationEvidence";
import { writeJson } from "../../../server/benchmarks/generationMatrix/journal";
const json = async (file: string) => JSON.parse(await fs.readFile(file, "utf8"));
const config = await json(process.env.POSTSPARK_ACERVO82_PILOT_CONFIG!);
assert.equal(config.profileHash, smokeHash); assert.equal(config.maxUsd, automaticSmokeProfile.maxUsd);
const selected = process.argv[2];
assert(automaticSmokeProfile.cases.some((entry: any) => entry.id === selected), "Specify one authorized case only; inspect its receipts before starting the next.");
const test = automaticSmokeProfile.cases.find((entry: any) => entry.id === selected)!;
const directory = path.join(path.dirname(config.budgetFile), test.id);
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
const receiptFile = path.join(directory, "admission.json");
let receipt = await json(receiptFile).catch(error => { if (error.code === "ENOENT") return { case: test.id, createdAt: new Date().toISOString(), idempotencyKey: `${automaticSmokeProfile.session}-${test.id}` }; throw error; });
await writeJson(receiptFile, receipt);
const local = await openLocalApi({port:Number(process.env.PORT)});
try {
  assert.equal(local.actor, config.actor);
  if (!receipt.requestId) {
    const input = orchestratedGenerationInputSchema.parse({ ownerId: local.actor, inputType: "text", content: test.content, platform: "instagram", postMode: test.postMode, ...(test.slides > 1 ? { slideCount: test.slides } : {}), aspectRatio: "4:5", creationMode: "ideation", generationModel: "auto", includeDraftDesigns: true, formatIntentConfirmed: true, idempotencyKey: receipt.idempotencyKey });
    const admission = await local.api.generation.start.mutate(input);
    receipt = { ...receipt, requestId: admission.snapshot.requestId, created: admission.created };
    await writeJson(receiptFile, receipt);
  }
  let response = await local.api.generation.get.query({ requestId: receipt.requestId });
  // Polling observes this exact admitted request; it never retries a paid operation.
  const deadline = Date.now() + 10 * 60_000;
  while (response.snapshot.overallStatus === "running" && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2500));
    response = await local.api.generation.get.query({ requestId: receipt.requestId });
  }
  if (["completed", "partial", "failed", "cancelled"].includes(response.snapshot.overallStatus) && !receipt.finishedAt && receipt.createdAt) {
    receipt = { ...receipt, finishedAt: new Date().toISOString(), elapsedMs: Date.now() - Date.parse(receipt.createdAt) };
    await writeJson(receiptFile, receipt);
  }
  await writeJson(path.join(directory, "snapshot.json"), response);
  const db = getDb();
  const [request, operations] = await Promise.all([
    db.from("generation_v5_requests").select("*").eq("id", receipt.requestId).eq("owner_id", local.actor).single(),
    db.from("generation_v5_operations").select("operation_key,state,result,expectation").eq("request_id", receipt.requestId),
  ]);
  assert(!request.error && !operations.error, "automatic_smoke_evidence_unavailable");
  await writeJson(path.join(directory, "operations.json"), operations.data);
  const evidence = inspectGenerationEvidence({ request: request.data, operations: operations.data ?? [] });
  await writeJson(path.join(directory, "evidence.json"), evidence);
  console.log(JSON.stringify({ case: test.id, requestId: receipt.requestId, status: response.snapshot.overallStatus, proposals: response.snapshot.proposals.map(proposal => ({ slot: proposal.slot, status: proposal.status })), evidence: { passed: evidence.passed, failed: evidence.checks.filter(check => !check.passed) }, directory, browserNext: "Open this request in Studio; choose a delivered variation, save, reopen History and compare canvas_model." }));
} finally { await local.close(); }
