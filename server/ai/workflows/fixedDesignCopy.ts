import { z } from "zod";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { resolve } from "node:path";
import {
  contentListItems,
  readContentSource,
  setContentSource,
  arsenalHash,
} from "@shared/arsenalContent";
import { readArsenalComposition } from "@shared/designArsenal";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { partitionArsenalReadinessIssues } from "@shared/arsenalReadiness";
import { arsenalBundledManifest } from "@shared/arsenalBundledManifest";
import { layoutRichText } from "@shared/arsenalTextLayout";
import {
  effectiveContentRequirements,
  requirementMatches,
} from "@shared/contentRequirements";
import type { OrchestratedGenerationInput } from "@shared/generationRequest";
import { aspectRatioHeight } from "@shared/aspectRatios";
import type { CanvasPostModel } from "../../../client/src/pages/CanvasLab/components/types";
import {
  editArsenalContent,
  putArsenalComposition,
} from "../../../client/src/pages/CanvasLab/lib/arsenalComposition";
import { createComponentTextMeasurer } from "../componentTextMeasurer";
import { GenerationFailureError } from "@shared/generationFailure";
import { invokeLLM } from "../../_core/llm";
import type { PinnedDesign } from "./fixedDesignSource";

type Field = {
  id: string;
  page: number;
  role: string;
  sample: string;
  minChars: number;
  maxChars: number;
  source?: string;
  bindingId?: string;
  itemId?: string;
  height?: number;
};
const copySchema = z
  .object({
    values: z
      .array(z.object({ id: z.string(), text: z.string().max(4000) }).strict())
      .max(240),
    caption: z.string().max(4000),
  })
  .strict();
const reviewSchema = z
  .object({ issues: z.array(z.string().max(400)).max(12) })
  .strict();
type Copy = z.infer<typeof copySchema>;
type Operation = <T>(key: string, work: () => Promise<T>) => Promise<T>;

export function fixedDesignFields(model: CanvasPostModel): Field[] {
  return model.slides.flatMap<Field>((page, index) => {
    if (page.composition) {
      const scene = readArsenalComposition(page.composition);
      const sources = new Set<string>();
      return scene.base.bindings.flatMap(binding => {
        if (binding.kind === "media" || sources.has(binding.source)) return [];
        sources.add(binding.source);
        const targets = scene.elements.filter(
          element => element.bindingId === binding.id && element.kind === "text"
        );
        const capacity = Math.max(
          8,
          Math.floor(
            targets.reduce(
              (sum, element) =>
                sum +
                (element.width / (element.fontSize * 0.6)) *
                  Math.max(
                    1,
                    Math.floor(element.height / (element.fontSize * 1.2))
                  ),
              0
            )
          )
        );
        const role = binding.source.split(":")[1] ?? binding.source;
        if (binding.kind === "list")
          return contentListItems(scene.content, binding.source).map(item => ({
            id: `${index}:${binding.id}:${item.id}`,
            page: index,
            role,
            sample: item.text,
            minChars: 1,
            maxChars: Math.floor(capacity / Math.max(1, targets.length)),
            source: binding.source,
            bindingId: binding.id,
            itemId: item.id,
          }));
        const sample = readContentSource(scene.content, binding.source);
        return typeof sample === "string"
          ? [
              {
                id: `${index}:${binding.id}`,
                page: index,
                role,
                sample,
                minChars: role === "headline" ? 1 : 0,
                maxChars: capacity,
                source: binding.source,
                bindingId: binding.id,
              },
            ]
          : [];
      });
    }
    const texts = page.extraTexts ?? [];
    const shapes = page.extraShapes ?? [];
    const headline = [...texts]
      .sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0))
      .find(t => t.text.length > 2);
    return texts.flatMap((text, position) => {
      if (
        (position === 0 && text.id === "text-0" && text.y === 20) ||
        /^(\d{1,2}|[+×“])$/.test(text.text)
      )
        return [];
      const { x = 0, y = 0, width = 320, fontSize = 12 } = text;
      const rowBottom = Math.min(
        aspectRatioHeight(model.aspectRatio, 360),
        ...texts
          .filter(
            next =>
              (next.y ?? 0) > y &&
              (next.x ?? 0) < x + width &&
              (next.x ?? 0) + (next.width ?? 320) > x
          )
          .map(next => (next.y ?? 0) - 2)
      );
      const shapeBottom = Math.min(
        ...shapes
          .filter(
            shape =>
              shape.x <= x &&
              shape.y <= y &&
              shape.x + shape.width >= x + width - 0.5 &&
              shape.y + shape.height > y + fontSize
          )
          .map(shape => shape.y + shape.height - 3)
      );
      const height = Math.max(
        fontSize * 1.3,
        Math.min(rowBottom, shapeBottom) - y
      );
      const pageHeight = aspectRatioHeight(model.aspectRatio, 360);
      const role =
        text.id === headline?.id
          ? "headline"
          : y > pageHeight - 32
            ? "rodapé"
            : y > pageHeight - 74
              ? "callToAction"
              : "apoio ou etiqueta";
      return [
        {
          id: `${index}:${text.id}`,
          page: index,
          role,
          sample: text.text,
          minChars: role === "headline" || role === "callToAction" ? 1 : 0,
          maxChars: Math.max(
            5,
            Math.floor(
              (width / (fontSize * 0.62)) *
                Math.max(1, Math.floor(height / (fontSize * 1.3)))
            )
          ),
          height,
        },
      ];
    });
  });
}

let kitFontsRegistered = false;
function registerKitFonts() {
  if (kitFontsRegistered) return;
  kitFontsRegistered = true;
  for (const entry of Object.values(arsenalBundledManifest)) {
    if (
      entry.sourceFamily?.startsWith("Space Grotesk") ||
      entry.sourceFamily === "Space Mono"
    )
      GlobalFonts.registerFromPath(
        resolve("client/public", "." + entry.path),
        entry.sourceFamily.startsWith("Space Grotesk")
          ? "Space Grotesk"
          : entry.sourceFamily
      );
  }
}

function legacyMetrics(
  text: NonNullable<CanvasPostModel["slides"][number]["extraTexts"]>[number]
) {
  const ctx = createCanvas(1, 1).getContext("2d");
  return layoutRichText({
    text: text.text,
    width: text.width ?? 320,
    fontSize: text.fontSize ?? 12,
    fontFamily: text.fontFamily ?? "Inter",
    fontStyle: String(text.fontWeight ?? "normal"),
    fill: text.color ?? "#000",
    lineHeight: 1.3,
    measureGlyph(value, family, size, style) {
      ctx.font = `${style} ${size}px "${family.split(",")[0].replace(/["']/g, "")}"`;
      return ctx.measureText(value).width;
    },
  });
}

export async function fitFixedCopy(
  pin: PinnedDesign,
  input: OrchestratedGenerationInput,
  runId: string,
  copy: Copy
) {
  const fields = fixedDesignFields(pin.canvas);
  const values = new Map(
    copy.values.map(value => [value.id, value.text.trim()])
  );
  const issues: string[] = [];
  if (
    values.size !== copy.values.length ||
    fields.length !== values.size ||
    fields.some(field => !values.has(field.id))
  )
    return {
      issues: ["Preencha cada identificador de campo exatamente uma vez."],
    };
  const brief = input.executionBrief;
  let post = structuredClone(pin.canvas);
  post.id = `design-${runId}-0`;
  post.caption = copy.caption;
  delete post.completeDesign;
  if (post.slides.some(slide => !slide.composition)) registerKitFonts();
  for (const [index, slide] of Array.from(post.slides.entries())) {
    const targets = fields.filter(field => field.page === index);
    const empty = targets.find(
      field => field.minChars && !values.get(field.id)
    );
    if (empty) issues.push(`O campo obrigatório ${empty.id} está vazio.`);
    if (slide.composition) {
      const source = slide.composition;
      const content = structuredClone(source.content);
      for (const field of targets)
        setContentSource(
          content,
          field.source!,
          values.get(field.id)!,
          field.itemId
        );
      const measureText = await createComponentTextMeasurer(source.assets);
      const adjusted = resolveArsenalGeometry(
        editArsenalContent(source, content),
        { measureText, allowReduction: true, allowSubpixelTextOverflow: true }
      );
      for (const issue of partitionArsenalReadinessIssues(adjusted.issues)
        .blocking) {
        const affected = adjusted.elements
          .filter(element => issue.includes(element.id))
          .map(element => element.bindingId);
        const ids = targets
          .filter(
            field => field.bindingId && affected.includes(field.bindingId)
          )
          .map(field => field.id);
        issues.push(`Página ${index + 1}: ${issue} ${ids.join(" ")}`);
      }
      post = putArsenalComposition(
        { ...post, currentSlideIndex: index },
        readArsenalComposition(adjusted)
      );
    } else {
      slide.extraTexts = slide.extraTexts?.map(text => {
        const field = targets.find(item => item.id === `${index}:${text.id}`);
        if (!field) return text;
        const value = {
          ...text,
          text: values.get(field.id)!,
          textRich: undefined,
        };
        if (value.text && legacyMetrics(value).height > field.height! + 0.5)
          issues.push(
            `O campo ${field.id} excede a altura de ${Math.round(field.height!)} px.`
          );
        return value;
      });
    }
  }
  const visible = fields.map(field => {
    const page = post.slides[field.page];
    const text = page.composition
      ? page.composition.elements
          .filter(
            element =>
              element.bindingId === field.bindingId &&
              (!field.itemId || element.itemId === field.itemId) &&
              element.opacity > 0
          )
          .map(element => element.text)
          .join(" ")
          .trim()
      : (page.extraTexts?.find(
          element => field.id === `${field.page}:${element.id}`
        )?.text ?? "");
    return { id: field.id, text };
  });
  const art = visible
    .map(field => field.text)
    .filter(Boolean)
    .join(" ");
  for (const requirement of effectiveContentRequirements(brief).filter(
    row => row.kind !== "meaning"
  )) {
    const candidates =
      requirement.scope === "art"
        ? [art]
        : requirement.scope === "caption"
          ? [copy.caption]
          : [art, copy.caption];
    if (
      candidates.some(value => requirementMatches(value, requirement)) ===
      (requirement.kind === "forbidden")
    )
      issues.push(
        `Revise a exigência em ${requirement.scope}: ${requirement.value}`
      );
  }
  const normalize = (text: string) => text.trim().replace(/\s+/g, " ");
  if (brief?.interventionLevel === "visual_only") {
    if (normalize(art) !== normalize(brief.rawInput))
      issues.push(
        "Distribua literalmente o texto do briefing na arte, sem acrescentar nem retirar palavras."
      );
    if (
      copy.caption.trim() &&
      normalize(copy.caption) !== normalize(brief.rawInput)
    )
      issues.push(
        "A legenda deve ficar vazia ou repetir o texto literal do briefing."
      );
  }
  return {
    issues,
    visible,
    post: { ...post, currentSlideIndex: 0, headline: post.slides[0].headline },
  };
}

export async function generateFixedCopy(args: {
  pin: PinnedDesign;
  input: OrchestratedGenerationInput;
  runId: string;
  source: string;
  signal: AbortSignal;
  deadline: number;
  model?: string;
  operation: Operation;
  generate?: typeof invokeLLM;
}) {
  const {
    pin,
    input,
    runId,
    source,
    signal,
    deadline,
    model,
    operation,
    generate = invokeLLM,
  } = args;
  if (arsenalHash(pin.canvas) !== pin.revision)
    throw new GenerationFailureError(
      "preparation_contract_incompatible",
      "selection"
    );
  const fields = fixedDesignFields(pin.canvas);
  if (!fields.length)
    throw new GenerationFailureError("artwork_unusable", "copy");
  const request = {
    request: input.content,
    briefing: input.executionBrief ?? input.content,
    sources: source,
    fields,
  };
  const call = async <T>(
    key: string,
    schema: z.ZodType<T>,
    system: string,
    data: unknown
  ): Promise<T> =>
    operation(key, async () => {
      const json = z.toJSONSchema(schema);
      delete json.$schema;
      const result = await generate({
        taskRoute: key.includes("review")
          ? "post_evaluation"
          : input.postMode === "carousel"
            ? "carousel_generation"
            : "static_generation",
        ...(model ? { pinnedModel: model } : {}),
        signal,
        deadlineMs: deadline,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(data) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fixed_design_" + key,
            strict: true,
            schema: json,
          },
        },
        forceTextSchema: true,
        maxCompletionTokens: 4500,
      });
      const raw = result.choices[0]?.message.content;
      if (typeof raw !== "string")
        throw new GenerationFailureError("artwork_unusable", "copy");
      return schema.parse(JSON.parse(raw));
    });
  const instructions =
    "Preencha os campos deste design fixo. Respeite o briefing, conserve fatos e CTA obrigatórios na arte. As amostras mostram espaço, não são fontes de fatos. maxChars é uma estimativa. Use frases concisas e os IDs indicados. Retorne todos os campos, inclusive os opcionais vazios.";
  const review = (copy: Copy, visible: Copy["values"], key: string) =>
    call(
      key,
      reviewSchema,
      "Confira se a arte preenche as exigências do briefing, preserva as promessas explícitas, não inventa fatos e respeita o escopo arte/legenda. Retorne issues vazio se passar. Quando houver um erro, cite o ID do campo a ajustar.",
      {
        briefing: request.briefing,
        sources: source,
        art: visible,
        caption: copy.caption,
      }
    );
  let copy = await call("copy", copySchema, instructions, request);
  let fit = await fitFixedCopy(pin, input, runId, copy);
  let issues = fit.issues;
  if (!issues.length)
    issues = (await review(copy, fit.visible!, "review")).issues;
  if (
    issues.length &&
    input.executionBrief?.interventionLevel !== "visual_only"
  ) {
    const repaired = await call(
      "repair",
      copySchema,
      instructions +
        " Corrija somente os campos apontados e preserve os demais.",
      { ...request, previous: copy, issues }
    );
    const affected = fields.filter(field =>
      issues.some(issue => issue.includes(field.id))
    );
    const physicalOnly =
      fit.issues.length > 0 &&
      fit.issues.every(issue =>
        affected.some(field => issue.includes(field.id))
      );
    copy = physicalOnly
      ? {
          caption: copy.caption,
          values: copy.values.map(value =>
            affected.some(field => field.id === value.id)
              ? (repaired.values.find(candidate => candidate.id === value.id) ??
                value)
              : value
          ),
        }
      : repaired;
    fit = await fitFixedCopy(pin, input, runId, copy);
    issues = fit.issues;
    if (!issues.length)
      issues = (await review(copy, fit.visible!, "review_repair")).issues;
  }
  if (issues.length || !fit.post)
    throw new GenerationFailureError("artwork_unusable", "copy", false);
  return fit.post;
}
