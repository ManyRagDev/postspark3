import type { RecreationRecipe } from '../../shared/designRecreation';
import { renderRecipeAsync } from '../designBatch/native';

/** Render declared group members, with the inherited solid artboard color; no pixel segmentation. */
export async function renderComponent(recipe: RecreationRecipe, groupId: string) {
  const copy = structuredClone(recipe), group = copy.matrix?.groups.find(g => g.id === groupId);
  if (!group) throw new Error(`Missing group ${groupId}`);
  const ids = new Set(group.members.map(m => m.layerId));
  copy.scene.layers = copy.scene.layers.filter(l => ids.has(l.id));
  const corners = copy.scene.layers.flatMap(l => {
    const angle = l.rotationDeg * Math.PI / 180;
    return [[0, 0], [l.width, 0], [0, l.height], [l.width, l.height]].map(([x, y]) =>
      [l.x + x * Math.cos(angle) - y * Math.sin(angle), l.y + x * Math.sin(angle) + y * Math.cos(angle)]);
  });
  const left = Math.min(...corners.map(p => p[0])) - 16, top = Math.min(...corners.map(p => p[1])) - 16;
  copy.scene.source.widthPx = Math.ceil(Math.max(...corners.map(p => p[0])) - left + 16);
  copy.scene.source.heightPx = Math.ceil(Math.max(...corners.map(p => p[1])) - top + 16);
  for (const l of copy.scene.layers) { l.x -= left; l.y -= top; }
  copy.matrix!.groups = [group];
  copy.matrix!.fields = copy.matrix!.fields.filter(f => f.groupId === groupId);
  copy.matrix!.media = copy.matrix!.media.filter(m => m.groupId === groupId);
  return renderRecipeAsync(copy);
}
