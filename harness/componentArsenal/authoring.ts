import type { RecreationRecipe } from "../../shared/designRecreation";
import type { SourceRecord } from "./inventory";

export const AUTHORING_VERSION = "component-reference-authoring-v1";
type Role = "headline" | "body" | "eyebrow" | "sectionLabel" | "callToAction" | "label";
export type Unit = { role: Role; fields: string[] };
const u = (role: Role, fields: string): Unit => ({ role, fields: fields.split(" ") });
/** Authored per reference: field names alone do not establish semantic responsibility. */
export const REFERENCES: Record<string, Unit[]> = {
  "0196e78997cab5ec7a590ea1718a573f": [u("label","eco-copy"),u("sectionLabel","categoria-1"),u("sectionLabel","categoria-2"),u("sectionLabel","categoria-3"),u("headline","titulo"),u("body","apoio palavra-destaque")],
  "0623fb1c14937cd1e67e980b566710ba": [u("headline","titulo-linha-1 titulo-linha-2 titulo-linha-3 titulo-linha-4"),u("eyebrow","chamada-curta"),u("body","apoio"),u("callToAction","cta")],
  "0ee1f7691aaa5e28cfd0eb2c8a36cb23": [u("headline","chamada verdade sobre titulo-criativo titulo-pessoas"),u("callToAction","cta")],
  "14516d3436422c5c9d3a85e85b95b22a": [u("eyebrow","chamada"),u("headline","titulo-brutal titulo-ism"),u("body","subtitulo"),u("label","serie")],
  "19025ac85b33580e27126420174e7514": [u("headline","titulo"),u("body","descricao")],
  "1c2fb00a82a764bab2f4374d03f67886": [u("eyebrow","chamada"),u("headline","titulo"),u("sectionLabel","cabecalho"),u("body","lista"),u("callToAction","cta"),u("label","janela"),u("label","legenda")],
  "481adc75c3b7da8d267aeef293da71a6": [u("headline","linha-internet linha-trouxe linha-muita linha-coisa"),u("body","apoio")],
  "6da56cf3eb349b1ef42ab98eaf610f05": [u("label","indice"),u("headline","titulo-abertura titulo-enfase titulo-pergunta"),u("body","abertura corpo-1 corpo-2"),u("body","beneficios"),u("body","citacao")],
  "8ecb33ec8e977a91f88f21c4ea5b5271": [u("label","marca"),u("headline","titulo"),u("body","conversao apoio"),u("label","shop about blog"),u("sectionLabel","manifesto-loja"),u("sectionLabel","produto-nome"),u("label","produto-avaliacao"),u("body","produto-descricao"),u("label","preco"),u("callToAction","cta"),u("body","sem-gradientes bordas ruidoso"),u("label","endereco")],
  "94a676e076f6baa3074a34f6dd7d3858": [u("headline","pieces"),u("label","volume")],
  "94e0a100310160059384fb4c6ca5b2c4": [u("eyebrow","intro-one intro-bold intro-tail"),u("headline","shortcut for create content"),u("body","closing-before closing-bold closing-after")],
  "9679d55f99201e6b77de677b5d5ce161": [u("headline","headline"),u("eyebrow","aside-text"),u("body","explanation-copy"),u("body","questions"),u("body","takeaway-copy")],
  "Screenshot-2026-09-28-23:26:40": [u("headline","first second third"),u("body","support")],
  "Screenshot-2026-09-28-23:29:44": [u("headline","grid systems"),u("body","sub")],
  "b06f3275848efa40092a6fa9c2441763": [u("headline","premise different"),u("body","solution")],
  "c5d8dcc1ddabea113d4f4a5ea76cde0d": [u("eyebrow","motto"),u("headline","main-copy"),u("body","quote"),u("label","quote-source")],
  "cbb2b5fd83ed04a8bd24e7f049be0a01": [u("body","optional-caption")],
  "ce55b6d7148b388e91a9ff9e14d58df1": [u("label","brand-name brand-descriptor"),u("headline","marketing tagline"),u("sectionLabel","masthead paper-brand"),u("body","newspaper-points"),u("body","paper-support"),u("callToAction","paper-cta")],
  "ed6e7942b198ca4ef238d0818c913535": [u("headline","title"),u("body","reveal-text"),u("callToAction","footer")],
  "f0aea278d4b4be1a351ad73a5b715bab": [u("headline","intro accent connector title")],
  "f659cc876f6d0cce3745e91bf2ca5454": [u("headline","intro title"),u("body","left right")],
  "f65e1862777e3c9e201442396155f3fa": [u("headline","line1 line2 line3")],
  "fae145a59682736bc7033d7b60b4bb3c": [u("headline","seu nego cio nao"),u("body","ele parece")],
  "fonts": [u("headline","title"),u("body","column-0-0 column-0-1 column-1-0 column-1-1")],
};
const NATIVE_EXTRA: Record<string, Role> = { "cd-kicker":"eyebrow", "cd-sticker-rot":"label", "cd-scanline-tag":"label", "cd-stat":"label", "cd-attribution":"label" };
export function authorRecipe(record: SourceRecord, recipe: RecreationRecipe, explicitUnits?:Unit[]) {
  const matrix = recipe.matrix!;
  const units: Unit[] = explicitUnits ?? REFERENCES[record.referenceId] ?? matrix.fields.map(f => u(
    f.id === "title" || f.id === "headline" ? "headline" : f.id === "cta-copy" || f.id === "cta" ? "callToAction" : f.id === "eyebrow" ? "eyebrow" : NATIVE_EXTRA[f.id] ?? "body", f.id));
  const claimed = units.flatMap(unit => unit.fields), all = matrix.fields.map(f => f.id);
  if (new Set(claimed).size !== claimed.length || all.some(id => !claimed.includes(id)) || claimed.some(id => !all.includes(id)))
    throw new Error(`Autoria incompleta/divergente: ${record.referenceId}`);
  const ordinals: Partial<Record<Role, number>> = {};
  const authored = units.map(unit => {
    const index = ordinals[unit.role] ?? 0; ordinals[unit.role] = index + 1;
    const fields = unit.fields.map(id => matrix.fields.find(f => f.id === id)!);
    const layerIds = fields.flatMap(f => f.layerIds);
    const layers = layerIds.map(id => recipe.scene.layers.find(l => l.id === id)!);
    return { ...unit, source: `block:${unit.role}:${index}:text`, layerIds,
      weights: layers.map(l => Math.max(1, l.text?.trim().split(/\s+/).length ?? 1)),
      sampleText: layers.map(l => l.text ?? "").join(" "), minScale: Math.min(...fields.map(f => f.minScale)),
      required: unit.role === "headline" };
  });
  const covered = new Set(authored.flatMap(unit => unit.layerIds));
  // Unbound decorative glyphs stay explicit ornament; every other text is authored, never silently copied.
  for (const layer of recipe.scene.layers) if (layer.kind === "text" && layer.text?.trim() && !covered.has(layer.id) && !/^[×✕✖+•●■□▶►→←↗↘↑↓xX"“”‘’]+$/.test(layer.text.trim())) {
    const index = ordinals.label ?? 0; ordinals.label = index + 1;
    authored.push({role:"label",fields:[],source:`block:label:${index}:text`,layerIds:[layer.id],weights:[1],sampleText:layer.text,minScale:.7,required:false});
  }
  return authored;
}
