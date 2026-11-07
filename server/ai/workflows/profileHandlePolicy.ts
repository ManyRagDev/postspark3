import { editorialContextV9 } from "./editorialContextV9";
import { buildSourceEvidenceV10 } from "./reviewEvidenceV10";
import type { ProposalExecutionInput, CopyResponse } from "./proposalGraph";

export const DEFAULT_PROFILE_HANDLE = "@seuperfil";
type ProfileInput = Pick<ProposalExecutionInput, "prompt" | "editorialContext" | "executionBrief" | "projectDossier" | "projectSnapshot" | "sourceReferences" | "contextContent" | "reviewExecutionConfig">;
const handles = /(^|[^A-Za-z0-9_\u00C0-\uFFFF@%+./-])(@[A-Za-z0-9_\u00C0-\u024F][A-Za-z0-9_\u00C0-\u024F.-]*(?:@[A-Za-z0-9][A-Za-z0-9.-]*)?)/g;
const urls = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"']+/gi;

function protectedRanges(text: string) {
  const ranges = Array.from(text.matchAll(urls), match => ({start:match.index!,end:match.index!+match[0].length}));
  for (const match of Array.from(text.matchAll(/[A-Za-z0-9._%+\-\u00C0-\u024F]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g))) {
    if (text[match.index! - 1] !== "@") ranges.push({start:match.index!,end:match.index!+match[0].length});
  }
  for (const match of Array.from(text.matchAll(/`[^`]*`/g))) ranges.push({start:match.index!,end:match.index!+match[0].length});
  return ranges;
}

function mapHandles(text: string, replace: (handle: string) => string) {
  const ranges = protectedRanges(text);
  return text.replace(handles, (match, prefix: string, candidate: string, offset: number) => {
    const start = offset + prefix.length, end = start + candidate.length;
    if (ranges.some(range => start < range.end && end > range.start)) return match;
    const handle = candidate.replace(/[.]+$/, ""), punctuation = candidate.slice(handle.length);
    return prefix + replace(handle) + punctuation;
  });
}

function handlesInProfileUrls(text: string) {
  const found: string[] = [];
  for (const match of Array.from(text.matchAll(urls))) {
    try {
      const url = new URL(match[0].startsWith("www.") ? `https://${match[0]}` : match[0]);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      const path = url.pathname.split("/").filter(Boolean);
      if (["instagram.com","x.com","twitter.com"].includes(host) && path.length === 1 && /^[A-Za-z0-9_.]+$/.test(path[0]) && !["p","reel","reels","stories","explore","direct","intent","home","search","share"].includes(path[0].toLowerCase())) found.push(`@${path[0]}`);
      if (["tiktok.com","youtube.com","threads.net","threads.com"].includes(host) && path[0]?.startsWith("@") && /^@[A-Za-z0-9_.-]+$/.test(path[0])) found.push(path[0]);
    } catch { /* Non-profile or malformed URL remains untouched. */ }
  }
  return found;
}

export function usesProfileHandlePolicy(input: Pick<ProfileInput,"reviewExecutionConfig">) {
  const config = input.reviewExecutionConfig;
  return config?.version === 5 && "profileHandlePolicyVersion" in config && config.profileHandlePolicyVersion === 1;
}

export function suppliedProfileHandles(input: Omit<ProfileInput,"reviewExecutionConfig">) {
  const context = input.editorialContext?.version === 3 ? input.editorialContext : editorialContextV9(input);
  const content = buildSourceEvidenceV10(context).filter(source => source.kind === "content" && !/:visual_reference$|:guidance$/.test(source.origin));
  const texts = [input.prompt, input.executionBrief?.rawInput, input.executionBrief?.notes,
    input.executionBrief?.callToAction,
    ...content.map(source => source.text),
    ...(input.sourceReferences ?? []).filter(source=>source.purpose !== "visual_reference" && source.purpose !== "guidance").map(source=>source.url),
  ].filter((text): text is string=>typeof text === "string");
  const known = new Map<string,string>();
  for (const text of texts) {
    mapHandles(text, handle=>{known.set(handle.toLowerCase(),known.get(handle.toLowerCase()) ?? handle);return handle;});
    for (const handle of handlesInProfileUrls(text)) known.set(handle.toLowerCase(),known.get(handle.toLowerCase()) ?? handle);
  }
  return Array.from(known.values());
}

export function profileHandleInstructions(input: ProfileInput) {
  if (!usesProfileHandlePolicy(input)) return undefined;
  return {placeholder:DEFAULT_PROFILE_HANDLE,provided:suppliedProfileHandles(input),
    rule:"Preserve os perfis fornecidos. Toda indicação de perfil criada sem um handle fornecido usa @seuperfil. Esse marcador editorial não afirma que uma conta exista. Em visual_only, preserve literalmente o texto original."};
}

export function profileHandleValueNormalizer(input: ProfileInput) {
  const enabled = usesProfileHandlePolicy(input) && input.executionBrief?.interventionLevel !== "visual_only";
  if (!enabled) return (value: string | string[]) => value;
  const known = new Map(suppliedProfileHandles(input).map(handle=>[handle.toLowerCase(),handle]));
  const normalize = (text: string) => enabled ? mapHandles(text, handle=>known.get(handle.toLowerCase()) ?? DEFAULT_PROFILE_HANDLE) : text;
  return (value: string | string[]): string | string[] => Array.isArray(value) ? value.map(normalize) : normalize(value);
}

/** Raw provider receipts remain immutable. Normalize native text before measuring. */
export function normalizeCopyProfileHandles(copy: CopyResponse, input: ProfileInput): CopyResponse {
  if (!usesProfileHandlePolicy(input) || input.executionBrief?.interventionLevel === "visual_only") return copy;
  const normalize = profileHandleValueNormalizer(input);
  return {...copy,caption:normalize(copy.caption) as string,hashtags:normalize(copy.hashtags) as string[],
    slides:copy.slides.map(slide=>({...slide,values:slide.values.map(row=>({...row,value:normalize(row.value)})),mediaPrompts:slide.mediaPrompts.map(media=>({...media,prompt:normalize(media.prompt) as string}))})),
  };
}
