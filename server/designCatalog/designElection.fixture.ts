import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { createComponentDefinition, compactComponentCard, assemblyIdentity } from "@shared/componentAssembly";

export function electionCatalogFixture(count = 13) {
  const base = completeDesignTestDefinitions()[0];
  const definitions = Array.from({ length: count }, (_, i) => createComponentDefinition({
    ...base, id: assemblyIdentity(["election-fixture", i]), label: `Design ${i}`,
    source: { ...base.source, variantKey: `election-${i}` },
    completeDesign: { ...base.completeDesign!, family: `family-${i}` },
  }));
  return { definitions, inventory: {
    registered: definitions.map(d => ({ id:d.id,definition_hash:d.hash,status:"approved",aspect_ratios:d.aspectRatios,roles:d.roles,source:d.source,design:d.completeDesign! })),
    indexed: definitions.map(d => ({ component_id:d.id,definition_hash:d.hash,card:compactComponentCard(d) })),
  } };
}
export const electionCatalogRequest = { aspectRatio:"4:5",postMode:"static" as const,text:"Café fresco.",slideCount:1,experimental:false };
