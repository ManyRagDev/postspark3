/** Bounded offline feasibility study: compact cards, numerical retrieval, relational composition. */
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { recreationRecipeSchema, type RecreationRecipe } from '../../shared/designRecreation';
import { sha256 } from '../designBatch/builder';
import { renderRecipeAsync } from '../designBatch/native';
import { compose, sources, ids, type Background, type Module } from '../designCombinations/engine';
import { checkDescriptors } from './checks';
import { describe, distance, componentDistance, compactCard, titleLayers, DESCRIPTOR_VERSION, STRUCTURE_AXES, STRUCTURE_WEIGHTS, STYLE_AXES, ROW_AXES } from './descriptors';
import { renderComponent } from './componentPreview';

const LIB = 'artifacts/design-recreation/family-library-2026-10-01T02-59-27-361Z';
const OUT = process.env.POSTSPARK_REPRESENTATION_OUTPUT ?? `artifacts/design-recreation/representation-pilot-${new Date().toISOString().replace(/[:.]/g, '-')}`;
if (existsSync(OUT)) throw new Error(`Refusing to overwrite ${OUT}`);
for (const dir of ['', 'previews', 'recipes', 'renders', 'traces']) mkdirSync(join(OUT, dir), { recursive: true });
const save = (file: string, value: unknown) => writeFileSync(join(OUT, file), JSON.stringify(value, null, 2));
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
type Item = { id: string; title: string; category: 'native' | 'reference' | 'pilot'; status: string; variants: { format: string; recipe: string; preview: string; sha256: string }[] };
const manifest = JSON.parse(readFileSync(join(LIB, 'manifest.json'), 'utf8')) as { items: Item[] };
const inputHashes: { path: string; sha256: string }[] = [];
let parsed = 0;
const excluded: { id: string; reason: string }[] = [];
const requirements: Record<string, string[]> = {
  'data-punch': ['numeric-value-provided-by-user'], versus: ['two-comparison-sides'],
  'quote-authority': ['quote-and-attribution'], 'mosaic-grid': ['multiple-content-items'],
};

const entries = manifest.items.flatMap(item => {
  for (const variant of item.variants) {
    const path = join(LIB, variant.recipe), raw = readFileSync(path);
    assert.equal(sha256(raw), variant.sha256, path);
    recreationRecipeSchema.parse(JSON.parse(raw.toString())); parsed++;
    inputHashes.push({ path, sha256: sha256(raw) });
  }
  if (item.id === 'fonts' || item.id === 'cbb2b5fd83ed04a8bd24e7f049be0a01') {
    excluded.push({ id: item.id, reason: item.id === 'fonts' ? 'Font specimen, not a post composition' : 'Pure photograph, not a graphical matrix' });
    return [];
  }
  // One format per family avoids retrieving the same design in three ratios.
  const variant = item.variants.find(v => v.format === '5:6') ?? item.variants[0];
  const recipe = recreationRecipeSchema.parse(JSON.parse(readFileSync(join(LIB, variant.recipe), 'utf8')));
  const descriptor = describe(recipe);
  const card = compactCard(item.id, item.title, item.status, descriptor, requirements[item.id] ?? []);
  // Honest comparison: remove embedded payloads before measuring JSON compression.
  const withoutAssets = JSON.parse(JSON.stringify(recipe, (key, value) => key === 'dataUrl' ? undefined : value));
  const metadataOnly = { id: item.id, name: item.title, status: item.status, requirements: requirements[item.id] ?? [], mediaSlots: card.mediaSlots };
  const preview = `previews/${item.id}.png`; copyFileSync(join(LIB, variant.preview), join(OUT, preview));
  return [{ ...item, variant, recipe, descriptor, card, metadataOnly, preview,
    sizes: { fullJson: bytes(recipe), jsonWithoutAssets: bytes(withoutAssets), metadataOnly: bytes(metadataOnly), card: bytes(card), numericalVectors: bytes({ version: DESCRIPTOR_VERSION, structure: descriptor.structure, style: descriptor.style }) } }];
});
const checks = checkDescriptors(entries.map(e => e.recipe));
const totals = entries.reduce((a, e) => Object.fromEntries(Object.entries(a).map(([key, value]) => [key, value + e.sizes[key as keyof typeof e.sizes]])) as typeof a,
  { fullJson: 0, jsonWithoutAssets: 0, metadataOnly: 0, card: 0, numericalVectors: 0 });
save('index-descriptors.json', { version: DESCRIPTOR_VERSION, structureAxes: STRUCTURE_AXES, structureWeights: STRUCTURE_WEIGHTS, styleAxes: STYLE_AXES, componentRowAxes: ROW_AXES,
  entries: entries.map(e => ({ id: e.id, recipe: join(LIB, e.variant.recipe), sha256: e.variant.sha256, ...e.descriptor })) });
save('compact-cards.json', entries.map(e => e.card));
save('sizes.json', { unit: 'UTF-8 bytes of minified JSON, not tokens', selectedDesigns: entries.length, totals, perDesign: entries.map(e => ({ id: e.id, ...e.sizes })) });

const queryIds = [ids.paper, 'editorial-poster', 'brutal-split', '0ee1f7691aaa5e28cfd0eb2c8a36cb23', ids.window];
const retrieval = queryIds.map(id => {
  const query = entries.find(e => e.id === id)!;
  return { id, modes: [0, .2].map(styleShare => ({ styleShare,
    neighbors: entries.filter(e => e.id !== id).map(e => ({ id: e.id, ...distance(query.descriptor, e.descriptor, styleShare) }))
      .sort((a, b) => a.value - b.value || a.id.localeCompare(b.id)).slice(0, 3) })) };
});
save('retrieval.json', retrieval);
const componentQueries = [{ designId: ids.window, groupId: 'titulo' }, { designId: ids.paper, groupId: 'papel' }, { designId: 'editorial-poster', groupId: 'headline' }];
const componentRetrieval = [];
for (const query of componentQueries) {
  const source = entries.find(e => e.id === query.designId)!;
  const component = source.descriptor.components.find(c => c.id === query.groupId)!;
  // Only groups containing text participate in these title/content queries.
  const candidates = entries.filter(e => e.id !== source.id).flatMap(e => e.descriptor.components.filter(c => c.rows.some(row => row[0] === 1)).map(c =>
    ({ designId: e.id, groupId: c.id, label: c.label, distance: componentDistance(component, c) })));
  candidates.sort((a, b) => a.distance - b.distance || `${a.designId}/${a.groupId}`.localeCompare(`${b.designId}/${b.groupId}`));
  // Suppress geometrically identical matches from the nine background variations.
  const seen = new Set<string>();
  const neighbors = candidates.filter(c => {
    const entry = entries.find(e => e.id === c.designId)!, group = entry.descriptor.components.find(g => g.id === c.groupId)!;
    const key = JSON.stringify(group.rows);
    if (seen.has(key)) return false; seen.add(key); return true;
  }).slice(0, 3);
  const images = [];
  for (const [i, hit] of [query, ...neighbors].entries()) {
    const entry = entries.find(e => e.id === hit.designId)!;
    const preview: string = `previews/component-${componentRetrieval.length}-${i}.png`;
    writeFileSync(join(OUT, preview), await renderComponent(entry.recipe, hit.groupId));
    images.push({ ...hit, title: entry.title, preview });
  }
  componentRetrieval.push({ query, neighbors, images });
}
save('component-retrieval.json', { method: 'Symmetric nearest-row distance plus row-count penalty; geometry normalized within declared groups', results: componentRetrieval });
const shortlist = entries.filter(e => e.id !== ids.paper).sort((a, b) => distance(describe(sources.paper), a.descriptor).value - distance(describe(sources.paper), b.descriptor).value).slice(0, 5);
save('llm-shortlist-example.json', { instructions: 'Choose one id for the supplied brief, or none. Respect requirements and media availability. Status is evidence of approval, never inferred from numerical proximity.',
  note: 'Example payload only: no LLM call or classification-accuracy measurement in this study.', candidates: shortlist.map(e => e.card) });

// The reusable engine must preserve the previously approved appearance with default options.
let regressionCases = 0;
for (const background of ['paper', 'photo', 'window'] as Background[]) for (const module of ['paper', 'ribbons', 'window'] as Module[]) {
  const result = compose(background, module, 'Verificar todos os dias');
  const png = await renderRecipeAsync(result.recipe);
  assert.equal(sha256(png), sha256(readFileSync(`artifacts/design-recreation/combination-pilot/renders/${background}-${module}-requested.png`)), `Baseline ${background}/${module}`);
  regressionCases++;
}
checks.push({ check: 'previous approved compositions: identical native PNG hashes after engine extraction', cases: regressionCases, status: 'passed' });

const briefs: { id: string; title: string; support: string; cta: string; background: Background }[] = [
  { id: 'ideas', title: 'Criar com intenção', support: 'Dê forma à sua próxima ideia.', cta: 'Comece hoje', background: 'paper' },
  { id: 'gifts', title: 'Presentes com significado', support: 'Cada detalhe conta uma história.', cta: 'Escolha seu presente', background: 'photo' },
  { id: 'daily', title: 'Sua ideia em movimento', support: 'Pequenos passos, novas possibilidades.', cta: 'Tire do papel', background: 'window' },
];
const trials: { id: string; title: string; module: Module; background: Background; donor: string | null; baseline: string; render: string; recipe: string; trace: string; lines: string[] }[] = [];
const usedFonts = new Set<string>();
for (const module of ['paper', 'ribbons', 'window'] as Module[]) {
  const descriptor = describe(sources[module]);
  const baseFonts = new Set(titleLayers(sources[module]).map(l => l.fontFamily));
  const donors = entries.filter(e => e.category === 'native').map(e => ({ entry: e, layer: titleLayers(e.recipe).sort((a, b) => b.fontSize - a.fontSize)[0], distance: distance(descriptor, e.descriptor).value }))
    .filter(d => d.layer && !baseFonts.has(d.layer.fontFamily) && !usedFonts.has(d.layer.fontFamily!))
    .sort((a, b) => a.distance - b.distance || a.entry.id.localeCompare(b.entry.id));
  // Choose a font that fits all three briefs. Search order uses layout similarity only as a heuristic.
  const attempts: { donor: string; font: string | null; distance: number; accepted: boolean; reason?: string }[] = [];
  let selected: typeof donors[number] | undefined;
  for (const donor of donors) {
    try {
      for (const brief of briefs) compose(brief.background, module, brief.title, { support: brief.support, cta: brief.cta, typography: { recipe: donor.entry.recipe, layer: donor.layer } });
      attempts.push({ donor: donor.entry.id, font: donor.layer.fontFamily, distance: donor.distance, accepted: true }); selected = donor; break;
    } catch (error) {
      attempts.push({ donor: donor.entry.id, font: donor.layer.fontFamily, distance: donor.distance, accepted: false, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (selected?.layer.fontFamily) usedFonts.add(selected.layer.fontFamily);
  for (const brief of briefs) {
    const id = `${brief.id}-${module}`, start = Date.now();
    const options = { support: brief.support, cta: brief.cta };
    const baseline = compose(brief.background, module, brief.title, options);
    const result = selected ? compose(brief.background, module, brief.title, { ...options, typography: { recipe: selected.entry.recipe, layer: selected.layer } }) : baseline;
    const json = JSON.stringify(result.recipe, null, 2), png = await renderRecipeAsync(result.recipe);
    const reopened = recreationRecipeSchema.parse(JSON.parse(json));
    assert.equal(sha256(await renderRecipeAsync(reopened)), sha256(png));
    writeFileSync(join(OUT, `recipes/${id}.json`), json);
    writeFileSync(join(OUT, `renders/${id}.png`), png);
    writeFileSync(join(OUT, `renders/${id}-baseline.png`), await renderRecipeAsync(baseline.recipe));
    const { recipe: _recipe, ...evidence } = result;
    save(`traces/${id}.json`, { id, brief, base: ids[module], donor: selected?.entry.id ?? null, attempts,
      fallback: selected ? null : 'Original component typography',
      candidates: donors.map(d => ({ id: d.entry.id, distance: d.distance, font: d.layer.fontFamily })),
      relations: [
        { type: 'centerX', target: 'title', value: 368 }, { type: 'wrap-words', target: 'title', width: 490 },
        { type: 'fit-background', source: 'title-lines', target: 'highlights', padding: module === 'window' ? 0 : 14 },
        { type: 'flow-below', chain: ['title', 'support', 'cta'] }, { type: 'grow-surface', source: 'content-bottom' },
      ],
      scope: 'Only title family/weight/letterSpacing is transferred from the donor; original component geometry, palette and linked surfaces are preserved. Rules are authored, not learned from the tensor.',
      ...evidence, recipeSha256: sha256(json), pngSha256: sha256(png), durationMs: Date.now() - start });
    trials.push({ id, title: brief.title, module, background: brief.background, donor: selected?.entry.id ?? null,
      baseline: `renders/${id}-baseline.png`, render: `renders/${id}.png`, recipe: `recipes/${id}.json`, trace: `traces/${id}.json`, lines: result.lines });
  }
}
checks.push({ check: 'new compositions: schema, text fit, title contrast, block collisions, identical PNG after JSON roundtrip', cases: trials.length, status: 'passed' });
assert.throws(() => compose('paper', 'paper', 'W'.repeat(300)), /palavra excede/);
assert.throws(() => compose('paper', 'paper', Array(35).fill('conteúdo').join(' ')), /ultrapassaria a prancheta/);
checks.push({ check: 'unsupported long word and excessive content rejected', cases: 2, status: 'passed' });
for (const source of inputHashes) assert.equal(sha256(readFileSync(source.path)), source.sha256, `Original modified: ${source.path}`);
checks.push({ check: 'source recipe preservation', cases: inputHashes.length, status: 'passed' });
save('checks.json', checks);

// Native visual evidence, independent of browser automation.
const sheet = createCanvas(1008, 1344), context = sheet.getContext('2d');
context.fillStyle = '#111923'; context.fillRect(0, 0, sheet.width, sheet.height);
for (const [i, trial] of trials.entries()) {
  const x = (i % 3) * 336, y = Math.floor(i / 3) * 448;
  context.fillStyle = '#FFFFFF'; context.font = '15px sans-serif'; context.fillText(`${trial.module} · ${trial.donor ?? 'original'}`, x + 8, y + 22);
  context.drawImage(await loadImage(join(OUT, trial.render)), x + 8, y + 32, 320, 400);
}
writeFileSync(join(OUT, 'combinations.png'), sheet.toBuffer('image/png'));
const retrievalSheet = createCanvas(1100, 5 * 380), rc = retrievalSheet.getContext('2d');
rc.fillStyle = '#111923'; rc.fillRect(0, 0, retrievalSheet.width, retrievalSheet.height);
for (const [row, result] of retrieval.entries()) for (const [col, hit] of [{ id: result.id, value: 0 }, ...result.modes[0].neighbors].entries()) {
  const entry = entries.find(e => e.id === hit.id)!, img = await loadImage(join(OUT, entry.preview));
  const ratio = Math.min(250 / img.width, 325 / img.height), x = col * 275 + 10, y = row * 380 + 42;
  rc.fillStyle = '#FFFFFF'; rc.font = '12px sans-serif'; rc.fillText(`${col ? 'd=' + hit.value : 'Consulta'} · ${entry.title.slice(0, 27)}`, x, y - 15);
  rc.drawImage(img, x, y, img.width * ratio, img.height * ratio);
}
writeFileSync(join(OUT, 'neighbors.png'), retrievalSheet.toBuffer('image/png'));
const componentSheet = createCanvas(1100, componentRetrieval.length * 380), cc = componentSheet.getContext('2d');
cc.fillStyle = '#111923'; cc.fillRect(0, 0, componentSheet.width, componentSheet.height);
for (const [row, result] of componentRetrieval.entries()) for (const [col, hit] of result.images.entries()) {
  const img = await loadImage(join(OUT, hit.preview)), ratio = Math.min(250 / img.width, 310 / img.height);
  const x = col * 275 + 10, y = row * 380 + 42;
  cc.fillStyle = '#FFFFFF'; cc.font = '12px sans-serif'; cc.fillText(`${col ? 'Vizinho' : 'Consulta'} · ${hit.groupId}`, x, y - 15);
  cc.drawImage(img, x, y, img.width * ratio, img.height * ratio);
}
writeFileSync(join(OUT, 'components.png'), componentSheet.toBuffer('image/png'));

const report = { format: 'postspark.representation-pilot', version: 1, at: new Date().toISOString(), inputLibrary: LIB,
  parsedRecipes: parsed, indexedDesigns: entries.length, excluded, axes: { structural: STRUCTURE_AXES.length, style: STYLE_AXES.length, componentRow: ROW_AXES.length },
  totals, shortlistCardsBytes: bytes(shortlist.map(e => e.card)), checks, retrieval, componentRetrieval, trials,
  findings: [
    'Compact cards solve prompt bulk directly. Vectors stay in the application and preselect candidates; numerical vectors do not need to be pasted into a chat prompt.',
    'Structural similarity is measurable and independent of embedded photo bytes, literal sample copy and uniform scaling. The distance is a hand-built, uncalibrated heuristic.',
    'Component row matrices and declared edges preserve associations; they do not infer compatibility or generate aesthetic rules by themselves.',
    'Derived compositions use a bounded existing engine plus title typography from original families. This does not demonstrate arbitrary recombination of every component.',
  ], limits: [
    'No LLM call: no measured classification accuracy, token counts, latency or model cost.',
    'Similarity has no human-labeled ground truth. Coarse rotated-box occupancy ignores pixel detail, occlusion, texture and semantic purpose.',
    'Largest typography is only a title heuristic; decorative words and numeric highlights can be misidentified.',
    'Color RGB distance and exact font names are simple style heuristics, not perceptual embeddings.',
    'Numerical coordinates lose detail. Full recipes, IDs and hashes remain authoritative; the index must be regenerated when inputs or feature versions change.',
    'Existing V3 groups do not declare all layout dependencies. Flexible relations here are authored in the engine and emitted in traces; Admin2 imports materialized snapshots.',
    'Nine new previews require human review. Technical constraints and similarity do not guarantee visual quality.',
    'Offline native Konva only. No browser, production generator, database, migration, billing or authentication changes.',
  ] };
save('manifest.json', report);
const kb = (n: number) => (n / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' KiB';
const row = (label: string, value: number) => `<tr><td>${label}</td><td>${kb(value)}</td></tr>`;
const neighborsHtml = retrieval.map(result => {
  const query = entries.find(e => e.id === result.id)!;
  return `<section><h3>${esc(query.title)}</h3>${result.modes.map(mode => `<div class="neighbors" data-mode="${mode.styleShare}"><article><h4>Consulta</h4><img src="${query.preview}" alt="${esc(query.title)}"></article>${mode.neighbors.map(hit => { const e = entries.find(e => e.id === hit.id)!; return `<article><h4>${esc(e.title)}</h4><img src="${e.preview}" alt="${esc(e.title)}"><small>Distância: ${hit.value} · ${esc(e.status)}</small><details><summary>Principais diferenças medidas</summary>${hit.differences.map(d => `<p>${esc(d.axis)}: ${d.contribution.toFixed(4)}</p>`).join('')}</details></article>`; }).join('')}</div>`).join('')}</section>`;
}).join('');
const trialsHtml = trials.map(trial => `<article class="trial"><h3>${esc(trial.title)}</h3><small>Componente: ${trial.module} · tipografia de ${esc(trial.donor ?? 'origem')}</small><div class="pair"><figure><img src="${trial.baseline}" alt="Componente com a fonte anterior"><figcaption>Tipografia anterior, mesmo conteúdo</figcaption></figure><figure><img src="${trial.render}" alt="Nova combinação"><figcaption>Tipografia da família selecionada</figcaption></figure></div><p><a href="${trial.recipe}" download>Receita importável</a> · <a href="${trial.trace}">Trace e relações</a></p></article>`).join('');
const componentsHtml = `<h3>Busca local: grupos de elementos</h3><p>Abaixo estão apenas os membros de cada grupo declarado, com a cor de fundo herdada. Comparamos linhas das matrizes por tipo, posição relativa e proporções, ignorando sua posição na página. A correspondência é aproximada e pode associar várias linhas à mesma linha.</p>${componentRetrieval.map(result => `<section><div class="neighbors">${result.images.map((img, i) => `<article><h4>${i ? esc(img.title) : 'Consulta: ' + esc(img.title)}</h4><img src="${img.preview}" alt="Grupo ${esc(img.groupId)}"><small>${esc(img.groupId)}${i ? ' · distância ' + result.neighbors[i - 1].distance : ''}</small></article>`).join('')}</div></section>`).join('')}<p><a href="component-retrieval.json">Resultados por componente</a></p>`;
writeFileSync(join(OUT, 'index.html'), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Representações e combinações · PostSpark</title><style>body{font:16px system-ui;background:#10161e;color:#e8edf4;max-width:1400px;margin:auto;padding:24px}p,li{line-height:1.6}a{color:#65dbed}h1{font-size:36px}h2{margin-top:52px}small{color:#b4c5d7;display:block}table{border-collapse:collapse;min-width:380px}td,th{text-align:left;padding:12px;border-bottom:1px solid #3c4b58}article{padding:14px;background:#1b2633;border-radius:12px}section{margin:32px 0}.neighbors{display:grid;grid-template-columns:repeat(4,1fr);gap:15px}.neighbors img{width:100%;height:320px;object-fit:contain}h4{min-height:3em}select{padding:12px;font:inherit}#trials{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}.pair{display:flex;gap:12px}figure{margin:15px 0;width:50%}figure img{width:100%}figcaption{font-size:13px}details{font-size:13px;margin-top:12px}.notice{border-left:4px solid #57d6c2;padding:12px;background:#192a30}@media(max-width:800px){.neighbors{grid-template-columns:repeat(2,1fr)}#trials{grid-template-columns:1fr}}</style><h1>Resumo, busca e composição</h1><p>Ensaio local com ${entries.length} designs: representações compactas para selecionar candidatos e relações explícitas para compor. As receitas completas continuam preservadas.</p><p class="notice">Vetores ajudam a procurar. Relações ajudam a compor. A qualidade visual é avaliada no resultado. Nenhum design foi publicado no gerador por este ensaio.</p><nav><a href="#context">Contexto da LLM</a> · <a href="#search">Similaridade</a> · <a href="#derived">Novas combinações</a> · <a href="manifest.json">Relatório completo</a></nav><h2 id="context">1. Quanto precisa chegar à LLM?</h2><p>Comparação da mesma seleção de ${entries.length} receitas, em JSON minificado. Bytes UTF-8 medidos; não são tokens. Fotos e fontes incorporadas são removidas na segunda linha para uma comparação justa.</p><table><tr><th>Representação</th><th>Tamanho total</th></tr>${row('JSONs completos', totals.fullJson)}${row('JSONs sem fotos/fontes incorporadas', totals.jsonWithoutAssets)}${row('Metadados simples: nome, estado, requisitos, mídia', totals.metadataOnly)}${row('Cartões com resumo estrutural', totals.card)}${row('Cinco cartões após busca', bytes(shortlist.map(e => e.card)))}</table><p>O resumo simples já reduz o contexto. O vetor de ${STRUCTURE_AXES.length} características estruturais e ${STYLE_AXES.length} de estilo serve ao código da busca. A LLM receberia nomes, requisitos e descrições, escolhendo IDs. Não houve chamada à LLM nem avaliação de acurácia de classificação.</p><p><a href="compact-cards.json">Cartões</a> · <a href="llm-shortlist-example.json">Exemplo de payload</a> · <a href="index-descriptors.json">Vetores, matrizes por componente e relações</a></p><h2 id="search">2. O que fica próximo?</h2><p>Uma variante por design. Menor distância indica maior semelhança nos eixos definidos, sem equivaler a uma nota de beleza. Requisitos de conteúdo precisam ser verificados à parte. Os candidatos incluem trabalhos ainda pendentes de aprovação.</p><label>Critério <select id="mode"><option value="0">Estrutura: áreas, posições e hierarquia</option><option value="0.2">80% estrutura + 20% estilo</option></select></label>${neighborsHtml}${componentsHtml}<h2 id="derived">3. Nove derivações para comparar</h2><p>Mesmos três componentes do piloto aprovado, três textos novos e tipografia das famílias originais. O título mantém corpo e centro; as tarjas acompanham suas medidas; o apoio desce. A foto é a mídia inserida anteriormente pelo proprietário. O doador é procurado por proximidade estrutural, com rejeição se o conteúdo não couber.</p><p class="notice">As regras de relação foram escritas no compositor. Os tensores não aprenderam a compor. Estes JSONs são instantâneos importáveis; a edição flexível ainda não foi integrada ao Admin2.</p><div id="trials">${trialsHtml}</div><h2>Conferências e limites</h2><ul>${checks.map(c => `<li>${c.cases} casos — ${esc(c.check)}</li>`).join('')}</ul><ul>${report.limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul><p><a href="checks.json">Evidências de verificação</a> · <a href="combinations.png">Visão geral das derivações</a> · <a href="neighbors.png">Visão geral da busca estrutural</a></p><script>function setMode(){document.querySelectorAll('[data-mode]').forEach(e=>e.hidden=e.dataset.mode!==document.querySelector('#mode').value)}document.querySelector('#mode').onchange=setMode;setMode();</script><style>[hidden]{display:none!important}</style></html>`);
console.log(JSON.stringify({ output: resolve(OUT), parsed, designs: entries.length, totals, checks: checks.length, trials: trials.length, donors: trials.filter((_, i) => i % 3 === 0).map(t => t.donor) }, null, 2));
