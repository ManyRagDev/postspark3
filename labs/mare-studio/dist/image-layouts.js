import { evaluateLayer } from "./composition-model.js";

export const IMAGE_LAYOUTS = [
  {id: "stack", label: "Empilhamento"},
  {id: "mosaic", label: "Mosaico"},
  {id: "fan", label: "Leque de cartas"},
  {id: "strip", label: "Faixa"},
];

const frame = (x, y, width, height, rotation = 0) => ({x, y, width, height, rotation});

function grid(count, columns, top, height) {
  const gap = 10, fullWidth = 460;
  const rows = Math.ceil(count / columns);
  const width = (fullWidth - (columns - 1) * gap) / columns;
  return Array.from({length: count}, (_, index) => {
    const row = Math.floor(index / columns);
    const inRow = Math.min(columns, count - row * columns);
    const x = 270 + (index % columns - (inRow - 1) / 2) * (width + gap);
    const y = top + row * (height + gap) + height / 2;
    return frame(x, y, width, height);
  });
}

export function imageLayout(id, count) {
  if (count < 2) return [];
  if (id === "mosaic") {
    const columns = Math.min(count - 1, count > 7 ? 4 : count > 4 ? 3 : 2);
    const rows = Math.ceil((count - 1) / columns);
    const cellHeight = Math.min(185, 365 / rows - 10);
    const height = 240 + rows * (cellHeight + 10);
    const top = 480 - height / 2;
    return [frame(270, top + 120, 460, 240), ...grid(count - 1, columns, top + 250, cellHeight)];
  }
  if (id === "strip") {
    const columns = Math.min(4, count);
    const rows = Math.ceil(count / columns);
    const height = Math.min(355, 620 / rows - 10);
    return grid(count, columns, 480 - (rows * (height + 10) - 10) / 2, height);
  }
  return Array.from({length: count}, (_, index) => {
    const progress = index / (count - 1);
    const position = progress * 2 - 1;
    if (id === "fan") {
      return frame(270 + position * 110, 470 + position ** 2 * 44, 190, 282, position * 22);
    }
    const size = .87 + progress * .13;
    return frame(270 + position * 45, 480 + position * 24, 325 * size, 415 * size, position * 10);
  });
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function remap(layer, axes, transform) {
  for (const axis of axes) {
    layer.props[axis] = transform(axis, layer.props[axis]);
    for (const key of layer.keys[axis] || []) key.value = transform(axis, key.value);
  }
}

// Fit the layout at the current pose while retaining each card's animation and timing.
export function arrangeImages(layers, layoutId, time) {
  const placements = imageLayout(layoutId, layers.length);
  return layers.map((image, index) => {
    const layer = structuredClone(image);
    const target = placements[index];
    const pose = evaluateLayer(layer, time);
    remap(layer, ["x", "y"], (axis, value) => clamp(value + target[axis] - pose[axis], -10000, 10000));
    const turn = ((target.rotation - pose.rotation + 180) % 360 + 360) % 360 - 180;
    remap(layer, ["rotation"], (_, value) => clamp(value + turn, -36000, 36000));
    remap(layer, ["scaleX", "scaleY"], (axis, value) => clamp(value / (pose[axis] || 1), 0, 100));
    layer.width = target.width;
    layer.height = target.height;
    layer.fit = "cover";
    return layer;
  });
}
