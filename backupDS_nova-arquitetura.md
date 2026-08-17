# Análise comparativa dos motores de geração de posts

## 0. Objetivo do documento

Este documento analisa os dois motores de geração de posts existentes no
ecossistema PostSpark — o original (`PostSpark 3`, em produção) e o
`postspark-next` (em desenvolvimento como reescrita) — e propõe uma terceira
arquitetura que une o melhor de cada um.

O diagnóstico parte de fatos observados no código e de experiência acumulada de
uso, com o seguinte recorte:

- **Fato observado no código** — estrutura, fluxo, contratos e implementação;
- **Inferência a partir do uso** — comportamento percebido em gerações reais;
- **Hipótese** — projeção de como os sistemas se comportariam sob condições
  ainda não testadas.

---

## 1. Contexto: o problema de fundo

Gerar um post para redes sociais a partir de uma ideia do usuário envolve duas
decisões radicalmente diferentes:

| Decisão | Natureza | Exemplo |
|---------|----------|---------|
| **O que dizer** (conteúdo) | Criativa, subjetiva, depende de contexto | "Posicione o fracasso como matéria-prima do crescimento" |
| **Como diagramar** (layout) | Espacial, objetiva, depende de geometria | Headline a 320px de largura, corpo a 280px, CTA no rodapé |

A pergunta central que define a arquitetura é: **quem decide cada uma?**

O PostSpark original respondeu: "o LLM decide as duas". O postspark-next
respondeu: "o LLM decide o conteúdo; o código decide o layout". Cada resposta
criou um conjunto próprio de qualidades e defeitos.

A experiência do usuário resume o saldo em duas frases:

> O PostSpark original fica bonito mas desorganizado — tenho que ficar
> arrumando. O Next fica menos bonito, mas bem mais organizado.

Este documento investiga o porquê e propõe um caminho que produza **bonito +
organizado + rápido + confiável**.

---

## 2. PostSpark Original: arquitetura monolítica orientada a LLM

### 2.1 Como funciona

O fluxo de geração é um pipeline sequencial dentro de um único procedimento
tRPC (`post.generate` em [`server/routers.ts`](./server/routers.ts:565)).

```
Usuário (TheVoid)
  │ input: texto | URL | imagem
  ▼
post.generate (1 chamada tRPC)
  │
  ├─[1] Billing: reserva Sparks
  ├─[2] Contexto: carrega/extrai site intelligence
  ├─[3] Estratégia: planContentStrategies() — LLM gera 5 estratégias → seleciona 3
  ├─[4] Geração paralela ×3: cada estratégia dispara 1 LLM com JSON Schema
  │      O LLM decide: headline, body, layout, cores, posições, template, slides
  ├─[5] Pipeline de qualidade:
  │      ├─ applyDeterministicCopyGuards (trunca texto)
  │      ├─ Brand Soul Guardian (força paleta + WCAG)
  │      ├─ Diversification Guard (LLM reescreve se muito similar)
  │      ├─ Semantic Originality (verifica fingerprints)
  │      ├─ Evaluate & Revise (LLM juiz + até 2 revisões)
  │      └─ Caption Synthesis (LLM dedicado para legenda)
  ├─[6] Snapshot: createPostVisualSnapshot() ×3 → PostVisualSnapshot v3
  └─[7] Entrega: 3 variações prontas
  │
  ▼
HoloDeck (React, browser)
  └─ PostCardV2 renderiza a partir do PostVisualSnapshot
```

**Modelos de linguagem:** OpenRouter (primário) + Groq (fallback) + Gemini
(último recurso). Um roteador em [`server/ai/modelRouter.ts`](./server/ai/modelRouter.ts:135)
seleciona o provider por tarefa.

**Latência típica:** 15–25 segundos.

### 2.2 O que o LLM decide (e o que o código decide)

| Aspecto | Quem decide | Mecanismo |
|---------|------------|-----------|
| Ângulo criativo (copy angle) | LLM | `planContentStrategies` seleciona 3 estratégias distintas |
| Headline, body, CTA, hashtags | LLM | Geração por slot com JSON Schema |
| Layout (centered/left/split/minimal) | LLM | Campo `layout` no schema |
| Posição X, Y, width dos elementos | LLM | `aspectRatioOptimizations` com coordenadas por aspect ratio |
| Cores (fundo, texto, accent) | LLM | Campos `backgroundColor`, `textColor`, `accentColor` |
| Template (feature-grid, numbered-list, etc.) | LLM | Campo `template` para posts estáticos |
| Slides do carrossel | LLM | Exatamente 5 slides com estrutura fixa |
| Correção de copy (truncamento) | Código | `applyDeterministicCopyGuards` (headline ≤60, body ≤140) |
| Correção de contraste | Código | `enforceBrandVisualGuardian` se houver site intelligence |
| Correção de layout (sobreposição) | Código | `applyVisualFitFallback` em `visualFit.ts` |
| Normalização canônica | Código | `createPostVisualSnapshot` congela em v3 |

### 2.3 Forças

**A. Beleza e criatividade visual.**
O LLM tem liberdade total para propor layouts, cores e composições. Como não
há um sistema de design rígido, variações entre candidatos são genuinamente
distintas — não permutações de um punhado de famílias.

**B. Latência aceitável.**
~15–25s é razoável para um produto interativo. O paralelismo de 3 chamadas
LLM reduz o tempo de espera percebido.

**C. Diversidade conceitual.**
O `planContentStrategies` força 3 ângulos conceitualmente diferentes (dor,
benefício, objeção, autoridade, storytelling), o que produz variações com
personalidades distintas — não apenas o mesmo texto em layouts diferentes.

**D. Snapshot canônico como contrato único.**
O `PostVisualSnapshot v3` é o documento autoritativo que unifica HoloDeck,
Workbench, exportação e persistência. Toda edição passa por ele; não há
caminho alternativo de renderização.

### 2.4 Fraquezas

**A. Design truncado e desorganizado.**
O LLM decide posições (x, y, width) por aspecto visual, não por geometria
real. O resultado frequente: headline e body sobrepostos, copy que não cabe
no espaço alocado, contraste insuficiente, cards estreitos demais. O
`applyVisualFitFallback` tenta corrigir deterministicamente, mas é um
paliativo — age depois que o problema já existe.

**B. Pipeline de qualidade inchado.**
Cada "fix" que o código aplica (copy guards, brand guardian, visual fit,
diversification guard, evaluate & revise, caption synthesis) é uma camada
adicionada para corrigir o que o LLM errou. O pipeline tem 7 estágios de
pós-processamento, vários deles envolvendo novas chamadas LLM.

**C. Ausência de Constitution estruturada.**
O Original usa `siteIntelligence` (extração de identidade visual de um site)
como proxy de identidade de marca. É frágil — depende de scraping, não cobre
marcas sem site, e não tem o conceito de exemplares/anti-exemplares como
mecanismo de aprendizado.

**D. Sem orçamento de espaço (VisualBudget).**
O LLM escreve copy sem saber quanto espaço tem disponível. Depois o código
tenta encaixar. Isso inverte a ordem natural: o container deveria ser
conhecido antes do conteúdo.

---

## 3. PostSpark Next: arquitetura de grafo com design determinístico

### 3.1 Como funciona

O Next organiza a geração como um **grafo de estados LangGraph** com 10 nós
orquestrados por arestas condicionais.

```
START
  ↓
intake     → Reserva Sparks, cria RunState com orçamentos
  ↓
director   → LLM (deepseek-v4-pro): gera N ângulos criativos + posições de registro
  ↓ (pode RECUSAR conteúdo se violar forbidden zones)
allocate   → CÓDIGO (PRNG determinístico): atribui família, variante, paleta, princípio
  ↓
studio     → LLM (gpt-5-mini): escreve copy para cada candidato, negocia com budget
  ↓ (paralelo: N candidatos × 1-2 chamadas)
render     → resolve() → LayoutTree → renderToPng() via Playwright no servidor
  ↓
lint       → @next/harness: lint estrutural + verificação de pixels
  ↓ (se <2 sobreviventes → replenish: repovoa, volta ao studio)
critic     → LLM (claude-sonnet-5, MULTIMODAL): avalia 9 dimensões contra imagem
  ↓ (se precisa reparo + orçamento → repair → volta ao render)
deliver    → Comita reserva, persiste deliveries
```

Arquivos centrais:

| Módulo | Arquivo | Linhas |
|--------|---------|--------|
| Grafo | [`packages/engine/src/graph.ts`](./postspark-next/packages/engine/src/graph.ts) | ~80 |
| Nós | [`packages/engine/src/nodes.ts`](./postspark-next/packages/engine/src/nodes.ts) | ~400 |
| Alocador | [`packages/engine/src/allocate.ts`](./postspark-next/packages/engine/src/allocate.ts) | 207 |
| Prompts | [`packages/engine/src/prompts.ts`](./postspark-next/packages/engine/src/prompts.ts) | ~400 |
| LLM client | [`packages/engine/src/llm/client.ts`](./postspark-next/packages/engine/src/llm/client.ts) | ~200 |
| Model router | [`packages/engine/src/llm/routing.ts`](./postspark-next/packages/engine/src/llm/routing.ts) | ~80 |
| Design system | [`packages/design-system/src/`](./postspark-next/packages/design-system/src/) | ~1.785 |
| Contratos | [`packages/contracts/src/`](./postspark-next/packages/contracts/src/) | ~800 |

### 3.2 Separação de agentes: Director, Studio, Critic

Diferente do Original (1 LLM faz tudo por variação), o Next especializa:

| Agente | Modelo | Temperatura | Função |
|--------|--------|-------------|--------|
| **Director** | `deepseek/deepseek-v4-pro` | 0.2 | Ângulos criativos, posições de registro |
| **Studio** | `openai/gpt-5-mini` | 0.7 | Copy (headline, body, CTA, slides) |
| **Critic** | `anthropic/claude-sonnet-5` | 0.1 | Avaliação multimodal (vê a imagem) |
| **Onboarding** | `deepseek/deepseek-v4-pro` | 0.3 | Entrevista de constituição de marca |

### 3.3 O design-system determinístico

O coração do Next é o `@next/design-system`, que substitui o LLM na decisão
de layout. Seus módulos:

| Módulo | Responsabilidade |
|--------|-----------------|
| `families.ts` | 3 famílias × 2 variantes = 6 layouts concretos. Cada família define fontes, alinhamento, densidade, suporte a formatos, budget de caracteres |
| `resolve.ts` | 13 estágios para posicionar elementos: geometria do canvas, safe area, paleta, budget de conteúdo, alocação vertical (body mínimo primeiro, depois headline), binary search de font-size, CTA pill, stacking com progressive shrink, textura de fundo |
| `negotiate.ts` | Se o copy não cabe no layout escolhido, tenta variante mais densa. Se nenhuma couber, retorna limites numéricos para o LLM reescrever |
| `measure.ts` | Mede texto usando fontkit (métricas reais de glyph, não estimativas). Suporta fontes variáveis, cache de 2 níveis, margem de 3% para diferenças de kerning entre browser e fontkit |
| `palette.ts` | 4 papéis cromáticos determinísticos a partir dos tokens da marca. WCAG AA garantido (contraste ≥4.5:1) com correção iterativa para cores de meio-tom |
| `allocate.ts` | PRNG (`mulberry32`) com seed derivado do `runId`. Aloca família + variante + paleta + princípio compositivo + efeito para cada candidato. 72 combinações base |

### 3.4 Forças

**A. Layout consistente e organizado.**
O design-system garante que todo post respeita geometria, contraste e
espaçamento. Não há sobreposição de elementos, copy estourado, ou cores
ilegíveis. O usuário nunca precisa "arrumar" o layout.

**B. Constitution estruturada.**
A `Constitution` (espectro de registro, voz, exemplares, anti-exemplares,
tokens visuais, claims proibidas) é um artefato de primeira classe. Todo
prompt a injeta. O flywheel de gosto (cada download/edição/rejeição
retroalimenta os exemplares) é um fosso competitivo real.

**C. Orçamento de espaço (VisualBudget).**
O `measure.ts` + `families.ts` calculam quantos caracteres cabem em cada slot
antes do Studio escrever. O `negotiate.ts` lida com overflow tentando
variantes mais densas antes de pedir rewrite.

**D. Separação de responsabilidades.**
Director (o quê), Allocator (como), Studio (copy), Critic (qualidade) são
agentes independentes com modelos otimizados para cada função. Nenhum agente
precisa ser bom em tudo.

**E. Renderização server-side (Playwright).**
O que o usuário vê no preview é pixel-verdade — o PNG baixado é idêntico ao
que foi avaliado pelo Critic. Elimina divergências browser↔export.

### 3.5 Fraquezas

**A. Latência proibitiva.**
45–90 segundos até o HoloDeck. As causas:

- Director + Studio × N + render × N + lint + Critic × N + possível repair
  loop. Cada etapa é síncrona dentro do grafo.
- Playwright render para cada candidato (CPU-bound, ~3-5s por candidato).
- Critic multimodal (1 chamada LLM com imagem por candidato).
- Repair loop pode iterar várias vezes.

Comparação: o Original entrega em ~15-25s. O Next leva de 3× a 5× mais.

**B. Resultados visualmente semelhantes.**
Apenas 3 famílias de layout (editorial, chromatic-block, poster-minimo) × 2
variantes = 6 visuais possíveis. Para 5 candidatos, é inevitável que vários
compartilhem a mesma família ou sejam permutações muito próximas. O usuário
percebe "sempre a mesma cara".

**C. Critic como gatekeeper bloqueante.**
O Critic multimodal rejeita candidatos com frequência, disparando o ciclo
repair → render → critic. Isso causa:

- Latência adicional (cada iteração custa ~10-15s).
- Frustração: o grafo "reprova designs o tempo todo".
- Convergência para o seguro: o Critic tende a aprovar o que já viu antes,
  reduzindo ainda mais a diversidade.

**D. Heurística excessivamente complexa.**
O `resolve.ts` tem 13 estágios porque tenta encaixar copy arbitrário num
layout fixo. É um problema de otimização resolvido em runtime. O
`negotiate.ts` + `REWRITE_SAFETY` são camadas de recuperação para quando o
resolve falha. A pilha inteira (1.785 linhas no design-system) existe para
resolver um problema que poderia ser evitado com constraints melhores no
momento da geração do copy.

**E. Sem snapshot canônico no cliente.**
O Next não tem equivalente ao `PostVisualSnapshot`. O candidato é um objeto
com `copy` + `layoutParams` + `renderRefs`. A renderização é sempre
server-side. Isso significa que o preview no HoloDeck é uma imagem PNG
(estática), não um componente React interativo. A edição exige re-resolve +
re-render no servidor, adicionando latência a cada mudança.

**F. Acoplamento forte com Playwright.**
Se o Playwright falha (timeout, crash do Chromium, memória), todo o pipeline
para. Não há fallback para renderização no browser.

---

## 4. Diagnóstico comparativo

| Dimensão | Original | Next | Diagnóstico |
|----------|----------|------|-------------|
| **Beleza visual** | Alta | Média-baixa | Original: LLM cria livremente. Next: 3 famílias limitam diversidade. |
| **Organização do layout** | Baixa | Alta | Original: LLM erra geometria. Next: código garante consistência. |
| **Latência** | 15–25s | 45–90s | Next é 3-5× mais lento. Critic + Playwright + repair loop são os vilões. |
| **Diversidade entre variações** | Alta | Baixa | Original: 3 estratégias distintas. Next: 3 famílias para 5 candidatos força repetição. |
| **Robustez de layout** | Baixa | Alta | Original: visual fit é paliativo. Next: design-system garante correção. |
| **Constituição de marca** | Fraca (site intelligence) | Forte (Constitution + flywheel) | Next tem fosso competitivo real. |
| **Experiência de edição** | Fluida (browser, instantâneo) | Travada (server, re-render) | Original: Zustand + PostCardV2. Next: API call para cada mudança. |
| **Resiliência a falhas** | Média | Baixa | Next depende de Playwright vivo, OpenRouter up, sem fallback. |
| **Complexidade do código** | Média | Alta | Next: 1.785 linhas só no design-system para 3 famílias. |
| **Qualidade do copy** | Boa | Boa | Ambos usam LLMs competentes. Next tem vantagem do VisualBudget. |

### 4.1 O padrão que emerge

```
Original:  LLM decide TUDO → bonito, caótico, rápido
Next:      Código decide TUDO → organizado, sem graça, lento

O ideal:   LLM decide CONTEÚDO, código decide GEOMETRIA
           → bonito + organizado + rápido
```

O Next já tenta essa separação (Director + Studio para conteúdo, Allocator +
design-system para geometria). Mas ele exagerou na direção determinística:
poucas famílias, pipeline serial longo, Critic bloqueante.

O Original já entrega o HoloDeck rápido (15–25s) e com preview interativo
(React). Mas delega geometria ao LLM, que é o agente errado para essa tarefa.

---

## 5. Proposta: Fluid Engine — o melhor dos dois mundos

### 5.1 Princípios de design

1. **LLM decide o quê. Código decide o como.**
   Conteúdo (ângulo, copy, tom) é território do LLM. Geometria (posição,
   tamanho, cores, fontes) é território do código.

2. **Orçamento antes da escrita.**
   O VisualBudget (espaço disponível para cada elemento) é calculado antes
   do Studio gerar o copy. O Studio escreve para caber — não o contrário.

3. **Preview no browser, export no servidor.**
   O HoloDeck renderiza via React (instantâneo, interativo). O PNG só é
   gerado via Playwright no momento do download/export.

4. **Qualidade é assessoria, não gatekeeper.**
   Lint e Critic rodam em background, pós-HoloDeck. Colocam flags, não
   bloqueiam. O usuário decide se quer agir sobre os alertas.

5. **Diversidade por quantidade, não por complexidade.**
   Muitas famílias de layout simples (10+) em vez de poucas famílias
   complexas (3). Cada família é declarativa: geometria pura, sem lógica
   de composição.

6. **Snapshot canônico como contrato universal.**
   Manter o padrão `PostVisualSnapshot` (evoluído para v4) como documento
   autoritativo que unifica HoloDeck, Workbench, exportação e persistência.

### 5.2 Arquitetura

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FLUID ENGINE                                  │
├────────────┬────────────┬────────────────┬────────────┬─────────────┤
│  INTAKE    │  VISION    │  COMPOSITION   │  HOLODECK  │   EXPORT    │
│  <1s       │  ~3-5s     │  ~6-10s        │  instant   │  on-demand  │
│  Server    │  Server    │  Server        │  Client    │   Server    │
├────────────┼────────────┼────────────────┼────────────┼─────────────┤
│ Spark      │ 1 LLM call │ N parallel     │ React      │ Playwright  │
│ reserve    │ Director   │ Studio writes  │ PostCardV3 │ renderToPng │
│ Constitu-  │ produces   │ copy to fit    │ renders    │             │
│ tion load  │ N angles   │ VisualBudget   │ snapshots  │  PNG/PDF    │
└────────────┴────────────┴────────────────┴────────────┴─────────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │  QUALITY (async)    │
                          │  Lint + Critic      │
                          │  Background, flags  │
                          │  non-blocking       │
                          └─────────────────────┘
```

### 5.3 Pipeline detalhado

#### Fase 1: Intake (servidor, <1s)

- Valida input do usuário (texto, URL, imagem).
- Reserva Sparks via Supabase RPC.
- Carrega `Constitution` da marca (herdada do Next: espectro de registro,
  voz, exemplares, anti-exemplares, tokens visuais, claims proibidas).
- Se input for URL, dispara extração de site intelligence em background
  (assíncrono, não bloqueante — se chegar a tempo, enriquece a Constitution;
  senão, segue sem).

#### Fase 2: Vision (servidor, 1 chamada LLM, ~3-5s)

O **Director** (1 chamada LLM) recebe `input + Constitution` e produz N
ângulos criativos em uma única resposta. Esta é uma inovação sobre o
Original (que fazia 1 chamada de estratégia + 3 de geração) e sobre o Next
(que faz Director + N × Studio).

```
Director input:
  - Prompt do usuário
  - Constitution (espectro, voz, exemplares, forbidden zones)
  - Format (static | carousel)
  - Platform (instagram)

Director output (N ângulos):
  {
    concept: "Posicione o fracasso como matéria-prima do crescimento",
    registerPosition: { authority: 0.6, warmth: 0.7, urgency: 0.3 },
    copyAngle: { type: "objecao", label: "O erro que gera resultado" },
    suggestedFamilies: ["editorial", "poster-minimo", "chromatic-block"],
    visualMood: "sóbrio, tipográfico, contraste alto"
  }
```

Por que 1 chamada? O LLM sabe o que já sugeriu nos ângulos anteriores e
garante diversidade conceitual. É mais rápido que N chamadas separadas.

#### Fase 3: Composition (servidor, N paralelo, ~6-10s)

Para cada ângulo, em paralelo:

**Passo 3a — Allocator (código, instantâneo)**

Similar ao `allocate.ts` do Next, mas simplificado:

- PRNG determinístico com seed derivado do `runId + angleIndex`.
- Seleciona: 1 família de layout + 1 variante + 1 paletteRole.
- Opcionalmente: 1 efeito leve (grain, noise, glass).
- Sem wildcard, sem degradação.

**Passo 3b — VisualBudget (código, instantâneo)**

A grande inovação sobre o Original. Antes do Studio escrever, o código
calcula exatamente quanto espaço cada elemento tem:

```
VisualBudget = {
  headline:   { maxChars: 55,  maxLines: 2, maxWidth: 320, maxHeight: 80  },
  body:       { maxChars: 120, maxLines: 3, maxWidth: 280, maxHeight: 60  },
  cta:        { maxChars: 35,  maxLines: 1, maxWidth: 200, maxHeight: 32  },
  hashtags:   { maxCount: 4,   maxChars: 100 },
  sections:   { maxCount: 3,   labelMaxChars: 20, descMaxChars: 36 }
}
```

Este orçamento é injetado no prompt do Studio como constraint numérica
precisa — não como sugestão vaga. O Studio sabe exatamente quanto espaço
tem e escreve para caber.

O cálculo usa `measure.ts` (fontkit, métricas reais de glyph) herdado do
Next, que é a fundação que torna isso confiável.

**Passo 3c — Studio (1 chamada LLM por ângulo, paralelo)**

O Studio recebe:

- `angle.concept` + `angle.copyAngle` (o que comunicar).
- `VisualBudget` (quanto espaço tem).
- `Constitution.exemplars` (exemplos do que funciona para esta marca).
- `familyId` + `variantId` (contexto visual — "você está escrevendo para
  um layout editorial, alinhado à esquerda, com fonte serifada grande").

E produz:

- `headline`, `body`, `callToAction`, `hashtags`.
- `sections[]` ou `slides[]` (se aplicável).
- `imagePrompt` (para geração de fundo, se família suporta imagem).

**Passo 3d — Snapshot v4 (código, instantâneo)**

`createPostVisualSnapshot()` congela o candidato em `PostVisualSnapshot v4`:

- Aplica `VisualBudget` + `LayoutTree` (resolvida deterministicamente).
- Sincroniza `DesignTokens` (cores, fontes, bordas, sombras).
- Normaliza sections, slides, image settings.
- Valida: nada fora do canvas, nada sobreposto, contraste ≥4.5:1.

#### Fase 4: HoloDeck (cliente, instantâneo)

O backend retorna `PostVisualSnapshot[]` (3-5 variações). O HoloDeck
renderiza via `PostCardV3` — React puro no browser, sem Playwright.

O usuário vê os resultados em **~10-15 segundos** (vs 15-25s Original,
vs 45-90s Next).

Vantagens sobre o Next:
- Preview interativo (hover, clique, swipe).
- Troca de aspect ratio instantânea (re-normalize no cliente).
- Edição leve no HoloDeck (trocar família, variante, paleta) sem API call.

#### Fase 5: Quality (servidor, assíncrono, não bloqueante)

Roda em background DEPOIS que o HoloDeck já está visível:

1. **Lint determinístico** (instantâneo): verifica overflow, contraste,
   forbidden claims, diversidade entre candidatos.
2. **Critic opcional** (1 chamada LLM multimodal): só se o usuário pedir
   "revisão aprofundada" ou se o lint detectar risco alto.
3. Candidatos com problemas recebem **flags** (ícone amarelo no card),
   não são bloqueados. O usuário decide se quer usar mesmo assim.

#### Fase 6: Export (servidor, on-demand)

Só quando o usuário clica "Baixar" ou "Salvar":

- `renderToPng(snapshot)` via Playwright (herdado do Next).
- Upload para Supabase Storage.
- Registro no flywheel (exemplar ou anti-exemplar).

Até lá, tudo é browser rendering.

### 5.4 O design-system simplificado

| Aspecto | Next (atual) | Fluid (proposto) |
|---------|-------------|-----------------|
| Famílias de layout | 3 | 10+ |
| Variantes por família | 2 | 1-2 |
| Layouts concretos | 6 | 15-25 |
| Lógica por família | Alta (composição, princípios, textura) | Baixa (geometria pura) |
| `resolve.ts` estágios | 13 | 4 |
| `negotiate.ts` | Sim (fallback para variante densa) | Não (VisualBudget garante fit) |
| `allocate.ts` | PRNG + wildcard + degradação | PRNG simples |

**Famílias propostas (inicial):**

| Família | Alinhamento | Fundo | Header | Body | Decor |
|---------|------------|-------|--------|------|-------|
| `editorial` | esquerda | imagem ok | serif grande | sans-serif | linha fina |
| `chromatic-block` | esquerda | cor sólida | bold grotesk | regular | bloco de cor |
| `poster-minimo` | centro | imagem ok | centralizado | mínimo | nenhum |
| `magazine-cover` | esquerda | imagem ok | overlay texto | badge lateral | moldura |
| `brutalist` | esquerda | cor sólida | mono grande | mono pequeno | borda grossa |
| `glass-card` | centro | imagem + blur | card flutuante | dentro do card | vidro |
| `typographic` | centro | cor sólida | gigante, textura | minúsculo | textura de fundo |
| `diagonal-split` | esquerda | split diagonal | sobre cor A | sobre cor B | linha diagonal |
| `frame` | centro | imagem ok | dentro de moldura | fora da moldura | borda dupla |
| `minimal-grid` | grade | cor sólida | célula A | célula B + CTA | grid lines |

Cada família tem ~60-80 linhas (geometria declarativa: coordenadas dos
slots, fontes, alinhamento). O `resolve_v4` tem 4 estágios:

```
resolve_v4(budget, copy, family, tokens):
  1. Posiciona headline no slot pré-calculado, aplica font-size do budget
  2. Posiciona body no slot pré-calculado
  3. Posiciona CTA no slot pré-calculado
  4. Aplica tokens (cores, bordas, sombra)
  → LayoutTree pronta
```

Sem binary search, sem overflow recovery, sem `REWRITE_SAFETY`. O orçamento
já garante que cabe.

### 5.5 Métricas-alvo

| Métrica | Original | Next | Fluid (alvo) |
|---------|----------|------|-------------|
| Tempo até HoloDeck | 15–25s | 45–90s | **10–15s** |
| Chamadas LLM totais | 5–8 | 8–15 | **4–7** |
| Diversidade visual | Alta | Baixa | **Alta** (10+ famílias) |
| Layouts quebrados | Frequente | Raro | **Raro** (VisualBudget) |
| Bloqueios por qualidade | Nunca | Frequentes | **Nunca** (flags) |
| Preview interativo | Sim | Não (PNG estático) | **Sim** |
| Edição instantânea | Sim | Não (API call) | **Sim** |
| Constitution + flywheel | Não | Sim | **Sim** (herdado) |
| Pixel-verdade no export | Não (browser ≠ PNG) | Sim | **Sim** (Playwright no export) |

---

## 6. Previsão de problemas e mitigação

### Problema 1: VisualBudget subestima o espaço → copy curto demais

**Causa provável:** O `measure.ts` calcula com fontkit, mas o browser renderiza
com kerning e hinting ligeiramente diferentes. A margem de segurança de 3%
pode ser insuficiente para fontes específicas.

**Mitigação:**
- Manter a margem de 3% como padrão, mas permitir override por família
  (fontes display como Fraunces podem precisar de 5%).
- Adicionar um teste de regressão visual: gerar N candidatos com copy no
  limite do orçamento, renderizar no browser, capturar screenshot, comparar
  com o esperado.
- Se o problema for recorrente, aumentar a margem globalmente e aceitar copy
  ligeiramente mais curto como trade-off.

### Problema 2: Studio ignora o VisualBudget

**Causa provável:** O LLM recebe constraints numéricas, mas não as respeita
consistentemente (problema conhecido com structured output em JSON Schema).

**Mitigação:**
- `applyDeterministicCopyGuards` (herdado do Original) como rede de segurança:
  trunca headline, body, CTA deterministicamente se excederem o orçamento.
- Incluir no prompt do Studio exemplos concretos de copy que respeita vs.
  copy que excede o orçamento (few-shot com feedback negativo).
- Se um candidato consistentemente excede o orçamento, marcar com flag
  "copy truncado" no HoloDeck.

### Problema 3: Famílias novas quebram com combinações inesperadas de copy + formato

**Causa provável:** Uma família `diagonal-split` funciona para headlines de 30
chars, mas quebra com headlines de 55 chars. Ou uma família `glass-card` não
lida bem com 3 sections.

**Mitigação:**
- Cada família declara explicitamente seus limites: `maxHeadlineChars`,
  `supportsSections`, `supportsCarousel`, `minBodyChars`.
- O Allocator só seleciona famílias compatíveis com o ângulo criativo.
- Suíte de tortura (herdada do Next): para cada família × variante × formato,
  gerar copy sintético nos limites e verificar que o resolve não quebra.
- Rodar no CI. Nova família só mergeia se passar na suíte de tortura.

### Problema 4: Director produz ângulos muito similares → diversidade baixa

**Causa provável:** Com 1 chamada LLM para N ângulos, o modelo pode produzir
variações cosméticas do mesmo conceito em vez de ângulos genuinamente distintos.

**Mitigação:**
- Incluir no prompt do Director: "cada ângulo deve partir de uma premissa
  conceitual diferente. Se dois ângulos puderem ser resumidos pela mesma
  frase, revise."
- Pós-processamento determinístico: calcular similaridade de embedding entre
  os concepts dos ângulos. Se dois ângulos tiverem similaridade > 0.85,
  marcar com flag "baixa diversidade conceitual".
- Oferecer ao usuário um botão "Gerar mais ângulos" que chama o Director
  novamente com instrução explícita de evitar os conceitos já gerados.

### Problema 5: Latência do Director + Studio ainda acima do alvo

**Causa provável:** O Director é uma chamada LLM. O Studio são N chamadas
paralelas. Se N=5, são 6 chamadas LLM totais. Com latência de rede + LLM de
~2-4s por chamada, o p95 pode passar de 15s.

**Mitigação:**
- **Modo turbo:** Reduzir N para 3 quando o usuário está explorando (TheVoid
  rápido). Aumentar para 5 quando o usuário pede "mais opções".
- **Streaming parcial:** Enviar cada candidato para o HoloDeck assim que o
  Studio terminar (não esperar todos). O usuário vê o primeiro em ~5-6s e
  os demais chegam incrementalmente.
- **Modelos mais rápidos para o Studio:** Usar `gpt-5-mini` ou `groq/llama`
  com temperatura baixa para copy — priorizar latência sobre criatividade
  (o Director já garantiu o ângulo criativo).

### Problema 6: Sem Critic bloqueante, a qualidade pode degradar

**Causa provável:** Sem o gate do Critic multimodal, posts com problemas
visuais sutis (ex: headline ilegível sobre imagem clara, CTA cortado) podem
chegar ao usuário sem alerta.

**Mitigação:**
- Lint determinístico forte: contraste WCAG, overflow check, forbidden
  claims, verificação de tamanho mínimo de fonte.
- Critic assíncrono: roda em background e põe flags. Se o usuário baixar
  um post com flag vermelha, mostrar confirmação: "Este post tem um problema
  de legibilidade. Deseja baixar mesmo assim?"
- Métrica de qualidade: trackear `flags_ignoradas / downloads`. Se > 10%,
  reavaliar se o Critic deveria voltar a ser bloqueante para aquele tipo
  específico de flag.

### Problema 7: Divergência browser (preview) vs Playwright (export)

**Causa provável:** O `PostCardV3` renderiza no browser do usuário (Chrome,
Safari, Firefox). O `renderToPng` renderiza no Chromium headless do
Playwright. Fontes, kerning, anti-aliasing e subpixel rendering diferem.

**Mitigação:**
- Usar as mesmas fontes (web fonts carregadas no browser, arquivos `.ttf`
  no servidor Playwright).
- Margem de segurança no VisualBudget que acomode a pior diferença entre
  browsers (3-5%).
- Teste de regressão: para cada família, gerar screenshot no browser e no
  Playwright, comparar pixel a pixel com threshold de tolerância (ex: 98%
  de pixels idênticos).
- Se a divergência for inaceitável para uma família específica, marcá-la
  como "export-only" (sem preview interativo — mostra thumbnail PNG).

### Problema 8: Migração do Constitution do Next para o Fluid

**Causa provável:** O Fluid herda o conceito de Constitution do Next, mas
o schema pode divergir (ex: tokens visuais específicos por família).

**Mitigação:**
- Manter o schema Zod da Constitution como contrato compartilhado entre
  os dois projetos durante a transição.
- Versionar o schema (`constitutionVersion`).
- Fluid lê Constitution v1 (Next). Se precisar de campos novos, cria v2
  com migration function (`upgradeConstitution(v1) → v2`).

---

## 7. O que herdar de cada projeto

### Do PostSpark Original

| Artefato | Ação |
|----------|------|
| `PostVisualSnapshot` (v3 → v4) | Evoluir contrato, adicionar `VisualBudget` + `LayoutTree` |
| `PostCardV2` → `PostCardV3` | Adaptar para consumir `LayoutTree` em vez de `layoutSettings` soltas |
| `variationSnapshot.ts` | Manter como normalizador canônico, adicionar resolve_v4 |
| `HoloDeck` (peek + wallet) | Manter UX, adaptar dados para v4 |
| `Workbench` (Zustand editor) | Manter editor instantâneo, trocar fonte de dados para v4 |
| `applyDeterministicCopyGuards` | Manter como rede de segurança pós-Studio |
| `server/ai/modelRouter.ts` | Adaptar para novo conjunto de tarefas (director, studio) |

### Do PostSpark Next

| Artefato | Ação |
|----------|------|
| `Constitution` (schema + flywheel) | Herdar integralmente |
| `measure.ts` (fontkit) | Herdar integralmente — é a fundação do VisualBudget |
| `palette.ts` (WCAG) | Herdar integralmente |
| `allocate.ts` (PRNG) | Simplificar (remover wildcard, degradação) |
| `families.ts` | Expandir de 3 para 10+, simplificar cada família |
| `renderToPng` (Playwright) | Herdar, mas mover para export on-demand |
| `lintNode` (harness) | Herdar, converter para assíncrono não bloqueante |
| `criticNode` | Herdar, converter para opcional/assíncrono |
| `prompts.ts` (Director, Studio) | Reescrever com injeção de VisualBudget |

### O que construir novo

| Artefato | Descrição |
|----------|-----------|
| `VisualBudget` | Cálculo de orçamento de espaço por elemento a partir da família + variante + formato |
| `resolve_v4` | Resolução simplificada (4 estágios) que assume conteúdo cabendo no orçamento |
| `PostVisualSnapshot v4` | Contrato estendido com `VisualBudget`, `LayoutTree`, `familyId`, `variantId` |
| `PostCardV3` | Renderizador React que consome `LayoutTree` |
| Director multi-angle | 1 chamada LLM → N ângulos (vs 1 ângulo por chamada no Next) |
| Quality background worker | Lint + Critic assíncronos com sistema de flags |

---

## 8. Considerações finais

### 8.1 Premissas que precisam ser validadas

- **Hipótese 1:** O Studio (LLM) respeitará constraints numéricas de
  VisualBudget com precisão suficiente para eliminar o `negotiate.ts`.
  Validação: teste com 100 gerações, medir taxa de copy que excede o
  orçamento. Alvo: <5%.

- **Hipótese 2:** 10+ famílias de layout simples produzem diversidade visual
  percebida equivalente ou superior a 3 famílias com lógica de composição
  complexa. Validação: teste A/B com usuários.

- **Hipótese 3:** O Critic assíncrono (flags, não bloqueios) mantém qualidade
  percebida equivalente ao Critic bloqueante. Validação: métrica de
  `flags_ignoradas / downloads` em produção.

- **Hipótese 4:** Streaming parcial de candidatos (mostrar o primeiro antes
  dos demais) melhora a percepção de velocidade mais do que reduzir a
  latência total. Validação: teste de percepção com usuários.

### 8.2 Riscos estruturais

- **Risco:** A complexidade de manter dois projetos (Original em produção +
  Fluid em desenvolvimento) drena o time. **Mitigação:** Fluid substitui o
  Original, não coexiste. O Next vira referência de Constitution e
  design-system, não produto separado.

- **Risco:** Playwright no export é pesado e pode falhar sob carga.
  **Mitigação:** Alternativa de renderização no browser (canvas/dom-to-image)
  como fallback. O preview do HoloDeck já é uma renderização React — exportar
  como PNG a partir do DOM é tecnicamente viável (embora com fidelidade
  menor que Playwright).

- **Risco:** A migração do schema de dados (Original: `posts` + `variations`,
  Next: `runs` + `deliveries`, Fluid: TBD) pode causar incompatibilidade com
  dados existentes. **Mitigação:** Fluid usa schema novo (`postspark_fluid`)
  e mantém leitura do schema antigo para migração progressiva.

### 8.3 Ordem sugerida de implementação

1. **Contrato:** `PostVisualSnapshot v4` + `VisualBudget` + `LayoutTree`
   (schemas Zod em `shared/`).
2. **Design-system:** `measure.ts` + `palette.ts` (herdados), `families.ts`
   (reescrito com 10+ famílias), `resolve_v4` (novo, simplificado).
3. **Engine:** Director multi-angle (1 LLM → N ângulos), Studio com
   VisualBudget (1 LLM por ângulo, paralelo).
4. **Snapshot:** `createPostVisualSnapshot v4` (normalizador canônico).
5. **Cliente:** `PostCardV3` (renderizador React), HoloDeck adaptado.
6. **Quality:** Lint assíncrono + flags.
7. **Export:** `renderToPng` on-demand.
8. **Flywheel:** Constitution + exemplares (herdado do Next, integrado ao
   fluxo de download/descarte).
