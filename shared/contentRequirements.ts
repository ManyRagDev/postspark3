import { z } from "zod";
import { arsenalHash } from "./arsenalContent";

export const contentRequirementSchema = z
  .object({
    kind: z.enum(["literal", "meaning", "forbidden"]),
    value: z
      .string()
      .min(1)
      .max(4000)
      .refine(value => Boolean(value.trim()), "Obrigação vazia"),
    scope: z.enum(["art", "caption", "either"]).default("either"),
    caseSensitive: z.boolean().optional(),
    match: z.enum(["word_or_phrase", "substring"]).optional(),
  })
  .strict();
export type ContentRequirement = z.input<typeof contentRequirementSchema>;
export type EffectiveContentRequirement = z.output<
  typeof contentRequirementSchema
> & { id: string };
export interface RequirementBrief {
  mustKeep?: string[];
  mustInclude?: string[];
  forbiddenTerms?: string[];
  contentRequirements?: ContentRequirement[];
}
export function effectiveContentRequirements(
  brief?: RequirementBrief | null
): EffectiveContentRequirement[] {
  const values = [
    ...(brief?.mustKeep ?? []).filter(Boolean).map(value => ({
      kind: "literal" as const,
      value,
      scope: "either" as const,
      caseSensitive: true,
    })),
    ...(brief?.mustInclude ?? []).filter(Boolean).map(value => ({
      kind: "literal" as const,
      value,
      scope: "either" as const,
      caseSensitive: true,
    })),
    ...(brief?.forbiddenTerms ?? []).filter(Boolean).map(value => ({
      kind: "forbidden" as const,
      value,
      scope: "either" as const,
      caseSensitive: false,
      match: "word_or_phrase" as const,
    })),
    ...(brief?.contentRequirements ?? []),
  ].map(v => {
    const r = contentRequirementSchema.parse(v);
    return {
      ...r,
      caseSensitive: r.caseSensitive ?? r.kind === "literal",
      ...(r.kind === "forbidden"
        ? { match: r.match ?? ("word_or_phrase" as const) }
        : {}),
    };
  });
  return Array.from(
    new Map(values.map(r => [arsenalHash(r), r])).entries()
  ).map(([hash, r]) => ({ ...r, id: `r${hash.slice(0, 24)}` }));
}
export function requirementMatches(
  text: string,
  r: EffectiveContentRequirement
): boolean {
  const norm = (s: string) => {
    const value =
      r.kind === "forbidden" && r.match !== "substring"
        ? s.normalize("NFC").replace(/\s+/g, " ")
        : s;
    return r.caseSensitive ? value : value.toLocaleLowerCase("pt-BR");
  };
  const haystack = norm(text),
    needle = norm(r.value);
  if (r.kind !== "forbidden" || r.match === "substring")
    return haystack.includes(needle);
  const word = (s: string) => new RegExp("[\\p{L}\\p{N}\\p{M}_#]", "u").test(s);
  for (let from = 0; from <= haystack.length; ) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) return false;
    const before = Array.from(haystack.slice(0, i)).at(-1) ?? "",
      after = Array.from(haystack.slice(i + needle.length))[0] ?? "";
    if (
      (!word(needle[0]) || !word(before)) &&
      (!word(needle.at(-1)!) || !word(after))
    )
      return true;
    from = i + Math.max(1, needle.length);
  }
  return false;
}
