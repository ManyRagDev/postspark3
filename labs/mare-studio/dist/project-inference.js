import { inferMotion } from "./local-inference.js";

// Discover the operation first so that the small local model receives the relevant
// schema and state. Long editorial plans can use the same session API incrementally.
const jsonGrammar = String.raw`object ::= "{" ws (pair (ws "," ws pair)*)? ws "}"
pair ::= string ws ":" ws value
array ::= "[" ws (value (ws "," ws value)*)? ws "]"
value ::= object | array | string | number | "true" | "false" | "null"
string ::= "\"" ([^"\\\x00-\x1F] | "\\" ["\\/bfnrt])* "\""
number ::= "-"? ("0" | [1-9] [0-9]*) ("." [0-9]+)?
ws ::= [ \t\n\r]*
`;
export async function inferProjectCommand(session, request, { signal, onProgress }) {
  const state = session.inspect();
  const catalog = session.catalog().filter(c => {
    // Large binary and complete scene inputs come from the document and asset adapters.
    if (c.id === "composition.apply" || c.id === "speech.apply" || Object.hasOwn(c.params, "file"))
      return false;
    const required = Object.keys(c.params).filter(k => !k.endsWith("?"));
    if (!state.compositions.length && required.includes("compositionId") && c.id !== "composition.create")
      return false;
    if (
      !state.clips.length &&
      required.includes("clipId") &&
      !["composition.insert", "media.insert"].includes(c.id)
    )
      return false;
    if (
      required.includes("layerId") &&
      !state.compositions.some(c => c.layers?.length) &&
      c.id !== "layer.add"
    )
      return false;
    return true;
  });
  const choices = [...catalog.map(c => c.id), "unsupported"];
  const id = (
    await inferMotion({
      signal,
      onProgress,
      system:
        "Escolha a operação que representa integralmente o pedido. Se o alvo ou a ação for ambíguo ou exigir outras operações, responda unsupported.",
      prompt: catalog.map(c => c.id + " = " + c.manual).join("\n") + "\nPedido: " + request,
      grammar: "root ::= " + choices.map(c => JSON.stringify(c)).join(" | "),
    })
  ).trim();
  const op = catalog.find(c => c.id === id);
  if (!op) throw Error("O modelo não encontrou uma operação inequívoca para este pedido.");
  const handles = new Map();
  const ref = value => {
    if (value == null) return null;
    if (!handles.has(value)) handles.set(value, "@" + (handles.size + 1));
    return handles.get(value);
  };
  const needs = key => Object.keys(op.params).some(k => k.replace("?", "") === key);
  const context = {};
  if (needs("compositionId") || needs("layerId") || needs("layerIds")) {
    context.compositions = state.compositions.map(c => ({
      id: ref(c.id),
      name: c.name,
      duration: c.duration,
      selected: c.id === state.context.compositionId,
      layers:
        needs("layerId") || needs("layerIds")
          ? c.layers?.map(l => [
              ref(l.id),
              l.name,
              l.text ?? l.type,
              l.id === state.context.layerId && c.id === state.context.compositionId,
            ])
          : undefined,
    }));
  }
  if (needs("clipId") || needs("clipIds") || needs("fromId"))
    context.clips = state.clips.map(c => [
      ref(c.id),
      c.name,
      c.start,
      c.trim,
      c.duration,
      c.id === state.context.clipId,
    ]);
  if (needs("trackId"))
    context.tracks = state.tracks.map(t => [
      ref(t.id),
      t.kind,
      t.clips.map(c => [ref(c.id), c.name, c.start]),
    ]);
  if (needs("asset") || needs("image")) context.assets = state.assets.map(a => [ref(a.ref), a.name, a.kind]);
  if (id === "transition.set") context.presets = session.options().transitions;
  if (id === "composition.create") context.templates = session.options().templates.map(t => [t.id, t.name]);
  if (needs("channel") && state.context.compositionId && state.context.layerId) {
    const l = session.inspect({
      compositionId: state.context.compositionId,
      layerId: state.context.layerId,
      time: state.context.time,
    }).layers[0];
    context.selectedKeys = l.keys;
  }
  const keys = Object.keys(op.params);
  const prompt =
    "Operation: " +
    op.id +
    " (" +
    op.manual +
    "). Return the ordered argument values for " +
    keys.map(k => k + " (" + op.params[k] + ")").join(", ") +
    ". Context: " +
    JSON.stringify(context) +
    "\nUser request: " +
    request;
  if (prompt.length > 6500)
    throw Error("O projeto excede o contexto do modelo local. Use uma edição por alvo no catálogo.");
  const references = [...handles.values()];
  const literals = Array.from(request.matchAll(/["“‘«']([^"”’»']+)["”’»']/gu), m => m[1]);
  const slots = keys.map(k => {
    const bare = k.replace("?", "");
    let rule = "value";
    const creates =
      (op.id === "composition.create" && bare === "compositionId") ||
      (op.id === "layer.add" && bare === "layerId") ||
      (op.id === "track.add" && bare === "trackId") ||
      (["composition.insert", "media.insert"].includes(op.id) && bare === "clipId");
    if (
      ["compositionId", "clipId", "layerId", "trackId", "fromId", "image", "asset"].includes(bare) &&
      !creates &&
      references.length
    )
      rule = "(" + references.map(ref => JSON.stringify(JSON.stringify(ref))).join(" | ") + ")";
    else if (["name", "text", "title"].includes(bare) && literals.length)
      rule = "(" + literals.map(v => JSON.stringify(JSON.stringify(v))).join(" | ") + ")";
    else if (
      [
        "name",
        "newId",
        "text",
        "voice",
        "model",
        "color",
        "type",
        "kind",
        "channel",
        "panel",
        "language",
        "stockId",
      ].includes(bare) ||
      creates
    )
      rule = "string";
    else if (
      [
        "time",
        "duration",
        "delta",
        "start",
        "offset",
        "index",
        "volume",
        "frames",
        "zoom",
        "scrollLeft",
      ].includes(bare)
    )
      rule = "number";
    else if (
      ["enabled", "locked", "paired", "ripple", "curves", "snap", "mask", "speech", "realtime"].includes(bare)
    )
      rule = '("true" | "false")';
    return k.endsWith("?") || (op.id === "transition.set" && bare === "type")
      ? "(" + rule + ' | "null")'
      : rule;
  });
  const grammar = 'root ::= ws ("null" | "[" ws ' + slots.join(' ws "," ws ') + ' ws "]")\n' + jsonGrammar;
  const answer = await inferMotion({
    signal,
    onProgress,
    system:
      "Fill a JSON array of argument values, in the exact order specified. Use the literal requested name or text with no extra words. Use @ references for existing targets, null for omitted optional slots. If the request is ambiguous return null.",
    prompt,
    grammar,
  });
  const refs = new Map([...handles].map(([value, key]) => [key, value]));
  const values = JSON.parse(answer);
  if (!Array.isArray(values) || values.length !== keys.length)
    throw Error("O modelo não identificou os parâmetros.");
  const params = Object.fromEntries(
    keys.flatMap((k, i) => (k.endsWith("?") && values[i] === null ? [] : [[k.replace("?", ""), values[i]]]))
  );
  for (const key of ["compositionId", "layerId", "clipId", "fromId", "trackId", "asset", "image"]) {
    if (refs.has(params[key])) params[key] = refs.get(params[key]);
  }
  for (const key of ["clipIds", "layerIds"])
    if (Array.isArray(params[key])) params[key] = params[key].map(v => refs.get(v) ?? v);
  if (session.inspect().revision !== state.revision) throw Error("O projeto mudou durante a interpretação.");
  return { ...params, id: op.id };
}
