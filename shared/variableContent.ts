import { z } from "zod";

export const contentBlockTypes = [
  "text",
  "list",
  "metric",
  "quote",
  "comparison",
] as const;
export const contentTextRoles = [
  "headline",
  "body",
  "eyebrow",
  "sectionLabel",
  "callToAction",
  "label",
] as const;
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/);
const item = z.object({ id, text: z.string() }).strict();
const common = { id };
export const contentBlockSchemas = {
  text: z
    .object({
      ...common,
      type: z.literal("text"),
      role: z.enum(contentTextRoles),
      text: z.string(),
    })
    .strict(),
  list: z
    .object({ ...common, type: z.literal("list"), items: z.array(item) })
    .strict(),
  metric: z
    .object({
      ...common,
      type: z.literal("metric"),
      value: z.string(),
      label: z.string(),
      sourceSpanIds: z.array(z.string()),
    })
    .strict(),
  quote: z
    .object({
      ...common,
      type: z.literal("quote"),
      text: z.string(),
      author: z.string().nullable(),
      sourceSpanIds: z.array(z.string()),
    })
    .strict(),
  comparison: z
    .object({
      ...common,
      type: z.literal("comparison"),
      left: z.object({ label: z.string(), text: z.string() }).strict(),
      right: z.object({ label: z.string(), text: z.string() }).strict(),
    })
    .strict(),
};
export const contentBlockSchema = z.discriminatedUnion("type", [
  contentBlockSchemas.text,
  contentBlockSchemas.list,
  contentBlockSchemas.metric,
  contentBlockSchemas.quote,
  contentBlockSchemas.comparison,
]);
export type ContentBlock = z.infer<typeof contentBlockSchema>;
export const variableContentDocumentSchema = z
  .object({
    schemaVersion: z.literal(3),
    blocks: z.array(contentBlockSchema),
    caption: z.string(),
    hashtags: z.array(z.string()),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (new Set(c.blocks.map(b => b.id)).size !== c.blocks.length)
      ctx.addIssue({
        code: "custom",
        message: "IDs de blocos duplicados",
        path: ["blocks"],
      });
    for (const [index, b] of Array.from(c.blocks.entries()))
      if (
        b.type === "list" &&
        new Set(b.items.map(i => i.id)).size !== b.items.length
      )
        ctx.addIssue({
          code: "custom",
          message: "IDs de itens duplicados",
          path: ["blocks", index, "items"],
        });
  });
export type VariableContent = z.infer<typeof variableContentDocumentSchema>;
export const VARIABLE_CONTENT_LIMITS = {
  blocks: 32,
  items: 64,
  fieldChars: 4000,
  totalChars: 12000,
} as const;
const contractV1Schema = z
  .object({
    version: z.literal(1),
    blocks: z
      .object({
        min: z.number().int().min(1).max(32),
        max: z.number().int().min(1).max(32),
      })
      .strict(),
    allowedTypes: z.array(z.enum(contentBlockTypes)).min(1).max(5),
    requiredTypes: z.array(z.enum(contentBlockTypes)).max(5),
    allowedTextRoles: z.array(z.enum(contentTextRoles)).min(1).max(6),
    requiredTextRoles: z.array(z.enum(contentTextRoles)).max(6),
    listItems: z
      .object({
        min: z.number().int().min(1).max(64),
        max: z.number().int().min(1).max(64),
      })
      .strict(),
  })
  .strict();
const contractV2Schema = contractV1Schema.extend({
  version: z.literal(2),
  blocks: contractV1Schema.shape.blocks.nullable(),
  listItems: contractV1Schema.shape.listItems.nullable(),
});
/** Stored V1 bounds retain their original meaning; V2 null means editorial freedom. */
export const variableContentContractSchema = z
  .discriminatedUnion("version", [contractV1Schema, contractV2Schema])
  .superRefine((c, ctx) => {
    if (
      (c.blocks && c.blocks.min > c.blocks.max) ||
      (c.listItems && c.listItems.min > c.listItems.max)
    )
      ctx.addIssue({ code: "custom", message: "Faixa de conteúdo inválida" });
    const minimum =
      new Set(c.requiredTypes.filter(t => t !== "text")).size +
      Math.max(
        new Set(c.requiredTextRoles).size,
        c.requiredTypes.includes("text") ? 1 : 0
      );
    if (minimum > (c.blocks?.max ?? VARIABLE_CONTENT_LIMITS.blocks))
      ctx.addIssue({
        code: "custom",
        message: "Blocos obrigatórios excedem a quantidade pedida",
      });
    if (
      c.requiredTypes.some(t => !c.allowedTypes.includes(t)) ||
      c.requiredTextRoles.some(r => !c.allowedTextRoles.includes(r)) ||
      (c.requiredTextRoles.length > 0 && !c.allowedTypes.includes("text"))
    )
      ctx.addIssue({
        code: "custom",
        message: "Conteúdo obrigatório não permitido",
      });
  });
export type VariableContentContract = z.infer<
  typeof variableContentContractSchema
>;

/** Only requested counts enter the LLM schema; technical count budgets stay server-side. */
export function variableContentResponseSchema(
  contract: VariableContentContract
) {
  const c = variableContentContractSchema.parse(contract);
  const generatedText = z
    .string()
    .min(1)
    .max(VARIABLE_CONTENT_LIMITS.fieldChars);
  const evidence = z.array(z.string().min(1).max(80)).min(1).max(16);
  const side = z.object({ label: generatedText, text: generatedText }).strict();
  const schemas = {
    text: contentBlockSchemas.text.extend({
      text: generatedText,
      role: z.enum(
        c.allowedTextRoles as [
          (typeof contentTextRoles)[number],
          ...(typeof contentTextRoles)[number][],
        ]
      ),
    }),
    list: contentBlockSchemas.list.extend({
      items: c.listItems
        ? z
            .array(item.extend({ text: generatedText }))
            .min(1)
            .max(c.listItems.max)
        : z.array(item.extend({ text: generatedText })).min(1),
    }),
    metric: contentBlockSchemas.metric.extend({
      value: generatedText,
      label: generatedText,
      sourceSpanIds: evidence,
    }),
    quote: contentBlockSchemas.quote.extend({
      text: generatedText,
      author: generatedText.nullable(),
      sourceSpanIds: evidence,
    }),
    comparison: contentBlockSchemas.comparison.extend({
      left: side,
      right: side,
    }),
  };
  const choices = c.allowedTypes.map(type => schemas[type]);
  const block =
    choices.length === 1
      ? choices[0]
      : z.union(
          choices as [
            (typeof choices)[number],
            (typeof choices)[number],
            ...(typeof choices)[number][],
          ]
        );
  return z
    .object({
      schemaVersion: z.literal(3),
      blocks: c.blocks
        ? z.array(block).min(c.blocks.min).max(c.blocks.max)
        : z.array(block).min(1),
      caption: z.string().max(VARIABLE_CONTENT_LIMITS.fieldChars),
      hashtags: z.array(z.string().max(100)).max(30),
    })
    .strict();
}
export function validateVariableContent(
  content: VariableContent,
  contract: VariableContentContract
): string[] {
  const parsed = variableContentResponseSchema(contract).safeParse(content);
  const errors = parsed.success
    ? []
    : parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`);
  const identity = variableContentDocumentSchema.safeParse(content);
  if (!identity.success)
    errors.push(...identity.error.issues.map(i => i.message));
  const lists = content.blocks.filter(b => b.type === "list");
  const totalItems = lists.reduce((n, b) => n + b.items.length, 0);
  if (content.blocks.length > VARIABLE_CONTENT_LIMITS.blocks)
    errors.push(
      `Orçamento técnico: use até ${VARIABLE_CONTENT_LIMITS.blocks} blocos`
    );
  if (totalItems > VARIABLE_CONTENT_LIMITS.items)
    errors.push(
      `Orçamento técnico: use até ${VARIABLE_CONTENT_LIMITS.items} itens no total`
    );
  if (
    lists.length &&
    contract.listItems &&
    (totalItems < contract.listItems.min || totalItems > contract.listItems.max)
  )
    errors.push(
      `Total de itens fora do contrato: ${totalItems}; esperado ${contract.listItems.min}–${contract.listItems.max}`
    );
  for (const type of contract.requiredTypes)
    if (!content.blocks.some(b => b.type === type))
      errors.push(`Bloco obrigatório ausente: ${type}`);
  for (const role of contract.requiredTextRoles)
    if (!content.blocks.some(b => b.type === "text" && b.role === role))
      errors.push(`Papel obrigatório ausente: ${role}`);
  let chars =
    content.caption.length + content.hashtags.reduce((n, s) => n + s.length, 0);
  if (
    [content.caption, ...content.hashtags].some(
      s => s.length > VARIABLE_CONTENT_LIMITS.fieldChars
    )
  )
    errors.push("Campo excede 4.000 caracteres");
  const check = (text: string) => {
    chars += text.length;
    if (!text.trim()) errors.push("Bloco visual vazio");
    if (text.length > VARIABLE_CONTENT_LIMITS.fieldChars)
      errors.push("Campo excede 4.000 caracteres");
  };
  for (const b of content.blocks) {
    if (b.type === "text") check(b.text);
    else if (b.type === "list") b.items.forEach(i => check(i.text));
    else if (b.type === "metric") {
      check(b.value);
      check(b.label);
    } else if (b.type === "quote") {
      check(b.text);
      if (b.author !== null) check(b.author);
    } else {
      check(b.left.label);
      check(b.left.text);
      check(b.right.label);
      check(b.right.text);
    }
  }
  if (chars > VARIABLE_CONTENT_LIMITS.totalChars)
    errors.push("Conteúdo excede 12.000 caracteres");
  return Array.from(new Set(errors));
}

/** Positive editorial guidance, containing counts only when the contract specifies them. */
export function variableContentPromptInstructions(
  contract: VariableContentContract
): string {
  const c = variableContentContractSchema.parse(contract);
  const quantity = (bounds: { min: number; max: number }, noun: string) =>
    bounds.min === bounds.max
      ? `Use exatamente ${bounds.min} ${noun}.`
      : `Use entre ${bounds.min} e ${bounds.max} ${noun}.`;
  return [
    "Organize o conteúdo nos blocos necessários para comunicar o briefing com clareza. Use content schemaVersion 3, blocos tipados e IDs estáveis únicos; escolha os papéis conforme sua função e o schema fornecido.",
    "Uma lista é um bloco semântico; seus itens são contados em conjunto com os itens das demais listas.",
    c.blocks ? quantity(c.blocks, "blocos semânticos") : "",
    c.listItems
      ? quantity(c.listItems, "itens no total de todas as listas")
      : "",
    c.requiredTypes.length
      ? `Inclua os tipos solicitados: ${c.requiredTypes.join(", ")}.`
      : "",
    c.requiredTextRoles.length
      ? `Inclua os papéis solicitados: ${c.requiredTextRoles.join(", ")}.`
      : "",
    "Preserve os textos literais e sustente métricas e citações nas evidências fornecidas, com sourceSpanIds correspondentes. Copy literal pode ser igual nas direções visuais. Mantenha legenda e hashtags nos campos próprios. A geometria é responsabilidade do compositor.",
  ]
    .filter(Boolean)
    .join(" ");
}

const words: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
};
/** Explicit counts come from the original request, never from catalogue capacity. */
export function deriveVariableContentContract(
  request: string
): VariableContentContract {
  const text = request
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["“][^"”]*["”]/g, " ");
  const token = "(?:\\d+|" + Object.keys(words).join("|") + ")";
  const count = (s: string) => (/^\d+$/.test(s) ? Number(s) : words[s]);
  const bounds = (noun: string, limit: number, extra: number[] = []) => {
    let remaining = text;
    const ranges: { min: number; max: number }[] = [];
    remaining = remaining.replace(
      new RegExp(
        "\\bentre\\s+(" +
          token +
          ")\\s+e\\s+(" +
          token +
          ")\\s+(?:" +
          noun +
          ")\\b",
        "g"
      ),
      (_, a, b) => {
        ranges.push({ min: count(a), max: count(b) });
        return " ";
      }
    );
    remaining = remaining.replace(
      new RegExp("\\bate\\s+(" + token + ")\\s+(?:" + noun + ")\\b", "g"),
      (_, a) => {
        ranges.push({ min: 1, max: count(a) });
        return " ";
      }
    );
    const exact = [
      ...extra,
      ...Array.from(
        remaining.matchAll(
          new RegExp("\\b(" + token + ")\\s+(?:" + noun + ")\\b", "g")
        ),
        m => count(m[1])
      ),
    ];
    if (noun.startsWith("itens"))
      exact.push(
        ...Array.from(
          remaining.matchAll(
            new RegExp("\\blista\\s+(?:com|de)\\s+(" + token + ")\\b", "g")
          ),
          m => count(m[1])
        )
      );
    if (new Set(exact).size > 1)
      throw new Error(
        "Quantidades conflitantes no pedido; informe uma quantidade única."
      );
    const all = [...ranges, ...exact.map(n => ({ min: n, max: n }))];
    if (all.some(r => r.min < 1 || r.max > limit || r.min > r.max))
      throw new Error(
        `Quantidade fora do orçamento de geração (1–${limit}). O pedido não foi reduzido.`
      );
    if (!all.length) return undefined;
    const result = {
      min: Math.max(...all.map(r => r.min)),
      max: Math.min(...all.map(r => r.max)),
    };
    if (result.min > result.max)
      throw new Error(
        "Quantidades conflitantes no pedido; informe uma faixa compatível."
      );
    return result;
  };
  const singleNoun = text.match(
    /\b(?:apenas|somente|so)\s+(?:(?:um|uma|1)\s+)?(frase|texto|titulo|corpo|cta|metrica|citacao|comparacao)\b/
  )?.[1];
  const single = Boolean(singleNoun);
  const forcedType =
    singleNoun === "metrica"
      ? ("metric" as const)
      : singleNoun === "citacao"
        ? ("quote" as const)
        : singleNoun === "comparacao"
          ? ("comparison" as const)
          : undefined;
  const forcedRole =
    singleNoun === "titulo"
      ? ("headline" as const)
      : singleNoun === "corpo"
        ? ("body" as const)
        : singleNoun === "cta"
          ? ("callToAction" as const)
          : undefined;
  const phraseOnly =
    (single && !forcedType) ||
    new RegExp("\\b" + token + "\\s+frases?\\b").test(text);
  const listOnly = new RegExp(
    "\\b(?:apenas|somente|so)\\s+(?:" +
      token +
      "\\s+)?(?:lista|itens|dicas|passos)\\b"
  ).test(text);
  const blockBounds = bounds(
    "blocos?|elementos?|frases?",
    32,
    single || listOnly ? [1] : []
  );
  const itemBounds = bounds("itens|passos|dicas", 64);
  const noList = /\bsem\s+(?:lista|listas|itens)\b/.test(text);
  const list =
    Boolean(itemBounds) ||
    /\b(?:lista|listas|itens|passos|dicas)\b/.test(
      text.replace(/\bsem\s+(?:lista|listas|itens)\b/g, " ")
    );
  if (noList && list)
    throw new Error("Pedido exige e proíbe lista ao mesmo tempo.");
  const noCTA = /\bsem\s+(?:cta|chamada\s+para\s+acao)\b/.test(text);
  const roles: VariableContentContract["requiredTextRoles"] = forcedRole
    ? [forcedRole]
    : [];
  if (/\b(?:com|inclua|incluir|use)\s+(?:um\s+)?titulo\b/.test(text))
    roles.push("headline");
  if (/\b(?:com|inclua|incluir|use|titulo\s+e)\s+(?:um\s+)?corpo\b/.test(text))
    roles.push("body");
  if (
    /\b(?:inclua|incluir|com)\s+(?:um(?:a)?\s+)?(?:cta|chamada\s+para\s+acao)\b/.test(
      text
    )
  )
    roles.push("callToAction");
  const allowedTypes = forcedType
    ? [forcedType]
    : phraseOnly
      ? ["text" as const]
      : listOnly
        ? ["list" as const]
        : contentBlockTypes.filter(t => !(t === "list" && noList));
  const allowedTextRoles = contentTextRoles.filter(
    r =>
      !(forcedRole
        ? r !== forcedRole
        : phraseOnly && r !== "body" && r !== "headline") &&
      !(r === "headline" && /\bsem\s+titulo\b/.test(text)) &&
      !(r === "body" && /\bsem\s+corpo\b/.test(text)) &&
      !(r === "callToAction" && noCTA)
  );
  const parsed = variableContentContractSchema.safeParse({
    version: 2,
    blocks: blockBounds ?? null,
    allowedTypes,
    requiredTypes: list ? ["list"] : forcedType ? [forcedType] : [],
    allowedTextRoles,
    requiredTextRoles: roles,
    listItems: itemBounds ?? null,
  });
  if (!parsed.success)
    throw new Error(parsed.error.issues.map(i => i.message).join("; "));
  return parsed.data;
}
