import type { ComponentDefinitionV1 } from "./componentAssembly";
import { arsenalHash } from "./arsenalContent";

export type CohesionFinding = {
  action: "consolidate" | "inspect" | "preserve";
  reason: string;
  source: string;
  targets: string[];
};

/** Audit immutable authoring data, not a particular generated copy. */
export function auditDesignTextCohesion(
  d: ComponentDefinitionV1
): CohesionFinding[] {
  if (!d.completeDesign) return [];
  const { bindings, instances, relations } = d.fragment;
  const byId = new Map(instances.map(i => [i.id, i]));
  const rows = bindings.filter(b => b.kind === "text");
  const sources = new Map<string, string[]>();
  for (const b of rows)
    sources.set(b.source, [...(sources.get(b.source) ?? []), ...b.targetIds]);
  const required = new Set([
    ...(d.completeDesign.designGuidance?.requiredTextTargets ?? []),
    ...(d.removableElementIds ?? []),
    ...bindings.flatMap(b => b.hideWhenEmpty ?? []),
  ]);
  const findings: CohesionFinding[] = [];
  for (const [source, targets] of Array.from(sources)) {
    if (targets.length <= 1) continue;
    const boxes = targets.map(id => byId.get(id)!);
    const pieces = boxes.map(i => d.pieces[i.pieceHash]);
    const parts = pieces.map(p => p.contentFragment);
    const push = (action: CohesionFinding["action"], reason: string) =>
      findings.push({ action, reason, source, targets });
    if (
      parts.some(f => !f) ||
      rows.filter(b => b.source === source).length > 1
    ) {
      push("inspect", "campo_repetido_ou_sem_particao");
      continue;
    }
    if (
      parts.some(f => f?.allocation) ||
      targets.some(id => required.has(id)) ||
      relations.some(
        r =>
          r.enabled &&
          r.kind !== "textFit" &&
          (r.inputs.some(id => targets.includes(id)) ||
            r.outputs.some(o => targets.includes(o.targetId)))
      )
    ) {
      push("preserve", "camadas_com_funcao_declarada");
      continue;
    }
    const style = (p: (typeof pieces)[number]) => {
      const { contentFragment, fontSize, ...rest } = p;
      return arsenalHash(rest);
    };
    if (
      pieces.some(
        p =>
          p.textFragments?.length ||
          p.textGradient ||
          p.extrusion ||
          style(p) !== style(pieces[0]) ||
          Math.abs(p.fontSize - pieces[0].fontSize) > pieces[0].fontSize * 0.02
      )
    ) {
      push("inspect", "tipografia_ou_efeitos_distintos");
      continue;
    }
    const ordered = boxes
      .map((box, i) => ({ box, index: parts[i]!.index }))
      .sort((a, b) => a.index - b.index)
      .map(r => r.box);
    const first = ordered[0];
    const axis = [0, 0.5, 1].some(fraction =>
      ordered.every(
        b =>
          Math.abs(
            b.x + b.width * fraction - (first.x + first.width * fraction)
          ) <= 2
      )
    );
    const continuous = ordered.every(
      (b, i) =>
        b.parentId === first.parentId &&
        !b.rotation &&
        b.opacity === first.opacity &&
        (!i ||
          Math.abs(b.y - ordered[i - 1].y - ordered[i - 1].height) <=
            Math.max(2, ordered[i - 1].height * 0.04))
    );
    if (!axis || !continuous) {
      push("inspect", "geometria_ou_ordem_distinta");
      continue;
    }
    push("consolidate", "linhas_contiguas_do_mesmo_campo");
  }
  // Inferred neighbors are suggestions only. Two independent body fields may
  // legitimately occupy adjacent rows.
  const singles = rows.filter(
    b => b.targetIds.length === 1 && /^block:(headline|body):/.test(b.source)
  );
  for (const [i, previous] of Array.from(singles.entries())) {
    const a = byId.get(previous.targetIds[0])!;
    for (const next of singles.slice(i + 1)) {
      const b = byId.get(next.targetIds[0])!;
      if (
        !a.parentId ||
        a.parentId !== b.parentId ||
        a.rotation ||
        b.rotation ||
        a.pieceHash !== b.pieceHash ||
        previous.source.split(":")[1] !== next.source.split(":")[1] ||
        previous.source === next.source
      )
        continue;
      if (
        Math.abs(a.x - b.x) <= 2 &&
        Math.min(
          Math.abs(b.y - a.y - a.height),
          Math.abs(a.y - b.y - b.height)
        ) <= 2
      )
        findings.push({
          action: "inspect",
          reason: "campos_vizinhos_com_mesma_tipografia",
          source: previous.source + " / " + next.source,
          targets: [a.id, b.id],
        });
    }
  }
  return findings;
}

export function assertDesignTextCohesion(
  d: ComponentDefinitionV1,
  findings = auditDesignTextCohesion(d)
) {
  const blocks = findings.filter(f => f.action === "consolidate");
  if (blocks.length)
    throw new Error(
      `Coesão textual de ${d.label}: use uma caixa por parágrafo contínuo. ` +
        blocks.map(f => `${f.source} [${f.targets.join(", ")}]`).join(" / ")
    );
}
