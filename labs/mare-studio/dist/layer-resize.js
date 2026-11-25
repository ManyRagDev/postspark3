export const maxScale = 100;
const minDragScale = 0.001;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const precise = value => Math.round(value * 1e6) / 1e6;

export function layerAxes(pose, dx, dy) {
  const angle = pose.rotation * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: dx * cos + dy * sin, y: dy * cos - dx * sin };
}

function proportionalScale(ratio, factor, minimum = 0) {
  const fitted = clamp(factor, minimum, maxScale);
  return { scaleX: ratio.scaleX * fitted, scaleY: ratio.scaleY * fitted };
}

function scaleRatio({scaleX, scaleY}) {
  if (scaleX <= 0 || scaleY <= 0) return {scaleX: 1, scaleY: 1};
  const largest = Math.max(scaleX, scaleY);
  return { scaleX: scaleX / largest, scaleY: scaleY / largest };
}

export function linkedScale(pose, axis, value) {
  const ratio = scaleRatio(pose);
  return proportionalScale(ratio, value === 0 ? 0 : value / ratio[axis]);
}

export function resizeLayer(layer, pose, corner, delta, locked) {
  const local = layerAxes(pose, delta.x, delta.y);
  // Keep the center fixed. A corner travels half the total change in size.
  const dx = 2 * corner.x * local.x, dy = 2 * corner.y * local.y;
  if (locked) {
    const ratio = scaleRatio(pose);
    const width = layer.width * ratio.scaleX, height = layer.height * ratio.scaleY;
    const projected = ((layer.width * pose.scaleX + dx) * width + (layer.height * pose.scaleY + dy) * height) /
      (width * width + height * height);
    return proportionalScale(ratio, projected, minDragScale);
  }
  if (layer.type === "text") {
    return {
      width: precise(clamp(layer.width + dx / (pose.scaleX || 1), 1, 8000)),
      height: precise(clamp(layer.height + dy / (pose.scaleY || 1), 1, 8000)),
    };
  }
  const expand = (scale, delta) => Math.abs(delta) < 1e-9 ? scale :
    precise(clamp(scale + delta, minDragScale, maxScale));
  return { scaleX: expand(pose.scaleX, dx / layer.width), scaleY: expand(pose.scaleY, dy / layer.height) };
}
