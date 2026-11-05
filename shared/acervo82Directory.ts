import { acervo82Code, savedDesignIdentity } from './acervo82Identity';
import type { ComponentCardV1 } from './componentAssembly';

export type Acervo82Family = {
  family: string;
  code: string;
  name: string;
  descriptor: string;
  definitionId: string;
  definitionHash: string;
  aspects: string[];
  capabilities: { single: boolean; carousel: boolean; photo: boolean; list: boolean; comparison: boolean; metric: boolean };
};

/** Public identities come from the authorized revision; a historic name is never looked up here. */
export function acervo82FamilyDirectory(cards: readonly ComponentCardV1[]): Acervo82Family[] {
  const members = new Map<string, ComponentCardV1[]>();
  for (const card of cards) {
    const family = card.completeDesign?.family;
    if (!family || !acervo82Code(family)) continue;
    const group = members.get(family) ?? [];
    group.push(card);
    members.set(family, group);
  }
  return Array.from(members).flatMap(([family, group]) => {
    const roots = group.filter(c => !c.completeDesign?.designGuidance?.carouselVariant).sort((a,b) => a.id.localeCompare(b.id));
    const root = roots[0];
    if (!root) return [];
    const {code, name} = savedDesignIdentity({completeDesign:{family,name:root.label}});
    const carousel = roots.some(source => source.roles.includes('cover') && (['compose','literal'] as const).some(mode => (['development','closing'] as const).every(role => group.some(card => {
      const v = card.completeDesign?.designGuidance?.carouselVariant;
      return v?.version === 3 && v.contentMode === mode && v.role === role && v.sourceId === source.id && v.sourceHash === source.hash && card.roles.includes(role);
    }))));
    return [{family, code:code!, name, descriptor:root.completeDesign?.designGuidance?.selection?.description ?? name, definitionId:root.id, definitionHash:root.hash,
      aspects:Array.from(new Set(roots.flatMap(c=>c.aspectRatios))).sort(), capabilities:{
        single:roots.some(c=>c.roles.includes('static')), carousel,
        photo:roots.some(c=>c.mediaSlots.length>0), list:roots.some(c=>c.fields.some(f=>f.kind==='list')),
        comparison:roots.some(c=>c.fields.some(f=>f.source.startsWith('block:comparison:'))),
        metric:roots.some(c=>c.fields.some(f=>f.source.startsWith('block:metric:'))),
      }}];
  }).sort((a,b)=>a.code.localeCompare(b.code));
}
