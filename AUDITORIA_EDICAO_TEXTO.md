# 📋 Auditoria Técnica do Módulo de Edição de Texto — PostSpark 3

**Revisão 2** — 2026-06-29
**Escopo:** Análise profunda das capacidades de edição de texto (tipografia, dimensionamento, alinhamento, posicionamento e funções avançadas)

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

## ✅ O que Funciona Perfeitamente (Produção)

### 1. Sistema de Fontes Hierárquico
- Três escopos: `headline`, `body`, `global` (ambos)
- Override por elemento (`headlineFontFamily`, `bodyFontFamily`)
- Integração com Google Fonts via `useDynamicFont`
- Fallback: `designTokens.typography.fontFamily` → `Inter` → `var(--font-display)`
- **Bloco:** `FontColorBlock` com `<FontDropdown />`

### 2. Multiplicadores de Tamanho
- Sliders 0.6× a 1.8× para título e corpo
- Integração com `useTextAutoFit` (tamanho base ajustado por aspect ratio)
- Visualização percentual em tempo real
- **Bloco:** `FontColorBlock`

### 3. Cores de Texto Granulares
- Três níveis: `textColor` (global), `headlineColor`, `bodyColor`
- Destaque: `accentColor` vinculado a `designTokens.colors.primary`
- Botão "Limpar" para remover overrides de cor
- **Blocos:** `FontColorBlock` + `DesignBlock`/`ChameleonPanel`

### 4. Sistema de Layout (Grid 3×3)
- 9 posições: `top-left` a `bottom-right`
- Aplicável a: headline, body, accentBar, badge, sticker, carouselArrow, card, sections
- Alinhamento por camada (`left`/`center`/`right`)
- Controle de largura por bloco (10-100%)
- **Bloco:** `LayoutBlock`

### 5. Edição Inline de Texto (WYSIWYG)
- **Headline e body:** `contentEditable` ativo em **todos os 6 layouts** do `PostCardV2` (story, centered, left-aligned, split, minimal, modern-card) — ativado por duplo-clique, persiste via `onBlur` → `commitCarouselAwareUpdate`
- **TextElement:** Duplo-clique no canvas → `contentEditable` com borda tracejada, persistência automática
- **Blocos/Componentes:** `PostCardV2`, `AdvancedTextNode`

### 6. Controles de Drag & Drop
- `CanvasInteractionProvider` com snapping e magnet
- `DraggableBlock` com medição de geometria e constraints de tamanho mínimo
- `InteractionOverlay` com alças de resize
- **Componentes:** `DraggableBlock`, `CanvasInteractionProvider`, `InteractionOverlay`

### 7. Controle de Escopo (ApplyScope)
- `current` | `all` | `selected`
- Aplicação coerente em carrossel (slide overrides)
- `CarouselScopeControl` para seleção múltipla de slides
- **Store:** `editorStore.applyScope`

### 8. Renderização Responsiva
- `useTextAutoFit`: ajuste automático de tamanho de fonte, line-clamp e padding por aspect ratio
- `line-clamp-2` em layouts compactos (story e minimal intencionalmente sem clamp)
- Suporte a 6 layouts: centered, left-aligned, split, minimal, modern-card, story
- `dynamicPadding` automático por formato

---

## ❌ O que está Quebrado, Instável ou Inacessível

### 1. Fragmentação dos Controles de Texto (problema estrutural)
**Localização:** `FontColorBlock` + `LayoutBlock` + `DesignBlock`/`ChameleonPanel` + `ElementContentBlock`

**Problema:** As propriedades de um mesmo elemento de texto estão espalhadas por 4 blocos diferentes, em abas colapsáveis distintas. O usuário não tem um ponto único para editar "estilo do título".

**Impacto:** Curva de descoberta alta. Para trocar fonte, cor, alinhamento e posição de um título, o usuário transita entre 3 blocos. A edição inline (duplo-clique no canvas) resolve parte do problema mas não está sinalizada visualmente.

---

### 2. Cinco Propriedades de TextElement Existem no Tipo mas sem UI
**Localização:** `TextElement.styles` em `shared/postspark.ts:401-406`

| Campo | Tipo | O que falta |
|---|---|---|
| `fontWeight` | `string` | Controle de peso (negrito, light, etc.) — sem UI |
| `fontStyle` | `string` | Toggle itálico — sem UI |
| `textDecoration` | `string` | Sublinhado/tachado — sem UI |
| `lineHeight` | `string` | Slider de altura de linha — sem UI |
| `opacity` | `string` | Slider de opacidade — sem UI |

**Impacto:** O contrato de dados suporta essas propriedades, o `AdvancedTextNode` as renderiza via `element.styles` spread, mas **nenhum bloco do Workbench expõe controles**. O `ElementContentBlock` só edita: texto, fontFamily, color, fontSize, rotação, posição X/Y e largura.

---

### 3. Alinhamento "right" Inconsistente entre Blocos
**Localização:** `FontColorBlock:265` vs `LayoutBlock:68`

- `FontColorBlock` (alinhamento global): só `left` e `center`
- `LayoutBlock` (alinhamento por camada): `left`, `center` e `right`

**Problema:** O `DesignTokens.typography.textAlign` restringe a `"left" | "center"`, então o alinhamento global não pode ser `right`. Mas o `LayoutBlock` permite `right` por camada individual — uma inconsistência que confunde.

**Impacto:** Usuário pode alinhar um elemento à direita via LayoutBlock, mas o controle "global" no FontColorBlock não reflete nem oferece essa opção.

---

### 4. Letter-Spacing/Tracking Ausente
**Problema:** `letterSpacing` não existe nem no tipo `TextElement.styles` nem no `PostVariation`. Nenhum controle em qualquer bloco.

**Impacto:** Impossível criar títulos com tracking negativo (comum em designs premium) ou expandido para legibilidade.

---

### 5. Sombras e Contornos de Texto Inexistentes
**Problema:** `text-shadow` e `-webkit-text-stroke` não têm propriedade no contrato de dados nem UI.

**Impacto:** Sem efeitos de profundidade tipográfica ou estilos "outline".

---

### 6. Posicionamento Livre Descartado ao Trocar Layout
**Localização:** `LayoutBlock:147-158`

**Problema:** Ao clicar num preset de layout master, o código limpa `freePosition` de **todos** os elementos:
```typescript
(["headline", "body", "accentBar", "badge", "sticker", "carouselArrow"] as const).forEach(layer => {
    if (clearedLayout[layer]) {
        clearedLayout[layer] = { ...clearedLayout[layer], freePosition: undefined };
    }
});
```

**Impacto:** Ajustes finos de posição são perdidos sem aviso ao alternar layouts.

---

### 7. z-index Automático sem Controle Manual
**Localização:** `AdvancedTextNode:110` e `ImageElementBlock:86`

**Problema:** z-index é binário e hardcoded: 1 (normal) ou 100 (selecionado). Sem slider ou controle de camada.

**Impacto:** Impossível definir ordem de sobreposição entre múltiplos elementos.

---

### 8. Transformação de Texto Global sem Override por Elemento
**Localização:** `ChameleonPanel:186-194` → `DesignTokens.typography.textTransform`

**Problema:** `textTransform` (`none`/`uppercase`) é exclusivamente global. Aplicado ao headline no `PostCardV2:1694` (modern-card) e ignorado nos demais layouts.

**Impacto:** Não é possível ter título em CAIXA ALTA e corpo em normal simultaneamente.

---

### 9. Bug: Primeiro Clique em Elemento Desloca os Demais (diagnóstico à parte)
**Localização:** `layoutPositionAdapter:71-76` + `interactionController:155` + `DraggableBlock:109,176`

**Problema:** Micro-movimento de ponteiro (≥5px) durante um clique converte o elemento para `position: absolute` via `freePosition`. O `useLayoutEffect` que mediria o `flowFootprint` retorna cedo (`if (isAbsolute) return`), e o shell externo recebe `display: contents`, removendo o elemento do fluxo.

**Impacto:** Outros elementos deslocam-se para preencher o vazio. Afeta apenas o primeiro clique em cada elemento.

---

### 10. Peso de Fonte por Headline/Body Inexistente
**Problema:** `PostVariation` tem `headlineFontFamily`, `headlineFontSize`, `headlineColor` mas **não** tem `headlineFontWeight` ou `bodyFontWeight`. O `PostCardV2` aplica `font-bold` hardcoded no headline e peso normal no body.

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

## 🚀 Recomendações de Melhoria

### Prioridade Alta (Refatoração Estrutural + UX Crítica)

1. **Unificar controles de estilo de texto em um bloco coeso**
   - Juntar `FontColorBlock` + alinhamento do `LayoutBlock` + `textTransform` num novo `TextStyleBlock` contextual
   - O bloco reage ao `layoutTarget` e mostra só as propriedades relevantes ao elemento selecionado
   - Elimina a necessidade de navegar entre 3-4 abas para formatar um título

2. **Expor as 5 propriedades órfãs do `TextElement.styles`**
   - Adicionar em `ElementContentBlock`: toggle negrito, toggle itálico, toggle sublinhado/tachado, slider line-height, slider opacidade
   - Estender também para headline/body (ex.: `headlineFontWeight`, `bodyFontWeight` no `PostVariation`)

3. **Corrigir alinhamento "right" no FontColorBlock**
   - Adicionar `"right"` ao array do `FontColorBlock:265`
   - Atualizar `DesignTokens.typography.textAlign` para aceitar `"left" | "center" | "right"`

4. **Sinalizar edição inline no canvas**
   - Adicionar cursor `text` ou tooltip "Duplo-clique para editar" ao pairar sobre headline/body
   - Já existe `contentEditable` em todos os layouts — só falta descoberta

### Prioridade Média (Novas Funcionalidades)

5. **Implementar letter-spacing/tracking**
   - Adicionar `letterSpacing: string` ao `TextElement.styles` e schema Zod
   - Slider no `ElementContentBlock` e no bloco unificado de estilo

6. **Implementar sombras e contornos de texto**
   - Adicionar `textShadow?: string` e `textStroke?: string` ao `TextElement.styles`
   - Controles de cor, deslocamento e blur no bloco de estilo

7. **Controle manual de z-index**
   - Adicionar `zIndex?: number` ao `TextElement` e `ImageElement`
   - Slider 0-100 no `ElementContentBlock`

8. **Preservar posicionamento livre ao trocar layout**
   - Remover a limpeza automática de `freePosition` no `LayoutBlock:147-158`
   - Ou: confirmar com o usuário antes de descartar

9. **Transformação de texto por elemento**
   - Mover `textTransform` para `LayoutPosition` (por elemento) ou adicionar `headlineTextTransform`/`bodyTextTransform`
   - Permitir uppercase só no título

### Prioridade Baixa (Refinamento)

10. **Adicionar `headlineFontWeight` e `bodyFontWeight` ao `PostVariation`**
    - Permite controle de peso independente para título e corpo

11. **Alinhamento justificado**
    - Adicionar `"justify"` às opções de `textAlign`

12. **Atalhos de teclado**
    - `Ctrl+B` (negrito), `Ctrl+I` (itálico), `Ctrl+U` (sublinhado) durante edição inline

13. **Presets de estilo**
    - Salvar e reaplicar configurações de tipografia entre elementos/posts

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

**Score Geral:** **58/100** — O sistema tem base sólida de renderização e posicionamento (drag, grid 3×3, edição inline), mas a **dispersão dos controles por 4 blocos** e a **ausência de UI para 5 propriedades já tipadas** derrubam a experiência. A edição inline (headline/body) funciona mas é invisível para o usuário.

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
│   │   │   └── DesignBlock.tsx                      — Design Tokens (delega p/ ChameleonPanel)
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
    ├── variationSnapshot.ts                         — Fonte única da verdade (snapshot)
    └── layoutToAdvanced.ts                          — Conversão layout → AdvancedLayoutSettings

shared/
├── postspark.ts                                     — Tipos (TextElement, LayoutPosition, DesignTokens, PostVariation)
└── postsparkSchemas.ts                              — Validação Zod
```

---

## 🔄 Changelog da Revisão 2

| Item | Revisão 1 | Revisão 2 |
|---|---|---|
| Edição inline headline/body | ❌ "não tem" | ✅ Existe em 6 layouts (`contentEditable`) |
| fontStyle, textDecoration, lineHeight, opacity, fontWeight | ✅ "Disponível" | 🧬 "Tipo existe, sem UI" |
| Alinhamento "right" | ❌ "ausente" | ⚠️ Ausente no FontColorBlock, presente no LayoutBlock |
| `ApplyScope "selected"` | Mencionado | Confirmado via `editorStore:34` |
| Fragmentação dos controles | Não documentada | Nova seção com mapa visual |
| Score | 72/100 | 58/100 (corrigido para refletir cobertura real de UI) |
| Recomendação #4 ("edição inline para texto base") | Sugeria implementar | Removida — já existe; substituída por "sinalizar descoberta" |
