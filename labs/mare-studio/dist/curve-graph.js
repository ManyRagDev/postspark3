import { evaluateChannel } from "./composition-model.js";

// X spans the same composition window as the keyframe rail. The curve itself
// only spans the visible lifetime of the layer.
export function curveGraph(layer, axis, clip) {
  const keys = layer.keys[axis] || [];
  const start = Math.max(0, clip.trim - layer.start);
  const end = Math.min(layer.end, clip.trim + clip.duration) - layer.start;
  if (end < start) return null;

  const visible = keys.filter(key => key.t >= start && key.t <= end);
  const times = new Set([start, end, ...visible.map(key => key.t)]);
  for (let i = 1; i < 160; i++) times.add(start + (end - start) * i / 160);
  const holds = new Set(visible.filter(key => key.ease === "hold").map(key => key.t));
  const points = [];
  const x = t => 100 * (layer.start + t - clip.trim) / clip.duration;
  for (const t of [...times].sort((a, b) => a - b)) {
    const value = evaluateChannel(layer.props[axis], keys, t, axis);
    if (holds.has(t) && points.length) points.push({x: x(t), value: points.at(-1).value});
    points.push({x: x(t), value});
  }
  const values = points.map(point => point.value);
  const min = Math.min(...values), max = Math.max(...values);
  const y = value => min === max ? 50 : 90 - 80 * (value - min) / (max - min);
  return {
    min, max,
    path: points.map(point => point.x.toFixed(4) + "," + y(point.value).toFixed(4)).join(" "),
    keys: visible.map(key => ({...key, x: x(key.t), y: y(key.value)})),
  };
}
