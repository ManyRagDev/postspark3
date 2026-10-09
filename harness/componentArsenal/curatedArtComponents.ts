import { arsenalHash } from "../../shared/arsenalContent";
import { assemblyIdentity, createComponentDefinition, type ComponentDefinitionV1 } from "../../shared/componentAssembly";
import { arsenalVariantSchema, type ResolvedVariantDefinitionV2 } from "../../shared/designArsenal";
import type { ComponentPackage } from "./extract";

const REFERENCES = new Set([
  "0623fb1c14937cd1e67e980b566710ba",
  "1c2fb00a82a764bab2f4374d03f67886",
  "c5d8dcc1ddabea113d4f4a5ea76cde0d",
]);

function derive(source: ComponentDefinitionV1, variant: ResolvedVariantDefinitionV2, label: string, roles: ComponentDefinitionV1["roles"]): ComponentDefinitionV1 {
  const fragment = arsenalVariantSchema.parse(variant);
  const { id: _oldId, hash: _oldHash, ...base } = source;
  const candidate = {
    ...base,
    label,
    description: `${source.description} Derivação autorada para montagem com mínimo tipográfico absoluto a partir da revisão congelada 8.`,
    source: { ...source.source, variantKey: fragment.variantKey },
    roles,
    fragment,
    pieces: Object.fromEntries(fragment.instances.map(instance => [instance.pieceHash, source.pieces[instance.pieceHash]])),
    assets: source.assets.filter(asset => fragment.assetIds.includes(asset.id)),
    colorRoles: Object.fromEntries(fragment.instances.map(instance => [instance.id, source.colorRoles?.[instance.id] ?? "preserve"])),
    removableElementIds: (source.removableElementIds ?? []).filter(id => fragment.instances.some(instance => instance.id === id)),
  };
  const id = assemblyIdentity(candidate);
  return createComponentDefinition({ ...candidate, id });
}

function textTargets(variant: ResolvedVariantDefinitionV2, source: string): string[] {
  return variant.bindings.find(binding => binding.source === source)?.targetIds ?? [];
}

function setTextFits(variant: ResolvedVariantDefinitionV2, ids: string[], minFontSize: number) {
  for (const id of ids) {
    const node = variant.instances.find(instance => instance.id === id);
    const fit = variant.relations.find(relation => relation.kind === "textFit" && relation.outputs.some(output => output.targetId === id));
    if (!node || !fit || fit.kind !== "textFit") continue;
    fit.outputs = fit.outputs.map(output => output.targetId === id
      ? { ...output, properties: ["x", "width", "height", "fontSize"] }
      : output);
    fit.parameters.maxWidth = node.width;
    fit.parameters.maxHeight = node.height;
    fit.parameters.minFontSize = minFontSize;
  }
}

function setSurfaceFit(
  variant: ResolvedVariantDefinitionV2,
  id: string,
  inputs: string[],
  targetId: string,
  width: number,
  height: number,
  padX: number,
  padY: number,
) {
  const relation = variant.relations.find(candidate => candidate.id === id);
  if (!relation || relation.kind !== "surfaceFit") return;
  relation.inputs = [...inputs];
  relation.outputs = [{ targetId, properties: ["x", "y", "width", "height"] }];
  relation.parameters = {
    padding: { left: padX, right: padX, top: padY, bottom: padY },
    minWidth: width,
    minHeight: height,
  };
}

function coverFromDevelopment(p: ComponentPackage, source: ComponentDefinitionV1): ComponentDefinitionV1 {
  const variant = structuredClone(source.fragment) as ResolvedVariantDefinitionV2;
  const W = variant.artboard.width, H = variant.artboard.height;
  // Keep the readable type floor in artboard units: 24.8 at 736px maps to
  // 36.4px in the 1080px review render (1080 / 736 projection).
  const minReadableFont = 36.4 / (1080 / W);
  const headline = textTargets(variant, "block:headline:0:text");
  const body = textTargets(variant, "block:body:0:text");
  const cta = textTargets(variant, "block:callToAction:0:text");
  const placeText = (ids: string[], box: {x:number;y:number;width:number;height:number}, gap = 0) => {
    const nodes = ids.map(id => variant.instances.find(instance => instance.id === id)).filter((node): node is ResolvedVariantDefinitionV2["instances"][number] => !!node);
    const each = (box.height - gap * Math.max(0, nodes.length - 1)) / Math.max(1, nodes.length);
    nodes.forEach((node, index) => {
      node.parentId = null;
      node.x = box.x;
      node.y = box.y + index * (each + gap);
      node.width = box.width;
      node.height = each;
    });
    for (const id of ids) {
      const node = variant.instances.find(instance => instance.id === id);
      const relation = variant.relations.find(candidate => candidate.kind === "textFit" && candidate.outputs.some(output => output.targetId === id));
      if (node && relation?.kind === "textFit") {
        relation.parameters.maxWidth = node.width;
        relation.parameters.maxHeight = node.height;
        relation.parameters.minFontSize = minReadableFont;
      }
    }
  };

  if (p.source.referenceId === "0623fb1c14937cd1e67e980b566710ba") {
    // Four authored headline fragments retain their weights; the wider block
    // and 43% artboard band give each line room without discarding copy.
    placeText(headline, { x: W * .14, y: H * .15, width: W * .72, height: H * .43 }, H * .012);
    placeText(body, { x: W * .14, y: H * .64, width: W * .72, height: H * .12 });
    placeText(cta, { x: W * .22, y: H * .80, width: W * .56, height: H * .07 });
    const paper = variant.instances.find(instance => instance.id === "papel-principal");
    const shadow = variant.instances.find(instance => instance.id === "sombra-papel");
    if (paper) paper.rotation = 0;
    if (shadow) shadow.rotation = 0;
    setSurfaceFit(variant, "carousel-paper-fit", [...headline, ...body, ...cta], "papel-principal", W * .84, H * .78, W * .06, H * .045);
  } else if (p.source.referenceId === "1c2fb00a82a764bab2f4374d03f67886") {
    placeText(headline, { x: W * .12, y: H * .13, width: W * .76, height: H * .25 });
    placeText(body, { x: W * .15, y: H * .45, width: W * .70, height: H * .21 });
    placeText(cta, { x: W * .24, y: H * .78, width: W * .52, height: H * .08 });
    const panel = variant.instances.find(instance => instance.id === "cartao-conteudo");
    const titlePanel = variant.instances.find(instance => instance.id === "titulo-janela");
    const ctaPanel = variant.instances.find(instance => instance.id === "cta-fundo");
    if (panel) { panel.rotation = 0; panel.x = W * .12; panel.y = H * .43; panel.width = W * .76; panel.height = H * .25; }
    if (titlePanel) titlePanel.rotation = variant.instances.find(instance => instance.id === headline[0])?.rotation ?? 0;
    if (ctaPanel) ctaPanel.rotation = 0;
    setSurfaceFit(variant, "carousel-window-title-fit", headline, "titulo-janela", W * .82, H * .27, W * .03, H * .02);
    setSurfaceFit(variant, "carousel-window-content-fit", body, "cartao-conteudo", W * .76, H * .25, W * .03, H * .02);
    setSurfaceFit(variant, "carousel-cta-fit", cta, "cta-fundo", W * .58, H * .09, W * .03, H * .015);
  } else {
    placeText(headline, { x: W * .12, y: H * .12, width: W * .76, height: H * .46 }, H * .012);
    placeText(body, { x: W * .14, y: H * .74, width: W * .72, height: H * .18 });
    setTextFits(variant, [...headline, ...body], minReadableFont);
  }

  // Text fit floors are absolute display-size floors, never a percentage of a
  // potentially undersized source font. Piece treatments/font manifests stay intact.
  setTextFits(variant, [...headline, ...body, ...cta], minReadableFont);
  variant.variantKey += `-curated-cover-${arsenalHash([p.source.referenceId, source.id]).slice(0, 8)}`;
  const roles: ComponentDefinitionV1["roles"] = ["static", "cover", "example"];
  return derive(source, variant, `${source.label} · capa autorada`, roles);
}

function correctedPaperDevelopment(p: ComponentPackage, source: ComponentDefinitionV1): ComponentDefinitionV1 {
  const variant = structuredClone(source.fragment) as ResolvedVariantDefinitionV2;
  const minReadableFont = 36.4 / (1080 / variant.artboard.width);
  const ids = variant.bindings.flatMap(binding => binding.targetIds);
  setTextFits(variant, ids, minReadableFont);
  variant.variantKey += `-curated-readable-${arsenalHash(source.id).slice(0, 8)}`;
  return derive(source, variant, `${source.label} · leitura corrigida`, ["development"]);
}

/** Curated derivatives are append-only components; the revision-8 sources remain untouched. */
export function curatedArtComponents(p: ComponentPackage): ComponentDefinitionV1[] {
  if (!REFERENCES.has(p.source.referenceId) || p.source.destination !== "composition") return [];
  const source = p.components.find(component =>
    component.kind === "content" && component.fragment.aspectRatio === "4:5" &&
    component.source.kind === "recipe" && component.source.referenceId === p.source.referenceId && component.source.variantKey.includes("carousel-development")
  );
  if (!source) return [];
  const result = [coverFromDevelopment(p, source)];
  if (p.source.referenceId === "0623fb1c14937cd1e67e980b566710ba") result.push(correctedPaperDevelopment(p, source));
  return result;
}
