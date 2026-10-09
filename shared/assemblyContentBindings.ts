import { canonicalContentSource, canonicalContentSources, readContentSource, type DesignContent } from "./arsenalContent";
import type { ArsenalBinding } from "./designArsenal";

type TextBinding = Pick<ArsenalBinding, "kind" | "source" | "required">;

/** A closing invitation can use a native optional body slot, without adding a
 * text region or changing its geometry. Native CTA regions take precedence. */
export function completeDesignClosingBodySource(bindings: TextBinding[], content?: DesignContent): string | undefined {
  const isRole = (source: string, role: string) => source === role || new RegExp(`^block:${role}:\\d+:text$`).test(source);
  if (bindings.some(b => b.kind === "text" && isRole(b.source, "callToAction"))) return undefined;
  if (content?.schemaVersion === 3) {
    const ctaSources = new Set(content.blocks.filter(b => b.type === "text" && b.role === "callToAction").map(b => `content:${b.id}:text`));
    if (bindings.some(b => b.kind === "text" && canonicalContentSources(content, b.source).some(source => ctaSources.has(source)))) return undefined;
  }
  return bindings.find(b => b.kind === "text" && !b.required && isRole(b.source, "body") && (!content || !readContentSource(content, b.source)))?.source;
}

export function bindCompleteDesignClosingContent<T extends TextBinding>(content: DesignContent, bindings: T[]): T[] {
  const result = structuredClone(bindings);
  if (content.schemaVersion === 3 && content.blocks.some(b => b.type === "text" && b.role === "callToAction" && b.text.trim())) {
    const source = completeDesignClosingBodySource(result, content);
    if (source) for (const binding of result)
      if (binding.kind === "text" && binding.source === source) binding.source = "block:callToAction:0:text";
  }
  return bindAssemblyContent(content, result);
}

/** Adapt a generated region to repeated paragraphs without changing the catalogue or copy.
 * Existing slots keep their role; surplus paragraphs flow into its last occupied region.
 * A missing optional caption/CTA/eyebrow is hidden, never filled with demo text. */
export function bindAssemblyContent<T extends Pick<ArsenalBinding, "kind" | "source" | "required">>(content: DesignContent, bindings: T[]): T[] {
  const result = structuredClone(bindings);
  if (content.schemaVersion !== 3) return result;
  const optionalRoles = new Set(["body", "eyebrow", "sectionLabel", "callToAction", "label"]);
  for (const binding of result) {
    if (binding.kind !== "text") continue;
    const role = binding.source.match(/^block:([a-zA-Z]+):\d+:text$/)?.[1] ?? binding.source;
    if (optionalRoles.has(role) && !readContentSource(content, binding.source)) binding.required = false;
  }
  const covered = new Set(result.flatMap(b => canonicalContentSources(content, b.source)));
  for (const role of Array.from(new Set(content.blocks.filter(b => b.type === "text").map(b => b.role)))) {
    const extra = content.blocks.filter(b => b.type === "text" && b.role === role && !covered.has(`content:${b.id}:text`));
    if (!extra.length) continue;
    const occupied = result.filter(b => b.kind === "text" && canonicalContentSources(content, b.source).some(key => {
      const block = content.blocks.find(block => `content:${block.id}:text` === key);
      return block?.type === "text" && block.role === role;
    }));
    const last = occupied.at(-1);
    if (!last) continue; // No compatible semantic region: keep the coverage error explicit.
    const lastSource = last.source, lastKey = canonicalContentSource(content, lastSource);
    const keys = canonicalContentSources(content, last.source);
    const group = `textGroup:${[...keys.map(key => key.split(":")[1]), ...extra.map(b => b.id)].join(",")}`;
    for (const binding of occupied) {
      if (binding.source === lastSource || (lastKey && canonicalContentSource(content, binding.source) === lastKey)) binding.source = group;
    }
    for (const b of extra) covered.add(`content:${b.id}:text`);
  }
  return result;
}
