/** Build a private, portable collection. No model calls, database writes or product changes. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, renameSync, mkdtempSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import JSZip from "jszip";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { FAMILIES } from "../../shared/creative/families";
import { recreationRecipeSchema, type RecreationRecipe } from "../../shared/designRecreation";
import { referenceFontFamily } from "../../client/src/pages/CanvasLab/lib/referenceFonts";
import { sha256 } from "../designBatch/builder";
import { renderRecipeAsync } from "../designBatch/native";
import { convertFamily, embeddedFonts, FORMATS, CONVERTER_VERSION } from "./convert";

const at = new Date().toISOString(), stamp = at.replace(/[:.]/g, "-");
const root = process.cwd();
const artifacts = "artifacts/design-recreation";
const backupDir = join(artifacts, "original-families-backup", stamp);
const output = join(artifacts, `family-library-${stamp}`);
mkdirSync(backupDir, { recursive: true });
const stage = mkdtempSync(join(artifacts, ".family-library-"));
const save = (path: string, data: string | Buffer) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };
const json = (path: string, value: unknown) => save(path, JSON.stringify(value, null, 2));
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const originalPaths = [
  ...walk("shared/creative"), ...walk("shared/typography"),
  "shared/postspark.ts", "shared/referenceReconstruction.ts", "shared/designRecreation.ts", "shared/designMatrix.ts",
  "client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "client/src/pages/CanvasLab/components/types.ts",
  "client/src/pages/CanvasLab/lib/familyPreset.ts", "client/src/pages/CanvasLab/lib/catalogTypography.ts",
  "client/src/pages/CanvasLab/lib/richTextLayout.ts", "client/src/pages/CanvasLab/lib/contrast.ts",
  "client/src/pages/CanvasLab/lib/referenceFonts.ts", "client/src/pages/StudioApp/lib/studioGeneration.ts",
  "client/src/components/views/WorkbenchV2/PostCardV2.tsx", "DOCUMENTO_MESTRE.md", "docs/plano-dnapost-curadoria.md",
];
const backupZip = new JSZip();
const sourceRecords = originalPaths.map(path => {
  const bytes = readFileSync(path);
  backupZip.file(path, bytes);
  save(join(backupDir, "files", path), bytes);
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
});
const backupManifest = { format: "postspark.native-families.backup", version: 1, at, note: "Cópia dos arquivos atuais, inclusive alterações locais não commitadas. Restauração manual e seletiva; não sobrescrever trabalho posterior em massa.", files: sourceRecords };
backupZip.file("BACKUP-MANIFEST.json", JSON.stringify(backupManifest, null, 2));
json(join(backupDir, "manifest.json"), backupManifest);
save(join(backupDir, "originais.zip"), await backupZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`Backup preservado: ${backupDir}/originais.zip`);

const sourceHash = sourceRecords.find(s => s.path === "shared/creative/families.ts")!.sha256;
const fonts = embeddedFonts();
const approvedMediaSource = `${artifacts}/batch-2026-09-30/recipes/1c2fb00a82a764bab2f4374d03f67886.json`;
const approvedMedia = recreationRecipeSchema.parse(JSON.parse(readFileSync(approvedMediaSource, "utf8"))).matrix!.media.find(m => m.asset)!.asset!;
type Item = { id: string; title: string; category: "native" | "reference" | "pilot"; variants: Array<{ format: string; recipe: string; preview: string; trace?: string; sha256: string }>; status: string; differences: string[]; pieceIds: string[] };
const items: Item[] = [], traces: unknown[] = [];
type Piece = { id: string; definition: unknown; sources: Array<{ recipeId: string; groupId: string; familyId?: string }>; };
const pieces = new Map<string, Piece>();

/** Common offline component inventory. Not a second product post document or an executable solver. */
function indexPieces(recipe: RecreationRecipe, familyId?: string): string[] {
  const ids: string[] = [];
  const matrix = recipe.matrix!;
  for (const group of matrix.groups) {
    const members = group.members.map((m, i) => {
      const l = recipe.scene.layers.find(l => l.id === m.layerId)!;
      const field = matrix.fields.find(f => f.layerIds.includes(l.id));
      const media = matrix.media.find(s => s.layerId === l.id);
      return { member: i, kind: l.kind, role: l.role, geometry: { x: m.x, y: m.y, rotation: m.rotationDeg, width: l.width, height: l.height },
        appearance: { fill: l.fill, stroke: l.strokeColor, strokeWidth: l.strokeWidth, opacity: l.opacity, points: l.points, extrusion: l.extrusion, cornerRadius: recipe.adaptation?.layerStyles.find(s => s.layerId === l.id)?.cornerRadiusPx ?? 0 },
        typography: l.fontFamily ? { family: l.fontFamily, weight: l.fontWeight, size: l.fontSize, lineHeight: l.lineHeight, letterSpacing: l.letterSpacing, align: l.align, fontHash: recipe.scene.fonts.find(f => f.family === l.fontFamily && f.weight === l.fontWeight)?.sha256 } : null,
        content: field ? { kind: "text-slot", slot: matrix.fields.indexOf(field), line: field.layerIds.indexOf(l.id) } : media ? { kind: "media-slot" } : { kind: "fixed", text: l.text } };
    });
    const definition = { referenceCanvas: { width: recipe.scene.source.widthPx, height: recipe.scene.source.heightPx }, members,
      constraints: { requires: members.some(m => m.content.kind === "media-slot") ? ["media-if-filled"] : [], conflictsWith: [] },
      compatibilityStatus: "requires-composition-review", layoutBehavior: "v3-fixed-group" };
    const hash = sha256(JSON.stringify(definition)), id = `piece-${hash.slice(0, 24)}`;
    const found = pieces.get(id) ?? { id, definition, sources: [] };
    found.sources.push({ recipeId: recipe.id, groupId: group.id, ...(familyId ? { familyId } : {}) });
    pieces.set(id, found); ids.push(id);
  }
  return ids;
}

for (const family of FAMILIES) {
  const item: Item = { id: family.id, title: family.label, category: "native", variants: [], status: "Convertida · revisão visual pendente", differences: [], pieceIds: [] };
  for (const format of FORMATS) {
    const start = Date.now();
    const result = convertFamily(family.id, format, fonts, sourceHash, at);
    const { recipe, baseline, trace } = result;
    for (const slot of recipe.matrix!.media) slot.asset = structuredClone(approvedMedia);
    if (recipe.matrix!.media.length) recipe.notes.push("Prévia usa a foto de demonstração inserida pelo proprietário na receita cfaccad3. Ela é substituível; não pertence ao design nativo.");
    const stem = `${family.id}-${format.replace(":", "x")}`;
    const recipePath = `recipes/native/${stem}.json`, preview = `previews/native/${stem}.png`, tracePath = `provenance/${stem}.json`;
    const bytes = JSON.stringify(recipe, null, 2), png = await renderRecipeAsync(recipe);
    save(join(stage, recipePath), bytes); save(join(stage, preview), png);
    json(join(stage, `baselines/${stem}.json`), baseline);
    const event = { ...trace, at, durationMs: Date.now() - start, recipeId: recipe.id, recipeSha256: sha256(bytes), pngSha256: sha256(png), outputBytes: Buffer.byteLength(bytes), mediaSource: recipe.matrix!.media.length ? { path: approvedMediaSource, sha256: approvedMedia.sha256 } : null };
    json(join(stage, tracePath), event); traces.push(event);
    item.variants.push({ format, recipe: recipePath, preview, trace: tracePath, sha256: sha256(bytes) });
    item.pieceIds.push(...indexPieces(recipe, family.id));
    item.differences.push(...trace.differences, ...(trace.fontDifferences ? [trace.fontDifferences] : []));
  }
  item.differences = [...new Set(item.differences)]; item.pieceIds = [...new Set(item.pieceIds)]; items.push(item);
  console.log(`Convertida: ${family.label} (${FORMATS.join(", ")})`);
}

// Existing designs are copied byte for byte, never rewritten or implicitly approved.
const batch = `${artifacts}/batch-2026-09-30`;
for (const file of readdirSync(`${batch}/recipes`).filter(f => f.endsWith(".json")).sort()) {
  const stem = file.slice(0, -5), bytes = readFileSync(`${batch}/recipes/${file}`);
  const recipe = recreationRecipeSchema.parse(JSON.parse(bytes.toString()));
  const recipePath = `recipes/references/${file}`, preview = `previews/references/${stem}.png`;
  const originalPreview = [`${batch}/renders/${stem}.png`, `${batch}/renders/${stem}-source.png`, `${batch}/renders/${stem}-original.png`, `${batch}/renders/${stem}-no-op.png`].find(p => existsSync(p));
  if (!originalPreview) throw Error(`Prévia do lote ausente: ${stem}`);
  save(join(stage, recipePath), bytes); save(join(stage, preview), readFileSync(originalPreview));
  const approved = stem === "1c2fb00a82a764bab2f4374d03f67886";
  const isPhoto = stem.startsWith("cbb2"), isFont = stem === "fonts";
  items.push({ id: stem, title: recipe.title, category: "reference", variants: [{ format: "original", recipe: recipePath, preview, sha256: sha256(bytes) }],
    status: approved ? "Aprovada pelo proprietário" : isPhoto ? "Referência fotográfica · não é matriz gráfica" : isFont ? "Catálogo tipográfico · aproximação" : "Curada · aprovação visual pendente",
    differences: recipe.missingElements.map(e => e.description), pieceIds: isPhoto || isFont ? [] : indexPieces(recipe) });
}
const pilot = `${artifacts}/combination-pilot`;
for (const file of readdirSync(`${pilot}/recipes`).filter(f => f.endsWith("-requested.json")).sort()) {
  const bytes = readFileSync(`${pilot}/recipes/${file}`), recipe = recreationRecipeSchema.parse(JSON.parse(bytes.toString())), stem = file.slice(0, -5);
  const recipePath = `recipes/pilot/${file}`, preview = `previews/pilot/${stem}.png`;
  save(join(stage, recipePath), bytes); save(join(stage, preview), readFileSync(`${pilot}/renders/${stem}.png`));
  items.push({ id: stem, title: recipe.title, category: "pilot", variants: [{ format: "original", recipe: recipePath, preview, sha256: sha256(bytes) }], status: "Ensaio aprovado pelo proprietário", differences: ["Instantâneo do ensaio; edição flexível ainda não existe no Admin2."], pieceIds: indexPieces(recipe) });
}

for (const piece of pieces.values()) json(join(stage, `pieces/${piece.id}.json`), { format: "postspark.offline-piece", version: 1, ...piece });
const manifest = { format: "postspark.private-design-collection", version: 1, at, converter: CONVERTER_VERSION, recipeContract: "postspark.admin2.recipe v3", items,
  pieceCount: pieces.size, backup: relative(output, backupDir), sourceFiles: sourceRecords, renderer: "native Konva diagnostic surface; not browser React Stage",
  excludedEditorExtensions: ["stroke-impact", "cinematic-depth"], notes: ["Peças são inventário offline; constraints ainda precisam de curadoria por combinação. Não são publicadas no gerador.", "Os 12 compositores originais e os 14 presets do editor continuam intactos."] };
json(join(stage, "manifest.json"), manifest); json(join(stage, "traces.json"), traces);
const recipeZip = new JSZip();
for (const item of items) for (const variant of item.variants) recipeZip.file(variant.recipe.replace("recipes/", ""), readFileSync(join(stage, variant.recipe)));
recipeZip.file("LEIA-ME.txt", "Importe UM arquivo JSON da pasta native, references ou pilot no /admin2. Todos são receitas V3. manifest.json e pieces/*.json são inventário técnico e não devem ser importados.\nAs receitas nativas são adaptações do compositor original; consulte a galeria para diferenças.\n");
save(join(stage, "receitas.zip"), await recipeZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const data = JSON.stringify(items).replace(/</g, "\\u003c");
save(join(stage, "index.html"), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PostSpark · coleção de designs</title>
<style>*{box-sizing:border-box}body{margin:0;background:#080f15;color:#e8edf2;font:16px system-ui}header,main{max-width:1460px;margin:auto;padding:26px}h1{font-size:34px;margin:0 0 12px}p{line-height:1.6;color:#b4c4ce}a{color:#64e4f1}button,select,input{font:inherit;padding:10px 14px;background:#15232e;color:#e8edf2;border:1px solid #3b535f;border-radius:8px}.controls{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}input{flex:1;min-width:200px}#grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:24px}article{padding:18px;background:#101b23;border:1px solid #29404c;border-radius:15px}article img{display:block;width:100%;height:355px;object-fit:contain;background:#060b10}h2{font-size:20px;margin:14px 0 5px}.status{font-size:12px;color:#92c6d0}.links{display:flex;gap:14px;margin-top:12px}details{margin-top:16px;font-size:13px}li{margin:8px 0;color:#b4c4ce}aside{border-left:3px solid #ffbc67;padding:1px 18px;background:#161e22}.count{color:#90acbd;font-size:14px}footer{max-width:1460px;margin:auto;padding:28px}</style>
<header><div class="status">POSTSPARK / CURADORIA PRIVADA</div><h1>Uma coleção, várias possibilidades.</h1>
<p>12 famílias nativas, 24 referências do lote e 9 combinações do ensaio. As famílias foram convertidas para receitas V3 com fontes incorporadas, campos de texto e grupos. Escolha o formato, baixe uma receita e importe no <strong>/admin2</strong>.</p>
<aside><p><strong>Os originais estão preservados.</strong> Esta coleção usa o compositor das 12 famílias originais; há diferenças em relação ao editor atual. As adaptações de cada família estão descritas nos cartões. A conversão ainda aguarda sua avaliação visual. As fotos são substituíveis.</p></aside>
<div class="controls"><a href="receitas.zip" download>Baixar todas as receitas</a><a href="${escape(relative(output, join(backupDir, "originais.zip")))}" download>Backup das famílias originais</a><a href="manifest.json">Inventário e procedência</a></div>
<div class="controls"><label>Origem <select id="origin"><option value="all">Todas</option><option value="native">12 famílias nativas</option><option value="reference">Referências curadas</option><option value="pilot">Combinações aprovadas</option></select></label><label>Formato das famílias <select id="format"><option>5:6</option><option>1:1</option><option>9:16</option></select></label><input id="search" placeholder="Buscar design…" aria-label="Buscar design"></div><div id="count" class="count"></div></header>
<main id="grid"></main><footer><p>Receitas V3 continuam usando o encaixe atual do Admin2. Regras de edição flexível e recombinação automática são a próxima etapa. O inventário de peças não publica designs no gerador.</p></footer>
<script>const items=${data};const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function draw(){const origin=document.querySelector('#origin').value,format=document.querySelector('#format').value,q=document.querySelector('#search').value.toLowerCase();const visible=items.filter(i=>(origin==='all'||i.category===origin)&&(i.title+' '+i.id).toLowerCase().includes(q));document.querySelector('#count').textContent=visible.length+' designs · '+${pieces.size}+' peças no inventário da coleção';document.querySelector('#grid').innerHTML=visible.map(i=>{const v=i.variants.find(v=>v.format===format)||i.variants[0];return '<article><img loading="lazy" src="'+esc(v.preview)+'" alt="'+esc(i.title)+'"><h2>'+esc(i.title)+'</h2><div class="status">'+esc(i.status)+' · '+esc(v.format)+'</div><div class="links"><a href="'+esc(v.recipe)+'" download>Baixar receita JSON</a><a href="'+esc(v.preview)+'" target="_blank">Ver PNG</a></div>'+(i.differences.length?'<details><summary>Adaptações e limites</summary><ul>'+i.differences.map(d=>'<li>'+esc(d)+'</li>').join('')+'</ul></details>':'')+(v.trace?'<details><summary>Procedência</summary><a href="'+esc(v.trace)+'">Abrir registro da conversão</a></details>':'')+'</article>';}).join('')}['origin','format'].forEach(id=>document.getElementById(id).onchange=draw);document.getElementById('search').oninput=draw;draw();</script></html>`);

const nativeItems = items.filter(i => i.category === "native");
const sheet = createCanvas(1200, 1420), ctx = sheet.getContext("2d"); ctx.fillStyle = "#101820"; ctx.fillRect(0, 0, 1200, 1420);
const captionFont = fonts.get("Inter:700")!;
const captionFamily = referenceFontFamily({ fonts: [captionFont] } as RecreationRecipe["scene"], captionFont.family, captionFont.weight);
for (const [i, item] of nativeItems.entries()) {
  const v = item.variants.find(v => v.format === "5:6")!, image = await loadImage(readFileSync(join(stage, v.preview)));
  const x = (i % 4) * 300, y = Math.floor(i / 4) * 470;
  ctx.drawImage(image, x + 12, y + 12, 276, 331.2); ctx.fillStyle = "#FFFFFF"; ctx.font = `700 17px "${captionFamily}"`; ctx.fillText(item.title, x + 12, y + 370, 276);
  ctx.font = `700 13px "${captionFamily}"`; ctx.fillStyle = "#9CB7C5"; ctx.fillText(item.id, x + 12, y + 395, 276);
}
save(join(stage, "familias.png"), sheet.toBuffer("image/png"));
save(join(stage, "LEIA-ME.md"), `# Coleção privada de designs\n\nAbra index.html. Baixe uma receita JSON e importe em /admin2. Há ${items.length} cartões: 12 famílias em três formatos, 24 referências e nove combinações aprovadas.\n\nTodos os JSONs em recipes/ seguem postspark.admin2.recipe V3. Os arquivos em pieces/, baselines/ e provenance/ são inventário e documentação técnica, não arquivos de importação.\n\nBackup: ${relative(output, backupDir)}/originais.zip. Os arquivos de origem não foram alterados. Restaure apenas os arquivos necessários após comparar com o estado atual.\n\nA conversão é do compositor original em shared/creative/families.ts. Metadados de paleta do editor são apenas identidade de demonstração. Baselines preservam input e output completos por formato. Blur/filtros fotográficos não suportados e adaptações de Glitch/Cinética/Versus são declarados na galeria.\n\nNão há nova aprovação automática, migration ou publicação no gerador. As duas famílias adicionais do editor estão preservadas no backup e ainda não foram convertidas.\n`);

// Refuse to present a collection if any source changed during generation.
for (const entry of sourceRecords) if (sha256(readFileSync(entry.path)) !== entry.sha256) throw Error(`Fonte mudou durante a conversão: ${entry.path}`);
renameSync(stage, output);
console.log(JSON.stringify({ output: join(root, output), backup: join(root, backupDir), nativeFamilies: FAMILIES.length, nativeRecipes: FAMILIES.length * FORMATS.length, collectionDesigns: items.length, recipes: items.reduce((n, i) => n + i.variants.length, 0), pieces: pieces.size, status: "generated-awaiting-visual-review" }, null, 2));
