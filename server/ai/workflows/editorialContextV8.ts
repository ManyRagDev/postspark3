import { sourceRepresentation } from "./sourceRepresentation";
import { arsenalHash } from "@shared/arsenalContent";
import { GenerationFailureError } from "@shared/generationFailure";
import { editorialContextV7 } from "./editorialContextV7";

type Legacy = ReturnType<typeof editorialContextV7>;
type Input = Parameters<typeof editorialContextV7>[0];
export type SourceRange = { sourceId: string; start: number; end: number };
export type EditorialContextV2 = {
  version: 2;
  normalizationVersion: 1;
  sources: Legacy["sources"];
  project: {
    name?: SourceRange;
    niche?: SourceRange;
    structuredData: Record<string, SourceRange>;
  } | null;
  request: Record<string, SourceRange | string | undefined>;
  instructions: Record<string, SourceRange | string | undefined>;
  requirements: Array<
    Omit<Legacy["requirements"][number], "value"> & { valueRef: SourceRange }
  >;
  instructionOrigins: Legacy["instructionOrigins"];
  socialPlaybook: Legacy["socialPlaybook"];
  guidanceRanges: SourceRange[];
  hash: string;
};
export type EditorialContext = Legacy | EditorialContextV2 | import("./editorialContextV9").EditorialContextV3;

/** Offsets are JS UTF-16 string offsets, matching persisted native text and evidence anchors. */
export function sourceRangeText(
  context: Pick<EditorialContextV2, "sources">,
  ref: SourceRange
): string {
  const source = context.sources.find(s => s.id === ref.sourceId);
  if (
    !source ||
    !Number.isInteger(ref.start) ||
    !Number.isInteger(ref.end) ||
    ref.start < 0 ||
    ref.end <= ref.start ||
    ref.end > source.text.length
  )
    throw new Error("proposal_review_invalid_source_quote");
  return source.text.slice(ref.start, ref.end);
}

export function editorialContextV8(input: Input): EditorialContextV2 {
  const legacy = editorialContextV7(input, 6);
  const sources: Legacy["sources"] = [];
  // Preserve complete sources before interning structured values or instruction references.
  const intern = (
    text: string | undefined,
    origin = "context"
  ): SourceRange | undefined => {
    if (!text) return undefined;
    for (const source of sources) {
      const start = source.text.indexOf(text);
      if (start >= 0)
        return { sourceId: source.id, start, end: start + text.length };
    }
    const source = {
      id: `s${sources.length + 1}`,
      origin,
      text,
      hash: arsenalHash(text),
      canonicalHash: arsenalHash(sourceRepresentation(text).text),
    };
    sources.push(source);
    return { sourceId: source.id, start: 0, end: text.length };
  };
  for (const s of legacy.sources
    .filter(s => s.origin !== "project_snapshot")
    .sort((a, b) => b.text.length - a.text.length))
    intern(s.text, s.origin);
  if (input.projectDossier) intern(input.projectDossier, "project_dossier");
  const project = legacy.project
    ? {
        name: intern(legacy.project.name, "project_identity"),
        niche: intern(legacy.project.niche, "project_identity"),
        structuredData: Object.fromEntries(
          Object.entries(legacy.project.structuredData).map(([key, value]) => [
            key,
            intern(value, `project_${key}`)!,
          ])
        ),
      }
    : null;
  const instructions: EditorialContextV2["instructions"] = {};
  for (const [key, value] of Object.entries(legacy.instructions)) {
    if (typeof value === "string")
      instructions[key] = intern(value, `piece_${key}`);
    else if (value !== undefined)
      instructions[key] = intern(JSON.stringify(value), `piece_${key}`);
  }
  const requirements = legacy.requirements.map(({ value, ...r }) => ({
    ...r,
    valueRef: intern(value, "requirement")!,
  }));
  // Only actual guidance sections/ranges are excluded as factual evidence.
  // A voice value may also occur in a genuine factual sentence elsewhere.
  const guidanceRanges: SourceRange[] = [];
  const guidanceOrigins = new Set([
    "project_targetAudience",
    "project_voiceTone",
    "project_defaultCta",
    "project_forbiddenTerms",
    "project_painsAndObjections",
    "piece_tone",
    "piece_audience",
    "piece_brandEssence",
    "piece_callToAction",
  ]);
  for (const source of sources) {
    if (guidanceOrigins.has(source.origin))
      guidanceRanges.push({
        sourceId: source.id,
        start: 0,
        end: source.text.length,
      });
    for (const match of Array.from(
      source.text.matchAll(
        /^##\s+([^\r\n]+)\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/gm
      )
    )) {
      const heading = match[1]
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[_*]/g, " ")
        .toUpperCase();
      if (
        /PUBLICO|TOM DE VOZ|POSTURA|CHAMADA PARA ACAO|CTA PADRAO|TERMOS.*PROIBID|FRONTEIRAS|DORES.*OBJECOES/.test(
          heading
        )
      ) {
        const start = match.index! + match[0].indexOf("\n") + 1,
          end = match.index! + match[0].length;
        if (end > start)
          guidanceRanges.push({ sourceId: source.id, start, end });
      }
    }
  }
  const data = {
    version: 2 as const,
    normalizationVersion: 1 as const,
    sources,
    project,
    request: {
      prompt: intern(input.prompt, "user"),
      format: input.postMode,
      platform: input.platform,
    },
    instructions,
    requirements,
    instructionOrigins: legacy.instructionOrigins,
    socialPlaybook: legacy.socialPlaybook,
    guidanceRanges,
  };
  return { ...data, hash: arsenalHash(data) };
}

/** Internal compatibility view only. Never serialize this resolved view to a provider. */
export function resolvedEditorialContext(context: EditorialContext): Legacy {
  if (context.version === 1) return context;
  const resolve = (v: SourceRange | string | undefined) =>
    typeof v === "object" ? sourceRangeText(context, v) : v;
  return {
    version: 1,
    normalizationVersion: context.normalizationVersion,
    sources: context.sources,
    requirements: context.requirements.map(({ valueRef, ...r }) => ({
      ...r,
      value: sourceRangeText(context, valueRef),
    })),
    instructions: Object.fromEntries(
      Object.entries(context.instructions).map(([key, v]) => [
        key,
        key === "slides" && v ? JSON.parse(resolve(v)!) : resolve(v),
      ])
    ) as Legacy["instructions"],
    project: context.project
      ? {
          version: 1,
          name: resolve(context.project.name) ?? "",
          niche: resolve(context.project.niche) ?? "",
          structuredData: Object.fromEntries(
            Object.entries(context.project.structuredData).map(([k, v]) => [
              k,
              sourceRangeText(context, v),
            ])
          ),
        }
      : undefined,
    request: {
      prompt: resolve(context.request.prompt)!,
      format: context.request.format as "static" | "carousel",
      platform: context.request.platform as string,
    },
    instructionOrigins: context.instructionOrigins,
    socialPlaybook: context.socialPlaybook,
    hash: context.hash,
  };
}
export function validatedEditorialContextV8(
  input: Input & {
    editorialContext?: EditorialContext;
    editorialContextHash?: string;
  }
): EditorialContextV2 {
  const expected = editorialContextV8(input);
  if (
    input.editorialContextHash !== expected.hash ||
    arsenalHash(input.editorialContext) !== arsenalHash(expected)
  )
    throw new GenerationFailureError(
      "preparation_contract_incompatible",
      "review"
    );
  return expected;
}

export const referenceContextInstructions =
  "O contexto contém um inventário completo de fontes e referências {sourceId,start,end}. Resolva cada referência no texto da fonte por índices UTF-16, incluindo orientações, requisitos e pedido. As fontes aparecem uma vez; suas referências conservam origem e prioridade. Orientações de voz, público, CTA e restrições orientam a composição; evidência factual provém das capacidades e condições descritas. Use o playbook para traduzir o mecanismo em utilidade cotidiana e selecionar o essencial à contribuição de cada página.";
