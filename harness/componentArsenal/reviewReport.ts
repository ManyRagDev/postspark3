/** Read prepared artifacts and persist an explicit review destination for every original reference. */
import fs from "node:fs/promises";
import path from "node:path";
import type {ComponentPackage} from "./extract";

const output=path.resolve(process.argv[2]??"artifacts/component-arsenal/revision-6");
const inventory=JSON.parse(await fs.readFile(path.join(output,"inventory.json"),"utf8")),qa=JSON.parse(await fs.readFile(path.join(output,"checks.json"),"utf8"));
let md="# Destino das 24 referências originais\n\nTodas as fontes e aprovações históricas permanecem intactas. Há 22 referências gráficas em draft, uma referência fotográfica e um estudo tipográfico. Nenhuma possui nova aprovação humana fabricada. Componentização não corrige ausências registradas nas receitas. Fotos/slots exigem mídia futura; máscaras, texturas e aproximações continuam explícitas.\n\n";
for(const row of inventory.rows.filter((r:{category:string})=>r.category==="reference")){
  const p:ComponentPackage=JSON.parse(await fs.readFile(path.join(output,row.package),"utf8")),issues=qa.checks.filter((c:{id:string;state:string})=>c.id===row.id&&c.state==="needs_adjustment");
  md+=`## ${row.title}\n\n- Origem: \`${row.recipePath}\`; SHA-256 \`${row.fileHash}\`.\n- Destino: ${row.destination}; ${p.components.length} componentes draft; publicação/elegibilidade pendentes.\n- Geometria: ${issues.length?issues.map((c:{mode:string;issues:string[]})=>`${c.mode}: ${c.issues.join("; ")}`).join(" | "):"sem pendência neste ensaio específico; revisão visual continua obrigatória."}\n`;
  for(const e of p.sourceSnapshot.recipe.missingElements)md+=`- Limitação ${e.essential?"essencial":"visual"}: ${e.description} — ${e.reason}\n`;
  const corrections=p.assetFiles.filter(a=>a.adjustment);if(corrections.length)md+=`- Fontes: ${corrections.map(a=>`${a.sourceFamily}: ${a.adjustment}`).join(" | ")}\n`;
  const pairs=p.components.flatMap(c=>c.fragment.lineBoxOverlaps??[]);if(pairs.length)md+="- Caixas de linha: pares adjacentes explícitos admitem sobreposição pequena somente com mesma fonte de conteúdo, texto em uma linha e sem rotação. Novas quebras, expansão e overflows continuam auditados; isso não constitui aprovação.\n";
  md+="\n";
}
md+="## Famílias e formatos\n\nAs 14 famílias têm fontes concretas: 36 receitas clássicas preservadas e seis ports explícitos do renderer. Stroke Impact porta o comportamento real da fonte e tamanho; o renderer atual não aplica o stroke descrito pelo nome. Cinematic Depth porta moldura e tipografia reais sem inventar footer. Aprovação própria e comparação browser pendentes. Cada componente histórico5:6 tem derivação4:5 rastreável por projeção uniforme; a fonte local e seus limites ficam preservados.\n";
await fs.writeFile(path.join(output,"CORPUS_REVIEW.md"),md);
console.log(JSON.stringify({output,references:24,needsAdjustment:qa.needsAdjustment,previewBlocked:qa.previewBlocked,publication:"pending-human-review"}));
