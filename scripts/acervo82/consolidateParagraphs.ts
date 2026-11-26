import assert from "node:assert/strict";
import type { ComponentDefinitionV1 } from "../../shared/componentAssembly";
import { arsenalHash } from "../../shared/arsenalContent";
import { auditDesignTextCohesion } from "../../shared/designTextCohesion";

export function consolidateParagraphs(d: ComponentDefinitionV1) {
  const groups = auditDesignTextCohesion(d).filter(
    f => f.action === "consolidate"
  );
  const frag = d.fragment;
  const originalPieces = new Map(frag.instances.map(i => [i.id, i.pieceHash]));
  for (const { source, targets } of groups) {
    const binding = frag.bindings.find(
      b => b.source === source && b.kind === "text"
    )!;
    const boxes = targets.map(id => frag.instances.find(i => i.id === id)!);
    const first = boxes[0];
    const { contentFragment, ...piece } = d.pieces[first.pieceHash];
    const fits = boxes.map((box, index) => {
      const part = d.pieces[box.pieceHash].contentFragment;
      assert(
        part?.index === index &&
          part.count === boxes.length &&
          part.unit === "words"
      );
      assert(
        d.colorRoles?.[box.id] === d.colorRoles?.[first.id],
        "Papéis de cor distintos"
      );
      const r = frag.relations.find(r =>
        r.outputs.some(o => o.targetId === box.id)
      );
      assert(
        r?.kind === "textFit" &&
          r.enabled &&
          !r.inputs.length &&
          r.outputs.length === 1
      );
      assert(r.parameters.anchor === piece.align);
      return r;
    });
    const removed = new Set(targets.slice(1));
    // Refuse an independent use of a line, including references in optional metadata.
    const otherRefs = {
      ...d,
      pieces: undefined,
      colorRoles: undefined,
      fragment: {
        ...frag,
        instances: frag.instances.filter(i => !targets.includes(i.id)),
        bindings: frag.bindings.filter(b => b !== binding),
        relations: frag.relations.filter(r => !fits.some(f => f.id === r.id)),
      },
    };
    const protectedIds = new Set<string>();
    JSON.stringify(otherRefs, (key, value) => {
      protectedIds.add(key);
      if (typeof value === "string") protectedIds.add(value);
      return value;
    });
    assert(
      !Array.from(removed).some(id => protectedIds.has(id)),
      "Linha referenciada em outro elemento"
    );
    const minZ = Math.min(...boxes.map(i => i.zIndex)),
      maxZ = Math.max(...boxes.map(i => i.zIndex));
    assert(
      !frag.instances.some(
        i =>
          !targets.includes(i.id) &&
          i.parentId === first.parentId &&
          i.zIndex >= minZ &&
          i.zIndex <= maxZ
      ),
      "Intercalação de camadas"
    );
    const x = Math.min(...boxes.map(b => b.x)),
      right = Math.max(...boxes.map(b => b.x + b.width));
    const bottom = Math.max(...boxes.map(b => b.y + b.height));
    first.x = x;
    first.width = right - x;
    // The last line of the Industrial title shares its row with two badges.
    // A single editable rectangle must end before the first badge.
    if (
      d.completeDesign?.family === "acervo82-concept-06" &&
      first.id === "text-10-0"
    ) {
      const badge = frag.instances.find(i => i.id === "surface-12");
      assert(badge && badge.x > x && badge.y < bottom);
      const leftCorner =
        badge.x - badge.height * Math.sin((badge.rotation * Math.PI) / 180);
      first.width = Math.min(first.width, leftCorner - x - 6);
    }
    first.height = bottom - first.y;
    first.pieceHash = arsenalHash(piece);
    d.pieces[first.pieceHash] = piece;
    fits[0].parameters.maxWidth = first.width;
    fits[0].parameters.maxHeight = first.height;
    frag.relations = frag.relations.filter(
      r => !fits.slice(1).some(f => f.id === r.id)
    );
    frag.instances = frag.instances.filter(i => !removed.has(i.id));
    binding.targetIds = [first.id];
    for (const id of removed) if (d.colorRoles) delete d.colorRoles[id];
    // Keep all pieces used by another layer, including ornament instances.
    for (const hash of targets.map(id => originalPieces.get(id)!))
      if (!frag.instances.some(i => i.pieceHash === hash))
        delete d.pieces[hash];
  }
  return groups;
}
