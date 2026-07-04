# 🧪 Especificação de Testes: Alinhamento de Texto

**Especifica:** Comportamento de alinhamento de texto global e por elemento
**Baseado em:** `implementation-plan.md` Fase 1.2

---

## 📋 Contexto

Atualmente, `FontColorBlock` oferece apenas `left`/`center` para alinhamento global. `LayoutBlock` oferece `left`/`center`/`right` por elemento, mas essa diferença não é comunicada ao usuário.

Esta spec define o comportamento após unificação: **alinhamento deve estar disponível em 3 níveis (`left`/`center`/`right`) tanto global quanto por elemento.**

---

## 🎯 Objetivos

1. Adicionar opção `right` ao controle global de alinhamento
2. Manter opção `right` existente por elemento (sem regressão)
3. Atualizar tipo `DesignTokens.typography.textAlign`
4. Validar em todos os 6 layouts

---

## 📐 Contrato

### Tipos

```typescript
// shared/postspark.ts — Atualização

export interface DesignTokens {
  typography: {
    // Antes: textAlign: "left" | "center";
    textAlign: "left" | "center" | "right";  // ✅ ADICIONAR "right"
  };
}

// shared/postspark.ts — Sem mudanças (já existe)

export type TextAlignment = "left" | "center" | "right";

export interface LayoutPosition {
  textAlign: TextAlignment;
  // ...
}
```

### Componentes

```typescript
// TextStyleBlock.tsx — Controle global

const ALIGNMENT_OPTIONS = [
  { id: "left", label: "Esquerda", icon: AlignLeft },
  { id: "center", label: "Centro", icon: AlignCenter },
  { id: "right", label: "Direita", icon: AlignRight },  // ✅ ADICIONAR
];
```

---

## ✅ Critérios de Aceite

### CA-01: Controle Global Inclui Direita
- [ ] Botão "Direita" visível ao lado de "Esquerda" e "Centro"
- [ ] Clique no botão define `designTokens.typography.textAlign = "right"`
- [ ] Botão ativo tem destaque visual (cor de accent)

### CA-02: LayoutBlock Mantém Funcionalidade
- [ ] Opção `right` continua funcionando por elemento
- [ ] Sem regressão: `left` e `center` funcionam como antes
- [ ] Alinhamento por elemento sobrescreve global quando definido

### CA-03: PostCardV2 Aplica Alinhamento
- [ ] `PostCardV2.tsx` aplica `textAlign: "right"` quando definido
- [ ] Texto alinhado à direita em todos os 6 layouts:
  - centered
  - left-aligned
  - split
  - minimal
  - modern-card
  - story
- [ ] `line-clamp` respeitado mesmo com `textAlign: "right"`

### CA-04: Schema Zod Valida "right"
- [ ] `postsparkSchemas.ts` aceita `"right"` em `DesignTokens.typography.textAlign`
- [ ] Validação rejeita valores inválidos (`"justify"`, `"top"`)

### CA-05: Persistência e Recuperação
- [ ] Alinhamento `right` persiste no `editorStore`
- [ ] Ao recarregar página, alinhamento `right` é preservado
- [ ] Ao salvar post, alinhamento `right` é salvo no banco

---

## 🧪 Casos de Teste

### TC-01: Seleção de Alinhamento Direita

**Dado:** Usuário está editando um post
**E:** O controle de alinhamento global está visível
**Quando:** Usuário clica no botão "Direita"
**Então:**
- `designTokens.typography.textAlign` é definido como `"right"`
- Texto no canvas se alinha à direita
- Botão "Direita" fica ativo (destaque visual)

```typescript
test('selecionar alinhamento direita global', () => {
  // Arrange
  const { getByLabelText } = render(<TextStyleBlock />);
  const rightButton = getByLabelText(/direita/i);

  // Act
  fireEvent.click(rightButton);

  // Assert
  expect(updateVariation).toHaveBeenCalledWith({
    designTokens: expect.objectContaining({
      typography: expect.objectContaining({
        textAlign: 'right',
      }),
    }),
  });
});
```

---

### TC-02: Alinhamento Direita por Elemento

**Dado:** Usuário selecionou "headline" como layoutTarget
**E:** LayoutBlock mostra controles por elemento
**Quando:** Usuário clica no botão "Direita"
**Então:**
- `layoutSettings.headline.textAlign` é definido como `"right"`
- Somente headline se alinha à direita
- Body mantém alinhamento global ou seu próprio

```typescript
test('alinhamento direita por elemento (headline)', () => {
  // Arrange
  setLayoutTarget('headline');
  const { getByLabelText } = render(<LayoutBlock />);
  const rightButton = getByLabelText(/direita/i);

  // Act
  fireEvent.click(rightButton);

  // Assert
  expect(updateLayoutSettings).toHaveBeenCalledWith({
    headline: expect.objectContaining({
      textAlign: 'right',
    }),
  });
});
```

---

### TC-03: Alinhamento por Elemento Sobrescreve Global

**Dado:** Alinhamento global definido como `"center"`
**E:** Headline tem alinhamento específico `"right"`
**Quando:** Post é renderizado
**Então:**
- Headline usa `"right"` (sobrescreve)
- Body usa `"center"` (herda global)

```typescript
test('alinhamento por elemento sobrescreve global', () => {
  // Arrange
  const snapshot = {
    designTokens: { typography: { textAlign: 'center' } },
    layoutSettings: {
      headline: { textAlign: 'right' },
      body: { textAlign: undefined }, // herda
    },
  };

  // Act
  const { container } = render(<PostCardV2 snapshot={snapshot} />);

  // Assert — usa data-layout-id (atributo real do DOM via DraggableBlock)
  expect(container.querySelector('[data-layout-id="headline"]')).toHaveStyle({ textAlign: 'right' });
  expect(container.querySelector('[data-layout-id="body"]')).toHaveStyle({ textAlign: 'center' });
});
```

---

### TC-04: Alinhamento em Todos os Layouts

**Dado:** Post com `textAlign: "right"`
**Quando:** Usuário alterna entre layouts
**Então:** Texto permanece alinhado à direita em todos

```typescript
// Layouts reais do PostCardV2 (feature-grid é template de seção, não layout)
const layouts = ['centered', 'left-aligned', 'split', 'minimal', 'modern-card', 'story'];

test.each(layouts)('alinhamento direita no layout %s', (layout) => {
  // Arrange
  const snapshot = {
    layout,
    designTokens: { typography: { textAlign: 'right' } },
  };

  // Act
  const { container } = render(<PostCardV2 snapshot={snapshot} />);

  // Assert — headline e body usam data-layout-id via DraggableBlock
  const headline = container.querySelector('[data-layout-id="headline"]');
  const body = container.querySelector('[data-layout-id="body"]');
  if (headline) expect(headline).toHaveStyle({ textAlign: 'right' });
  if (body) expect(body).toHaveStyle({ textAlign: 'right' });
});
```

---

### TC-05: Validação Zod Rejeita Inválidos

**Dado:** Schema de `DesignTokens`
**Quando:** Valor inválido é passado
**Então:** Zod lança erro de validação

```typescript
test('schema rejeita textAlign inválido', () => {
  const invalidToken = {
    typography: { textAlign: 'justify' }, // inválido
  };

  expect(() => DesignTokensSchema.parse(invalidToken)).toThrow();
});
```

---

### TC-06: Persistência e Recuperação

**Dado:** Usuário definiu alinhamento como `"right"`
**Quando:** Post é salvo e recarregado
**Então:** Alinhamento `"right"` é preservado

```typescript
test('alinhamento persiste ao salvar/recarregar', async () => {
  // Arrange
  const { user } = setupUser();
  await user.click(screen.getByLabelText(/direita/i));

  // Act
  await user.click(screen.getByText(/salvar/i));
  await waitFor(() => screen.getByText(/salvo/i));
  reload();

  // Assert
  expect(screen.getByLabelText(/direita/i)).toHaveClass('active');
  // Headline usa data-layout-id="headline" (DraggableBlock)
  const headline = document.querySelector('[data-layout-id="headline"]');
  expect(getComputedStyle(headline).textAlign).toBe('right');
});
```

---

## 🔗 Dependências

- `TextStyleBlock.tsx` (criado na Fase 1.1)
- `shared/postspark.ts` — tipo atualizado
- `shared/postsparkSchemas.ts` — schema atualizado
- `PostCardV2.tsx` — renderização

---

## 📝 Notas de Implementação

1. **Atalho de teclado:** Considerar adicionar `Ctrl+Shift+R` para alinhar à direita rapidamente
2. **Acessibilidade:** Botões devem ter `aria-label` claro
3. **Ícones:** Usar `AlignRight` do lucide-react

---

## 📊 Matriz de Rastreabilidade

| Caso de Teste | Critério de Aceite | Arquivo Impactado |
|---------------|-------------------|-------------------|
| TC-01 | CA-01 | `TextStyleBlock.tsx` |
| TC-02 | CA-02 | `LayoutBlock.tsx` |
| TC-03 | CA-02 | `PostCardV2.tsx` |
| TC-04 | CA-03 | `PostCardV2.tsx` |
| TC-05 | CA-04 | `postsparkSchemas.ts` |
| TC-06 | CA-05 | `editorStore.ts` |
