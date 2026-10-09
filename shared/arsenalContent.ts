import { z } from "zod";
import {
  variableContentDocumentSchema,
  validateVariableContent,
  type VariableContent,
} from "./variableContent";
export { variableContentDocumentSchema } from "./variableContent";

// Editing/reopening deliberately has no generation character or item limits.
const text = z.string();
export const designContentV2DocumentSchema = z
  .object({
    schemaVersion: z.literal(2),
    headline: text,
    body: text.nullable(),
    eyebrow: text.nullable(),
    sectionLabel: text.nullable(),
    callToAction: text.nullable(),
    label: text.nullable(),
    items: z.array(z.object({ id: z.string().min(1), text }).strict()),
    metric: z
      .object({ value: text, label: text, sourceSpanIds: z.array(z.string()) })
      .strict()
      .nullable(),
    attribution: z
      .object({ quote: text, author: text, sourceSpanIds: z.array(z.string()) })
      .strict()
      .nullable(),
    comparison: z
      .object({
        left: z.object({ label: text, text }).strict(),
        right: z.object({ label: text, text }).strict(),
      })
      .strict()
      .nullable(),
    caption: text,
    hashtags: z.array(text),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (new Set(c.items.map(i => i.id)).size !== c.items.length)
      ctx.addIssue({
        code: "custom",
        message: "IDs de itens duplicados",
        path: ["items"],
      });
  });
export type DesignContentV2 = z.infer<typeof designContentV2DocumentSchema>;
export type DesignContent = DesignContentV2 | VariableContent;
export const designContentDocumentSchema = z.union([
  designContentV2DocumentSchema,
  variableContentDocumentSchema,
]);

export const designContentV2GenerationSchema =
  designContentV2DocumentSchema.superRefine((c, ctx) => {
    if (!c.headline.trim())
      ctx.addIssue({
        code: "custom",
        message: "Título obrigatório",
        path: ["headline"],
      });
    if (c.items.length > 12)
      ctx.addIssue({
        code: "custom",
        message: "Máximo 12 itens",
        path: ["items"],
      });
    let chars = 0;
    const visit = (v: unknown): void => {
      if (typeof v === "string") {
        chars += v.length;
        if (v.length > 4000)
          ctx.addIssue({
            code: "custom",
            message: "Texto excede 4.000 caracteres",
          });
      } else if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object")
        Object.entries(v)
          .filter(([key]) => key !== "id" && key !== "sourceSpanIds")
          .forEach(([, value]) => visit(value));
    };
    visit(c);
    if (chars > 12000)
      ctx.addIssue({
        code: "custom",
        message: "Conteúdo excede 12.000 caracteres",
      });
  });

export const designContentGenerationSchema = z.union([
  designContentV2GenerationSchema,
  variableContentDocumentSchema.superRefine((c, ctx) => {
    for (const message of validateVariableContent(c, {
      version: 2,
      blocks: null,
      allowedTypes: ["text", "list", "metric", "quote", "comparison"],
      requiredTypes: [],
      allowedTextRoles: [
        "headline",
        "body",
        "eyebrow",
        "sectionLabel",
        "callToAction",
        "label",
      ],
      requiredTextRoles: [],
      listItems: null,
    }))
      ctx.addIssue({ code: "custom", message });
  }),
]);

/** Same canonicalization as the existing catalog; no whitespace normalization. */
export function arsenalCanonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(arsenalCanonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${arsenalCanonicalJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

// A synchronous, platform-independent SHA-256 keeps a document edit atomic.
// UTF-8 input and big-endian padding; browser and server share exact hashes.
export function arsenalHash(value: unknown): string {
  const bytes = new TextEncoder().encode(arsenalCanonicalJson(value));
  const length = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(length);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const data = new DataView(padded.buffer);
  data.setUint32(length - 8, Math.floor(bytes.length / 0x20000000));
  data.setUint32(length - 4, (bytes.length * 8) >>> 0);
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotate = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let block = 0; block < length; block += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) w[i] = data.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15],
        b = w[i - 2];
      w[i] =
        w[i - 16] +
        (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) +
        w[i - 7] +
        (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10));
    }
    let [a, b, c, d, e, f, g, j] = h;
    for (let i = 0; i < 64; i++) {
      const t1 =
        (j +
          (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
          ((e & f) ^ (~e & g)) +
          k[i] +
          w[i]) |
        0;
      const t2 =
        ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) +
          ((a & b) ^ (a & c) ^ (b & c))) |
        0;
      j = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, j].forEach((v, i) => {
      h[i] = (h[i] + v) | 0;
    });
  }
  return h.map(n => (n >>> 0).toString(16).padStart(8, "0")).join("");
}

export const visualContentSources = [
  "headline",
  "body",
  "eyebrow",
  "sectionLabel",
  "callToAction",
  "label",
  "items",
  "metric.value",
  "metric.label",
  "attribution.quote",
  "attribution.author",
  "comparison.left.label",
  "comparison.left.text",
  "comparison.right.label",
  "comparison.right.text",
] as const;
export type ContentSource = string;
export const blockContentParts = {
  text: ["text"],
  list: ["items"],
  metric: ["value", "label"],
  quote: ["text", "author"],
  comparison: ["left.label", "left.text", "right.label", "right.text"],
} as const;
export function visualSourcesFor(content: DesignContent): string[] {
  return content.schemaVersion === 2
    ? [...visualContentSources]
    : content.blocks.flatMap(b =>
        blockContentParts[b.type].map(part => `content:${b.id}:${part}`)
      );
}
/** Stable canonical keys let coverage detect every repeated block, including duplicates of a role. */
export function canonicalContentSource(
  content: DesignContent,
  source: string
): string | null {
  if (content.schemaVersion === 2)
    return (visualContentSources as readonly string[]).includes(source)
      ? source
      : null;
  const canonical = source.match(/^content:([A-Za-z0-9_-]+):([a-zA-Z.]+)$/);
  if (canonical) {
    const b = content.blocks.find(b => b.id === canonical[1]);
    return b &&
      (blockContentParts[b.type] as readonly string[]).includes(canonical[2])
      ? source
      : null;
  }
  const aliases: Record<string, [string, string]> = {
    headline: ["headline", "text"],
    body: ["body", "text"],
    eyebrow: ["eyebrow", "text"],
    sectionLabel: ["sectionLabel", "text"],
    callToAction: ["callToAction", "text"],
    label: ["label", "text"],
    items: ["list", "items"],
    "metric.value": ["metric", "value"],
    "metric.label": ["metric", "label"],
    "attribution.quote": ["quote", "text"],
    "attribution.author": ["quote", "author"],
    "comparison.left.label": ["comparison", "left.label"],
    "comparison.left.text": ["comparison", "left.text"],
    "comparison.right.label": ["comparison", "right.label"],
    "comparison.right.text": ["comparison", "right.text"],
  };
  const selector = source.match(/^block:([a-zA-Z]+):(\d+):([a-zA-Z.]+)$/);
  const [kind, part] = selector
    ? [selector[1], selector[3]]
    : (aliases[source] ?? []);
  if (!kind) return null;
  const b = content.blocks.filter(
    b => b.type === kind || (b.type === "text" && b.role === kind)
  )[selector ? Number(selector[2]) : 0];
  return b && (blockContentParts[b.type] as readonly string[]).includes(part)
    ? `content:${b.id}:${part}`
    : null;
}
/** A generated text region may display several canonical paragraphs of the same role.
 * IDs remain authoritative; the group is a view, never a second copy of the text. */
export function groupedTextBlocks(content: DesignContent, source: string) {
  if (content.schemaVersion !== 3 || !/^textGroup:[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)+$/.test(source)) return [];
  const ids = source.slice("textGroup:".length).split(",");
  if (new Set(ids).size !== ids.length) return [];
  const blocks = ids.map(id => content.blocks.find(b => b.id === id));
  if (blocks.some(b => !b || b.type !== "text")) return [];
  const texts = blocks.filter((b): b is Extract<VariableContent["blocks"][number], {type:"text"}> => b?.type === "text");
  return texts.every(b => b.role === texts[0].role) ? texts : [];
}
export function canonicalContentSources(content: DesignContent, source: string): string[] {
  const group = groupedTextBlocks(content, source);
  if (group.length) return group.map(b => `content:${b.id}:text`);
  const key = canonicalContentSource(content, source);
  return key ? [key] : [];
}
export function readContentSource(
  content: DesignContent,
  source: string
): string | Array<{ id: string; text: string }> {
  if (content.schemaVersion === 3) {
    const group = groupedTextBlocks(content, source);
    if (group.length) return group.map(b => b.text).filter(Boolean).join("\n\n");
    const key = canonicalContentSource(content, source);
    if (!key) return "";
    const [, id, part] = key.split(":");
    const block = content.blocks.find(b => b.id === id)!;
    if (part === "items" && block.type === "list") return block.items;
    let v: unknown = block;
    for (const p of part.split("."))
      v = v && typeof v === "object" ? (v as Record<string, unknown>)[p] : null;
    return typeof v === "string" ? v : "";
  }
  if (source === "items") return content.items;
  let value: unknown = content;
  for (const key of source.split("."))
    value =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : null;
  return typeof value === "string" ? value : "";
}
export function contentListItems(content: DesignContent, source = "items") {
  const v = readContentSource(content, source);
  return Array.isArray(v) ? v : [];
}
export function projectContentHeadline(content: DesignContent): string {
  const v = readContentSource(content, "headline");
  return typeof v === "string" ? v : "";
}
/** Full compatibility projection, never manufacture, flattening only for legacy consumers. */
export function projectContentBody(content: DesignContent): string {
  const headline = canonicalContentSource(content, "headline");
  return visualSourcesFor(content)
    .filter(s => s !== headline)
    .flatMap(source => {
      const v = readContentSource(content, source);
      return Array.isArray(v) ? v.map(i => i.text) : v ? [v] : [];
    })
    .join("\n");
}
export function contentCoverageIssues(
  content: DesignContent,
  bindings: ReadonlyArray<{ source: string }>
): string[] {
  const covered = new Set(
    bindings.flatMap(b => canonicalContentSources(content, b.source))
  );
  return visualSourcesFor(content)
    .filter(s => {
      const v = readContentSource(content, s);
      return (Array.isArray(v) ? v.length : !!v.trim()) && !covered.has(s);
    })
    .map(s => `content_coverage:${s}`);
}
/** Mutates a cloned document only; caller owns revision/undo. */
export function setContentSource(
  content: DesignContent,
  source: string,
  text: string,
  itemId?: string | null
): void {
  if (itemId) {
    const item = contentListItems(content, source).find(i => i.id === itemId);
    if (item) item.text = text;
    return;
  }
  let target: unknown = content,
    path = source;
  if (content.schemaVersion === 3) {
    const group = groupedTextBlocks(content, source);
    if (group.length) {
      if (text === readContentSource(content, source)) return;
      const paragraphs = text.split("\n\n");
      group.forEach((block, index) => {
        block.text = index === group.length - 1 ? paragraphs.slice(index).join("\n\n") : (paragraphs[index] ?? "");
      });
      return;
    }
    const key = canonicalContentSource(content, source);
    if (!key) throw new Error("Binding sem bloco de conteúdo");
    const [, id, part] = key.split(":");
    target = content.blocks.find(b => b.id === id);
    path = part;
  }
  const parts = path.split(".");
  for (const p of parts.slice(0, -1))
    target = (target as Record<string, unknown>)[p];
  if (!target || typeof target !== "object")
    throw new Error("Binding de texto inválido");
  (target as Record<string, unknown>)[parts.at(-1)!] = text;
}

/** Updates headline, body (subtext), and/or caption on any DesignContent document (V2 or V3). */
export function applyContentText(
  content: DesignContent,
  patch: { headline?: string; body?: string | null; subtext?: string | null; caption?: string }
): DesignContent {
  const next = structuredClone(content);
  const headline = patch.headline;
  const bodyText = patch.body !== undefined ? patch.body : patch.subtext;
  const caption = patch.caption;

  if (headline !== undefined) {
    if (next.schemaVersion === 2) {
      next.headline = headline;
    } else {
      const headBlock = next.blocks.find(b => b.type === "text" && b.role === "headline");
      if (headBlock && headBlock.type === "text") headBlock.text = headline;
    }
  }
  if (bodyText !== undefined) {
    if (next.schemaVersion === 2) {
      next.body = bodyText;
    } else {
      const bodyBlock = next.blocks.find(b => b.type === "text" && b.role === "body");
      if (bodyBlock && bodyBlock.type === "text") bodyBlock.text = bodyText ?? "";
    }
  }
  if (caption !== undefined) {
    next.caption = caption;
  }
  return next;
}
