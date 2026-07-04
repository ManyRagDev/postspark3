# 🚀 Plano de Implementação — Edição de Texto

**Baseado em:** `00-audit.md`
**Metodologia:** Spec-Driven Development
**Versão:** 1.0

---

## 📊 Visão Geral

| Fase | Esforço | Prioridade | Dependências | Valor Negócio |
|------|---------|------------|--------------|---------------|
| **Fase 1: Unificação + Alinhamento** | 8 story points | 🔴 Alta | Nenhuma | Resolve fragmentação principal + alinhamento direito |
| **Fase 2: Propriedades Avançadas** | 13 story points | 🟡 Média | Fase 1.1 (TextStyleBlock) | Expande UI para 5 propriedades órfãs |
| **Fase 3: Novas Funcionalidades** | 8 story points | 🟢 Baixa | Fase 2 | Letter-spacing, sombras, z-index |
| **Fase 4: Refinamento** | 5 story points | 🟢 Baixa | Fase 3 | Atalhos, presets, transformação |

**Total Estimado:** 34 story points

---

## 🎯 Fase 1: Unificação + Alinhamento (Alta Prioridade)

**Objetivo:** Eliminar fragmentação dos controles e corrigir alinhamento global.

### Epics

#### 1.1 Criar `TextStyleBlock` Unificado

**Problem:** Controles de texto espalhados por 4 blocos (`FontColorBlock`, `LayoutBlock`, `DesignBlock`, `ElementContentBlock`).

**Solution:** Criar bloco único reativo ao `layoutTarget`.

```typescript
// client/src/components/views/WorkbenchV2/blocks/TextStyleBlock.tsx

interface TextStyleBlockProps {
  // Reage ao layoutTarget atual
  target: LayoutTarget;
}

// Comportamento:
// - target = "headline" | "body" → mostra: fonte, tamanho, cor, alinhamento, peso, transform
// - target = "textElement:xxx" → mostra: fonte, tamanho px, cor, rotação, X/Y, estilos avançados
// - target = "badge" | "sticker" → mostra: fonte, tamanho, cor
// - target = "global" → mostra: font-family global, textTransform
```

**Critérios de Aceite:**
- [ ] Usuário edita título sem trocar de aba
- [ ] Controles contextuais aparecem baseados no elemento selecionado
- [ ] `FontColorBlock` descontinuado ( migrado para `TextStyleBlock`)
- - LayoutBlock perde controles de alinhamento (vão para TextStyleBlock)

**Arquivos:**
- Criar: `TextStyleBlock.tsx`
- Modificar: `WorkbenchV2.tsx` (substituir FontColorBlock)
- Remover: `FontColorBlock.tsx` (após migração)

---

#### 1.2 Adicionar Alinhamento à Direita Global

**Problem:** `FontColorBlock` só tem `left`/`center`. `right` existe em `LayoutBlock` mas não no controle global.

**Solution:** Atualizar tipo e UI. Executar junto com 1.1 (TextStyleBlock) para evitar dupla migração.

**Dependência:** `TextStyleBlock` deve estar criado (1.1) para receber o controle de alinhamento.

```typescript
// shared/postspark.ts

export interface DesignTokens {
  typography: {
    // Antes: textAlign: "left" | "center";
    textAlign: "left" | "center" | "right";  // ADICIONAR
    // ...
  };
}
```

**Critérios de Aceite:**
- [ ] Botão "right" adicionado ao controle de alinhamento
- [ ] Schema Zod atualizado para aceitar `"right"`
- [ ] `PostCardV2.tsx` respeita `textAlign: "right"`

**Arquivos:**
- Modificar: `shared/postspark.ts`, `shared/postsparkSchemas.ts`
- Modificar: `ChameleonPanel.tsx` ou `TextStyleBlock.tsx`

---

#### 1.3 Sinalizar Edição Inline no Canvas

**Problem:** Edição inline (duplo-clique) existe mas não tem indicador visual.

**Solution:** Cursor `text` e atributo `title` ou tooltip ao pairar sobre texto editável.

```tsx
// PostCardV2.tsx — Adicionar ao h2/p editáveis:

// 1. Cursor text via className condicional:
className={`... ${isEditable && !inlineEditTarget ? "cursor-text" : ""}`}
title={isEditable && !inlineEditTarget ? "Duplo-clique para editar" : undefined}

// 2. Ou via wrapper com tooltip Tailwind:
// <span className="group/tooltip relative">
//   <h2 ... />
//   <span className="invisible group-hover/tooltip:visible absolute -top-8 left-1/2 -translate-x-1/2
//     bg-white/10 backdrop-blur text-[10px] px-2 py-1 rounded whitespace-nowrap">
//     Duplo-clique para editar
//   </span>
// </span>
```

**Critérios de Aceite:**
- [ ] Cursor `text` ao pairar sobre headline/body em modo de edição
- [ ] Tooltip ou `title` attribute indicando "Duplo-clique para editar"
- [ ] Funciona em todos os 6 layouts
- [ ] Some quando edição inline já está ativa (`inlineEditTarget` preenchido)

**Arquivos:**
- Modificar: `PostCardV2.tsx` (adicionar cursor + title/tooltip)
- Opcional: Criar hook `useEditableHint`

---

### Estimativas Fase 1

| Epic | Complexidade | Risco | Estimativa |
|------|-------------|-------|------------|
| 1.1 TextStyleBlock | Alta (refatoração estrutural) | Médio | 5 SP |
| 1.2 Alinhamento right | Baixa | Baixo | 1 SP |
| 1.3 Sinalizar edição inline | Baixa | Baixo | 2 SP |
| **Total** | | | **8 SP** |

---

## 🔧 Fase 2: Propriedades Avançadas (Média Prioridade)

**Objetivo:** Expor as 5 propriedades órfãs do `TextElement.styles`.

### Epics

#### 2.1 Adicionar Controles de Estilo de Texto

**Problem:** `fontWeight`, `fontStyle`, `textDecoration`, `lineHeight`, `opacity` existem no tipo mas sem UI.

**Solution:** Adicionar controles em `TextStyleBlock` (ou `ElementContentBlock` para TextElement).

```typescript
// Controles a adicionar:

// 1. Peso da fonte (toggle ou slider)
interface FontWeightControl {
  value: "normal" | "bold" | number;  // 100-900
}

// 2. Estilo itálico (toggle)
interface FontStyleControl {
  italic: boolean;
}

// 3. Decoração de texto (multiselect)
interface TextDecorationControl {
  underline: boolean;
  strike: boolean;
}

// 4. Altura da linha (slider)
interface LineHeightControl {
  value: string;  // "1.0" a "2.5"
}

// 5. Opacidade (slider)
interface OpacityControl {
  value: string;  // "0" a "1"
}
```

**Critérios de Aceite:**
- [ ] Toggle/slider para cada propriedade
- [ ] Aplicação em tempo real no canvas
- [ ] Persistência no estado (editorStore)
- [ ] Validação Zod

**Arquivos:**
- Modificar: `TextStyleBlock.tsx` ou `ElementContentBlock.tsx`
- Modificar: `shared/postspark.ts` (se necessário adicionar ao PostVariation)

---

#### 2.2 Estender Propriedades para Headline/Body

**Problem:** `TextElement` tem `fontWeight` mas `headlineFontWeight` não existe em `PostVariation`.

**Solution:** Adicionar campos de override ao `PostVariation`.

```typescript
// shared/postspark.ts

export interface PostVariation {
  // ... campos existentes
  headlineFontWeight?: "normal" | "bold" | number;  // ADICIONAR
  bodyFontWeight?: "normal" | "bold" | number;      // ADICIONAR
  headlineFontStyle?: "normal" | "italic";           // ADICIONAR
  bodyFontStyle?: "normal" | "italic";              // ADICIONAR
}
```

**Critérios de Aceite:**
- [ ] Campos adicionados ao tipo
- [ ] Schema Zod atualizado
- [ ] UI conectada
- [ ] `PostCardV2.tsx` aplica os overrides

**Arquivos:**
- Modificar: `shared/postspark.ts`, `shared/postsparkSchemas.ts`
- Modificar: `PostCardV2.tsx` (aplicar estilos)
- Modificar: `TextStyleBlock.tsx` (controles)

---

### Estimativas Fase 2

| Epic | Complexidade | Risco | Estimativa |
|------|-------------|-------|------------|
| 2.1 Controles de estilo | Média | Baixo | 5 SP |
| 2.2 Extender para headline/body | Média | Baixo | 3 SP |
| Testes & validação | — | — | 5 SP |
| **Total** | | | **13 SP** |

---

## ✨ Fase 3: Novas Funcionalidades (Baixa Prioridade)

**Objetivo:** Implementar letter-spacing, sombras, contornos e z-index.

### Epics

#### 3.1 Letter-Spacing/Tracking

**Solution:** Adicionar ao contrato e UI.

```typescript
// shared/postspark.ts

export interface TextElementStyles {
  letterSpacing?: string;  // ADICIONAR: "-2px" a "5px"
}

// UI: Slider -2px a 5px em TextStyleBlock
```

**Critérios de Aceite:**
- [ ] Propriedade no tipo e schema
- [ ] Slider de controle
- [ ] Validação de range

---

#### 3.2 Sombras e Contornos de Texto

**Solution:** Adicionar propriedades de efeito.

```typescript
// shared/postspark.ts

export interface TextElementStyles {
  textShadow?: string;        // ADICIONAR: "x y blur color"
  WebkitTextStroke?: string;  // ADICIONAR: "width color"
}
```

**Critérios de Aceite:**
- [ ] UI com controles de cor, deslocamento, blur
- [ ] Preview em tempo real

---

#### 3.3 Controle Manual de z-index

**Solution:** Adicionar `zIndex` a elementos.

```typescript
// shared/postspark.ts

export interface TextElement {
  zIndex?: number;  // ADICIONAR: 0-100
}

export interface ImageElement {
  zIndex?: number;  // ADICIONAR: 0-100
}
```

**Critérios de Aceite:**
- [ ] Slider 0-100
- [ ] Visualização de ordem de camada

---

### Estimativas Fase 3

| Epic | Complexidade | Risco | Estimativa |
|------|-------------|-------|------------|
| 3.1 Letter-spacing | Baixa | Baixo | 2 SP |
| 3.2 Sombras/contornos | Média | Baixo | 3 SP |
| 3.3 z-index manual | Baixa | Baixo | 3 SP |
| **Total** | | | **8 SP** |

---

## 🎨 Fase 4: Refinamento (Baixa Prioridade)

### Epics

#### 4.1 Transformação de Texto por Elemento

**Solution:** Mover `textTransform` para nível de elemento.

```typescript
// shared/postspark.ts

export interface LayoutPosition {
  // ...
  textTransform?: "none" | "uppercase";  // ADICIONAR
}

// OU
export interface PostVariation {
  headlineTextTransform?: "none" | "uppercase";  // ADICIONAR
  bodyTextTransform?: "none" | "uppercase";      // ADICIONAR
}
```

---

#### 4.2 Atalhos de Teclado

**Solution:** Capturar atalhos durante edição inline.

```typescript
// Durante contentEditable:
// Ctrl+B → negrito
// Ctrl+I → itálico
// Ctrl+U → sublinhado
```

---

#### 4.3 Presets de Estilo

**Solution:** Salvar/carregar configurações de tipografia.

```typescript
interface TextStylePreset {
  id: string;
  name: string;
  styles: Partial<TextElementStyles>;
}
```

---

### Estimativas Fase 4

| Epic | Complexidade | Risco | Estimativa |
|------|-------------|-------|------------|
| 4.1 Transformação por elemento | Baixa | Baixo | 2 SP |
| 4.2 Atalhos de teclado | Média | Médio | 2 SP |
| 4.3 Presets | Média | Baixo | 1 SP |
| **Total** | | | **5 SP** |

---

## 🔍 Bugs Corretivos (Alocados nos Sprints)

| Bug | Prioridade | Estimativa | Sprint | Observações |
|-----|------------|------------|--------|-------------|
| Primeiro clique desloca elementos | 🔴 Alta | 3 SP | Sprint 1 | `layoutPositionAdapter:71-76` + `DraggableBlock:109,176` |
| Posicionamento livre limpo ao trocar layout | 🟡 Média | 2 SP | Sprint 3 | `LayoutBlock:147-158` |

---

## 📋 Cronograma Sugerido

```
Sprint 1 (2 semanas): Fase 1 completo (8 SP) + Bug do primeiro clique (3 SP) = 11 SP
Sprint 2 (2 semanas): Fase 2 completo (13 SP)
Sprint 3 (2 semanas): Fase 3 completo (8 SP) + Bug posicionamento livre (2 SP) = 10 SP
Sprint 4 (1 semana): Fase 4 completo (5 SP)
```

---

## 🧪 Estratégia de Testes

Para cada fase, especificar testes em `tests/*.md` antes da implementação.

- `tests/alignment.md` — Especificação de testes para alinhamento (Fase 1.2)
- `tests/text-styles.md` — Especificação de testes para estilos de texto (Fase 2)
- `tests/advanced-text.md` — Especificação de testes para texto avançado (Fase 3)
- `tests/integration.md` — Especificação de testes de integração entre blocos (Fase 1.1)

---

## 📊 Métricas de Sucesso

| Métrica | Antes | Depois (Meta) |
|---------|-------|---------------|
| Cobertura UI (tipografia) | 20% | 90% |
| Cliques para formatar título | 6+ | 2 |
| Propriedades sem UI | 5 | 0 |
| Score geral | 58/100 | 85/100 |
