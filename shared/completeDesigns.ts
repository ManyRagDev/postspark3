import type { AssemblyPlanV1, ComponentCardV1, ComponentDefinitionV1 } from './componentAssembly';

/** Selection is finite: one complete scene, never an automatically assembled set. */
export function validateCompleteDesignSelection(plan: AssemblyPlanV1, cards: Array<ComponentCardV1 | ComponentDefinitionV1>): string[] {
  const offered = new Map(cards.map(c => [c.id,c]));
  return plan.variations.flatMap((variation,slot) => {
    const errors:string[]=[];
    const families=new Set<string>();
    if(variation.direction.typographyComponentId)errors.push(`complete_design_typography_donor:${slot}`);
    for(const [index,slide] of Array.from(variation.slides.entries())){
      const ref=slide.components[0],card=ref&&offered.get(ref.id);
      if(slide.components.length!==1 || card?.kind!=='content' || !card.completeDesign)
        errors.push(`complete_design_required:${slot}/${index}`);
      if(slide.components.some(r=>r.placement || r.layoutRelation))errors.push(`complete_design_native_geometry:${slot}/${index}`);
      if(card?.completeDesign)families.add(card.completeDesign.family);
    }
    if(families.size>1)errors.push(`complete_design_carousel_family:${slot}`);
    return errors;
  });
}

export function normalizeDesignColor(value:string):string {
  const hex=value.trim().toUpperCase();
  return /^#[0-9A-F]{3}$/.test(hex)?'#'+hex.slice(1).split('').map(c=>c+c).join(''):hex;
}
export function normalizeDesignFont(value:string):string {
  return value.split(',')[0].replace(/['"]/g,'').trim().toLowerCase();
}

/** Compatibility projection for controls/captions; the full scene remains authoritative. */
export function completeDesignPalette(design:ComponentDefinitionV1) {
  const background=design.fragment.artboard.background;
  const title=design.fragment.bindings.find(b=>b.kind==='text'&&b.source.includes('headline'))?.targetIds[0];
  const titleInstance=design.fragment.instances.find(i=>i.id===title);
  const text=titleInstance?design.pieces[titleInstance.pieceHash].fill:Object.values(design.pieces).find(p=>p.kind==='text')?.fill??'#111111';
  const accent=Object.values(design.pieces).find(p=>p.kind!=='text'&&p.fill!==background)?.fill??text;
  return {background,text,accent};
}
