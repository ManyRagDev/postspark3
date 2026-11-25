import { evaluateLayer, setKey } from "./composition-model.js";
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const round = v => Math.round(v * 1000) / 1000;
const scaleAxes = ["scaleX", "scaleY"];
export const axesFor = channel =>
  channel === "position" ? ["x", "y"] : channel === "scale" ? scaleAxes : [channel];

export function timelineKeys(layer, channel) {
  if (!layer) return [];
  const axes = axesFor(channel);
  if (axes.length === 1) return layer.keys[channel] || [];
  const byTime = new Map();
  for (const axis of axes) {
    for (const key of layer.keys[axis] || []) {
      const mark = byTime.get(key.t);
      if (!mark) byTime.set(key.t, { t: key.t, ease: key.ease });
      else if (JSON.stringify(mark.ease) !== JSON.stringify(key.ease)) mark.ease = "mixed";
    }
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function positionFrame(clip, layer, time) {
  const first = Math.ceil((Math.max(clip.trim, layer.start) - clip.trim) * 30 - 1e-8);
  const last = Math.ceil((Math.min(clip.trim + clip.duration, layer.end) - clip.trim) * 30 - 1e-8) - 1;
  if (last < first) return null;
  return clip.trim + clamp(Math.round((time - clip.trim) * 30), first, last) / 30;
}
export function setValue(layer, key, value, time) {
  if (layer.keys[key]?.length) {
    const t = clamp(time - layer.start, 0, layer.end - layer.start);
    const existing = layer.keys[key].find(k => Math.abs(k.t - t) <= 0.0005);
    setKey(layer, key, existing?.t ?? round(t), value, existing?.ease || "linear");
  } else layer.props[key] = value;
}
export function editScale(layer, values, time, paired) {
  if (!paired || !scaleAxes.some(axis => layer.keys[axis]?.length)) {
    for (const [axis, value] of Object.entries(values)) setValue(layer, axis, value, time);
    return;
  }
  const local = clamp(time - layer.start, 0, layer.end - layer.start);
  const existing = timelineKeys(layer, "scale").find(key => Math.abs(key.t - local) <= 0.0005);
  const t = existing?.t ?? round(local);
  const ease = existing?.ease === "mixed" ? "linear" : (existing?.ease ?? "linear");
  for (const axis of scaleAxes) {
    const key = layer.keys[axis]?.find(key => Math.abs(key.t - t) <= 0.000001);
    setKey(layer, axis, t, values[axis], key?.ease ?? ease);
  }
}
export function editPosition(layer, values, time, clip, channel) {
  if (channel !== "position" || !(layer.keys.x?.length || layer.keys.y?.length)) {
    for (const [axis, value] of Object.entries(values)) setValue(layer, axis, value, time);
    return time;
  }
  const existing = timelineKeys(layer, channel).find(k => Math.abs(layer.start + k.t - time) < 0.000001);
  const at = existing ? layer.start + existing.t : positionFrame(clip, layer, time);
  if (at === null) return time;
  const t = Math.max(0, at - layer.start);
  const pose = { ...evaluateLayer(layer, at), ...values };
  for (const axis of ["x", "y"]) {
    const key = layer.keys[axis]?.find(k => Math.abs(k.t - t) < 0.000001);
    setKey(layer, axis, t, pose[axis], key?.ease || "linear");
  }
  return at;
}
