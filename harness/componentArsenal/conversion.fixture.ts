import { readFileSync } from "node:fs";
import { RecipeBuilder } from "../designBatch/builder";
import { sha256, type SourceRecord } from "./inventory";
import type { ReferenceFontAsset } from "../../shared/referenceReconstruction";

export function conversionFixture() {
  const bytes = readFileSync("client/public/arsenal/fonts/8909904ab6c872eb994093482a88a28eca2cd95912d7b6fecd72103b0dc07edc.woff2");
  const font: ReferenceFontAsset = { family: "Inter", weight: 400, mimeType: "font/woff2", sha256: sha256(bytes), dataUrl: `data:font/woff2;base64,${bytes.toString("base64")}`, sourceUrl: null, license: "open-source" };
  const builder = new RecipeBuilder({ id: "why-conversion-fixture", title: "Pergunta editorial", width: 736, height: 920, background: "#FFFFFF", notes: ["Lista permite de um a três itens; corpo e geometria permanecem fixos.", "Grade pontilhada omitida; círculo mantido em vetor."] }, new Map([["Inter:400", font]]));
  const fields = [
    ["indice", ["01"]], ["titulo-abertura", ["Uma ideia"]], ["titulo-enfase", ["clara"]],
    ["titulo-pergunta", ["muda tudo?"]], ["abertura", ["Observe o contexto."]],
    ["corpo-1", ["Primeira linha de apoio", "Segunda linha de apoio"]],
    ["corpo-2", ["Outro apoio útil", "Com uma segunda linha"]],
    ["beneficios", ["- Primeiro benefício", "- Segundo benefício", "- Terceiro benefício"]],
    ["citacao", ["Uma frase", "em duas linhas"]],
  ] as const;
  let y = 20;
  builder.group("content", "Conteúdo", { x: 0, y: 0, rotationDeg: 0 }, b => {
    for (const [id, lines] of fields) {
      const ids = lines.map((text, index) => {
        const layerId = id === "beneficios" ? `lista-${index + 1}` : index ? `${id}-line-${index + 1}` : id;
        b.text(layerId, { text, fontFamily: "Inter", fontWeight: 400, fontSize: 24, x: 30, y, width: 650, height: 30, fill: "#111111", lineHeight: 1 });
        y += 40;
        return layerId;
      });
      b.field({ id, layerIds: ids, prefix: id === "beneficios" ? "- " : "" });
    }
  });
  const recipe = builder.build();
  recipe.missingElements = [{ description: "Grade pontilhada", reason: "Textura não reconstruída", box: null, role: "texture", essential: false }];
  const record: SourceRecord = { id: "reference:why:original", referenceId: "6da56cf3eb349b1ef42ab98eaf610f05", category: "reference", title: recipe.title, manifestPath: "fixture", recipePath: "fixture.json", previewPath: "fixture.png", fileHash: sha256(JSON.stringify(recipe)), declaredHash: null, sourceApproval: "pending", sourceFormat: "4:5", destination: "composition" };
  return { recipe, record };
}
