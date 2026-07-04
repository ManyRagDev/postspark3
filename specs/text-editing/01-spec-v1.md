# Unificação + Alinhamento — Spec v1

**Data:** 2026-06-29
**Status:** Approved
**Ver:** 01-spec-v1.md
**Cobre:** Fase 1 do `implementation-plan.md`

---

## 📋 Contexto

Os controles de edição de texto estão fragmentados por 4 blocos (`FontColorBlock`, `LayoutBlock`, `DesignBlock`, `ElementContentBlock`). O alinhamento global (`FontColorBlock`) só oferece `left`/`center`, enquanto `LayoutBlock` oferece `left`/`center`/`right` por camada sem comunicar essa diferença ao usuário. A edição inline de headline/body já existe (`contentEditable` no `PostCardV2`) mas não tem indicador visual de descoberta.

---

## 🎯 Objetivos

1. Criar `TextStyleBlock` unificado, reativo ao `layoutTarget`, concentrando controles de estilo de texto
2. Adicionar opção `right` ao alinhamento global (`DesignTokens.typography.textAlign`)
3. Sinalizar edição inline no canvas (cursor + indicador visual ao pairar)
4. Migrar controles de alinhamento do `LayoutBlock` para `TextStyleBlock`
5. Descontinuar `FontColorBlock` após migração completa

---

## 📐 Contrato de Interface

### TextStyleBlock (novo componente)

```typescript
// client/src/components/views/WorkbenchV2/blocks/TextStyleBlock.tsx

interface TextStyleBlockProps {
  // Reage ao layoutTarget do editorStore — sem props externas
}

// Comportamento contextual:
// target = "headline" | "body"
//   → fonte (family, size multiplier), cor (headlineColor/bodyColor),
//     alinhamento (left/center/right), peso, itálico, sublinhado,
//     transformação de texto
//
// target = "badge" | "sticker" | "accentBar" | "carouselArrow"
//   → fonte, cor, alinhamento
//
// target = "textElement:xxx"
//   → fonte, tamanho (px), cor, rotação, X/Y, largura,
//     estilos avançados (delega para ElementContentBlock)
//
// target = "global"
//   → font-family global, textTransform, alinhamento global
```

### Tipo atualizado

```typescript
// shared/postspark.ts

export interface DesignTokens {
  typography: {
    // Antes: textAlign: "left" | "center";
    textAlign: "left" | "center" | "right";  // ✅ ADICIONAR
  };
}
```

---

## ✅ Critérios de Aceite

### CA-01: TextStyleBlock reage ao layoutTarget
- [ ] Ao clicar num elemento no canvas, o bloco mostra controles relevantes
- [ ] Ao clicar no fundo (`layoutTarget="global"`), mostra controles globais
- [ ] Transição entre contextos é instantânea (sem flicker)

### CA-02: Alinhamento "right" disponível globalmente
- [ ] Botão "Direita" ao lado de "Esquerda" e "Centro"
- [ ] Define `designTokens.typography.textAlign = "right"`
- [ ] LayoutBlock mantém `right` por elemento (sem regressão)

### CA-03: PostCardV2 respeita textAlign="right"
- [ ] Todos os 6 layouts (story, centered, left-aligned, split, minimal, modern-card) aplicam `textAlign`
- [ ] `line-clamp` funciona com `textAlign: "right"`

### CA-04: Schema Zod aceita "right"
- [ ] `postsparkSchemas.ts` atualizado
- [ ] Valores inválidos rejeitados

### CA-05: Edição inline sinalizada
- [ ] Cursor `text` ao pairar sobre headline/body em modo de edição
- [ ] Tooltip ou hint visual de que duplo-clique ativa edição
- [ ] Funciona nos 6 layouts

### CA-06: Migração sem regressão
- [ ] Controles de `FontColorBlock` cobertos por `TextStyleBlock`
- [ ] LayoutBlock continua funcionando para grid 3×3, largura e padding
- [ ] Nenhum controle perdido na transição

---

## 🔗 Dependências

- `editorStore.layoutTarget` — estado existente
- `shared/postspark.ts` — DesignTokens
- `shared/postsparkSchemas.ts` — validação Zod
- `PostCardV2.tsx` — renderização

---

## 📝 Notas de Implementação

1. **TextStyleBlock** deve ser criado como novo arquivo. `FontColorBlock` permanece até migração validada, então é removido.
2. **LayoutBlock** perde os controles de alinhamento (vão para TextStyleBlock) e o seletor de camada (`activeLayer`), mantendo: grid 3×3, largura do bloco, padding, presets de layout.
3. **Tooltip de edição inline**: usar `title` attribute no elemento editável ou um wrapper com `group/tooltip` + `group-hover:opacity-100` do Tailwind.
4. **Alinhamento `right`** deve ser adicionado tanto ao tipo quanto ao schema Zod simultaneamente.

---

## 📊 Matriz de Rastreabilidade

| Problema (auditoria) | Critério | Teste |
|---|---|---|
| Fragmentação dos controles | CA-01, CA-06 | `integration.md` TC-01, TC-02 |
| Alinhamento `right` ausente | CA-02, CA-03, CA-04 | `alignment.md` TC-01 a TC-06 |
| Edição inline não sinalizada | CA-05 | `alignment.md` TC-04 (extendido) |

---

## 📊 Histórico de Revisões

| Versão | Data | Mudanças |
|--------|------|----------|
| v1 | 2026-06-29 | Criação baseada em `00-audit.md` e `implementation-plan.md` Fase 1 |
