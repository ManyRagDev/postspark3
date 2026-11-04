/** Per-family offline composition authorship. No selector imports this module. */
import { arsenalHash } from "../../shared/arsenalContent";
import { arsenalWorldGeometry } from "../../shared/arsenalGeometry";
import type { ComponentDefinitionV1 } from "../../shared/componentAssembly";

type Editable = Pick<
  ComponentDefinitionV1,
  | "fragment"
  | "pieces"
  | "completeDesign"
  | "colorRoles"
  | "removableElementIds"
>;
const why = "6da56cf3eb349b1ef42ab98eaf610f05";
export function hasAuthoredFamilyLayout(
  source: ComponentDefinitionV1,
  functionName: string
) {
  return (
    (["reading", "synthesis"].includes(functionName) ||
      (source.completeDesign!.family === why && functionName === "list")) &&
    ["paper-window-requested", "mosaic-grid", why].includes(
      source.completeDesign!.family
    )
  );
}

export function applyAuthoredFamilyLayout(d: Editable, functionName: string) {
  const family = d.completeDesign!.family,
    W = d.fragment.artboard.width,
    H = d.fragment.artboard.height;
  const removed = new Set<string>();
  const world = (id: string) => {
    const i = d.fragment.instances.find(i => i.id === id)!;
    const w = arsenalWorldGeometry(
      { ...i, label: id, scale: 1 },
      d.fragment.groups
    );
    return { ...w, width: i.width * w.scale, height: i.height * w.scale };
  };
  const editPiece = (id: string, change: Record<string, unknown>) => {
    const i = d.fragment.instances.find(i => i.id === id)!;
    const p = { ...d.pieces[i.pieceHash], ...change };
    const hash = arsenalHash(p);
    d.pieces[hash] = p;
    i.pieceHash = hash;
  };
  const place = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize?: number
  ) => {
    const i = d.fragment.instances.find(i => i.id === id)!;
    const w = world(id),
      a = ((w.rotation - i.rotation) * Math.PI) / 180,
      dx = x - w.x,
      dy = y - w.y;
    i.x += (dx * Math.cos(a) + dy * Math.sin(a)) / w.scale;
    i.y += (-dx * Math.sin(a) + dy * Math.cos(a)) / w.scale;
    i.width = width / w.scale;
    i.height = height / w.scale;
    if (fontSize) {
      const nextFont = fontSize / w.scale;
      // This family's compact title keeps the native fit interval proportional;
      // retaining the cover's absolute floor would disable fitting altogether.
      if (family === why) {
        const ratio = nextFont / d.pieces[i.pieceHash].fontSize;
        d.fragment.relations = d.fragment.relations.map(r =>
          r.kind === "textFit" && r.outputs.some(o => o.targetId === id)
            ? {
                ...r,
                parameters: {
                  ...r.parameters,
                  minFontSize: r.parameters.minFontSize * ratio,
                },
              }
            : r
        );
      }
      editPiece(id, { fontSize: nextFont });
    }
  };
  const merge = (source: string, label: string, preserveBounds = false) => {
    const b = d.fragment.bindings.find(b => b.source === source);
    if (!b) return null;
    const first = b.targetIds[0];
    const boxes = b.targetIds.map(world);
    b.targetIds.slice(1).forEach(id => removed.add(id));
    b.targetIds = [first];
    b.label = label;
    editPiece(first, { contentFragment: undefined, textFragments: undefined });
    if (preserveBounds) {
      const x = Math.min(...boxes.map(b => b.x)),
        y = Math.min(...boxes.map(b => b.y));
      place(
        first,
        x,
        y,
        Math.max(...boxes.map(b => b.x + b.width)) - x,
        Math.max(...boxes.map(b => b.y + b.height)) - y
      );
    }
    return first;
  };
  const removeBinding = (source: string) => {
    const b = d.fragment.bindings.find(b => b.source === source);
    b?.targetIds.forEach(id => removed.add(id));
    d.fragment.bindings = d.fragment.bindings.filter(b => b.source !== source);
  };

  if (family === "paper-window-requested" && functionName !== "native") {
    const frame = world("surface"),
      pad = frame.width * 0.08;
    const title = merge(
      "block:headline:0:text",
      "Título compacto do assunto dentro da janela"
    );
    if (title)
      place(
        title,
        frame.x + pad,
        frame.y + frame.height * 0.16,
        frame.width - 2 * pad,
        frame.height * 0.17,
        frame.width * 0.065
      );
    const body = merge(
      "block:body:0:text",
      functionName === "reading"
        ? "Desenvolvimento contínuo da ideia; pode conter parágrafos curtos"
        : "Síntese que prepara o próximo passo"
    );
    if (body)
      place(
        body,
        frame.x + pad,
        frame.y + frame.height * 0.38,
        frame.width - 2 * pad,
        frame.height * (functionName === "reading" ? 0.49 : 0.25),
        frame.width * 0.045
      );
    if (functionName === "reading") {
      removeBinding("block:callToAction:0:text");
      removed.add("cta");
      if (body) editPiece(body, { align: "left", lineHeight: 1.24 });
    } else {
      const cta = d.fragment.bindings.find(b =>
        b.source.startsWith("block:callToAction:")
      );
      if (cta) {
        place(
          "cta",
          frame.x + pad,
          frame.y + frame.height * 0.73,
          frame.width - 2 * pad,
          frame.height * 0.13
        );
        place(
          cta.targetIds[0],
          frame.x + pad * 1.2,
          frame.y + frame.height * 0.76,
          frame.width - pad * 2.4,
          frame.height * 0.07,
          frame.width * 0.045
        );
      }
    }
  } else if (family === "mosaic-grid") {
    if (functionName === "native") {
      for (let index = 0; index < 3; index++) {
        const b = d.fragment.bindings.find(
          b => b.source === `block:body:${index}:text`
        )!;
        b.hideWhenEmpty = [...b.targetIds, `section-card-${index}`];
      }
    } else {
      const title = merge(
        "block:headline:0:text",
        functionName === "reading"
          ? "Título compacto para as três explicações"
          : "Conclusão que organiza três pontos finais"
      );
      if (title)
        place(title, W * 0.08, H * 0.08, W * 0.84, H * 0.14, W * 0.065);
      for (let index = 0; index < 3; index++) {
        const b = d.fragment.bindings.find(
          b => b.source === `block:body:${index}:text`
        )!;
        const [number, copy] = b.targetIds;
        b.targetIds = [copy];
        b.hideWhenEmpty = [number, copy, `section-card-${index}`];
        b.label = `Item ${index + 1}: explicação independente; não repetir aqui o marcador do campo associado`;
        editPiece(number, {
          contentFragment: undefined,
          textFragments: undefined,
          fixedText: null,
          fixedTextRole: undefined,
        });
        d.fragment.bindings.push({
          id: `item-marker-${index}`,
          source: `block:label:${index}:text`,
          label: `Marcador opcional do item ${index + 1}: índice curto coerente com a sequência; vazio se não houver numeração`,
          kind: "text",
          required: false,
          targetIds: [number],
          cardinality: null,
          prefix: "",
          gap: 0,
        });
        d.completeDesign!.designGuidance!.fieldRelationships?.push({
          kind: "sequence",
          sources: [b.source, `block:label:${index}:text`],
          label: `Explicação e marcador pertencem ao mesmo cartão ${index + 1}.`,
        });
        editPiece(copy, {
          contentFragment: undefined,
          textFragments: undefined,
          align: "left",
          lineHeight: 1.2,
        });
        const x = W * 0.08,
          y = H * (0.29 + index * 0.195),
          width = W * 0.84,
          height = H * 0.165;
        place(`section-card-${index}`, x, y, width, height);
        place(
          number,
          x + W * 0.025,
          y + height * 0.35,
          W * 0.07,
          height * 0.35,
          W * 0.04
        );
        place(
          copy,
          x + W * 0.135,
          y + height * 0.16,
          width - W * 0.17,
          height * 0.68,
          W * 0.036
        );
      }
    }
  } else if (family === why) {
    // Short headlines still occupy their authored emphasis. Old definitions have
    // no allocation metadata and keep their exact historical partitioning.
    const headline = d.fragment.bindings.find(
      b => b.source === "block:headline:0:text"
    )!;
    for (const id of headline.targetIds) {
      const i = d.fragment.instances.find(i => i.id === id)!,
        p = d.pieces[i.pieceHash];
      if (p.contentFragment)
        editPiece(id, {
          contentFragment: {
            ...p.contentFragment,
            allocation: { mode: "preserve_occupancy", priority: [1, 0, 2] },
          },
        });
    }
    if (functionName === "native") {
      merge(
        "block:body:0:text",
        "Contexto contínuo em frases completas; sem partição entre parágrafos",
        true
      );
      merge(
        "block:body:1:text",
        "Síntese contínua em destaque; não inventar autoria de citação",
        true
      );
    } else {
      // Index is a separate motif, not an intentional overlap with the compact title.
      for (const id of d.fragment.instances
        .filter(i => i.parentId === "g-numero")
        .map(i => i.id)) {
        const w = world(id);
        place(id, w.x, w.y - H * 0.04, w.width, w.height);
      }
      // The emphasis rectangle and corner marks travel together with the title.
      const titleIds = d.fragment.instances
        .filter(i => i.parentId === "g-titulo")
        .map(i => i.id);
      const boxes = titleIds.map(world),
        left = Math.min(...boxes.map(b => b.x)),
        top = Math.min(...boxes.map(b => b.y)),
        right = Math.max(...boxes.map(b => b.x + b.width));
      const factor = functionName === "synthesis" ? 0.53 : 0.64,
        center = (left + right) / 2,
        newTop = H * 0.2;
      for (const id of titleIds) {
        const w = world(id),
          i = d.fragment.instances.find(i => i.id === id)!;
        const p = d.pieces[i.pieceHash];
        place(
          id,
          W / 2 + (w.x - center) * factor,
          newTop + (w.y - top) * factor,
          w.width * factor,
          w.height * factor,
          p.kind === "text" ? p.fontSize * w.scale * factor : undefined
        );
      }
      const argument = merge(
        "block:body:0:text",
        functionName !== "synthesis"
          ? "Argumento principal contínuo: explicação ou exemplo, com frases completas"
          : "Detalhe opcional que sustenta a conclusão"
      );
      const conclusion = merge(
        "block:body:1:text",
        "Conclusão ou síntese em destaque; não inventar autoria de citação"
      );
      if (functionName === "reading" || functionName === "list") {
        if (argument) {
          place(
            argument,
            W * 0.13,
            H * 0.385,
            W * 0.74,
            H * (functionName === "list" ? 0.12 : 0.235),
            W * 0.035
          );
          editPiece(argument, { lineHeight: 1.2 });
        }
        const list = d.fragment.bindings.find(b => b.kind === "list");
        list?.targetIds.forEach((id, index) =>
          place(
            id,
            W * 0.13,
            H *
              (functionName === "list"
                ? 0.55 + index * 0.09
                : 0.655 + index * 0.043),
            W * 0.74,
            H * (functionName === "list" ? 0.07 : 0.039),
            W * (functionName === "list" ? 0.038 : 0.032)
          )
        );
        if (conclusion)
          place(
            conclusion,
            W * 0.13,
            H * 0.815,
            W * 0.74,
            H * 0.105,
            W * 0.033
          );
      } else {
        if (conclusion) {
          place(conclusion, W * 0.13, H * 0.39, W * 0.74, H * 0.26, W * 0.06);
          editPiece(conclusion, { align: "center", lineHeight: 1.14 });
          d.fragment.bindings.find(
            b => b.source === "block:body:1:text"
          )!.required = true;
        }
        if (argument)
          place(argument, W * 0.15, H * 0.735, W * 0.7, H * 0.14, W * 0.029);
        const list = d.fragment.bindings.find(b => b.kind === "list");
        if (list) removeBinding(list.source);
      }
    }
  }
  d.fragment.instances = d.fragment.instances.filter(i => !removed.has(i.id));
  d.fragment.relations = d.fragment.relations
    .filter(
      r =>
        !r.outputs.some(o => removed.has(o.targetId)) &&
        !r.inputs.some(id => removed.has(id))
    )
    .map(r => {
      if (r.kind !== "textFit") return r;
      const i = d.fragment.instances.find(i => i.id === r.outputs[0].targetId)!;
      const p = d.pieces[i.pieceHash];
      return {
        ...r,
        parameters: {
          ...r.parameters,
          maxWidth: i.width,
          maxHeight: i.height,
          minFontSize: Math.min(p.fontSize, r.parameters.minFontSize),
        },
      };
    });
  d.fragment.intentionalOverlaps = d.fragment.intentionalOverlaps.filter(pair =>
    pair.every(id => !removed.has(id))
  );
  if (d.fragment.lineBoxOverlaps)
    d.fragment.lineBoxOverlaps = d.fragment.lineBoxOverlaps.filter(
      pair => !removed.has(pair.a) && !removed.has(pair.b)
    );
  if (d.removableElementIds)
    d.removableElementIds = d.removableElementIds.filter(
      id => !removed.has(id)
    );
  if (d.colorRoles)
    d.colorRoles = Object.fromEntries(
      Object.entries(d.colorRoles).filter(([id]) => !removed.has(id))
    );
  const guidance = d.completeDesign!.designGuidance!;
  if (guidance.requiredTextTargets)
    guidance.requiredTextTargets = guidance.requiredTextTargets.filter(
      id => !removed.has(id)
    );
  const fields = new Set(d.fragment.bindings.map(b => b.source));
  if (guidance.fieldRelationships)
    guidance.fieldRelationships = guidance.fieldRelationships.filter(
      r =>
        r.sources.every(s => fields.has(s)) &&
        !(r.kind === "emphasis" && family !== why)
    );
  guidance.contentRules = [
    ...guidance.contentRules.filter(
      rule =>
        !/Campos multiline convertidos|Título dividido em três campos/.test(
          rule
        )
    ),
    ...(family === why
      ? [
          "Título contínuo preserva ocupação das caixas; com menos de três palavras, a ênfase recebe prioridade sem exigir texto artificial. Corpo e conclusão usam caixas contínuas, preservando frases completas.",
        ]
      : []),
    ...(family === "mosaic-grid"
      ? [
          "Cada cartão sem conteúdo desaparece junto com seu marcador e superfície; preencher novamente o campo restaura o conjunto.",
        ]
      : []),
    ...(functionName === "native"
      ? []
      : [
          `Composição ${functionName} autorada por função: distribuição de conteúdo própria da família, distinta da capa.`,
        ]),
  ].slice(0, 20);
  if (family === why)
    guidance.knownLimitations = guidance.knownLimitations.filter(
      rule =>
        !/Campos multiline convertidos|Título dividido em três campos/.test(
          rule
        )
    );
}
