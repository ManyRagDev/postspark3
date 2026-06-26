# Plano de Acao - Simplificacao do Workbench Pos-Auditoria

Base: `docs/workbench-audit.md` + inspecao do codigo atual.

Objetivo: reduzir duplicidade e ambiguidade nos controles do Workbench sem
quebrar editor, snapshot, drag/resize, exportacao, salvamento ou carrossel.

Este plano e normativo para implementacao. Onde houver divergencia entre este
plano e a auditoria original, este plano prevalece porque foi ajustado contra o
codigo atual.

---

## Status de Execucao

Convencao: cada sub-fase so e marcada `[x]` depois do gate verificado e de um
commit isolado daquela fase. "Estado atual" aponta a proxima fase a executar.
Um agente novo retoma lendo esta secao + `git log`.

- [x] Fase 1.1 - Remover `RightPanel`
- [x] Fase 1.2 - Clarificar `CaptionBlock`
- [x] Fase 1.3 - Adicionar controle de `blendMode`
- [x] Fase 2.1 - Consolidar fonte em `FontColorBlock`
- [x] Fase 2.2 - Escrita canonica de acento (`designTokens.colors.primary`)
- [x] Fase 2.3 - Consolidar alinhamento em `FontColorBlock`
- [x] Fase 3.1 - Cores globais vs overrides
- [x] Fase 4.1 - Validar `customFontUrl` (codigo cabeado confirmado; validacao de rede ao vivo pendente p/ Fase 5.2)
- [x] Fase 4.2 - Orientar layout split
- [x] Fase 5 - Validacao final e documentacao

Estado atual: **Concluido**. `tsc --noEmit` limpo; `vitest run` 240/240 verdes
(inclui `variationSnapshot` e `postsparkSchemas`). DOCUMENTO_MESTRE atualizado
(secao 40). Pendencia: validacao manual/browser do `customFontUrl` (Fase 5.2).

---

## 0. Contexto e Motivo

Este plano existe porque a auditoria do Workbench identificou excesso de
comandos, controles duplicados e areas de UI com semantica ambigua. O problema
principal nao e falta de capacidade do editor; e a dificuldade de entender onde
cada tipo de ajuste deve ser feito.

Sintomas que motivaram o plano:

1. A sidebar esquerda mistura conteudo, design, layout e metadados em blocos que
   se sobrepoem.
2. Existem controles diferentes alterando campos iguais ou equivalentes, como
   fonte, alinhamento, proporcao e cor de acento.
3. Alguns comandos parecem mortos ou incompletos, como o `RightPanel` com
   `V2 Actions`.
4. Alguns campos funcionais, como `caption`, `hashtags` e `callToAction`, sao
   editaveis mas nao aparecem no card, o que cria expectativa visual errada.
5. A manutencao recente do Workbench tornou o motor de edicao sensivel; por isso
   a simplificacao de menus deve evitar mexer em snapshot, renderer passivo,
   geometria e persistencia.

Resultado esperado:

- O usuario entende qual painel controla cada tipo de coisa.
- Cada acao primaria aparece em um unico lugar canonico.
- Controles contextuais continuam uteis para edicao rapida.
- O Workbench permanece funcional e compativel com posts existentes.

---

## 1. Instrucoes para o Agente Implementador

Use este plano como contrato de execucao. Nao implemente por interpretacao livre
se uma regra abaixo proibir a mudanca.

Antes de editar:

1. Leia `DOCUMENTO_MESTRE.md`.
2. Leia `docs/workbench-audit.md`.
3. Leia os arquivos da fase atual antes de alterar.
4. Confirme se o codigo ainda corresponde ao fato descrito neste plano. Se nao
   corresponder, registre a divergencia e ajuste a abordagem minimamente.

Durante a implementacao:

1. Trabalhe uma fase por vez, na ordem recomendada.
2. Nao misture refactors esteticos ou estruturais fora do escopo.
3. Prefira remover duplicidade de UI sem alterar contratos de dados.
4. Preserve nomes de campos e fallbacks de leitura para compatibilidade.
5. Nao "consertar" problemas descobertos fora do escopo sem registrar e separar
   em fase propria.
6. Atualize `DOCUMENTO_MESTRE.md` somente depois de uma mudanca funcional,
   estrutural ou contratual realmente implementada.

Ao terminar cada fase:

1. Rode verificacoes possiveis.
2. Registre bloqueios preexistentes separadamente.
3. Confirme gates da fase.
4. Nao avance para fases sensiveis se a fase anterior quebrou edicao, snapshot,
   exportacao ou undo/redo.

---

## 2. Invariantes de Implementacao

Antes de qualquer mudanca:

1. Nao alterar o contrato de `PostVisualSnapshot`.
2. Nao criar novo normalizador visual.
3. Nao alterar `variationSnapshot.ts` salvo se um teste provar necessidade.
4. Nao alterar o motor de interacao (`CanvasInteractionProvider`,
   `InteractionOverlay`, `DraggableBlock`, adapters de geometria) para resolver
   problemas de menu.
5. Nao remover campos de dominio: `caption`, `hashtags`, `callToAction`,
   `headlineColor`, `bodyColor`, `accentColor`, `headlineFontFamily` e
   `bodyFontFamily` devem continuar legiveis para compatibilidade.
6. Toda escrita de UI deve continuar passando por `editorStore` e gerar
   `visualSnapshot` atualizado pelo fluxo existente.
7. Preservar comportamento de:
   - drag e resize;
   - undo/redo;
   - exportacao PNG;
   - save/load;
   - carrossel com `applyScope=current/all`;
   - mobile sheet.

---

## 3. Fronteira Funcional Canonica

Esta e a decisao central para evitar novas duplicidades.

### Texto

Dono de conteudo e ajustes textuais diretos:

- titulo/headline;
- corpo/body;
- badge/sticker;
- escala de titulo e corpo;
- fonte de titulo/corpo/global;
- cores especificas de titulo/corpo quando expostas;
- metadados de publicacao, desde que claramente separados.

### Design

Dono de identidade visual global:

- paleta global;
- cor primaria/acento;
- cor base de texto;
- fundo/card;
- estrutura visual;
- borda/sombra/cantos;
- decoracoes;
- URL de fonte customizada global.

### Midia

Dono de fundo e assets visuais:

- nenhum/IA/galeria/cor/upload como background;
- overlay do background;
- zoom/pan/filtros;
- blend mode do overlay/background.

### Layout

Dono de formato e geometria:

- plataforma;
- aspect ratio;
- preset de composicao;
- posicao e largura de layers;
- padding/respiro;
- split image position.

### Canvas

Dono de interacao direta:

- selecao;
- drag;
- resize;
- imagem livre;
- snap/magnet;
- controles de carrossel.

---

## 4. Fase 1 - Limpeza Segura e Baixo Risco

### 1.1 Remover `RightPanel`

Problema confirmado:

- `RightPanel` duplica o controle de `aspectRatio` ja existente em
  `PlatformBlock`.
- A secao `+ (V2 Actions)` e visivel, mas desabilitada com
  `opacity-40 pointer-events-none`.

Acao:

- Remover a funcao `RightPanel` de `WorkbenchV2.tsx`.
- Remover o render `{!isMobile && <RightPanel ... />}`.
- Manter `PlatformBlock` como unico controle de plataforma/proporcao.
- Ajustar o layout central para nao reservar largura do painel direito.
- Remover apenas `DESKTOP_ACCOUNT_SAFE_HEIGHT` e a prop `topClearance`, pois
  eles existem para o `RightPanel`.
- Manter `DESKTOP_ACCOUNT_SAFE_WIDTH`, pois ele ainda reserva espaco no
  `paddingRight` do header para o badge fixo de conta/Sparks no topo-direito.

Arquivos:

- `client/src/components/views/WorkbenchV2/WorkbenchV2.tsx`

Nao fazer:

- Nao alterar `PlatformBlock`.
- Nao alterar `setAspectRatio`.
- Nao alterar snapshot por formato.
- Nao remover `DESKTOP_ACCOUNT_SAFE_WIDTH` nem `desktopHeaderPaddingRight`.

Gate:

- Sem referencias restantes a `RightPanel`.
- Sem secao `V2 Actions` na UI.
- Troca 1:1 / 5:6 / 9:16 continua funcionando pelo `PlatformBlock`.
- Workbench desktop continua centralizando o canvas corretamente sem painel
  direito.
- Header desktop continua reservando espaco para badge de conta/Sparks no
  topo-direito.

---

### 1.2 Clarificar `CaptionBlock`

Problema confirmado:

- `headline` e `body` aparecem no card.
- `callToAction`, `caption` e `hashtags` sao metadados de publicacao e nao
  aparecem no card visual.
- A UI atual mistura esses campos no mesmo bloco, gerando expectativa errada.

Acao:

- Em `CaptionBlock`, separar visualmente:
  - "Conteudo do card": titulo e corpo.
  - "Metadados de publicacao": CTA, legenda, preview e hashtags.
- Manter todos os campos.
- Ajustar labels para deixar claro que legenda/hashtags nao alteram o design do
  card.

Arquivos:

- `client/src/components/views/WorkbenchV2/blocks/CaptionBlock.tsx`

Nao fazer:

- Nao remover `callToAction`, `caption` ou `hashtags`.
- Nao renderizar esses campos no card.
- Nao alterar persistencia.

Gate:

- Usuario consegue distinguir edicao visual de metadados.
- Campos continuam salvando no mesmo fluxo.
- Nenhum campo de caption/publicacao passa a ser renderizado no card.

---

### 1.3 Adicionar controle de `blendMode`

Problema confirmado:

- `imageSettings.blendMode` existe no contrato.
- `PostCardV2` le `imageSettings.blendMode`.
- `ImageBlock` nao expoe controle para alterar esse campo.

Acao:

- Adicionar controle na area de sobreposicao/filtros do `ImageBlock`.
- Opcoes minimas:
  - `normal`
  - `multiply`
  - `screen`
  - `overlay`
  - `darken`
  - `lighten`
- Escrever via `updateImageSettings({ blendMode })`.
- Mostrar apenas quando houver background com imagem, junto dos demais
  controles de overlay/filtro.
- Usar `client/src/components/tabs/ImageTab.tsx` como referencia funcional para
  lista de opcoes, estilo de controle e intencao de escrita. Adaptar o padrao
  legado `onUpdateImageSetting('blendMode', ...)` para o fluxo atual do
  WorkbenchV2 com `updateImageSettings({ blendMode })`.

Arquivos:

- `client/src/components/views/WorkbenchV2/blocks/ImageBlock.tsx`

Nao fazer:

- Nao mover `blendMode` para `bgOverlay` nesta fase.
- Nao alterar `PostCardV2` salvo se tipagem exigir.

Gate:

- Alterar blend mode muda a composicao visual do overlay/background.
- Undo/redo continua registrando a mudanca.
- Exportacao reflete o blend mode.
- Posts sem imagem de fundo nao exibem controle irrelevante de blend mode.

---

## 5. Fase 2 - Consolidacao Texto vs Design

Esta fase deve ser implementada depois da Fase 1. Ela e a mais sensivel porque
mexe na fronteira entre controles globais e controles contextuais.

### 2.1 Fonte: manter controle contextual em Texto, remover duplicidade global

Fato atual:

- `FontColorBlock` expoe `FontDropdown` e escreve:
  - `headlineFontFamily` quando alvo e titulo;
  - `bodyFontFamily` quando alvo e corpo;
  - `designTokens.typography.fontFamily` quando alvo e global.
- `ChameleonPanel` tambem expoe `FontDropdown` e possui comportamento
  contextual por `activeTarget`.
- Nao existe seletor de escopo visivel no `FontColorBlock`.
- `FONT_SCOPES` esta declarado em `FontColorBlock`, mas nao e renderizado.
- O escopo real de fonte vem de `layoutTarget`: no contexto global a troca
  edita ambos/global; para editar somente titulo ou corpo o usuario precisa
  selecionar o elemento correspondente no canvas.
- Hoje o `FontDropdown` do `ChameleonPanel` limpa
  `designTokens.typography.customFontUrl` ao trocar a fonte global. Essa
  limpeza e necessaria porque `getActiveFontInfo` prioriza `customFontUrl`
  valido sobre a familia escolhida.

Decisao:

- Fonte e uma acao primaria de texto. O controle principal deve ficar em
  `FontColorBlock`.
- `ChameleonPanel` nao deve duplicar `FontDropdown`.

Acao:

- Remover `FontDropdown` de `ChameleonPanel`.
- Manter no `ChameleonPanel` apenas:
  - `customFontUrl`, se mantido como fonte customizada global;
  - `textTransform`;
  - controles de estrutura, paleta e decoracao.
- Manter `FontDropdown` em `FontColorBlock`.
- Remover `FONT_SCOPES` se continuar sem uso.
- Se for necessario comunicar contexto, usar apenas um indicador derivado do
  `layoutTarget` atual, como "Global", "Titulo" ou "Corpo"; nao criar novo
  toggle de escopo nesta fase.
- No ramo global de `handleFontChange`, limpar
  `designTokens.typography.customFontUrl` ao trocar `fontFamily`, replicando a
  protecao que hoje existe no `ChameleonPanel`.

Arquivos:

- `client/src/components/ChameleonPanel.tsx`
- `client/src/components/views/WorkbenchV2/blocks/FontColorBlock.tsx`

Nao fazer:

- Nao remover `headlineFontFamily` ou `bodyFontFamily`.
- Nao remover `designTokens.typography.fontFamily`.
- Nao alterar `useDynamicFont`.
- Nao criar seletor visivel de escopo titulo/corpo/global nesta fase.

Gate:

- Existe apenas um seletor de familia tipografica visivel no Workbench desktop
  para o mesmo contexto.
- A busca por `FontDropdown` mostra uso no Workbench apenas via
  `FontColorBlock` ou componentes externos nao relacionados ao Workbench.
- Alterar fonte de titulo nao altera corpo; este gate deve ser testado
  selecionando o elemento de titulo no canvas, nao por toggle inexistente.
- Alterar fonte de corpo nao altera titulo; este gate deve ser testado
  selecionando o elemento de corpo no canvas, nao por toggle inexistente.
- Alterar fonte global limpa overrides quando esse for o comportamento atual
  esperado.
- Com `customFontUrl` setado, trocar fonte global no `FontColorBlock` tem
  efeito visual porque a URL customizada foi limpa no mesmo patch.

---

### 2.2 Cor primaria/acento: `designTokens.colors.primary` como escrita canonica

Fato atual:

- `editorStore.normalizeVariationPatch` ja deriva `accentColor` de
  `newFields.designTokens.colors.primary`.
- O problema restante e UI escrevendo `accentColor` diretamente junto com tokens.
- Por §26 do `DOCUMENTO_MESTRE.md`, `accentColor` top-level tem prioridade de
  leitura sobre `designTokens.colors.primary` (via
  `applyAspectRatioToVariation`). A escrita apenas em `primary` e segura porque
  `normalizeVariationPatch` re-deriva `accentColor` no mesmo patch (caminho
  `updateVariation` -> `setWithSnapshot` -> `applyVariationUpdate`), mantendo
  top-level e tokens coerentes. Nao "corrigir" essa derivacao: ela e o mecanismo
  que sustenta a canonicidade.

Decisao:

- Para novas escritas de UI, `designTokens.colors.primary` e a fonte canonica.
- `accentColor` permanece como campo derivado/compatibilidade.

Acao:

- Em `FontColorBlock`, alterar o controle "Destaque" para escrever apenas:
  `designTokens.colors.primary`.
- Nao enviar `accentColor` no patch manualmente.
- Confirmar que `normalizeVariationPatch` continua derivando `accentColor`.
- Em `ChameleonPanel`, ao editar "Primaria", manter escrita em
  `designTokens.colors.primary`; o store deve derivar `accentColor`.

Arquivos:

- `client/src/components/views/WorkbenchV2/blocks/FontColorBlock.tsx`
- `client/src/store/editorStore.ts` somente para teste/confirmacao; sem mudanca
  se a derivacao atual estiver correta.

Nao fazer:

- Nao remover leitura de `accentColor` em renderers.
- Nao migrar dados antigos.

Gate:

- Mudar "Destaque"/"Primaria" atualiza:
  - barras/acento;
  - badge/sticker quando usam primaria;
  - botao Exportar/controles que leem `activeVariation.accentColor`.
- `FontColorBlock` nao envia `accentColor` diretamente no mesmo patch do
  controle de acento.

---

### 2.3 Alinhamento textual: um unico controle por contexto

Problema confirmado:

- `FontColorBlock` e `ChameleonPanel` editam `designTokens.typography.textAlign`.

Decisao:

- Alinhamento de texto e ajuste textual direto. Deve ficar em `FontColorBlock`.
- `ChameleonPanel` nao deve expor controle duplicado de alinhamento.

Acao:

- Remover o select de alinhamento de `ChameleonPanel`.
- Manter toggle de alinhamento em `FontColorBlock`.
- Garantir que o toggle continue escrevendo em
  `designTokens.typography.textAlign`.

Arquivos:

- `client/src/components/ChameleonPanel.tsx`
- `client/src/components/views/WorkbenchV2/blocks/FontColorBlock.tsx`

Nao fazer:

- Nao alterar `layoutSettings[layer].textAlign`; isso pertence ao `LayoutBlock`
  e e outro conceito: alinhamento/posicionamento do layer.

Gate:

- Nao ha dois controles globais editando `designTokens.typography.textAlign`.
- Alinhamento visual do texto continua funcionando.
- `LayoutBlock` continua podendo alterar `layoutSettings[layer].textAlign` sem
  conflito conceitual com alinhamento tipografico.

---

## 6. Fase 3 - Ambiguidade de Cores de Texto

Esta fase exige cuidado porque remover `headlineColor` e `bodyColor` da UI reduz
controle fino. A implementacao deve preservar poder de edicao, mas evitar
duplicidade confusa.

### 3.1 Reclassificar cores de texto

Fato atual:

- `designTokens.colors.text` e cor base global.
- `headlineColor` e `bodyColor` sao overrides especificos.
- `PostCardV2` usa `headlineColor || textColor` e `bodyColor || textColor`.

Decisao:

- Manter `designTokens.colors.text` como "Texto global".
- Manter `headlineColor` e `bodyColor` como "Overrides de titulo/corpo" apenas
  no bloco de texto, com label explicito.

Acao:

- No `ChameleonPanel`, manter `Texto` como cor global base.
- No `FontColorBlock`, renomear controles:
  - "Titulo" -> "Titulo (override)"
  - "Corpo" -> "Corpo (override)"
- Adicionar acao pequena de reset para cada override, se ja houver padrao local
  facil:
  - limpar `headlineColor`;
  - limpar `bodyColor`;
  - fallback volta para `textColor`.
- Se reset exigir muito churn, deixar para fase posterior, mas manter labels
  explicitos.

Arquivos:

- `client/src/components/views/WorkbenchV2/blocks/FontColorBlock.tsx`
- `client/src/components/ChameleonPanel.tsx`

Nao fazer:

- Nao remover `headlineColor` e `bodyColor` do contrato.
- Nao remover fallback em `PostCardV2`.
- Nao mudar persistencia.

Gate:

- Usuario entende que `Texto` e global e `Titulo/Corpo` sao overrides.
- Alterar cor global afeta elementos sem override.
- Alterar override afeta somente titulo/corpo correspondente.
- Posts antigos com `headlineColor`/`bodyColor` continuam renderizando como
  antes.

---

## 7. Fase 4 - Lacunas Menores e Comunicacao Contextual

### 4.1 `customFontUrl`: validar, nao reimplementar

Fato atual:

- `useDynamicFont(fontFamily, customFontUrl)` ja existe.
- `getActiveFontInfo` prioriza `customFontUrl` quando contem
  `fonts.googleapis.com`.
- `loadFont` cria `<link rel="stylesheet">`.

Acao:

- Nao reimplementar carregamento.
- Validar manualmente:
  - colar URL Google Fonts valida;
  - fonte aparece no card;
  - exportacao usa a fonte apos `document.fonts.ready`.
- Se falhar, abrir correcao especifica baseada no sintoma.
- Se funcionar, atualizar label do input para "Fonte global via Google Fonts".

Arquivos:

- `client/src/components/ChameleonPanel.tsx`
- `client/src/hooks/useDynamicFont.ts`
- `client/src/lib/fonts.ts`

Nao fazer:

- Nao esconder o input sem testar.
- Nao trocar `<link>` por `@import` sem necessidade.

Gate:

- Uma URL valida do Google Fonts carrega e altera o render.
- Se a validacao nao puder ser executada por falta de rede, registrar como
  pendencia; nao remover a funcionalidade por ausencia de teste.

---

### 4.2 Melhorar visibilidade do `splitImagePosition`

Problema:

- O toggle de posicao da imagem so aparece quando o layout e `split`.
- Usuario pode nao saber por que o controle sumiu.

Acao:

- No `LayoutBlock`, quando layout nao for `split`, mostrar texto curto no local
  do controle:
  "Use o layout Bipartido para escolher imagem em cima ou embaixo."
- Nao tornar o controle clicavel fora do layout split.

Arquivos:

- `client/src/components/views/WorkbenchV2/blocks/LayoutBlock.tsx`

Gate:

- Usuario recebe orientacao sem adicionar novo comando.
- Ao selecionar layout bipartido, o toggle real continua aparecendo e
  funcionando.

---

## 8. Fase 5 - Validacao Obrigatoria

### 5.1 Testes automatizados

Rodar, no minimo:

- `npm run check`
- `npm test -- variationSnapshot`
- `npm test -- postsparkSchemas` (obrigatorio em refatoracoes do fluxo visual
  por §27 do `DOCUMENTO_MESTRE.md`; valida o contrato persistivel)
- testes focados que existirem para:
  - `editorStore`
  - `layoutPositionAdapter`
  - `blockInteraction`
  - `firstDrag.dom`

Se `npm run check` falhar por dependencia preexistente, registrar exatamente o
erro e rodar testes focados que nao dependam disso.

### 5.2 Validacao manual/browser

Fluxos obrigatorios:

1. Abrir post no Workbench.
2. Editar fonte global.
3. Editar fonte de titulo.
4. Editar fonte de corpo.
5. Editar cor primaria/acento.
6. Editar cor global de texto.
7. Editar override de titulo/corpo.
8. Trocar layout e aspect ratio.
9. Testar imagem de fundo:
   - galeria;
   - upload;
   - IA se ambiente permitir;
   - blend mode.
10. Testar undo/redo apos cada categoria de mudanca.
11. Salvar e reabrir.
12. Exportar PNG e verificar:
   - dimensao esperada;
   - sem controles/overlays;
   - visual proximo ao Workbench.
13. Testar mobile sheet basico:
   - abrir tabs;
   - editar texto;
   - trocar layout/proporcao.

### 5.3 Documentacao

Atualizar `DOCUMENTO_MESTRE.md` quando a implementacao terminar:

- remover duplicidade do painel direito;
- registrar fronteira Texto/Design/Midia/Layout/Canvas;
- registrar `designTokens.colors.primary` como escrita canonica de acento;
- registrar `headlineColor/bodyColor` como overrides, se mantidos;
- registrar novo controle de `blendMode`.
- registrar qualquer decisao tomada se algum gate precisou ser adaptado.

---

## 9. Guardrails de Codigo

O agente implementador deve respeitar estes limites tecnicos:

1. `client/src/lib/variationSnapshot.ts`
   - Nao editar nesta iniciativa.
   - Se uma mudanca parecer necessaria, parar e justificar antes.

2. `client/src/store/editorStore.ts`
   - Evitar mudancas.
   - Permitido apenas confirmar/ajustar escrita canonica de acento se testes
     mostrarem que a derivacao atual nao cobre algum caminho.

3. `client/src/components/views/WorkbenchV2/PostCardV2.tsx`
   - Evitar mudancas.
   - Permitido apenas se uma nova UI precisar de leitura ja existente e tipagem
     exigir ajuste minimo.

4. `client/src/editor/**`
   - Nao editar.
   - Este plano e sobre menus/controles, nao sobre o motor de interacao.

5. `shared/postspark.ts`
   - Nao alterar contrato nesta iniciativa.

6. `api/index.js`, `dist/`, `dist-server/`
   - Nao editar artefatos gerados.

7. Testes
   - Preferir testes focados quando a mudanca tocar store ou comportamento
     serializado.
   - Mudancas puramente de UI podem ser validadas por typecheck + browser/manual,
     desde que documentado.

---

## 10. Resumo de Impacto por Arquivo

| Arquivo | Mudanca planejada |
| --- | --- |
| `WorkbenchV2.tsx` | Remover `RightPanel`, remover render do painel direito, ajustar layout central |
| `FontColorBlock.tsx` | Manter fonte e alinhamento; remover `FONT_SCOPES` morto se continuar sem uso; limpar `customFontUrl` em troca global de fonte; escrever acento via `designTokens.colors.primary`; clarificar overrides de cor |
| `ChameleonPanel.tsx` | Remover `FontDropdown` duplicado sem perder a limpeza de `customFontUrl`; remover alinhamento duplicado; manter paleta/estrutura/decoracoes/customFontUrl |
| `CaptionBlock.tsx` | Separar conteudo visual de metadados de publicacao |
| `ImageBlock.tsx` | Adicionar controle de `blendMode` |
| `LayoutBlock.tsx` | Adicionar texto informativo quando layout nao for split |
| `editorStore.ts` | Preferencialmente sem mudanca; apenas confirmar derivacao ja existente de `accentColor` |
| `useDynamicFont.ts` | Sem mudanca prevista; apenas validacao |
| `PostCardV2.tsx` | Sem mudanca prevista; manter fallbacks e leitura de `blendMode` |
| `DOCUMENTO_MESTRE.md` | Atualizar apos implementacao |

---

## 11. Ordem de Execucao Recomendada

1. Fase 1.1 - Remover `RightPanel`.
2. Fase 1.2 - Clarificar `CaptionBlock`.
3. Fase 1.3 - Adicionar `blendMode`.
4. Fase 2.1 - Consolidar fonte em `FontColorBlock`.
5. Fase 2.2 - Ajustar escrita canonica de acento.
6. Fase 2.3 - Consolidar alinhamento em `FontColorBlock`.
7. Fase 3.1 - Clarificar cores globais vs overrides.
8. Fase 4.1 - Validar `customFontUrl`.
9. Fase 4.2 - Orientar layout split.
10. Fase 5 - Validar e documentar.

---

## 12. Definicao de Pronto

A implementacao so deve ser considerada pronta quando:

1. Nao houver controles duplicados para a mesma acao primaria.
2. O `RightPanel` nao existir mais.
3. Metadados de publicacao estiverem claramente separados do conteudo do card.
4. `blendMode` puder ser editado pela UI.
5. Fonte/alinhamento tiverem um unico dono visivel por contexto.
6. Cor primaria escrever por `designTokens.colors.primary`.
7. Troca de fonte global no `FontColorBlock` nao for bloqueada por
   `customFontUrl` antigo.
8. Overrides de titulo/corpo estiverem explicitamente nomeados ou removidos com
   decisao registrada.
9. `DOCUMENTO_MESTRE.md` estiver atualizado.
10. Testes focados passarem ou bloqueios preexistentes forem documentados.
11. Exportacao PNG continuar correta.
12. Nenhum arquivo fora do escopo foi alterado sem justificativa registrada.
13. Outro agente consegue auditar cada mudanca contra um item deste plano.
