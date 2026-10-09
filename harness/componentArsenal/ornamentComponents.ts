import { arsenalHash } from "../../shared/arsenalContent";
import { createComponentDefinition, type ComponentDefinitionV1 } from "../../shared/componentAssembly";
import { arsenalVariantSchema, type PieceDefinitionV2 } from "../../shared/designArsenal";
import type { ComponentPackage } from "./extract";
import { sha256 } from "./inventory";

type OrnamentSet = { key: string; label: string; ids: readonly string[]; description: string };

/** Explicit source-layer allowlist: names alone never promote arbitrary rectangles to ornaments. */
const SETS: Record<string, readonly OrnamentSet[]> = {
  "0623fb1c14937cd1e67e980b566710ba": [{
    key: "scrapbook-markers-and-stickers",
    label: "Marcadores e adesivos de scrapbook",
    ids: ["marcador-roxo-1", "marcador-roxo-2", "marcador-laranja-1", "marcador-laranja-2", "adesivo-seta", "adesivo-laranja"],
    description: "Seis marcas geométricas da composição scrapbook: quatro marcadores pontuais e dois adesivos independentes. Texto demonstrativo, papel, tarja e fotografia não fazem parte do componente; revisão visual pendente.",
  }],
  "1c2fb00a82a764bab2f4374d03f67886": [{
    key: "organic-shapes-and-asterisks",
    label: "Formas orgânicas e asteriscos",
    ids: ["forma-verde-topo", "forma-laranja-base", "asterisco-fundo", "asterisco-base"],
    description: "Duas formas de canto e dois asteriscos geométricos da composição original. Grades, cartões, barras e texto permanecem no componente de origem; revisão visual pendente.",
  }],
  "editorial-poster": [{ key: "accent-bar", label: "Barra de acento", ids: ["accent-bar"], description: "Barra geométrica de acento da referência Editorial Poster, preservada na posição original; revisão visual pendente." }],
  "data-punch": [{ key: "accent-bar", label: "Barra de acento", ids: ["accent-bar"], description: "Barra geométrica de acento da referência Data Punch, preservada na posição original; revisão visual pendente." }],
  "minimal-air": [{ key: "accent-bar", label: "Barra de acento", ids: ["accent-bar"], description: "Barra geométrica de acento da referência Minimal Air, preservada na posição original; revisão visual pendente." }],
  "duotone-wash": [{ key: "accent-bar", label: "Barra de acento", ids: ["accent-bar"], description: "Barra geométrica de acento da referência Duotone Wash, preservada na posição original; revisão visual pendente." }],
};

function immutableComponent(input: Omit<ComponentDefinitionV1, "hash">): ComponentDefinitionV1 {
  const { id: ignored, ...definition } = input;
  const hash = sha256(arsenalHash(definition));
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  return createComponentDefinition({ ...definition, id });
}

/** Extract only reviewed, source-specific geometric sets from the existing source-style content. */
export function ornamentComponents(p: ComponentPackage): ComponentDefinitionV1[] {
  const output: ComponentDefinitionV1[] = [];
  for (const base of p.components.filter(c => c.kind === "content" &&
    !c.fragment.variantKey.includes("-quiet") && !c.fragment.variantKey.includes("-typed-") && !c.fragment.variantKey.includes("-portrait4x5"))) {
    const source = base.source.kind === "recipe" ? base.source.referenceId : "";
    for (const set of SETS[source] ?? []) {
      const ids = new Set(set.ids);
      const selected = base.fragment.instances.filter(i => ids.has(i.id));
      // An incomplete or text/media-bearing source set is ambiguous; preserve the old component unchanged.
      if (selected.length !== ids.size || selected.some(i => {
        const piece = base.pieces[i.pieceHash];
        return !piece || piece.kind === "text" || piece.kind === "media" || piece.fixedText !== null || !!piece.fontAssetId;
      })) continue;
      const selectedIds = new Set(selected.map(i => i.id));
      const touchedRelations = base.fragment.relations.filter(r =>
        r.inputs.some(id => selectedIds.has(id)) || r.outputs.some(o => selectedIds.has(o.targetId)));
      if (touchedRelations.some(r => !r.inputs.every(id => selectedIds.has(id)) || !r.outputs.every(o => selectedIds.has(o.targetId)))) continue;

      // Keep each selected instance's full group ancestry so source transforms remain intact.
      const groupById = new Map(base.fragment.groups.map(g => [g.id, g]));
      const groupIds = new Set<string>();
      for (const instance of selected) {
        let parentId = instance.parentId;
        while (parentId && !groupIds.has(parentId)) {
          groupIds.add(parentId);
          parentId = groupById.get(parentId)?.parentId ?? null;
        }
      }
      const pieces = Object.fromEntries(selected.map(i => [i.pieceHash, base.pieces[i.pieceHash]])) as Record<string, PieceDefinitionV2>;
      const usedAssets = new Set(Object.values(pieces).map(piece => piece.fontAssetId).filter((id): id is string => !!id));
      const assets = base.assets.filter(asset => usedAssets.has(asset.id));
      const fragment = arsenalVariantSchema.parse({
        ...structuredClone(base.fragment),
        variantKey: `${base.fragment.variantKey}-ornament-${set.key}`,
        instances: selected,
        groups: base.fragment.groups.filter(group => groupIds.has(group.id)),
        bindings: base.fragment.bindings.filter(binding => binding.targetIds.every(id => selectedIds.has(id))),
        relations: touchedRelations,
        assetIds: assets.map(asset => asset.id),
        ...(base.fragment.mediaSlots ? { mediaSlots: base.fragment.mediaSlots.filter(slot => selectedIds.has(slot.id)) } : {}),
        ...(base.fragment.lineBoxOverlaps ? { lineBoxOverlaps: base.fragment.lineBoxOverlaps.filter(pair => selectedIds.has(pair.a) && selectedIds.has(pair.b)) } : {}),
      });
      output.push(immutableComponent({
        schemaVersion: 1,
        id: base.id,
        kind: "ornament",
        label: `${base.label.split(" · ")[0]} · ${set.label}`,
        description: set.description,
        source: { ...base.source, variantKey: fragment.variantKey },
        roles: ["static", "cover", "development", "list", "comparison", "example", "closing"],
        densities: ["balanced", "expressive"],
        aspectRatios: [fragment.aspectRatio],
        decorativeIntensity: 0.8,
        fragment,
        pieces,
        assets,
        colorRoles: Object.fromEntries(selected.map(instance => [instance.id, "preserve" as const])),
      }));
    }
  }
  return output;
}
