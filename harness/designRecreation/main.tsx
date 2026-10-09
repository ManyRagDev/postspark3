import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CanvasPostStage, type CanvasPostStageRef } from "@/pages/CanvasLab/components/CanvasPostStage";
import { materializeReferenceDiagnostic } from "@/pages/Admin/referenceSceneCompiler";
import { readRecipeFile, createTextAdaptation, fitRecipeText, prepareReference, finalizeRecipe } from "@/pages/Admin2/recipe";
import { ensureReferenceFontsLoaded } from "@/pages/CanvasLab/lib/referenceFonts";
import type { RecreationRecipe } from "@shared/designRecreation";
import "./style.css";

type Case = { id: string; title: string };
function App() {
  const [cases, setCases] = useState<Case[]>([]);
  const [analyzeSelected, setAnalyzeSelected] = useState(false);
  const [id, setId] = useState("brutalism");
  const [recipe, setRecipe] = useState<RecreationRecipe | null>(null);
  const [action, setAction] = useState("baseline");
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("Carregando…");
  const [busy, setBusy] = useState(true);
  const original = useRef<RecreationRecipe | null>(null);
  const stage = useRef<CanvasPostStageRef>(null);
  useEffect(() => { fetch("/evidence").then(r => r.json()).then(r => { setCases(r.cases); setAnalyzeSelected(r.analyzeSelected); void load(r.cases[0].id); }).catch(e => setStatus(String(e))); }, []);
  async function load(nextId: string) {
    setBusy(true); setId(nextId); setRecipe(null); original.current = null; setStatus("Conferindo JSON e fontes incorporadas…");
    try {
      const response = await fetch(`/evidence/${nextId}/recipe`);
      if (!response.ok) { setStatus("Imagem selecionada. Pronta para decodificar."); return; }
      const text = await response.text();
      const next = await readRecipeFile(new File([text], "recipe.json", { type: "application/json" }));
      await ensureReferenceFontsLoaded(next.scene);
      original.current = next; setId(nextId); setRecipe(next); setAction("baseline"); setRevision(v => v + 1);
      setStatus("Receita pronta; nenhuma chamada de IA.");
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  }
  async function analyze() {
    setBusy(true); setStatus("Preparando imagem e enviando ao modelo…");
    try {
      const blob = await (await fetch(`/evidence/${id}/image`)).blob();
      const source = await prepareReference(new File([blob], `${id}.jpg`, { type: "image/jpeg" }));
      const response = await fetch(`/evidence/${id}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrl: source.dataUrl, originalHash: source.originalHash }) });
      if (!response.ok) throw new Error(await response.text());
      const raw: RecreationRecipe = await response.json();
      setStatus("Modelo respondeu. Incorporando fontes e ajustando texto…");
      let next = raw;
      try { next = await finalizeRecipe(raw); }
      catch (e) { next = { ...raw, notes: [...raw.notes, `Preparação incompleta: ${String(e).slice(0, 350)}`] }; }
      const saved = await fetch(`/evidence/${id}/prepared`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipe: next }) });
      if (!saved.ok) throw new Error(await saved.text());
      original.current = next; setRecipe(next); setAction("baseline"); setRevision(v => v + 1);
      setStatus(`Análise concluída: ${next.model}, ${next.provider}; ${next.scene.layers.length} camadas. Fontes: ${next.scene.fonts.filter(f => f.dataUrl).length}/${next.scene.fonts.length}.`);
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  }
  const post = useMemo(() => recipe ? materializeReferenceDiagnostic(recipe.scene) : null, [recipe]);
  async function reopen() {
    if (!recipe) return; setBusy(true);
    try {
      const next = await readRecipeFile(new File([JSON.stringify(recipe)], "reopened.json"));
      await ensureReferenceFontsLoaded(next.scene); setRecipe(next); setAction("reopened"); setRevision(v => v + 1);
      setStatus("JSON exportado e relido; fonte e geometria preservadas.");
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  }
  function adapt() {
    const base = original.current; if (!base) return;
    const layer = base.scene.layers.find(l => l.text === "TRUTH");
    if (!layer) return;
    const next = fitRecipeText(createTextAdaptation(base, { [layer.id]: { text: "CRIATIVIDADE", family: layer.fontFamily!, weight: layer.fontWeight } }));
    setRecipe(next); setAction("adapted"); setRevision(v => v + 1);
    setStatus("TRUTH → CRIATIVIDADE; encaixe com as mesmas fontes incorporadas, sem IA nem downloads.");
  }
  async function save() {
    if (!recipe || !stage.current) return; setBusy(true);
    try {
      const png = stage.current.exportPng4K();
      const metrics = { renderer: recipe.scene.rendererVersion, layers: recipe.scene.layers.length, missingElements: recipe.missingElements, notes: recipe.notes, fonts: recipe.scene.fonts.map(f => ({ family: f.family, weight: f.weight, sha256: f.sha256, embedded: Boolean(f.dataUrl) })), jsonUnchanged: JSON.stringify(recipe) === JSON.stringify(original.current) };
      const response = await fetch(`/evidence/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ png, recipe, metrics }) });
      if (!response.ok) throw new Error(await response.text());
      const saved = await response.json();
      setStatus(`Salvo: ${id}-${action}.png (${saved.width}×${saved.height}); SHA-256 ${saved.pngSha256}`);
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  }
  const width = 340;
  return <main><h1>Ensaio Admin2 · {analyzeSelected ? "novas análises" : "receitas salvas"}</h1><p>CanvasPostStage real · escala igual · fontes incorporadas</p>
    <nav>{cases.map(c => <button key={c.id} disabled={busy} onClick={() => load(c.id)}>{c.title}</button>)}{analyzeSelected && <button disabled={busy || Boolean(recipe)} onClick={analyze}>Decodificar selecionada</button>}<button disabled={busy || !recipe} onClick={reopen}>Reabrir JSON</button>{!analyzeSelected && <button disabled={busy || id !== "creative"} onClick={adapt}>Trocar TRUTH por CRIATIVIDADE</button>}<button disabled={busy || !recipe} onClick={save}>Salvar evidência</button></nav>
    <div role="status">{status}</div>
    {recipe && post && <><section className="comparison"><article><h2>Referência</h2><img src={`/evidence/${id}/image`} style={{ width }} /></article><article><h2>Receita · {action}</h2><div style={{ width, height: width * recipe.scene.source.heightPx / recipe.scene.source.widthPx }}><CanvasPostStage key={revision} ref={stage} post={post} diagnosticScene={recipe.scene} diagnosticTextMode="fixed-lines" diagnosticLayerStyles={recipe.adaptation?.layerStyles} diagnosticNeutralFrame zoom={width / 360} isReadOnly /></div></article></section><details><summary>Dados do ensaio</summary><pre>{JSON.stringify({ missing: recipe.missingElements, notes: recipe.notes }, null, 2)}</pre></details></>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
