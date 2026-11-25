// Translate the existing composition interpreter's result into the same primitives
// available to the project assistant. Unchanged keys keep their original times and handles.
export function compositionCommands(compositionId, before, after) {
  const commands = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (before.background !== after.background)
    commands.push({ id: "composition.background", compositionId, color: after.background });
  for (const next of after.layers) {
    const { id: layerId, type, props, keys, src, ...fields } = next,
      target = { compositionId, layerId };
    const old = before.layers.find(l => l.id === layerId);
    const changes = Object.fromEntries(Object.entries(fields).filter(([k, v]) => !same(v, old?.[k])));
    if (!old && type !== "text" && changes.text === "") delete changes.text;
    if (!old) commands.push({ id: "layer.add", ...target, type, fields: changes });
    else if (Object.keys(changes).length) commands.push({ id: "layer.set", ...target, fields: changes });
    if (src !== old?.src) throw Error("Para trocar a imagem, use a referência da biblioteca.");
    if (!same(props, old?.props)) commands.push({ id: "layer.pose", ...target, fields: props });
    for (const [channel, points] of Object.entries(keys)) {
      const previous = old?.keys[channel] ?? [];
      for (const key of previous)
        if (!points.some(k => k.t === key.t))
          commands.push({ id: "key.remove", ...target, channel, time: key.t });
      for (const key of points)
        if (!previous.some(k => same(key, k)))
          commands.push({ id: "key.set", ...target, channel, time: key.t, value: key.value, ease: key.ease });
    }
  }
  return commands;
}
