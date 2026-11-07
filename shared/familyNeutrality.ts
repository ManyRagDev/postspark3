import { arsenalHash } from './arsenalContent';
import type { ComponentCardV1 } from './componentAssembly';
import type { FrozenEditorialCatalog } from './editorialIntent';
import type { RecentDesignSelection } from './designSelection';

export const FAMILY_NEUTRALITY_POLICY = Object.freeze({version:1 as const, axes:['organization','density','typography','imageRole'] as const, candidateUnit:'family', excessCapacityBonus:0, inventorySizeBonus:0});
export const PROPOSAL_SELECTION_POLICY = Object.freeze({ version: 1 as const, suitabilityGap: 0.4, recentRequests: 3 });
export type FamilyNeutrality = {version:1; seed:string; planningVersion?:2 | 3; proposalSelectionVersion?:1; deliveryRecoveryVersion?:1 | 2; creativeFlexibility?:1};
export type FamilyAxes = Record<(typeof FAMILY_NEUTRALITY_POLICY.axes)[number],string>;
export function proposalSelectionHistory(recent: RecentDesignSelection[], parent?: RecentDesignSelection) {
  return parent?.selections.length ? [parent, ...recent.filter(run => run.requestId !== parent.requestId)] : recent;
}
export const familyTie = (seed:string,family:string)=>arsenalHash({seed,family});
export function familyAxes(card:ComponentCardV1):FamilyAxes {
  const selection=card.completeDesign?.designGuidance?.selection;
  return selection?.axes ?? {organization:card.fields.some(f=>f.kind==='list')?'list':card.completeDesign?.designGuidance?.fieldRelationships?.some(r=>r.kind==='contrast')?'comparison':'single',density:[...card.densities].sort()[0]??'unknown',typography:'unknown',imageRole:card.mediaSlots.length?'photographic':'typographic'};
}
/** One fact per capability. Counts, aliases, free tags, file names and praise are deliberately absent. */
export function neutralSourceText(card:ComponentCardV1,catalog:FrozenEditorialCatalog|null) {
  const annotation=catalog?.document.designs.find(d=>d.sourceId===card.id&&d.sourceHash===card.hash);
  const intentIds=new Set(annotation?.intentIds??[]);
  const axes=familyAxes(card);
  return [
    card.completeDesign?.designGuidance?.selection?.description,
    ...Object.entries(axes).map(([axis,value])=>`${axis}: ${value}`),
    card.fields.some(f=>f.kind==='text')?'Mensagem textual editável.':null,
    card.fields.some(f=>f.kind==='list')?'Lista de itens independentes.':null,
    card.mediaSlots.length?'Fotografia em espaço substituível.':null,
    ...(catalog?.document.intents.filter(i=>intentIds.has(i.id)).map(i=>i.label).sort()??[]),
  ].filter(Boolean).join('\n').normalize('NFC');
}
export function familyDistance(a:FamilyAxes,b:FamilyAxes){return FAMILY_NEUTRALITY_POLICY.axes.filter(axis=>a[axis]!==b[axis]).length/FAMILY_NEUTRALITY_POLICY.axes.length;}
export function requestedIntentAffinity(available:readonly string[],requested:ReadonlySet<string>,suggested:ReadonlySet<string>){
  const known=new Set(available), total=requested.size+suggested.size*.25;
  if(!total)return 0;
  return (Array.from(requested).filter(id=>known.has(id)).length+Array.from(suggested).filter(id=>known.has(id)).length*.25)/total;
}
