import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  recipeFromSpec,
  type CompactSpec,
} from "../../../harness/designBatch/builder";
import type { ReferenceFontAsset } from "../../../shared/referenceReconstruction";

const root = process.cwd(),
  output = path.join(root, "artifacts/acervo82/pilot/intake");
const roster = JSON.parse(
  await fs.readFile("designs/acervo82/manifest.json", "utf8")
);
const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const specs: CompactSpec[] = [];
const priorManifest = await fs
  .readFile("designs/acervo82/pilot/manifest.json", "utf8")
  .then(JSON.parse)
  .catch(e => {
    if (e.code !== "ENOENT") throw e;
    return null;
  });
const authoredAt = priorManifest?.authoredAt ?? new Date().toISOString();
function scene(stem: string, title: string, background: string) {
  const spec: CompactSpec = {
    stem,
    title,
    background,
    width: 1080,
    height: 1350,
    layers: [],
    groups: [],
    authorship: { recipeId: `${stem}-pilot-v1`, createdAt: authoredAt },
    notes: [
      "Piloto acervo82; fonte preservada no manifesto; não equivale à aprovação do catálogo definitivo.",
    ],
  };
  specs.push(spec);
  return spec;
}
function group(s: CompactSpec, id: string) {
  s.groups.push({ id, label: id, transform: { x: 0, y: 0, rotationDeg: 0 } });
  return id;
}
function rect(
  s: CompactSpec,
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  extra: Record<string, unknown> = {}
) {
  s.layers.push({ kind: "rect", id, x, y, width, height, fill, ...extra });
}
function text(
  s: CompactSpec,
  id: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  size: number,
  font = "Inter",
  weight = 400,
  fill = "#111111",
  field = id,
  extra: Record<string, unknown> = {}
) {
  const g = s.groups.find(g => g.id === field)?.id ?? group(s, field);
  s.layers.push({
    kind: "text",
    id,
    text: value,
    x,
    y,
    width,
    height,
    fontSize: size,
    fontFamily: font,
    fontWeight: weight,
    fill,
    lineHeight: 1.16,
    groupId: g,
    fieldId: field,
    minScale: 0.68,
    ...extra,
  });
}
function line(
  s: CompactSpec,
  id: string,
  x: number,
  y: number,
  w: number,
  fill: string,
  h = 2
) {
  rect(s, id, x, y, w, h, fill);
}

// Reconstructed raster reference: editable lettering plus a replaceable photo.
{
  const s = scene(
    "acervo82-reference-03",
    "Creative People · cartaz fotográfico",
    "#F7F6F0"
  );
  text(
    s,
    "eyebrow",
    "THIS IS THE",
    320,
    65,
    440,
    70,
    48,
    "Archivo Black",
    400,
    "#111111",
    "eyebrow",
    { align: "center", rotationDeg: -3 }
  );
  rect(s, "yellow-label", 300, 155, 480, 105, "#EDB42D", {
    cornerRadiusPx: 25,
    rotationDeg: -3,
    strokeColor: "#111111",
    strokeWidth: 3,
    minScale: 0.45,
  });
  text(
    s,
    "truth",
    "TRUTH",
    310,
    160,
    460,
    115,
    76,
    "Archivo Black",
    400,
    "#FFFFFF",
    "truth",
    {
      align: "center",
      rotationDeg: -3,
      strokeColor: "#111111",
      strokeWidth: 3,
      minScale: 0.5,
    }
  );
  text(
    s,
    "headline",
    "CREATIVE PEOPLE",
    55,
    310,
    970,
    280,
    138,
    "Archivo Black",
    400,
    "#0737D8",
    "headline",
    { align: "center", lineHeight: 1.0 }
  );
  const g = group(s, "photo");
  rect(s, "photo-slot", 0, 680, 1080, 670, "#D5D5D5", {
    groupId: g,
    mediaId: "photo",
    role: "Fotografia substituível na metade inferior",
  });
  text(
    s,
    "cta",
    "NEXT SLIDE",
    400,
    610,
    280,
    45,
    26,
    "Archivo Black",
    400,
    "#111111",
    "cta",
    { align: "center" }
  );
  s.notes!.push(
    "Textura do papel e contorno irregular do raster são adaptações declaradas. Fotografia de exemplo não integra o design: slot privado substituível."
  );
}
{
  const s = scene("acervo82-r9-03", "Versus · mito e verdade", "#0F0F12");
  text(
    s,
    "eyebrow",
    "COMPARATIVO OFICIAL",
    70,
    65,
    940,
    70,
    35,
    "Montserrat",
    800,
    "#10B981",
    "eyebrow",
    { align: "center" }
  );
  rect(s, "left-card", 58, 555, 470, 225, "#181820", {
    cornerRadiusPx: 30,
    strokeColor: "#79343E",
    strokeWidth: 2,
  });
  rect(s, "right-card", 550, 555, 470, 225, "#181820", {
    cornerRadiusPx: 30,
    strokeColor: "#087A5C",
    strokeWidth: 2,
  });
  text(
    s,
    "left-label",
    "O MITO",
    90,
    590,
    400,
    45,
    29,
    "Inter",
    700,
    "#F87171",
    "left-label"
  );
  text(
    s,
    "left-body",
    "Design bonito resolve conteúdo fraco",
    90,
    650,
    400,
    110,
    35,
    "Montserrat",
    600,
    "#E2E8F0",
    "left-body"
  );
  text(
    s,
    "right-label",
    "A VERDADE",
    582,
    590,
    400,
    45,
    29,
    "Inter",
    700,
    "#10B981",
    "right-label"
  );
  text(
    s,
    "right-body",
    "Estrutura e clareza geram retenção real",
    582,
    650,
    400,
    150,
    35,
    "Montserrat",
    800,
    "#FFFFFF",
    "right-body"
  );
  line(s, "footer-line", 58, 1210, 964, "#273244");
  text(
    s,
    "brand",
    "INTER",
    58,
    1240,
    470,
    55,
    30,
    "Space Mono",
    400,
    "#94A3B8",
    "brand"
  );
  text(
    s,
    "cta",
    "COMPARAÇÃO →",
    580,
    1240,
    440,
    55,
    30,
    "Space Mono",
    400,
    "#10B981",
    "cta",
    { align: "right" }
  );
}
{
  const s = scene(
    "acervo82-r9-11",
    "Minimal Air · clareza e respiro",
    "#F8F9FA"
  );
  rect(s, "dot", 78, 78, 32, 32, "#2563EB", { cornerRadiusPx: 16 });
  text(
    s,
    "headline",
    "Menos ruído. Mais clareza.",
    78,
    475,
    924,
    210,
    82,
    "Inter",
    700,
    "#1A1A1A",
    "headline"
  );
  text(
    s,
    "body",
    "Espaço em branco generoso, equilíbrio zen e clareza absoluta para quem prefere a força do silêncio visual.",
    78,
    715,
    924,
    160,
    33,
    "Inter",
    400,
    "#475569",
    "body",
    { lineHeight: 1.65 }
  );
  line(s, "footer-line", 78, 1200, 924, "#CBD5E1");
  text(
    s,
    "brand",
    "INTER LIGHT",
    78,
    1230,
    470,
    55,
    31,
    "Inter",
    400,
    "#64748B",
    "brand"
  );
  text(
    s,
    "cta",
    "PÁGINA 01 →",
    580,
    1230,
    422,
    55,
    31,
    "Inter",
    700,
    "#2563EB",
    "cta",
    { align: "right" }
  );
}
{
  const s = scene(
    "acervo82-r9-20",
    "Data Punch · destaque numérico",
    "#0D1117"
  );
  text(
    s,
    "eyebrow",
    "DADOS EM DESTAQUE",
    65,
    72,
    930,
    65,
    30,
    "Space Mono",
    400,
    "#58A6FF",
    "eyebrow"
  );
  text(
    s,
    "metric",
    "+340%",
    65,
    460,
    940,
    190,
    142,
    "Space Grotesk",
    700,
    "#58A6FF",
    "metric"
  );
  text(
    s,
    "headline",
    "Crescimento de autoridade percebida.",
    65,
    660,
    940,
    185,
    56,
    "Space Grotesk",
    700,
    "#FFFFFF",
    "headline"
  );
  text(
    s,
    "body",
    "Números grandes e dados em destaque de alto impacto.",
    65,
    850,
    940,
    115,
    32,
    "Inter",
    400,
    "#94A3B8",
    "body",
    { lineHeight: 1.5 }
  );
  line(s, "footer-line", 65, 1215, 950, "#273244");
  text(
    s,
    "brand",
    "SPACE GROTESK",
    65,
    1240,
    520,
    55,
    30,
    "Space Mono",
    400,
    "#94A3B8",
    "brand"
  );
  text(
    s,
    "cta",
    "CASE STUDY →",
    620,
    1240,
    395,
    55,
    30,
    "Space Mono",
    400,
    "#58A6FF",
    "cta",
    { align: "right" }
  );
  s.notes!.push(
    "O número +340% é apenas o texto da referência. Todo dado da geração deve vir do briefing; nenhum resultado comercial pode ser inferido do exemplo."
  );
}
{
  const s = scene(
    "acervo82-concept-06",
    "Industrial Tech-Spec · manifesto",
    "#FF4400"
  );
  rect(s, "header", 58, 58, 964, 105, "#F4F1EA", {
    strokeColor: "#0A0A0A",
    strokeWidth: 5,
  });
  rect(s, "header-dark", 58, 58, 310, 105, "#0A0A0A");
  text(
    s,
    "eyebrow",
    "CAUTION // 06",
    82,
    83,
    275,
    58,
    30,
    "Space Mono",
    400,
    "#FF4400",
    "eyebrow"
  );
  text(
    s,
    "brand",
    "SPEC-SHEET",
    400,
    83,
    360,
    58,
    30,
    "Space Mono",
    400,
    "#0A0A0A",
    "brand"
  );
  text(
    s,
    "edition",
    "ISO-9001",
    770,
    83,
    225,
    58,
    30,
    "Space Mono",
    400,
    "#0A0A0A",
    "edition",
    { align: "right" }
  );
  for (let i = 0; i < 18; i++)
    s.layers.push({
      kind: "polygon",
      id: `hazard-${i}`,
      x: 58 + i * 54,
      y: 163,
      width: 54,
      height: 20,
      fill: "#0A0A0A",
      points: [0, 20, 22, 0, 48, 0, 26, 20],
    });
  rect(s, "tag-bg", 58, 425, 525, 50, "#0A0A0A");
  text(
    s,
    "label",
    "MANIFESTO DE PRODUTO",
    78,
    431,
    490,
    42,
    29,
    "Space Mono",
    400,
    "#FF4400",
    "label"
  );
  rect(s, "highlight", 61, 595, 490, 86, "#F4F1EA", {
    strokeColor: "#0A0A0A",
    strokeWidth: 3,
  });
  text(
    s,
    "headline",
    "NÃO É SOBRE ESTÉTICA BONITA. É SOBRE TENSÃO VISUAL.",
    58,
    495,
    964,
    355,
    82,
    "Archivo Black",
    400,
    "#0A0A0A",
    "headline",
    { lineHeight: 0.97, letterSpacing: -1.5 }
  );
  rect(s, "seal", 875, 830, 150, 150, "#F4F1EA", {
    cornerRadiusPx: 75,
    strokeColor: "#0A0A0A",
    strokeWidth: 4,
  });
  text(
    s,
    "seal-text",
    "100% RAW",
    888,
    865,
    126,
    90,
    29,
    "Space Mono",
    400,
    "#0A0A0A",
    "seal-text",
    { align: "center", rotationDeg: 12 }
  );
  rect(s, "footer", 58, 1080, 964, 210, "#F4F1EA", {
    strokeColor: "#0A0A0A",
    strokeWidth: 5,
  });
  text(
    s,
    "body",
    "PESO: 900 BLK   ORIGEM: LAB-SP   LOTE: #2026-X",
    86,
    1105,
    905,
    80,
    27,
    "Space Mono",
    400,
    "#0A0A0A",
    "body",
    { lineHeight: 1.4 }
  );
  line(s, "footer-rule", 86, 1195, 905, "#0A0A0A", 4);
  for (let i = 0; i < 30; i++)
    rect(s, `barcode-${i}`, 100 + i * 11, 1220, (i % 4) + 2, 50, "#0A0A0A");
  text(
    s,
    "cta",
    "SWIPE // →",
    700,
    1220,
    290,
    55,
    29,
    "Space Mono",
    400,
    "#0A0A0A",
    "cta",
    { align: "right" }
  );
  s.notes!.push(
    "Selo e metadados industriais são campos editáveis. ISO-9001 e 100% são exemplos da referência, nunca prova de certificação ou desempenho. A faixa clara é uma decoração fixa, não um destaque semântico automático de palavras."
  );
}
{
  const s = scene(
    "acervo82-concept-10",
    "Neo-Bauhaus · composição geométrica",
    "#F2ECE1"
  );
  rect(s, "red-circle", 820, -95, 400, 400, "#D92B2B", { cornerRadiusPx: 200 });
  s.layers.push({
    kind: "polygon",
    id: "blue-diamond",
    x: -60,
    y: 850,
    width: 300,
    height: 300,
    fill: "#1D3557",
    points: [150, 0, 300, 150, 150, 300, 0, 150],
  });
  const arc = [
    165,
    165,
    ...Array.from({ length: 25 }, (_, i) => {
      const t = Math.PI + (i * Math.PI) / 48;
      return [165 + 165 * Math.cos(t), 165 + 165 * Math.sin(t)];
    }).flat(),
  ];
  s.layers.push({
    kind: "polygon",
    id: "yellow-quarter",
    x: 780,
    y: 175,
    width: 165,
    height: 165,
    fill: "#E9C46A",
    strokeColor: "#111111",
    strokeWidth: 4,
    points: arc,
  });
  text(
    s,
    "eyebrow",
    "BAUHAUS // DESSAU",
    65,
    70,
    690,
    60,
    34,
    "Archivo Black",
    400,
    "#111111",
    "eyebrow",
    { letterSpacing: 2 }
  );
  rect(s, "edition-bg", 795, 65, 220, 60, "#111111");
  text(
    s,
    "edition",
    "1926–2026",
    810,
    76,
    195,
    44,
    29,
    "Space Mono",
    400,
    "#F2ECE1",
    "edition",
    { align: "center" }
  );
  line(s, "top-rule", 65, 145, 950, "#111111", 8);
  const g = group(s, "headline");
  s.groups.find(x => x.id === g)!.transform.rotationDeg = -3;
  rect(s, "headline-bg", 65, 510, 950, 245, "#111111", { rotationDeg: -3 });
  rect(s, "red-spine", 65, 510, 22, 245, "#D92B2B", { rotationDeg: -3 });
  text(
    s,
    "headline",
    "A FORMA SEGUE A FUNÇÃO.",
    105,
    540,
    865,
    205,
    83,
    "Archivo Black",
    400,
    "#F2ECE1",
    "headline",
    { rotationDeg: -3, lineHeight: 1.08 }
  );
  rect(s, "body-box", 130, 810, 885, 220, "#F2ECE1", {
    strokeColor: "#111111",
    strokeWidth: 5,
  });
  text(
    s,
    "body",
    "Geometria pura, cores primárias de museu e blocos diagonais que guiam o olhar humano pela lei da Gestalt.",
    165,
    850,
    815,
    175,
    33,
    "Inter",
    700,
    "#111111",
    "body",
    { lineHeight: 1.55 }
  );
  line(s, "footer-rule", 65, 1220, 950, "#111111", 8);
  ["#D92B2B", "#1D3557", "#E9C46A"].forEach((color, i) =>
    rect(s, `footer-shape-${i}`, 65 + i * 48, 1260, 30, 30, color, {
      cornerRadiusPx: i === 0 ? 15 : 0,
    })
  );
  text(
    s,
    "cta",
    "MÓDULO 01 →",
    620,
    1250,
    395,
    60,
    31,
    "Archivo Black",
    400,
    "#111111",
    "cta",
    { align: "right" }
  );
  s.notes!.push(
    "Curva do quarto de círculo convertida em polígono nativo; sombras CSS não são usadas como geometria."
  );
}

await fs.mkdir(output, { recursive: true });
await fs.mkdir(path.join(output, "specs"), { recursive: true });
await fs.mkdir(path.join(output, "authoring"), { recursive: true });
const fonts: ReferenceFontAsset[] = [];
const fontSources = JSON.parse(
  await fs.readFile("designs/acervo82/pilot/fonts.json", "utf8")
).fonts;
for (const f of fontSources) {
  const bytes = await fs.readFile(f.path);
  if (hash(bytes) !== f.sha256)
    throw new Error(`pilot_font_hash_mismatch:${f.family}`);
  for (const weight of [
    "Inter",
    "Montserrat",
    "Space Grotesk",
    "Archivo",
    "Fraunces",
    "Playfair Display",
    "Lora",
  ].includes(f.family)
    ? [400, 600, 700]
    : [400])
    fonts.push({
      family: f.family,
      weight,
      sourceUrl: null,
      mimeType: "font/ttf",
      dataUrl: `data:font/ttf;base64,${bytes.toString("base64")}`,
      sha256: hash(bytes),
      license: "open-source",
    });
}
// Variable font pieces may request intermediate weights; all retain verified bytes.
for (const family of ["Inter", "Montserrat"])
  for (const weight of [800, 900])
    fonts.push({ ...fonts.find(f => f.family === family)!, weight });
await fs.mkdir("artifacts/design-recreation/acervo82-pilot", {
  recursive: true,
});
await fs.writeFile(
  "artifacts/design-recreation/acervo82-pilot/fonts.json",
  JSON.stringify({ scene: { fonts } })
);
const inventory = [];
for (const s of specs) {
  const e = roster.entries.find((e: any) => e.id === s.stem);
  if (!e) throw new Error("pilot_source_not_in_frozen_roster");
  const bytes = await fs.readFile(e.preview);
  s.sourcePath = e.preview;
  s.originalHash = hash(bytes);
  const json = JSON.stringify(s, null, 2) + "\n";
  await fs.writeFile(`designs/acervo82/pilot/specs/${s.stem}.json`, json);
  await fs.writeFile(path.join(output, "specs", `${s.stem}.json`), json);
  const fields = [
    ...new Set(s.layers.map(l => l.fieldId).filter(Boolean)),
  ] as string[];
  const units = fields.map(id => ({
    role:
      id === "headline" || id === "left-body"
        ? "headline"
        : id === "body" || id === "right-body"
          ? "body"
          : id === "cta"
            ? "callToAction"
            : id === "eyebrow"
              ? "eyebrow"
              : "label",
    fields: [id],
  }));
  const authoring = { family: s.stem, units, roles: ["static", "cover"] };
  await fs.writeFile(
    path.join(output, "authoring", `${s.stem}.json`),
    JSON.stringify(authoring, null, 2)
  );
  inventory.push({
    id: s.stem,
    name: s.title,
    sourcePath: path.resolve(e.preview),
    sha256: hash(bytes),
    width: 1080,
    height: 1350,
    status: "authored-pilot",
    rosterId: e.id,
  });
  // Validate all layers, groups, fields and verified font references before build.
  recipeFromSpec(s, new Map(fonts.map(f => [`${f.family}:${f.weight}`, f])));
}
await fs.writeFile(
  path.join(output, "inventory.json"),
  JSON.stringify(
    {
      format: "postspark.complete-designs.intake",
      schemaVersion: 1,
      images: inventory,
    },
    null,
    2
  )
);
await fs.writeFile(
  "designs/acervo82/pilot/manifest.json",
  JSON.stringify(
    {
      version: 1,
      authoredAt,
      scope: "isolated-pilot-not-final-catalogue",
      sources: inventory.map(i => ({
        id: i.id,
        title: i.name,
        sourceHash: i.sha256,
      })),
      authorship:
        "native editable layers; compare against archived reference; no automatic visual approval",
    },
    null,
    2
  ) + "\n"
);
console.log(
  JSON.stringify({
    authored: specs.length,
    sourcePreserved: true,
    output,
    externalCalls: 0,
  })
);
