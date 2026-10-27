import {
  assemblyIdentity,
  createComponentDefinition,
  type ComponentDefinitionV1,
} from "../../shared/componentAssembly";

/** Catalogue authorship, never a renderer override. Keep the source variant key
 * so the new revision replaces this design for selection, preserving old posts. */
export function authorWindowPhotoBackground(
  source: ComponentDefinitionV1,
  revision: number
): ComponentDefinitionV1 {
  if (
    source.completeDesign?.family !== "gifts-window" ||
    !source.completeDesign.baselineVerified ||
    !Number.isInteger(revision) ||
    revision <= (source.completeDesign.authorshipRevision ?? 0)
  )
    throw new Error(
      "window_background_requires_eligible_source_and_new_revision"
    );
  const fragment = structuredClone(source.fragment);
  const photo = fragment.instances.find(i => i.id === "photo");
  const surface = fragment.instances.find(i => i.id === "surface");
  if (
    !photo ||
    source.pieces[photo.pieceHash].kind !== "media" ||
    !surface ||
    source.pieces[surface.pieceHash].kind !== "rect" ||
    surface.opacity !== 1 ||
    !fragment.mediaSlots?.some(s => s.id === photo.id && s.policy === "cover")
  )
    throw new Error(
      "window_background_native_photo_and_opaque_window_required"
    );
  Object.assign(photo, {
    x: 0,
    y: 0,
    width: fragment.artboard.width,
    height: fragment.artboard.height,
  });
  const photoGroup = fragment.groups.find(g => g.id === photo.parentId);
  if (
    photoGroup &&
    (photoGroup.x ||
      photoGroup.y ||
      photoGroup.rotation ||
      photoGroup.scale !== 1)
  )
    throw new Error("window_background_photo_group_must_cover_artboard");
  const overlapKeys = new Set(
    fragment.intentionalOverlaps.map(p => [...p].sort().join("/"))
  );
  for (const text of fragment.instances.filter(
    i => source.pieces[i.pieceHash].kind === "text"
  )) {
    const pair: [string, string] = [photo.id, text.id];
    if (!overlapKeys.has([...pair].sort().join("/")))
      fragment.intentionalOverlaps.push(pair);
  }
  const mediaInstructions = [
    "Fotografia de ambientação cobrindo o fundo inteiro, com o assunto principal na metade superior, visível acima da janela.",
    "A janela opaca ocupa a parte inferior e protege a leitura. A foto não deve conter texto, botões ou uma segunda janela desenhada.",
    "Considerar o recorte cover e a sobreposição da janela; não enquadrar detalhes essenciais na área inferior encoberta.",
  ];
  fragment.mediaSlots = fragment.mediaSlots.map(slot =>
    slot.id === photo.id
      ? { ...slot, prompt: mediaInstructions.join(" ") }
      : slot
  );
  fragment.limitations.push(
    "Revisão de autoria: a foto cobre o fundo; o quadro isolado da revisão anterior foi substituído explicitamente."
  );
  const { hash: _hash, id: _id, ...base } = source;
  return createComponentDefinition({
    ...base,
    id: assemblyIdentity([
      "window-photo-background-v1",
      source.id,
      source.hash,
      revision,
    ]),
    label: "Presentes com significado · foto de fundo",
    description:
      "Fotografia de fundo em toda a capa e janela Mac opaca sobreposta na parte inferior; cores, fontes e campos nativos preservados.",
    fragment,
    completeDesign: {
      ...source.completeDesign,
      authorshipRevision: revision,
      designGuidance: {
        version: 1,
        summary:
          "Foto de fundo preenchendo a composição, com janela estilo Mac sobreposta embaixo e texto editável protegido por superfície opaca.",
        motifs: [
          "fotografia de fundo",
          "janela Mac",
          "controles coloridos",
          "borda e sombra marcadas",
        ],
        preserve: [
          "Preservar janela, controles, tipografia, cores e campos nativos.",
          "Manter a fotografia preenchendo o fundo e o assunto principal visível acima da janela.",
        ],
        contentRules: [
          "Capa com gancho e apoio breve, respeitando a capacidade dos campos; não acrescentar texto para ocupar a fotografia.",
        ],
        mediaRules: [{ slotId: photo.id, instructions: mediaInstructions }],
        knownLimitations: [
          "O recorte cover pode ocultar bordas da imagem; produtos que exijam vista integral precisam de um design específico para produto.",
          "Foto de demonstração não integra os assets publicados; usar mídia fornecida ou gerada pelo fluxo autorizado.",
        ],
      },
    },
  });
}
