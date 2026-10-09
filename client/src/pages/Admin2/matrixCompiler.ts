import {
  recreationRecipeSchema,
  type RecreationRecipe,
} from "@shared/designRecreation";
import type { DesignMatrix, MatrixTransform } from "@shared/designMatrix";
import {
  ensureReferenceFontsLoaded,
  referenceFontFamily,
} from "../CanvasLab/lib/referenceFonts";
import { layoutRichText } from "../CanvasLab/lib/richTextLayout";

export type MatrixInputs = {
  fields: Record<string, string>;
  transforms: Record<string, MatrixTransform>;
  media: DesignMatrix["media"];
};

export function matrixInputs(recipe: RecreationRecipe): MatrixInputs {
  if (!recipe.matrix)
    throw new Error("Esta receita ainda não possui campos vinculados.");
  return {
    fields: Object.fromEntries(
      recipe.matrix.fields.map(f => [
        f.id,
        f.layerIds
          .map(id => {
            const l = recipe.scene.layers.find(l => l.id === id)!;
            const text = l.opacity === 0 ? "" : (l.text ?? "");
            return f.prefix && text.startsWith(f.prefix)
              ? text.slice(f.prefix.length)
              : text;
          })
          .filter(Boolean)
          .join("\n"),
      ])
    ),
    transforms: Object.fromEntries(
      recipe.matrix.groups.map(g => [g.id, { ...g.transform }])
    ),
    media: structuredClone(recipe.matrix.media),
  };
}

/** Explicit local compile: source is immutable, overflow is rejected, list typography scales together. */
export async function compileMatrix(
  recipe: RecreationRecipe,
  input: MatrixInputs
): Promise<RecreationRecipe> {
  const next = recreationRecipeSchema.parse(structuredClone(recipe));
  if (!next.matrix)
    throw new Error("Importe uma receita com matriz vinculada.");
  await ensureReferenceFontsLoaded(next.scene);
  const matrix = next.matrix;
  const changedGroups: string[] = [],
    changedFields: string[] = [],
    resizedFields: string[] = [];
  const before = matrixInputs(recipe);
  for (const group of matrix.groups) {
    const t = input.transforms[group.id] ?? group.transform;
    if (JSON.stringify(t) !== JSON.stringify(group.transform))
      changedGroups.push(group.id);
    group.transform = { ...t };
    const radians = (t.rotationDeg * Math.PI) / 180;
    for (const member of group.members) {
      const layer = next.scene.layers.find(l => l.id === member.layerId)!;
      layer.x =
        t.x + member.x * Math.cos(radians) - member.y * Math.sin(radians);
      layer.y =
        t.y + member.x * Math.sin(radians) + member.y * Math.cos(radians);
      layer.rotationDeg = t.rotationDeg + member.rotationDeg;
    }
  }
  for (const field of matrix.fields) {
    const value = input.fields[field.id] ?? before.fields[field.id];
    if (value !== before.fields[field.id]) changedFields.push(field.id);
    const lines = value
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    if (!lines.length || lines.length > field.layerIds.length)
      throw new Error(
        `${field.label}: use ${field.kind === "text" ? "uma linha" : `de 1 a ${field.layerIds.length} itens`}.`
      );
    if (lines.some(s => (field.prefix + s).length > 1200))
      throw new Error(`${field.label}: texto muito longo.`);
    const layers = field.layerIds.map(
      id => next.scene.layers.find(l => l.id === id)!
    );
    layers.forEach((layer, i) => {
      layer.text = lines[i] ? field.prefix + lines[i] : " ";
      layer.opacity = lines[i] ? 1 : 0;
      if (
        !next.scene.fonts.some(
          f =>
            f.family === layer.fontFamily &&
            f.weight === layer.fontWeight &&
            f.dataUrl
        )
      )
        throw new Error(`${field.label}: incorpore a fonte antes de adaptar.`);
    });
    const fits = (scale: number) =>
      layers.every((l, i) => {
        if (!l.opacity) return true;
        const layout = layoutRichText({
          text: l.text!,
          width: l.width,
          fontSize: field.baseFontSizes[i] * scale,
          fontFamily: referenceFontFamily(
            next.scene,
            l.fontFamily,
            l.fontWeight
          ),
          fontStyle: String(l.fontWeight),
          fill: l.fill,
          align: l.align,
          lineHeight: l.lineHeight,
          letterSpacing: l.letterSpacing,
          wrap: false,
        });
        return (
          layout.height <= l.height + 0.01 &&
          layout.lines.every(line => line.width <= l.width + 0.01)
        );
      });
    if (!fits(field.minScale))
      throw new Error(
        `${field.label}: o conteúdo excede a área mesmo no tamanho mínimo. Encurte o texto; a composição original foi preservada.`
      );
    let scale = 1;
    if (!fits(1)) {
      let low = field.minScale,
        high = 1;
      for (let i = 0; i < 18; i++) {
        const middle = (low + high) / 2;
        if (fits(middle)) low = middle;
        else high = middle;
      }
      scale = low;
      resizedFields.push(field.id);
    }
    layers.forEach((l, i) => {
      l.fontSize = Math.floor(field.baseFontSizes[i] * scale * 10000) / 10000;
    });
  }
  // Only the asset and crop position can change; bindings and target geometry stay part of the matrix.
  matrix.media = matrix.media.map(slot => {
    const edit = input.media.find(m => m.id === slot.id);
    return edit
      ? {
          ...slot,
          asset: edit.asset,
          positionX: edit.positionX,
          positionY: edit.positionY,
        }
      : slot;
  });
  next.id = crypto.randomUUID();
  next.createdAt = new Date().toISOString();
  next.title = `${recipe.title.replace(/ · adaptação$/, "")} · adaptação`.slice(
    0,
    120
  );
  next.adaptation!.parentRecipeId = recipe.id;
  matrix.lastCompilation = {
    at: next.createdAt,
    status: resizedFields.length ? "adapted" : "applied",
    resizedFields,
    changedFields,
    changedGroups,
    filledMedia: matrix.media.filter(m => m.asset).map(m => m.id),
  };
  next.notes = next.notes.filter(n => !n.startsWith("[Matriz]")).slice(-195);
  next.notes.push(
    `[Matriz] Derivada de ${recipe.id}, sem chamada de IA. ${changedFields.length} campos alterados; ${resizedFields.length} campos com redução de fonte; ${matrix.lastCompilation.filledMedia.length} áreas de mídia preenchidas.`
  );
  if (
    new TextEncoder().encode(JSON.stringify(next)).byteLength >
    24 * 1024 * 1024
  )
    throw new Error(
      "A receita com fotos excedeu 24 MB. Use imagens menores para manter o JSON portátil."
    );
  return recreationRecipeSchema.parse(next);
}
