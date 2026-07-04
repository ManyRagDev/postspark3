# Propriedades Avançadas de Texto — Spec v2

**Data:** 2026-06-29
**Status:** Approved
**Ver:** 02-spec-v2.md
**Cobre:** Fase 2 do `implementation-plan.md`

---

## 📋 Contexto

Cinco propriedades do `TextElement.styles` (`fontWeight`, `fontStyle`, `textDecoration`, `lineHeight`, `opacity`) existem no tipo e schema Zod mas **não têm controle de UI**. O `PostVariation` não tem equivalentes para headline/body (`headlineFontWeight`, `bodyFontStyle`, etc.). O `AdvancedTextNode` já aplica `element.styles` via spread — basta expor os controles.

---

## 🎯 Objetivos

1. Adicionar UI para as 5 propriedades órfãs em `TextStyleBlock` e `ElementContentBlock`
2. Estender `PostVariation` com campos de override por headline/body
3. Aplicar estilos em tempo real no canvas
4. Atualizar schema Zod

---

## 📐 Contrato de Interface

### Tipos — TextElement (sem mudança, já existe)

```typescript
// shared/postspark.ts — Tipos existentes

export interface TextElement {
  styles: {
    fontSize: string;
    fontFamily: string;
    color: string;
    fontWeight: string;      // 🧬 Já existe, sem UI
    fontStyle: string;       // 🧬 Já existe, sem UI
    textDecoration: string;  // 🧬 Já existe, sem UI
    textAlign: "left" | "center" | "right";
    lineHeight: string;      // 🧬 Já existe, sem UI
    opacity: string;         // 🧬 Já existe, sem UI
  };
}
```

### Tipos — PostVariation (adicionar)

```typescript
// shared/postspark.ts — Campos NOVOS

export interface PostVariation {
  // ... campos existentes (headlineFontFamily, headlineFontSize, headlineColor, etc.)

  headlineFontWeight?: "normal" | "bold";        // ✅ ADICIONAR
  bodyFontWeight?: "normal" | "bold";            // ✅ ADICIONAR
  headlineFontStyle?: "normal" | "italic";       // ✅ ADICIONAR
  bodyFontStyle?: "normal" | "italic";           // ✅ ADICIONAR
  headlineTextDecoration?: "none" | "underline" | "line-through";  // ✅ ADICIONAR
  bodyTextDecoration?: "none" | "underline" | "line-through";      // ✅ ADICIONAR
}
```

### UI — Controles a expor

```typescript
// Em TextStyleBlock (headline/body) e ElementContentBlock (TextElement)

interface StyleControls {
  fontWeight: { type: "toggle"; values: ["normal", "bold"] };
  fontStyle: { type: "toggle"; values: ["normal", "italic"] };
  textDecoration: {
    underline: { type: "toggle" };
    lineThrough: { type: "toggle" };
    // Ambos podem estar ativos → "underline line-through"
  };
  lineHeight: { type: "slider"; min: 1.0; max: 2.5; step: 0.1 };
  opacity: { type: "slider"; min: 0; max: 1; step: 0.05 };
}
```

---

## ✅ Critérios de Aceite

### CA-01: Peso da fonte (fontWeight)
- [ ] Toggle Negrito em `TextStyleBlock` (headline/body) e `ElementContentBlock` (TextElement)
- [ ] `headlineFontWeight` / `bodyFontWeight` definidos como `"bold"` quando ativo
- [ ] `PostCardV2` aplica `fontWeight` dinâmico (sobrescreve `font-bold` hardcoded)

### CA-02: Itálico (fontStyle)
- [ ] Toggle Itálico disponível
- [ ] `headlineFontStyle` / `bodyFontStyle` definidos como `"italic"`
- [ ] Canvas atualiza em tempo real

### CA-03: Decoração de texto (textDecoration)
- [ ] Toggle Sublinhado e Toggle Tachado independentes
- [ ] Ambos podem estar ativos simultaneamente → `"underline line-through"`
- [ ] `headlineTextDecoration` / `bodyTextDecoration` aplicados

### CA-04: Altura de linha (lineHeight)
- [ ] Slider 1.0–2.5 (step 0.1) para TextElement
- [ ] Slider opcional para headline/body (adicional aos hardcoded por layout)
- [ ] Valor numérico exibido ao lado do slider

### CA-05: Opacidade (opacity)
- [ ] Slider 0–1 (step 0.05) para TextElement
- [ ] Slider opcional para headline/body
- [ ] Valor exibido como porcentagem

### CA-06: Schema Zod atualizado
- [ ] Novos campos do `PostVariation` validados
- [ ] Valores default definidos (`"normal"` para weight/style)

### CA-07: Persistência
- [ ] Valores salvos no `editorStore`
- [ ] Persistem ao salvar/recarregar post
- [ ] Compatíveis com carrossel (slide overrides)

---

## 🔗 Dependências

- `TextStyleBlock.tsx` (Fase 1.1)
- `ElementContentBlock.tsx` (estender controles existentes)
- `shared/postspark.ts` — adicionar campos ao `PostVariation`
- `shared/postsparkSchemas.ts` — atualizar schema
- `PostCardV2.tsx` — aplicar `headlineFontWeight`, `bodyFontStyle`, etc.
- `editorStore.ts` — `normalizeVariationPatch` deve propagar novos campos

---

## 📝 Notas de Implementação

1. **Ordem de aplicação no PostCardV2**: overrides por elemento (`headlineFontWeight`) devem vir depois das classes hardcoded (`font-bold`) no style inline.
2. **Valores válidos**:
   - `fontWeight`: `"normal"` | `"bold"`
   - `fontStyle`: `"normal"` | `"italic"`
   - `textDecoration`: `"none"` | `"underline"` | `"line-through"` | `"underline line-through"`
   - `lineHeight`: `"1.0"` a `"2.5"`
   - `opacity`: `"0"` a `"1"`
3. **TextElement.styles**: as propriedades já existem, basta expor UI. Nenhuma mudança de tipo necessária.
4. **Acessibilidade**: Toggles com `aria-pressed`, sliders com `aria-valuenow`.

---

## 📊 Matriz de Rastreabilidade

| Problema (auditoria) | Critério | Teste |
|---|---|---|
| fontWeight sem UI | CA-01 | `text-styles.md` TC-01 |
| fontStyle sem UI | CA-02 | `text-styles.md` TC-02 |
| textDecoration sem UI | CA-03 | `text-styles.md` TC-03, TC-04 |
| lineHeight sem UI | CA-04 | `text-styles.md` TC-05 |
| opacity sem UI | CA-05 | `text-styles.md` TC-06 |
| Sem headlineFontWeight | CA-01, CA-06, CA-07 | `text-styles.md` TC-08, TC-09, TC-10 |

---

## 📊 Histórico de Revisões

| Versão | Data | Mudanças |
|--------|------|----------|
| v2 | 2026-06-29 | Criação baseada em `00-audit.md` e `implementation-plan.md` Fase 2 |
