# 📋 Auditoria Técnica do Módulo de Edição de Texto — PostSpark 3

**Revisão 2** — 2026-06-29
**Status:** Completed
**Tipo:** Auditoria Técnica & Funcional

---

## 📂 Status da Busca por Documentos Prévios

**Resultado:** Nenhum relatório de auditoria anterior específico para edição de texto foi encontrado.

- `OPERATIONAL_ERRORS.txt`: Logs operacionais (execuções de geração, AI providers) — irrelevante
- `shared/postspark.ts`: Definições de tipo (`TextElement`, `LayoutPosition`, `TextAlignment`, `DesignTokens`)
- `shared/postsparkSchemas.ts`: Schema Zod — confirma os campos válidos no contrato de dados
- Nenhum documento de requisitos ou especificação UX de edição de texto

**Fontes analisadas (verificação cruzada):**
- `client/src/store/editorStore.ts` — Estado central via Zustand
- `client/src/components/views/WorkbenchV2/blocks/` — Todos os 6 blocos do Workbench
- `client/src/components/views/WorkbenchV2/PostCardV2.tsx` — Renderização do post (6 layouts)
- `client/src/components/canvas/AdvancedTextNode.tsx` — Texto avançado arrastável
- `client/src/components/canvas/DraggableBlock.tsx` — Bloco arrastável genérico
- `client/src/components/ChameleonPanel.tsx` — Painel de design tokens
- `shared/postspark.ts` — Tipos compartilhados (linhas 336-408, 440-536)
- `shared/postsparkSchemas.ts` — Validação Zod

---

## ⚠️ Diagnóstico Estrutural: Fragmentação dos Controles

Antes do mapeamento, o achado mais relevante: **as responsabilidades de edição de texto estão espalhadas por 4 blocos e 2 camadas (tokens globais + overrides por elemento), sem que o usuário tenha um caminho claro.**

| O que o usuário quer fazer | Onde está o controle |
|---|---|
| Escolher fonte | `FontColorBlock` (headline / body / global) |
| Tamanho da fonte | `FontColorBlock` (multiplicador 0.6-1.8×) + `ElementContentBlock` (px, só `TextElement`) |
| Cor do texto | `FontColorBlock` (headlineColor / bodyColor / accentColor) + `DesignBlock`/`ChameleonPanel` (design tokens globais) |
| Alinhamento (left/center) | `FontColorBlock` |
| Alinhamento (left/center/right) | `LayoutBlock` (por camada — **não comunicado ao usuário**) |
| Posição no grid 3×3 | `LayoutBlock` |
| Largura do bloco (%) | `LayoutBlock` |
| Padding global | `LayoutBlock` |
| Transformação (uppercase) | `ChameleonPanel` dentro do `DesignBlock` (global apenas) |
| Editar texto inline | Duplo-clique no canvas (headline/body em 6 layouts + TextElement) |
| Rotação | `ElementContentBlock` (só `TextElement`) |
| Peso (negrito), itálico, sublinhado, line-height, opacidade | **Tipos existem em `TextElement.styles` mas ZERO UI** |
| Letter-spacing, sombra, contorno | **Não existem no contrato de dados** |

**Consequência:** Para formatar um simples título, o usuário precisa navegar entre `FontColorBlock`, `LayoutBlock` e `DesignBlock` — três blocos em abas colapsáveis distintas. A edição inline (duplo-clique no canvas) existe mas não tem indicador visual de descoberta.

---

## ⚙️ Mapeamento de Funções Ativas

**Legenda:**
- `✅` = Funcionalidade completa com UI acessível ao usuário
- `🧬` = Existe no tipo/contrato de dados, mas **sem controle de UI** (usuário não alcança)
- `⚠️` = Parcial (existe mas tem restrições ou comportamento colateral)
- `❌` = Não implementado (nem tipo, nem UI)

### Tipografia e Estilo

| Função | Localização | Status | Nota |
|---|---|---|---|
| **Família de fonte** | `FontColorBlock:87-120` + `FontDropdown` | ✅ | Escopos: headline, body, global |
| **Peso da fonte (fontWeight)** | `TextElement.styles.fontWeight` (`shared/postspark:401`) | 🧬 | Tipo existe, sem UI. `headlineFontWeight`/`bodyFontWeight` **não existem** no `PostVariation` |
| **Estilo itálico (fontStyle)** | `TextElement.styles.fontStyle` (`shared/postspark:402`) | 🧬 | Tipo existe, sem UI |
| **Decoração de texto (textDecoration)** | `TextElement.styles.textDecoration` (`shared/postspark:403`) | 🧬 | Tipo existe, sem UI |
| **Transformação (textTransform)** | `ChameleonPanel:186-194` → `DesignTokens.typography.textTransform` | ⚠️ | Global apenas (`none`/`uppercase`). Sem override por elemento |

### Dimensionamento e Espaçamento

| Função | Localização | Status | Nota |
|---|---|---|---|
| **Tamanho da fonte (headline/body)** | `FontColorBlock:143-181` | ✅ | Multiplicadores 0.6-1.8× sobre o tamanho base do `useTextAutoFit` |
| **Tamanho da fonte (TextElement)** | `ElementContentBlock:214-222` | ✅ | Slider 8-96px, só para `TextElement` |
| **Altura da linha (lineHeight)** | `TextElement.styles.lineHeight` (`shared/postspark:405`) | 🧬 | Tipo existe, sem UI. PostCardV2 usa valores hardcoded por layout (1.25, 1.55, 1.6, 1.65) |
| **Letter-spacing/tracking** | — | ❌ | Não existe no contrato de dados nem na UI |
| **Padding global** | `LayoutBlock:217-225` | ✅ | Slider 0-80px |

### Alinhamento e Posicionamento Interno

| Função | Localização | Status | Nota |
|---|---|---|---|
| **Alinhamento de texto (global)** | `FontColorBlock:260-312` | ⚠️ | Só `left`/`center`. `right` e `justify` ausentes |
| **Alinhamento de texto (por camada)** | `LayoutBlock:66-70, 285-308` | ✅ | `left`/`center`/`right` disponíveis por elemento |
| **Posição no grid 3×3** | `LayoutBlock:254-282` | ✅ | 9 posições para headline, body, accentBar, badge, sticker, carouselArrow, card |
| **Largura do bloco** | `LayoutBlock:310-322` | ✅ | Slider 10-100% |

### Alinhamento e Relação com o Canvas

| Função | Localização | Status | Nota |
|---|---|---|---|
| **Arrastar elementos (drag)** | `DraggableBlock` + `CanvasInteractionProvider` | ✅ | Com snapping e constraints |
| **Posicionamento livre (freePosition)** | `LayoutPosition.freePosition` | ⚠️ | Funciona, mas é **limpo em bloco** ao trocar layout mestre (`LayoutBlock:147-158`) |
| **Snap/Magnet** | `CanvasControls.tsx` | ✅ | Toggle global |
| **Seleção de elemento (layoutTarget)** | `editorStore.layoutTarget` | ✅ | Define o sidebar contextual e o overlay de seleção |

### Funções Avançadas

| Função | Localização | Status | Nota |
|---|---|---|---|
| **TextElement (texto livre)** | `AdvancedTextNode.tsx` | ✅ | Drag + resize + edição inline + rotação |
| **Edição inline (headline/body)** | `PostCardV2.tsx:1137,1169,1240,1267,1336,1363,1457,1485,1563,1675,1705` | ✅ | `contentEditable` em todos os 6 layouts. Ativado por duplo-clique no canvas |
| **Edição inline (TextElement)** | `AdvancedTextNode:53-75,117` | ✅ | Duplo-clique + `contentEditable` com borda tracejada |
| **Rotação de texto** | `ElementContentBlock:223-231` | ✅ | Slider -180° a 180°, só `TextElement` |
| **Opacidade** | `TextElement.styles.opacity` (`shared/postspark:406`) | 🧬 | Tipo existe, sem UI. PostCardV2 usa valores hardcoded (0.75, 0.80, 0.85) |
| **Sombras/contornos** | — | ❌ | `text-shadow` e `-webkit-text-stroke` ausentes do contrato |
| **z-index** | `AdvancedTextNode:110` | ⚠️ | Hardcoded: 1 (normal) / 100 (selecionado). Sem controle do usuário |

---

## ❌ Problemas Identificados

### 1. Alinhamento de Texto Global Incompleto
**Localização:** `FontColorBlock:266-311`

**Problema:** Apenas `left` e `center` estão disponíveis. `right` e `justify` ausentes.

**Impacto:** Usuário pode alinhar um elemento à direita via LayoutBlock, mas o controle "global" no FontColorBlock não reflete nem oferece essa opção.

---

### 2. Propriedades de Texto Desconectadas
**Localização:** `TextElement.styles`

**Problema:** Propriedades avançadas (`fontWeight`, `fontStyle`, `textDecoration`, `lineHeight`, `opacity`) existem no tipo mas **não têm UI de edição** para o usuário comum.

**Impacto:** Usuários no Workbench não têm acesso a negrito, itálico, sublinhado, line-height ou opacidade.

---

### 3. Letter-Spacing/Tracking Ausente
**Problema:** `letterSpacing` não existe nem no tipo `TextElement.styles` nem no `PostVariation`. Nenhum controle em qualquer bloco.

**Impacto:** Impossível criar títulos com tracking negativo (comum em designs premium) ou expandido para legibilidade.

---

### 4. Sombras e Contornos de Texto Inexistentes
**Problema:** `text-shadow` e `-webkit-text-stroke` não têm propriedade no contrato de dados nem UI.

**Impacto:** Sem efeitos de profundidade tipográfica ou estilos "outline".

---

### 5. Posicionamento Livre Descartado ao Trocar Layout
**Localização:** `LayoutBlock:147-158`

**Problema:** Ao clicar num preset de layout master, o código limpa `freePosition` de **todos** os elementos.

**Impacto:** Ajustes finos de posição são perdidos sem aviso ao alternar layouts.

---

### 6. z-index Automático sem Controle Manual
**Localização:** `AdvancedTextNode:110` e `ImageElementBlock:86`

**Problema:** z-index é binário e hardcoded: 1 (normal) ou 100 (selecionado). Sem slider ou controle de camada.

**Impacto:** Impossível definir ordem de sobreposição entre múltiplos elementos.

---

### 7. Transformação de Texto Global sem Override por Elemento
**Localização:** `ChameleonPanel:186-194` → `DesignTokens.typography.textTransform`

**Problema:** `textTransform` (`none`/`uppercase`) é exclusivamente global.

**Impacto:** Não é possível ter título em CAIXA ALTA e corpo em normal simultaneamente.

---

### 8. Bug: Primeiro Clique em Elemento Desloca os Demais
**Localização:** `layoutPositionAdapter:71-76` + `interactionController:155` + `DraggableBlock:109,176`

**Problema:** Micro-movimento de ponteiro (≥5px) durante um clique converte o elemento para `position: absolute` via `freePosition`. O `useLayoutEffect` que mediria o `flowFootprint` retorna cedo (`if (isAbsolute) return`), e o shell externo recebe `display: contents`, removendo o elemento do fluxo.

**Impacto:** Outros elementos deslocam-se para preencher o vazio. Afeta apenas o primeiro clique em cada elemento.

---

### 9. Peso de Fonte por Headline/Body Inexistente
**Problema:** `PostVariation` tem `headlineFontFamily`, `headlineFontSize`, `headlineColor` mas **não** tem `headlineFontWeight` ou `bodyFontWeight`.

**Impacto:** Sem controle de peso tipográfico para títulos e corpo.

---

## 🗺️ Mapa de Fragmentação (Diagnóstico Visual)

```
Para editar "estilo do título", o usuário precisa de:

FontColorBlock          LayoutBlock             DesignBlock/ChameleonPanel
├─ Família da fonte      ├─ Posição (grid 3×3)   └─ textTransform (uppercase)
├─ Tamanho (multiplic.)  ├─ Alinhamento (right)
├─ Cor (headlineColor)   ├─ Largura (%)
└─ Alinhamento (left/ctr)└─ Padding global

E MAIS (se for TextElement):
ElementContentBlock      Canvas (duplo-clique)
├─ fontSize (px)         └─ Edição inline de conteúdo
├─ Rotação
├─ Posição X/Y
└─ Largura (px)

Propriedades NO TIPO mas SEM UI (TextElement.styles):
🧬 fontWeight  🧬 fontStyle  🧬 textDecoration  🧬 lineHeight  🧬 opacity

Propriedades AUSENTES do contrato:
❌ letterSpacing  ❌ textShadow  ❌ textStroke  ❌ headlineFontWeight
```

---

## 📊 Resumo Executivo

| Categoria | Status | Cobertura real (UI) | Cobertura tipo (schema) |
|---|---|---|---|
| Tipografia Básica | ✅ Completo | 85% | 85% |
| Tipografia Avançada | ❌ Inacessível | 20% | 55% |
| Dimensionamento | ⚠️ Parcial | 75% (falta line-height e letter-spacing) | 85% |
| Alinhamento Interno | ⚠️ Parcial | 67% (FontColorBlock sem right; sem justify) | 100% |
| Posicionamento Canvas | ✅ Completo | 90% (freePosition frágil na troca de layout) | 100% |
| Funções Avançadas | ❌ Incompleto | 25% | 40% |

**Score Geral:** **58/100** — O sistema tem base sólida de renderização e posicionamento (drag, grid 3×3, edição inline), mas a **dispersão dos controles por 4 blocos** e a **ausência de UI para 5 propriedades já tipadas** derrubam a experiência.

---

## 📁 Arquivos-Chave Analisados

```
client/src/
├── store/editorStore.ts                             — Estado central (Zustand)
├── components/
│   ├── views/WorkbenchV2/
│   │   ├── blocks/
│   │   │   ├── FontColorBlock.tsx                   — Tipografia & cor
│   │   │   ├── ElementContentBlock.tsx              — Edição de TextElement
│   │   │   ├── LayoutBlock.tsx                      — Grid 3×3, posição, alinhamento
│   │   │   └── DesignBlock.tsx                      — Design Tokens
│   │   ├── PostCardV2.tsx                           — Renderização (6 layouts)
│   │   └── CanvasWorkspace.tsx                      — Canvas central
│   ├── canvas/
│   │   ├── AdvancedTextNode.tsx                     — Texto livre arrastável
│   │   └── DraggableBlock.tsx                       — Bloco arrastável genérico
│   └── ChameleonPanel.tsx                           — Painel de design tokens
├── editor/
│   ├── adapters/
│   │   ├── layoutPositionAdapter.ts                 — Conversão geometria → freePosition
│   │   └── elementGeometryAdapters.ts               — Adaptadores de geometria
│   └── integration/
│       └── CanvasInteractionProvider.ts             — Interação no canvas
└── lib/
    ├── variationSnapshot.ts                         — Fonte única da verdade
    └── layoutToAdvanced.ts                          — Conversão layout → AdvancedLayoutSettings

shared/
├── postspark.ts                                     — Tipos (TextElement, LayoutPosition, DesignTokens, PostVariation)
└── postsparkSchemas.ts                              — Validação Zod
```
