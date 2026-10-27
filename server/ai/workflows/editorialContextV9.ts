import { sourceRepresentation } from "./sourceRepresentation";
import { arsenalHash } from "@shared/arsenalContent";
import { GenerationFailureError } from "@shared/generationFailure";
import { editorialContextV7 } from "./editorialContextV7";
import type {
  EditorialContext,
  EditorialContextV2,
  SourceRange,
} from "./editorialContextV8";
type Legacy = ReturnType<typeof editorialContextV7>;
type Input = Parameters<typeof editorialContextV7>[0];
export type EditorialContextV3 = Omit<EditorialContextV2, "version"> & {
  version: 3;
};
export function editorialContextV9(input: Input): EditorialContextV3 {
  const legacy = editorialContextV7(
    input.sourceReferences?.length
      ? { ...input, contextContent: undefined }
      : input,
    6
  );
  for (const forbidden of legacy.requirements.filter(
    r => r.kind === "forbidden"
  ))
    for (const required of legacy.requirements.filter(
      r => r.kind !== "forbidden"
    ))
      if (
        required.value
          .toLocaleLowerCase()
          .includes(forbidden.value.toLocaleLowerCase())
      )
        throw new GenerationFailureError("source_conflict", "selection");
  const sources: Legacy["sources"] = [];
  // Preserve complete sources before interning structured values or instruction references.
  const intern = (
    text: string | undefined,
    origin = "context"
  ): SourceRange | undefined => {
    if (!text) return undefined;
    for (const source of sources) {
      const start = source.text.indexOf(text);
      if (source.origin === origin && start >= 0)
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
    .filter(
      s =>
        s.origin !== "project_snapshot" &&
        (!input.sourceReferences?.length || s.origin !== "reference")
    )
    .sort((a, b) => b.text.length - a.text.length))
    intern(s.text, s.origin);
  for (const source of input.sourceReferences ?? [])
    if (source.facts)
      intern(
        source.facts,
        `source:${source.id ?? source.origin ?? "reference"}:${source.kind ?? "content"}:${source.purpose ?? "content"}`
      );
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
  const instructions: EditorialContextV3["instructions"] = {};
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
    if (
      guidanceOrigins.has(source.origin) ||
      source.origin.endsWith(":guidance")
    )
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
  for (const [key, ref] of Object.entries(project?.structuredData ?? {}))
    if (
      [
        "targetAudience",
        "voiceTone",
        "defaultCta",
        "forbiddenTerms",
        "painsAndObjections",
      ].includes(key)
    )
      guidanceRanges.push(ref);
  for (const ref of Object.values(instructions))
    if (ref && typeof ref === "object") guidanceRanges.push(ref);
  const data = {
    version: 3 as const,
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

export function validatedEditorialContextV9(
  input: Input & {
    editorialContext?: EditorialContext;
    editorialContextHash?: string;
  }
): EditorialContextV3 {
  const expected = editorialContextV9(input);
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
