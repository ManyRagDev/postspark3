# Lote offline de matrizes

`builder.ts` produz receitas V3 importáveis no Admin2 sem alterar código do produto.
Todas as coordenadas são pixels. Em `group()` são locais ao grupo; a receita salva
coordenadas globais resolvidas e membros locais consistentes. Elementos fora de grupos
permanecem estáticos. Não há grupos aninhados. `zIndex` padrão acompanha a ordem de criação.

```ts
import { RecipeBuilder, localFontPool } from "./builder";
const fonts = localFontPool(); // fontes já incorporadas em receitas locais; sem rede
const b = new RecipeBuilder({title: "Exemplo", width: 1200, height: 1500,
  background: "#E9B708", originalHash: "<SHA-256 da referência>"}, fonts);
b.group("title", "Título e tarja", {x: 100, y: 200, rotationDeg: -5}, b => {
  b.rect("surface", {x: 0, y: 0, width: 900, height: 180, fill: "#FFFFFF"});
  b.text("headline", {x: 30, y: 25, width: 840, height: 130,
    text: "Design com intenção", fontFamily: "Anton", fontWeight: 400,
    fontSize: 90, fill: "#222222", lineHeight: 1.15});
  b.field({id: "headline", label: "Título", layerIds: ["headline"], minScale: 0.7});
});
b.group("photo", "Área de foto", {x: 100, y: 500, rotationDeg: 0}, b => {
  b.rect("photo-slot", {x: 0, y: 0, width: 500, height: 700, fill: "#B8B8B8"});
  b.mediaSlot("photo", "photo-slot", "Foto principal");
});
const recipe = b.build(); // valida schema, incorpora somente fontes usadas
```

`rect`, `text`, `line`, `polygon` aceitam campos de `ReferenceSceneLayer`;
`cornerRadiusPx` é convertido para `adaptation.layerStyles`. `line`/`polygon` usam
pontos locais ao nó e exigem dimensões positivas (use 1px em linhas horizontais/verticais).
`field` deve ficar no grupo dono e após as camadas. Vários `layerIds` criam uma lista;
`prefix` (ex.: `"• "`) é vinculado aos itens e `baseFontSizes` é obtido das camadas.
Toda fonte e peso precisa existir em `localFontPool`; não há substituição silenciosa.

Diagnóstico PNG usa Konva com superfície nativa `@napi-rs/canvas` e `layoutRichText`
do produto. Ele não comprova o Stage React no navegador, a interação do editor nem
aprovação visual. Referências ficam somente no painel de comparação.

Execução:

```bash
node --import tsx harness/designBatch/run.ts
node --import tsx harness/designBatch/run.ts --resume
node --import tsx harness/designBatch/run.ts --force
node --import tsx harness/designBatch/run.ts --gallery-only
pnpm exec tsc --noEmit -p harness/designBatch/tsconfig.json
```

O diretório padrão é `artifacts/design-recreation/batch-2026-09-30` (primeiro argumento
opcional). `--resume` reutiliza checkpoints somente se hashes do harness, spec,
receita e arquivo original ainda correspondem. `--force` refaz o lote.
`--gallery-only` atualiza a galeria e integra `review/independent-review.json`
sem modificar receitas nem PNGs. O runner lê `inventory.json`, `specs/*.json` e
`recipes/*.json`, escreve PNG, variantes, checkpoints, `report.json`, `traces.json`,
`REPORT.md` e `index.html`. Specs são
regenerados na execução; `{reuse: "caminho.json"}` copia um artefato byte a byte.
`recipeFromSpec()` aceita coordenadas absolutas, `groupId`, `fieldId`, `mediaId`,
`fieldLabel`, `minScale` e `prefix`; a ordem de camadas define `zIndex`.

O runner usa o `compileMatrix()` de produção com FontFace simulado por registro nativo
da mesma fonte incorporada; `fetch` rejeita qualquer rede. Exercita troca de conteúdo,
redução limitada por campo, lista com itens ocultos, transformação do grupo, recusa de
overflow e de linhas excessivas, compilação no-op, imutabilidade e JSON→PNG roundtrip.
Campos ligados contendo múltiplas linhas são convertidos em lista de camadas, uma por
linha, com IDs determinísticos, geometria e rotação preservadas. Essa adaptação fica
registrada nas notas da receita. As recusas negativas precisam corresponder ao motivo
esperado; timeout, fonte ausente e falha de asserção não contam como sucesso. Todos os
casos obrigatórios alimentam o status final. Texto maior pode ser recusado por encaixe.
Para mídia cria
JPEG procedural distinto das referências, verifica hash/dimensões/crop no roundtrip e
pixels distintos ao mudar o recorte. O renderer nativo precisa decodificar imagens:
use `await renderRecipeAsync(recipe)` ou `await prepareRecipeMedia(recipe)` antes de
`renderRecipe(recipe)`. Fontes são reutilizadas somente de receitas locais existentes.

O arquivo histórico previamente aprovado mantém seus bytes e sua foto; a diferença
de largura subpixel medida em Node é registrada como aviso e não modifica aprovação.
A referência composta apenas por fotografia é identificada no relatório: não constitui
extração de matriz gráfica, embora possua legenda oculta para cumprir o contrato V3.

Para usar: abra `index.html`, compare os painéis, clique em **Baixar receita V3**,
importe no Admin2 e experimente os campos de texto e foto. Todos os relatórios mantêm
aprovação visual separada de sucesso técnico. `usage:0` é metadado da curadoria manual,
sem nova chamada a uma API externa pelo harness; não representa os custos dos agentes.
Compass não estava disponível no ambiente de ferramenta deste subagente; a leitura
dirigida dos contratos e módulos atuais fundamentou os helpers.
