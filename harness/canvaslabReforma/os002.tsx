import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Konva from "konva";
import CanvasLabPage from "../../client/src/pages/CanvasLab/CanvasLabPage";
import { INITIAL_POST, type CanvasPostModel } from "../../client/src/pages/CanvasLab/components/types";
import { createArsenalFixtureComposition } from "../../client/src/pages/CanvasLab/lib/arsenalFixture";
import {
  addArsenalAuthorialLayer,
  overrideArsenalElement,
  resolveArsenalComposition,
} from "../../client/src/pages/CanvasLab/lib/arsenalComposition";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "../../client/src/pages/CanvasLab/lib/saveAdapter";
import { readArsenalComposition } from "@shared/designArsenal";

const DUMMY_IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function isNegativeScenario(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.search.includes("scenario=missing-required-font");
}

function createAuthoredComposition(title: string, sub: string) {
  let comp = createArsenalFixtureComposition();

  // No percurso positivo, aplica override de fontes do sistema locais (Arial)
  // para que o Stage renderize sem requisições remotas de rede (técnica G-01).
  // No percurso negativo (--scenario=missing-required-font), mantém as fontes
  // remotas do manifesto para exercitar o bloqueio controlado de rede.
  if (!isNegativeScenario()) {
    for (const e of comp.elements.filter((e) => e.kind === "text")) {
      comp = overrideArsenalElement(comp, e.id, { fontAssetId: null, fontFamily: "Arial" });
    }
  }

  comp = addArsenalAuthorialLayer(comp, {
    id: "tx-auth-0",
    kind: "text",
    text: "Camada Autoral com Efeito",
    zIndex: 2,
    parentId: null,
    x: 40,
    y: 120,
    width: 280,
    height: 48,
    rotation: 0,
    opacity: 1,
    fontSize: 22,
    fill: "#ffffff",
    fontFamily: "Arial",
  });

  comp = addArsenalAuthorialLayer(comp, {
    id: "im-auth-0",
    kind: "image",
    url: DUMMY_IMAGE_URL,
    zIndex: 1,
    parentId: null,
    x: 20,
    y: 20,
    width: 60,
    height: 60,
    rotation: 0,
    opacity: 1,
  });

  if (comp.version === 3) {
    comp = {
      ...comp,
      effects: {
        ...comp.effects,
        "tx-auth-0": { effect: "shadow", color: "#000000", blur: 10, offset: { x: 2, y: 2 } },
      },
      richText: {
        ...comp.richText,
        "tx-auth-0": [
          { text: "Camada ", bold: true },
          { text: "Autoral com Efeito", italic: true },
        ],
      },
    };
    comp = resolveArsenalComposition(comp);
  }
  return comp;
}

function createBaseComposition() {
  let comp = createArsenalFixtureComposition();
  if (!isNegativeScenario()) {
    for (const e of comp.elements.filter((e) => e.kind === "text")) {
      comp = overrideArsenalElement(comp, e.id, { fontAssetId: null, fontFamily: "Arial" });
    }
  }
  return comp;
}

export function fixtureComposed(): CanvasPostModel {
  const p = structuredClone(INITIAL_POST);
  p.id = "audit-os002-composed";
  p.fontFamily = "Arial";
  p.subtextFontFamily = "Arial";
  p.caption = "Legenda OS-002 Composed";
  p.hashtags = ["#os002", "#canvaslab"];
  p.currentSlideIndex = 0;
  p.slides = [
    {
      id: "slide-0",
      step: "01",
      headline: "Café Especial Origem",
      subtext: "Grãos selecionados artesanais",
      composition: createAuthoredComposition("Café Especial Origem", "Grãos selecionados"),
    },
    {
      id: "slide-1",
      step: "02",
      headline: "Método de Preparo",
      subtext: "Temperatura e moagem ideais",
      composition: createBaseComposition(),
    },
    {
      id: "slide-2",
      step: "03",
      headline: "Finalização Perfeita",
      subtext: "Notas florais e encorpadas",
      composition: createBaseComposition(),
    },
  ];
  p.aspectRatio = p.slides[0].composition?.effectiveAspectRatio || "1:1";
  return p;
}

(window as any).audit = {
  Konva,
  saveCalls: [],
  canvasModelToSavePayload,
  savedPostToCanvasModel,
  readArsenalComposition,
  resolveArsenalComposition,
};

function App() {
  const [fixture, setFixture] = useState<{ key: number; post: CanvasPostModel }>({
    key: 0,
    post: fixtureComposed(),
  });

  (window as any).audit.openPost = (post: CanvasPostModel) => {
    setFixture((f) => ({ key: f.key + 1, post }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div id="fixture-controls" style={{ padding: "4px 8px", background: "#1c1d24", display: "flex", gap: "8px" }}>
        <button id="fixture-composed-btn" onClick={() => setFixture((f) => ({ key: f.key + 1, post: fixtureComposed() }))}>
          Fixture C
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CanvasLabPage
          key={fixture.key}
          initialPost={fixture.post}
          onSave={async (post) => {
            (window as any).audit.saveCalls.push(structuredClone(post));
            return true;
          }}
        />
      </div>
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
}
