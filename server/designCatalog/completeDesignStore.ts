import {
  normalizeDesignColor,
  normalizeDesignFont,
} from "../../shared/completeDesigns";
import {
  componentCardV1Schema,
  type ComponentCardV1,
} from "../../shared/componentAssembly";
import { getDb } from "../db";

/** Read compact indexed cards only. Whole definitions/assets are hydrated after selection. */
export async function retrieveCompleteDesignCards(input: {
  aspectRatio: string;
  postMode: "static" | "carousel";
  text: string;
  styleText?: string;
  brandColors?: string[];
  brandFonts?: string[];
  slideCount: number;
  experimental: boolean;
}): Promise<ComponentCardV1[]> {
  const signal = AbortSignal.timeout(8000),
    cards: ComponentCardV1[] = [];
  // Eligibility only. Shared Jev preselection evaluates these cards before the LLM chooses three proposals.
  for (let offset = 0; ; offset += 100) {
    const result = await getDb()
      .from("design_component_search_documents")
      .select(
        "component_id,definition_hash,card,design_components!inner(status)"
      )
      .eq("card->>kind", "content")
      .eq("card->completeDesign->>baselineVerified", "true")
      .contains("card->aspectRatios", JSON.stringify([input.aspectRatio]))
      .in(
        "design_components.status",
        input.experimental ? ["draft", "approved"] : ["approved"]
      )
      .order("component_id")
      .range(offset, offset + 99)
      .abortSignal(signal);
    if (result.error) throw result.error;
    for (const row of result.data ?? []) {
      const card = componentCardV1Schema.parse(row.card);
      if (
        card.id !== row.component_id ||
        card.hash !== row.definition_hash ||
        !card.completeDesign
      )
        throw new Error("complete_design_index_mismatch");
      cards.push(card);
    }
    if ((result.data?.length ?? 0) < 100) break;
  }
  const role = input.postMode === "static" ? "static" : "cover";
  const compatible = cards.filter(
    c =>
      (input.brandColors ?? []).every(color =>
        c.completeDesign?.colors?.some(
          stored => normalizeDesignColor(stored) === normalizeDesignColor(color)
        )
      ) &&
      (input.brandFonts ?? []).every(font =>
        [...c.fontFamilies, ...(c.sourceFontFamilies ?? [])].some(
          stored => normalizeDesignFont(stored) === normalizeDesignFont(font)
        )
      )
  );
  const completeFamily = (family: string) => {
    if (input.postMode === "static") return true;
    const members = compatible.filter(c => c.completeDesign?.family === family);
    return [
      "cover",
      "closing",
      ...(input.slideCount > 2 ? ["development"] : []),
    ].every(role =>
      members.some(c =>
        c.roles.includes(role as "cover" | "closing" | "development")
      )
    );
  };
  const eligible = compatible.filter(
    c => c.roles.includes(role) && completeFamily(c.completeDesign!.family)
  );
  const families = Array.from(
    new Set(eligible.map(c => c.completeDesign!.family))
  ).sort();
  return compatible
    .filter(c => families.includes(c.completeDesign!.family))
    .sort(
      (a, b) =>
        families.indexOf(a.completeDesign!.family) -
          families.indexOf(b.completeDesign!.family) || a.id.localeCompare(b.id)
    );
}
