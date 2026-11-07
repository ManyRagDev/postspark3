/** Real UI editing/persistence over already admitted requests. Never starts generation. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { savedPostToCanvasModel } from "../../../client/src/pages/CanvasLab/lib/saveAdapter";
import { chromium, type Page, type Response } from "playwright-core";
import superjson from "superjson";
import JSZip from "jszip";

import { openLocalApi } from "./localApi";
import { resolveReviewBrowser } from "../../../server/ai/workflows/proposalRenderer";

const json = async (file: string) => JSON.parse(await fs.readFile(file, "utf8"));
const config = await json("/tmp/postspark-dollar-goal/config.json");
const selected = process.argv[2] ?? "round-1";
assert(/^round-[1-4]$/.test(selected));
const test = {id:selected, content:config.inputContent, slides:1};
const parentDirectory = path.join(path.dirname(config.budgetFile), test.id);
const selectedSlot = process.argv[3] === undefined ? undefined : Number(process.argv[3]);
assert(selectedSlot === undefined || [0,1,2].includes(selectedSlot));
const directory = selectedSlot === undefined ? parentDirectory : path.join(parentDirectory, `slot-${selectedSlot}`);
await fs.mkdir(directory, {recursive:true,mode:0o700});
const admission = await json(path.join(parentDirectory, "admission.json"));
assert(admission.requestId, "existing_request_required_no_new_admission");

const proofFile = path.join(directory, "browser.json");
const prior = await json(proofFile).catch(error => { if (error.code === "ENOENT") return {}; throw error; });
if (prior.requestId) assert.equal(prior.requestId, admission.requestId);
const proof: Record<string, any> = { ...prior, version: 1, case: test.id, requestId: admission.requestId, finished: false, paidCalls: 0, steps: prior.steps ?? [], ui: prior.ui ?? {}, errors: [] };
const write = async (filename: string, value: unknown) => fs.writeFile(path.join(directory, filename), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
const checkpoint = async (step: string) => { proof.steps.push(step); await write("browser.json", proof); console.log(JSON.stringify({ case: test.id, browserStep: step })); };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const local = await openLocalApi({ port: 3182 });
assert.equal(local.actor, config.actor);
const browser = await chromium.launch({ executablePath: await resolveReviewBrowser(), headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
// The HttpOnly session is issued by the real local Supabase sign-in and cookie bridge.
const divider = local.cookie.indexOf("=");
await context.addCookies([{ name: local.cookie.slice(0, divider), value: local.cookie.slice(divider + 1), url: local.app, httpOnly: true, sameSite: "Lax" }]);
// This is the persisted UI preference, not a model injection. Each save is explicit.
await context.addInitScript(() => localStorage.setItem("postspark.canvasAutoSaveEnabled", "false"));
const blocked: string[] = [];
await context.route("**/api/trpc/**", async route => {
  const request = route.request();
  const procedures = new URL(request.url()).pathname.split("/api/trpc/")[1]?.split(",") ?? [];
  if (request.method() === "POST" && procedures.some(name => !["post.save", "post.update"].includes(name))) {
    blocked.push(procedures.join(",")); await route.abort("blockedbyclient"); return;
  }
  await route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.on("pageerror", error => proof.errors.push(error.message));
function procedures(response: Response) { return new URL(response.url()).pathname.split("/api/trpc/")[1]?.split(",") ?? []; }
async function rpcValue(response: Response, method: string) {
  assert(response.ok(), `${method}:${response.status()}`);
  const value = await response.json();
  const row = Array.isArray(value) ? value[procedures(response).indexOf(method)] : value;
  assert(!row.error, JSON.stringify(row.error));
  return row.result.data?.json !== undefined ? superjson.deserialize(row.result.data) : row.result.data;
}
async function screenshot(name: string) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
  await fs.writeFile(path.join(directory, `${name}.txt`), await page.locator("body").innerText());
}
async function textEditor(target: Page) {
  await target.getByRole("button", { name: "Camadas", exact: true }).click();
  const layers = target.getByRole("list", { name: "Camadas da arte", exact: true }).locator("button[aria-pressed]").filter({ hasText: /Texto ·/ });
  await layers.first().waitFor();
  if (proof.textLayerIndex === undefined) {
    const labels = await layers.allInnerTexts();
    const editorial = labels.findIndex(label => label.split("\n")[0].trim().length >= 16);
    proof.textLayerIndex = editorial < 0 ? 0 : editorial;
  }
  await layers.nth(proof.textLayerIndex).click();
  await target.getByRole("button", { name: "Ajustar objeto", exact: true }).click();
  const field = target.locator("#canvas-selected-text");
  if (!await field.isVisible()) await target.locator("summary").filter({ hasText: "Editar texto em campo" }).click();
  await field.waitFor({ state: "visible" }); return field;
}
async function save(mode: "new" | "update") {
  const method = mode === "new" ? "post.save" : "post.update";
  const response = page.waitForResponse(candidate => candidate.request().method() === "POST" && procedures(candidate).includes(method));
  await page.getByRole("button", { name: "Salvar post", exact: true }).click();
  await page.getByRole("button", { name: mode === "new" ? "Salvar como novo post" : "Atualizar o post salvo", exact: true }).click();
  return rpcValue(await response, method);
}
try {
  const generation = await local.api.generation.get.query({ requestId: admission.requestId });
  assert.notEqual(generation.snapshot.overallStatus, "running", "Wait for the admitted request to finish before this journey.");
  const ready = generation.snapshot.proposals.filter(proposal => proposal.status === "ready");
  assert(ready.length, "existing_request_has_no_ready_proposal");
  const chosenIndex = selectedSlot === undefined ? 0 : ready.findIndex(proposal => proposal.slot === selectedSlot);
  assert(chosenIndex >= 0, "requested_slot_not_ready");
  proof.selectedSlot = ready[chosenIndex].slot;
  const history = await local.api.post.getGeneration.query({ id: generation.snapshot.runId });
  assert.equal(history.id, generation.snapshot.runId);
  assert.equal(history.input_content, test.content);
  proof.readySlots = ready.map(proposal => proposal.slot);
  proof.historyRunId = history.id;
  if (!proof.postId) {
    await page.goto(`${local.app}/history`);
    await page.getByPlaceholder("Buscar por conteúdo ou plataforma...").fill(test.content.slice(0, 75));
    const restore = page.getByRole("button", { name: "Recuperar", exact: true });
    await restore.first().waitFor();
    const consent = page.getByRole("button", { name: "Aceitar e Continuar", exact: true });
    if (await consent.isVisible()) { await consent.click(); proof.ui.localConsent = "Accepted local application privacy notice; optional AI improvement sharing left unchecked."; }
    const histories = await local.api.post.listGenerations.query({ limit: 100, offset: 0 });
    const matches = histories.filter(row => String(row.input_content).includes(test.content.slice(0, 75))).filter(row => {
      const output = typeof row.output_snapshot === "string" ? JSON.parse(row.output_snapshot) : row.output_snapshot;
      return (Array.isArray(output) ? output : (output as any)?.variations)?.filter(Boolean).length > 0;
    });
    const historyIndex = matches.findIndex(row => row.id === history.id); assert(historyIndex >= 0);
    assert.equal(await restore.count(), matches.length, "history_ui_must_match_owner_scoped_receipts");
    assert(!(await page.locator("body").innerText()).includes("Invalid Date"), "history_timestamp_rendering_invalid");
    proof.ui.historyDatesValid = true;
    await screenshot("browser-01-history");
    await restore.nth(historyIndex).click();
    await page.getByRole("button", { name: "Personalizar Post", exact: true }).first().waitFor();
    proof.ui.gallery = await page.locator("body").innerText();
    await screenshot("browser-02-gallery");
    await checkpoint("history_restored_existing_ready_bundle");
    await page.getByRole("button", { name: "Personalizar Post", exact: true }).nth(chosenIndex).click();
    await page.getByRole("button", { name: "Salvar post", exact: true }).waitFor();
    const field = await textEditor(page);
    const original = await field.inputValue(); assert(original.trim(), "chosen_native_text_is_empty");
    // A visible punctuation change keeps the factual content and design identity.
    const edited = original.endsWith(".") ? original.slice(0, -1) : `${original}.`;
    await field.fill(edited); await field.blur();
    assert.equal(await field.inputValue(), edited);
    proof.edit = { original, edited, kind: "native_text_via_editor_command" };
    proof.ui.editor = await page.locator("body").innerText();
    await screenshot("browser-03-edited");
    const saved = await save("new"); proof.postId = saved.id;
    assert.equal(typeof proof.postId, "number");
    await checkpoint("native_text_edited_and_saved_via_ui");
  }
  const persisted = await local.api.post.get.query({ id: proof.postId }); assert(persisted?.canvas_model);
  const before = proof.savedCanvasHash ? await json(path.join(directory, "canvas-model-before-reopen.json")) : persisted.canvas_model as any;
  assert.equal(before.slides.length, test.slides);
  assert(JSON.stringify(before.slides).includes(proof.edit.edited), "edited_text_missing_from_persisted_canvas_model");
  await write("canvas-model-before-reopen.json", before);
  proof.savedCanvasHash = hash(before);
  proof.design = before.completeDesign;
  await page.goto(`${local.app}/saved-posts`);
  await page.getByRole("article").first().waitFor();
  const consent = page.getByRole("button", { name: "Aceitar e Continuar", exact: true });
  if (await consent.isVisible()) await consent.click();
  const search = String(persisted.headline ?? "").slice(0, 100);
  assert(search, "saved_post_needs_headline_for_reviewable_library_search");
  await page.getByRole("textbox", { name: "Buscar posts por título, design ou código" }).fill(search);
  const summariesResponse = page.waitForResponse(candidate => procedures(candidate).includes("post.listSummary") && decodeURIComponent(candidate.url()).includes(search));
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  // The exact owner-scoped API result is also the row order rendered by this UI.
  await summariesResponse;
  const summaries = await local.api.post.listSummary.query({ limit: 20, offset: 0, search });
  const index = summaries.items.findIndex(post => post.id === proof.postId); assert(index >= 0);
  const article = page.getByRole("article").nth(index);
  await article.getByRole("button", { name: "Abrir", exact: true }).waitFor();
  proof.ui.savedPost = await article.innerText();
  await screenshot("browser-04-library");
  await article.getByRole("button", { name: "Abrir", exact: true }).click();
  await page.getByRole("button", { name: "Salvar post", exact: true }).waitFor();
  const reopened = await textEditor(page);
  assert.equal(await reopened.inputValue(), proof.edit.edited, "reopened_native_text_differs");
  await screenshot("browser-05-reopened");
  if (test.slides > 1) {
    proof.ui.carouselPages = [];
    for (let index = 0; index < test.slides; index++) {
      const slide = page.getByRole("button", { name: new RegExp(`^Selecionar slide ${index + 1}:`) });
      proof.ui.carouselPages.push(await slide.getAttribute("aria-label"));
      await slide.click(); await screenshot(`browser-05-reopened-slide-${index + 1}`);
    }
    await page.getByRole("button", { name: /^Selecionar slide 1:/ }).click();
  }
  await checkpoint("saved_post_reopened_in_official_canvas_editor");
  await save("update");
  const afterRecord = await local.api.post.get.query({ id: proof.postId }); assert(afterRecord?.canvas_model);
  await write("canvas-model-after-reopen.json", afterRecord.canvas_model);
  proof.reopenedCanvasHash = hash(afterRecord.canvas_model);
  // This verifies the actual document emitted by the reopened UI, not a standalone adapter simulation.
  const differences: Array<{path:string;before:unknown;after:unknown}> = [];
  const compare = (left:any,right:any,at:string) => {
    if(isDeepStrictEqual(left,right))return;
    if(left&&right&&typeof left === "object"&&typeof right === "object") { for(const key of new Set([...Object.keys(left),...Object.keys(right)]))compare(left[key],right[key],`${at}.${key}`); }
    else differences.push({path:at,before:left,after:right});
  };
  compare(before,afterRecord.canvas_model,"canvas_model");
  proof.rawDifferences = differences; proof.canvasModelEqual = differences.length === 0;
  assert.deepEqual(savedPostToCanvasModel({id:proof.postId,canvas_model:afterRecord.canvas_model}), savedPostToCanvasModel({id:proof.postId,canvas_model:before}), "normalized_canvas_model_changed_during_ui_reopen_and_resave");
  assert.deepEqual((afterRecord.canvas_model as any).slides.map((slide:any)=>slide.composition),before.slides.map((slide:any)=>slide.composition),"authoritative_scene_changed");
  assert.deepEqual(blocked, [], "journey_attempted_an_unauthorized_mutation");
  if (true) {
    await page.evaluate(async () => { await document.fonts.ready; });
    const format = test.slides > 1 ? "zip" : "png";
    await page.getByRole("button", { name: "Baixar post", exact: true }).click();
    const downloading = page.waitForEvent("download", { timeout: 90_000 });
    await page.getByRole("menuitem", { name: format === "zip" ? "Todos os slides · ZIP" : "Imagem do slide atual · PNG 4K", exact: true }).click();
    const download = await downloading;
    assert.equal(await download.failure(), null);
    const exportPath = path.join(directory, `browser-export.${format}`);
    await download.saveAs(exportPath);
    const bytes = await fs.readFile(exportPath);
    const inspectPng = (buffer: Buffer) => {
      assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
      assert.equal(Math.max(width, height), 3840, "export_must_be_full_resolution");
      assert.equal(width / height, 4 / 5);
      return { width, height, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
    };
    const files = format === "zip" ? await (async () => {
      const zip = await JSZip.loadAsync(bytes);
      const entries = Object.values(zip.files).filter(entry => !entry.dir);
      assert.equal(entries.length, test.slides);
      return Promise.all(entries.map(async entry => ({ name: entry.name, ...inspectPng(await entry.async("nodebuffer")) })));
    })() : [{ name: download.suggestedFilename(), ...inspectPng(bytes) }];
    proof.export = { format, bytes: bytes.length, files };
    await checkpoint("real_browser_download_verified");
  }
  delete proof.failure;
  proof.finished = true; proof.normalizedCanvasModelEqual = true; proof.compositionsEqual = true; proof.newGenerationAdmissions = 0;
  await checkpoint("normalized_canvas_model_and_compositions_equal_after_ui_reopen_and_resave");
  console.log(JSON.stringify({ case: test.id, requestId: admission.requestId, postId: proof.postId, canvasModelEqual: proof.canvasModelEqual, normalizedCanvasModelEqual: true, compositionsEqual: true, rawDifferences:differences, slideCount: test.slides, directory, paidCalls: 0 }));
} catch (error) {
  proof.failure = error instanceof Error ? error.message : String(error);
  proof.blockedMutations = blocked;
  await screenshot("browser-failure").catch(() => {});
  await write("browser.json", proof); throw error;
} finally { await context.close(); await browser.close(); await local.close(); }
