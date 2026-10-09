import { compactComponentCard, type AssemblyPlanV1, type ComponentCardV1, type ComponentDefinitionV1 } from "@shared/componentAssembly";

type Offered = ComponentCardV1 | ComponentDefinitionV1;
type Language = "editorial" | "graphic" | "typographic" | "organic" | "restrained";
type Hierarchy = "headline" | "content" | "media" | "comparison" | "metric";
type Intent = { language: Language; hierarchy: Hierarchy; recurringComponentIds: string[]; mediaRole: "none" | "support" | "subject"; rhythm: Array<{slideId:string; emphasis:"hero"|"reading"|"highlight"|"closing"; density:"quiet"|"balanced"|"expressive"}> };
type PlanWithIntent = Omit<AssemblyPlanV1, "variations"> & { variations: Array<Omit<AssemblyPlanV1["variations"][number], "direction"> & { direction: AssemblyPlanV1["variations"][number]["direction"] & { intent?: Intent } }> };

function sourceKey(card: Offered): string {
  if ("source" in card) return card.source.kind === "recipe" ? `recipe:${card.source.referenceId}` : `catalog:${card.source.versionId}:${card.source.variantKey}`;
  return (card as ComponentCardV1 & { visualTraits?: { sourceKey: string } }).visualTraits?.sourceKey ?? card.id;
}
function regions(card: Offered): Array<{x:number;y:number;width:number;height:number}> {
  if (!("regions" in card) || !card.regions) return [];
  return card.regions;
}
function colorRoles(card: Offered): Record<string,string> {
  return "colorRoles" in card ? card.colorRoles ?? {} : {};
}
function fonts(card: Offered): string[] {
  if ("fontFamilies" in card) return card.fontFamilies;
  return Object.values(card.pieces).filter(p => p.kind === "text").map(p => p.fontFamily);
}
function offerSummary(offered: Offered[]): string {
  return offered.map(c => `${c.id} (${c.kind}; origem ${sourceKey(c)}; papéis ${c.roles.join(",")}; densidades ${c.densities.join(",")}; regiões ${regions(c).map(r => `${r.x.toFixed(2)},${r.y.toFixed(2)},${r.width.toFixed(2)}×${r.height.toFixed(2)}`).join("/") || "não informadas"}; famílias ${fonts(c).join("/") || "não informadas"}; paleta ${Object.values(colorRoles(c)).join("/") || "preservada"})`).join("\n");
}

/** Prompt fragment that makes the model choose visual systems before components. */
export function buildArtDirectionInstructions(offered: Offered[], count: number, includeOfferSummary = true): string {
  return `DIREÇÃO DE ARTE — decida a intenção visual antes de escolher componentes. Entregue ${count} propostas com intents realmente distintas (language, hierarchy e mediaRole); não tente provar diversidade apenas mudando labels. Compare IDs, origens, geometrias, papéis de cor e famílias tipográficas oferecidos abaixo. Use diferenças que os recursos disponíveis sustentem; quando a oferta for limitada, varie composição/posicionamento e paleta sem inventar capacidades. Preserve brief minimalista e copy literal. Declare ritmo por slide em ordem, usando hero na capa quando houver capa e closing no último slide; alinhe density a quiet/balanced/expressive e varie ritmo com intenção, sem tornar tudo expressive. A mídia deve ter função editorial coerente (none/support/subject). Em carrosséis, repita apenas até seis IDs estruturais úteis (background, ornament ou typography), efetivamente presentes em ao menos dois slides; direction.typographyComponentId aplica a doadora globalmente a todos os slides, sem duplicar referências. Em carrosséis com três ou mais slides, internos usam reading/highlight; com mais de um interno, varie essas ênfases. Mantenha unidade visual com variação de escala, posição e espaço. Não inclua palavras de demonstração como “demo”, “placeholder” ou “lorem”; não corte nem reescreva copy fornecida.${includeOfferSummary ? `\nCapacidades oferecidas:\n${offerSummary(offered)}` : "\nConsulte as capacidades nos cartões de componentes desta mensagem."}`;
}

/** Checks only explicit direction metadata; old plans remain valid. */
export function auditAssemblyArtDirection(plan: AssemblyPlanV1, offered: Offered[]): string[] {
  const issues: string[] = [];
  const p = plan as PlanWithIntent;
  offered=offered.map(c=>"fragment" in c?compactComponentCard(c):c);
  const ids = new Set(offered.map(c => c.id));
  const byId = new Map(offered.map(c => [c.id,c]));
  const signatures = new Set<string>();
  p.variations.forEach((variation, vi) => {
    const intent = variation.direction.intent;
    const slides = variation.slides;
    const used = slides.flatMap(s => s.components.map(c => c.id));
    const cards = used.map(id => byId.get(id)).filter((c): c is Offered => !!c);
    const cover = slides[0];
    const coverParts = cover?.components.map(ref => ({
      id: ref.id, kind: byId.get(ref.id)?.kind ?? "unknown", source: byId.has(ref.id) ? sourceKey(byId.get(ref.id)!) : ref.id,
      native: byId.has(ref.id) ? JSON.stringify({regions:regions(byId.get(ref.id)!),treatments:(byId.get(ref.id) as ComponentCardV1).visualTraits?.treatments??[]}) : "unknown",
      placement: ref.placement ? [ref.placement.x,ref.placement.y,ref.placement.width,ref.placement.height].map(n=>n.toFixed(3)).join(":") : "native",
      relation: ref.layoutRelation ? `${ref.layoutRelation.kind}:${ref.layoutRelation.relativeTo ?? ""}:${ref.layoutRelation.gap ?? ""}` : "native",
    })).sort((a,b)=>`${a.kind}:${a.source}`.localeCompare(`${b.kind}:${b.source}`));
    const donor = variation.direction.typographyComponentId;
    const donorCard = donor ? byId.get(donor) : undefined;
    const signature = [coverParts?.filter(x=>x.kind === "content").map(x=>`${x.source}:${x.native}@${x.placement}/${x.relation}`).join(","), coverParts?.filter(x=>x.kind === "media").map(x=>`${x.source}:${x.native}@${x.placement}/${x.relation}`).join(","), variation.direction.palette.background, variation.direction.palette.text, variation.direction.palette.accent, donor ? (donorCard ? fonts(donorCard).sort().join(",") : donor) : "no-type-donor", coverParts?.filter(x=>!(["content","media","typography"].includes(x.kind))).map(x=>`${x.id}:${x.kind}:${x.source}`).join(",")].join("|");
    signatures.add(signature);
    if (!intent) return;
    const evidenced = [...cards, ...(variation.direction.typographyComponentId && byId.has(variation.direction.typographyComponentId) ? [byId.get(variation.direction.typographyComponentId)!] : [])].filter(c => "visualTraits" in c && c.visualTraits);
    if (evidenced.length && !evidenced.some(c => (c as ComponentCardV1 & {visualTraits:{languages:Language[]}}).visualTraits.languages.includes(intent.language))) issues.push(`variation_${vi}: language ${intent.language} lacks offered visual evidence`);
    const rhythm = intent.rhythm;
    if (rhythm.length !== slides.length || rhythm.some((r,i) => r.slideId !== slides[i]?.id || r.density !== slides[i]?.density)) issues.push(`variation_${vi}: rhythm order/slideId/density mismatch`);
    if (slides.length > 1 && rhythm.length === slides.length) {
      if (slides[0].role === "cover" && rhythm[0].emphasis !== "hero") issues.push(`variation_${vi}: cover must have hero emphasis`);
      if (slides.at(-1)?.role === "closing" && rhythm.at(-1)?.emphasis !== "closing") issues.push(`variation_${vi}: last closing slide must have closing emphasis`);
    }
    if (slides.length >= 3 && rhythm.length === slides.length) {
      const internal = rhythm.slice(1,-1).map(r=>r.emphasis);
      const validInternal = slides.length === 3 ? internal.some(e=>e === "reading" || e === "highlight") : new Set(internal).size >= 2;
      if (!validInternal) issues.push(`variation_${vi}: carousel rhythm must vary internal emphasis`);
    }
    const blocks=slides.flatMap(s=>s.content.blocks);
    if(intent.hierarchy==="media"&&intent.mediaRole==="none"||intent.hierarchy==="headline"&&!blocks.some(b=>b.type==="text"&&b.role==="headline")||intent.hierarchy==="comparison"&&!blocks.some(b=>b.type==="comparison")||intent.hierarchy==="metric"&&!blocks.some(b=>b.type==="metric")||intent.hierarchy==="content"&&!blocks.some(b=>b.type!=="text"||b.role!=="headline"))issues.push(`variation_${vi}: hierarchy lacks canonical content evidence`);
    const recurring = intent.recurringComponentIds;
    if (recurring.length > 6 || new Set(recurring).size !== recurring.length || recurring.some(id => !ids.has(id))) issues.push(`variation_${vi}: invalid recurring component IDs`);
    for (const id of recurring) {
      const card = byId.get(id);
      const donor = variation.direction.typographyComponentId === id;
      if (card && (!["background","ornament","typography"].includes(card.kind) || (donor ? slides.length : new Set(slides.filter(s=>s.components.some(c=>c.id===id)).map(s=>s.id)).size) < (slides.length > 1 ? 2 : 1))) issues.push(`variation_${vi}: recurring component ${id} is not an eligible repeated component`);
    }
    const mediaSelected = cards.some(c=>c.kind === "media") || cards.some(c=>"mediaSlots" in c && c.mediaSlots.length > 0);
    if (intent.mediaRole === "none" && mediaSelected) issues.push(`variation_${vi}: mediaRole none conflicts with selected media slots`);
    if (intent.mediaRole !== "none" && !mediaSelected) issues.push(`variation_${vi}: mediaRole ${intent.mediaRole} requires selected media`);
  });
  // Three identical intent labels are insufficient: require evidence of distinct choices
  // only when the actual offers provide alternatives in at least one visual dimension.
  const available = new Set(offered.map(c=>`${sourceKey(c)}|${c.kind}|${regions(c).map(r=>[r.x,r.y,r.width,r.height].join(":")).join("/")}|${fonts(c).join("/")}`));
  const palettes = new Set(p.variations.map(v=>Object.values(v.direction.palette).join("|")));
  const canVary = available.size >= 3 || palettes.size > 1;
  if (p.variations.every(v=>v.direction.intent) && canVary && signatures.size < 3) issues.push("proposals: three distinct visual directions are required; proposals repeat the same cover structure, placement, palette, typography donor and support pieces");
  return issues;
}
