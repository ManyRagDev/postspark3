/** Evaluate the prior nine cases under an explicit contextual policy. Offline only. */
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { recreationRecipeSchema } from '../../shared/designRecreation';
import { sha256 } from '../designBatch/builder';
import { renderRecipeAsync } from '../designBatch/native';
import { compose, type Background, type Module } from '../designCombinations/engine';
import { describe, DESCRIPTOR_VERSION, titleLayers } from './descriptors';
import { assess, QUALITY_VERSION, type QualityBrief } from './quality';
import { featureMedia } from './featuredMedia';
import { qualityGallery } from './qualityGallery';

const INPUT = 'artifacts/design-recreation/representation-pilot-2026-10-01T14-36-23-376Z';
const LIBRARY = 'artifacts/design-recreation/family-library-2026-10-01T02-59-27-361Z';
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const OUTPUT = process.env.POSTSPARK_QUALITY_OUTPUT ?? `artifacts/design-recreation/quality-pilot-${RUN}`;
if (existsSync(OUTPUT)) throw new Error(`Refusing to overwrite ${OUTPUT}`);
for (const dir of ['', 'recipes', 'renders', 'evidence']) mkdirSync(join(OUTPUT, dir), { recursive: true });
const parse = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const save = (path: string, value: unknown) => writeFileSync(join(OUTPUT, path), JSON.stringify(value, null, 2));
const previous = parse(join(INPUT, 'manifest.json'));
const library = parse(join(LIBRARY, 'manifest.json'));
const policy = { version: QUALITY_VERSION, hardCriteria: ['copy preserved', 'text fits', 'no text collisions', 'text inside artboard', 'title contrast on known ground >= 4.5'],
  reviewCriteria: ['no isolated Portuguese/English connector', 'core text >= 16 native pixels', 'marked product region exposure >= 80%', 'featured media area >= 20% of artboard'],
  limitations: ['Thresholds are explicit experiment policy, not calibrated aesthetic or usability guarantees.', 'Subject rectangle is curator-marked, not automatically identified.', 'Visibility samples boxes/polygons and opacity; it does not understand pixels, salience or commercial impact.'],
  humanCriteria: ['message and primary focus clear', 'preferred variant', 'would use as a starting point'], realWorld: 'not-measured' };
save('policy.json', policy);
const cases = [], preservation: { path: string; sha256: string }[] = [];
for (const trial of previous.trials as { id: string; title: string; module: Module; background: Background; donor: string; recipe: string; render: string; trace: string }[]) {
  const oldPath = join(INPUT, trial.recipe), raw = readFileSync(oldPath), original = recreationRecipeSchema.parse(JSON.parse(raw.toString()));
  const trace = parse(join(INPUT, trial.trace));
  assert.equal(sha256(raw), trace.recipeSha256);
  assert.equal(sha256(readFileSync(join(INPUT, trial.render))), trace.pngSha256);
  preservation.push({ path: oldPath, sha256: sha256(raw) });
  const brief: QualityBrief = { id: trace.brief.id, title: trace.brief.title, support: trace.brief.support, cta: trace.brief.cta,
    intent: trace.brief.id === 'gifts' ? 'product' : trace.brief.id === 'ideas' ? 'ideas' : 'action',
    ...(trace.brief.id === 'gifts' ? { subject: { assetSha256: '0bbcafd0ad41bb9f22496a8ef7eae4d4fa60da635e325d4d6b33355b807d1048', x: .42, y: .09, width: .58, height: .78, provenance: 'manual-image-review' as const, label: 'Cesta e itens de presente' } } : {}) };
  const donorItem = library.items.find((e: { id: string }) => e.id === trial.donor);
  const donorFile = donorItem.variants.find((v: { format: string }) => v.format === '5:6').recipe;
  const donor = recreationRecipeSchema.parse(parse(join(LIBRARY, donorFile)));
  const donorLayer = titleLayers(donor).sort((a, b) => b.fontSize - a.fontSize)[0];
  const before = assess(original, brief);
  const candidates: { recipe: typeof original; assessment: ReturnType<typeof assess>; options: Record<string, unknown>; relation: unknown }[] = [];
  const attempts: Record<string, unknown>[] = [];
  for (const typography of ['preferred', 'component-original'] as const) for (const width of [490, 550]) {
    const options = { typography, maxTextWidth: width, textFlow: 'balanced' };
    try {
      const composed = compose(trial.background, trial.module, brief.title, { support: brief.support, cta: brief.cta, maxTextWidth: width, textFlow: 'balanced',
        ...(typography === 'preferred' ? { typography: { recipe: donor, layer: donorLayer } } : {}) });
      const variants: { recipe: typeof original; relation: unknown }[] = [{ recipe: composed.recipe, relation: { type: 'original-placement', rules: composed.rules } }];
      if (brief.intent === 'product') for (const fraction of [.48, .44]) variants.push(featureMedia(composed.recipe, fraction));
      for (const v of variants) {
        const assessment = assess(v.recipe, brief);
        candidates.push({ ...v, assessment, options });
        attempts.push({ options, relation: v.relation, technicalFailures: assessment.technical.failures, cautions: assessment.composition.cautions });
      }
    } catch (error) { attempts.push({ options, error: error instanceof Error ? error.message : String(error) }); }
  }
  // Keep a working baseline available; no attempt silently rewrites the content.
  candidates.push({ recipe: original, assessment: before, options: { fallback: 'unchanged-prior-recipe' }, relation: null });
  const valid = candidates.filter(c => c.assessment.technical.status === 'passed');
  const priority = (c: typeof candidates[number]) => [
    c.assessment.composition.cautions.filter(w => w.startsWith('subject-') || w.startsWith('media-')).length,
    c.assessment.composition.cautions.length,
    c.options.typography === 'preferred' ? 0 : 1,
    c.assessment.composition.lines.length,
  ];
  valid.sort((a, b) => {
    const x = priority(a), y = priority(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  });
  if (!valid.length) throw new Error(`No technically usable candidate for ${trial.id}`);
  const selected = valid[0], recipe = recreationRecipeSchema.parse(selected.recipe);
  const json = JSON.stringify(recipe, null, 2), png = await renderRecipeAsync(recipe);
  const reopened = recreationRecipeSchema.parse(JSON.parse(json));
  assert.equal(sha256(await renderRecipeAsync(reopened)), sha256(png), `Roundtrip ${trial.id}`);
  const recipeSha256 = sha256(json), pngSha256 = sha256(png), briefSha256 = sha256(JSON.stringify(brief));
  const evidence = { format: 'postspark.design-evidence', version: 1, caseId: trial.id, policy,
    recipe: { id: recipe.id, path: `recipes/${trial.id}.json`, sha256: recipeSha256 }, pngSha256, briefSha256, brief,
    source: { recipeSha256: sha256(raw), pngSha256: trace.pngSha256, donorRecipeId: donor.id, donorRecipeSha256: sha256(readFileSync(join(LIBRARY, donorFile))) },
    descriptor: describe(recipe), selection: { criterion: 'Lexicographic: hard failures excluded, media requirements, remaining cautions, preserve preferred typography, fewer lines, stable preference order; not a beauty score', selectedOptions: selected.options, selectedRelation: selected.relation, attempts },
    before, after: selected.assessment,
    observedConditions: { artboard: recipe.scene.source, title: brief.title, titleLines: selected.assessment.composition.lines, fonts: recipe.scene.fonts.map(f => ({ family: f.family, weight: f.weight, sha256: f.sha256 })),
      mediaAssetHashes: recipe.matrix?.media.map(m => m.asset?.sha256 ?? null), note: 'Observed cases, not an inferred min/max range or guarantee for new content.' },
    approval: { status: 'pending-human-review', scope: 'exact-brief-and-rendered-variant', communication: null, visual: null, reviewer: null },
    realWorld: { status: 'not-measured' } };
  writeFileSync(join(OUTPUT, `recipes/${trial.id}.json`), json);
  writeFileSync(join(OUTPUT, `renders/${trial.id}.png`), png);
  copyFileSync(join(INPUT, trial.render), join(OUTPUT, `renders/${trial.id}-before.png`));
  save(`evidence/${trial.id}.json`, evidence);
  const relation = selected.relation as { type?: string } | null;
  cases.push({ id: trial.id, title: brief.title, module: trial.module, before: `renders/${trial.id}-before.png`, after: `renders/${trial.id}.png`, recipe: `recipes/${trial.id}.json`, evidence: `evidence/${trial.id}.json`,
    summary: `${selected.options.typography === 'component-original' ? 'Tipografia do componente' : 'Tipografia da família'}; largura ${selected.options.maxTextWidth ?? 'anterior'}; ${relation?.type === 'separate-media-and-content' ? 'mídia separada' : 'composição central'}`,
    beforeWarnings: [...before.technical.failures, ...before.composition.cautions], afterWarnings: [...selected.assessment.technical.failures, ...selected.assessment.composition.cautions], recipeSha256, pngSha256, briefSha256 });
}

// Preserve the exact scope of the explicit approval already given in this conversation.
const approved = parse('artifacts/design-recreation/combination-pilot/manifest.json');
const approvedExamples = approved.rows.flatMap((row: { id: string; variants: { recipe: string; render: string; text: string }[] }) => row.variants.map(v => {
  const recipePath = join('artifacts/design-recreation/combination-pilot', v.recipe), pngPath = join('artifacts/design-recreation/combination-pilot', v.render);
  const raw = readFileSync(recipePath), recipe = recreationRecipeSchema.parse(JSON.parse(raw.toString()));
  const priorEvidence = parse(join('artifacts/design-recreation/combination-pilot', v.recipe.replace(/^recipes\//, 'reports/')));
  assert.equal(sha256(raw), priorEvidence.recipeSha256);
  assert.equal(sha256(readFileSync(pngPath)), priorEvidence.pngSha256);
  return { recipe: { path: recipePath, id: recipe.id, sha256: sha256(raw) }, render: { path: pngPath, sha256: sha256(readFileSync(pngPath)) },
    descriptorVersion: DESCRIPTOR_VERSION, descriptor: describe(recipe), combinationId: row.id, observedTitle: v.text, aspect: recipe.scene.source.widthPx / recipe.scene.source.heightPx,
    approval: { status: 'approved-in-conversation', reviewer: 'project-owner', source: 'User explicitly approved every phrase/combination in the original pilot', scope: 'these rendered examples', approvedAt: null },
    robustnessOutsideObservedExamples: 'not-established', realWorld: 'not-measured' };
}));
save('approved-examples.json', { format: 'postspark.design-approved-examples', version: 1, examples: approvedExamples });
for (const f of preservation) assert.equal(sha256(readFileSync(f.path)), f.sha256);
const sheet = createCanvas(1320, 9 * 444), context = sheet.getContext('2d');
context.fillStyle = '#10161e'; context.fillRect(0, 0, sheet.width, sheet.height);
for (const [i, c] of cases.entries()) {
  const y = i * 444;
  context.fillStyle = '#FFFFFF'; context.font = '18px sans-serif'; context.fillText(`${c.title} · ${c.module}`, 20, y + 24);
  context.font = '14px sans-serif'; context.fillText('Anterior', 20, y + 49); context.fillText('Adaptação', 355, y + 49);
  for (const [j, file] of [c.before, c.after].entries()) context.drawImage(await loadImage(join(OUTPUT, file)), 20 + j * 335, y + 62, 294, 368);
  context.font = '16px sans-serif'; context.fillText('Alertas antes: ' + c.beforeWarnings.length, 700, y + 150); context.fillText('Alertas agora: ' + c.afterWarnings.length, 700, y + 180);
  context.fillText(c.summary.split(';')[0], 700, y + 230);
}
writeFileSync(join(OUTPUT, 'comparisons.png'), sheet.toBuffer('image/png'));
writeFileSync(join(OUTPUT, 'index.html'), qualityGallery(cases, RUN));
const report = { format: 'postspark.design-quality-pilot', version: 1, runId: RUN, input: INPUT, policy,
  cases, approvedPriorExamples: approvedExamples.length, newApprovalStatus: 'pending-human-review',
  verified: ['9 new recipe schema validations', '9 identical PNGs after JSON roundtrip', '9 input recipes preserved by hash'],
  cautionsBefore: cases.reduce((n, c) => n + c.beforeWarnings.length, 0), cautionsAfter: cases.reduce((n, c) => n + c.afterWarnings.length, 0),
  limits: ['Native renderer only; browser review form not automated.', 'No LLM, database, migration, publication or performance analytics.', 'Subject annotation was manual for this one asset; new media require a new annotation.', 'No overall aesthetic score or automatic approval.', 'Flexible rules remain offline; exported recipes are V3 snapshots.'] };
save('manifest.json', report);
console.log(JSON.stringify({ output: resolve(OUTPUT), cases: cases.length, before: report.cautionsBefore, after: report.cautionsAfter, approvedPriorExamples: approvedExamples.length }, null, 2));
