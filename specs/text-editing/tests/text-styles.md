# 🧪 Especificação de Testes: Estilos de Texto

**Especifica:** Comportamento de propriedades avançadas de texto (peso, itálico, decoração, line-height, opacidade)
**Baseado em:** `implementation-plan.md` Fase 2

---

## 📋 Contexto

Propriedades `fontWeight`, `fontStyle`, `textDecoration`, `lineHeight` e `opacity` existem no tipo `TextElement.styles` mas **não têm UI**. Usuários não conseguem acessá-las no Workbench.

Esta spec define a exposição dessas propriedades na UI e sua extensão para `headline`/`body` (não apenas `TextElement`).

---

## 🎯 Objetivos

1. Adicionar UI para as 5 propriedades órfãs
2. Estender propriedades para `headline`/`body` via `PostVariation`
3. Aplicação em tempo real no canvas
4. Persistência e recuperação

---

## 📐 Contrato

### Tipos — TextElement (já existe)

```typescript
// shared/postspark.ts — Tipos existentes (sem mudança)

export interface TextElement {
  styles: {
    fontSize: string;
    fontFamily: string;
    color: string;
    fontWeight: string;      // 🧬 Já existe
    fontStyle: string;       // 🧬 Já existe
    textDecoration: string;  // 🧬 Já existe
    textAlign: "left" | "center" | "right";
    lineHeight: string;      // 🧬 Já existe
    opacity: string;         // 🧬 Já existe
  };
}
```

### Tipos — PostVariation (adicionar)

```typescript
// shared/postspark.ts — Campos a adicionar

export interface PostVariation {
  // ... campos existentes
  
  // ✅ ADICIONAR estes campos:
  headlineFontWeight?: "normal" | "bold" | number;  // 100-900
  bodyFontWeight?: "normal" | "bold" | number;
  headlineFontStyle?: "normal" | "italic";
  bodyFontStyle?: "normal" | "italic";
  headlineTextDecoration?: "none" | "underline" | "line-through";
  bodyTextDecoration?: "none" | "underline" | "line-through";
}
```

### UI — TextStyleBlock

```typescript
// client/src/components/views/WorkbenchV2/blocks/TextStyleBlock.tsx

interface TextStyleControls {
  // Controles para TextElement (já existe tipo)
  fontWeight: "normal" | "bold" | number;
  fontStyle: "normal" | "italic";
  textDecoration: "none" | "underline" | "line-through" | "underline line-through";
  lineHeight: string;  // "1.0" - "2.5"
  opacity: string;     // "0" - "1"
  
  // Controles para headline/body (adicionar)
  headlineFontWeight?: "normal" | "bold";
  bodyFontWeight?: "normal" | "bold";
  // ... etc
}
```

---

## ✅ Critérios de Aceite

### CA-01: Controle de Peso da Fonte (FontWeight)

**Para TextElement:**
- [ ] Toggle ou slider disponível em `TextStyleBlock`
- [ ] Valores: `"normal"`, `"bold"`, ou 100-900
- [ ] Aplicação em tempo real no canvas

**Para headline/body:**
- [ ] Controle em `TextStyleBlock` (quando target = headline/body)
- [ ] Valores: `"normal"` ou `"bold"`
- [ ] `PostCardV2.tsx` aplica `headlineFontWeight` e `bodyFontWeight`

### CA-02: Controle de Estilo Itálico (FontStyle)

**Para TextElement:**
- [ ] Toggle "Itálico" disponível
- [ ] Aplica `fontStyle: "italic"` quando ativo
- [ ] Toggle visual indicando estado

**Para headline/body:**
- [ ] Controle em `TextStyleBlock`
- [ ] `headlineFontStyle` e `bodyFontStyle` aplicados

### CA-03: Controle de Decoração de Texto

**Para TextElement:**
- [ ] Toggle "Sublinhado" disponível
- [ ] Toggle "Tachado" disponível
- [ ] Ambos podem estar ativos simultaneamente
- [ ] Aplica `textDecoration: "underline line-through"`

**Para headline/body:**
- [ ] Controle em `TextStyleBlock`
- [ ] `headlineTextDecoration` e `bodyTextDecoration` aplicados

### CA-04: Controle de Altura de Linha (LineHeight)

**Para TextElement:**
- [ ] Slider de 1.0 a 2.5 disponível
- [ ] Valor exibido em tempo real
- [ ] Aplica `lineHeight: "${value}"`

**Para headline/body:**
- [ ] Slider opcional (adicional, não obrigatório)
- [ ] Valores hardcoded por layout mantidos como fallback

### CA-05: Controle de Opacidade

**Para TextElement:**
- [ ] Slider de 0 a 1 disponível
- [ ] Valor exibido como porcentagem
- [ ] Aplica `opacity: "${value}"`

**Para headline/body:**
- [ ] Slider opcional em `TextStyleBlock`

### CA-06: Schema Zod Atualizado

- [ ] `postsparkSchemas.ts` valida novos campos
- [ ] Valores padrão definidos
- [ ] Mensagens de erro claras

### CA-07: Persistência e Recuperação

- [ ] Valores salvos no `editorStore`
- [ ] Persistem ao salvar post
- [ ] Recuperados ao recarregar página

---

## 🧪 Casos de Teste

### TC-01: Toggle Negrito (FontWeight)

**Dado:** Usuário selecionou headline como target
**E:** Controle de peso está visível
**Quando:** Usuário ativa "Negrito"
**Então:**
- `headlineFontWeight` definido como `"bold"`
- Headline no canvas renderiza com peso bold
- Toggle mostra estado ativo

```typescript
test('ativar negrito no headline', () => {
  // Arrange
  setLayoutTarget('headline');
  const { getByLabelText } = render(<TextStyleBlock />);
  const boldToggle = getByLabelText(/negrito|bold/i);

  // Act
  fireEvent.click(boldToggle);

  // Assert
  expect(updateVariation).toHaveBeenCalledWith({
    headlineFontWeight: 'bold',
  });

  const headline = document.querySelector('[data-layout-id="headline"]');
  expect(getComputedStyle(headline).fontWeight).toBe('700');
});
```

---

### TC-02: Toggle Itálico (FontStyle)

**Dado:** Usuário selecionou body como target
**E:** Controle de itálico está visível
**Quando:** Usuário ativa "Itálico"
**Então:**
- `bodyFontStyle` definido como `"italic"`
- Body no canvas renderiza em itálico

```typescript
test('ativar itálico no body', () => {
  // Arrange
  setLayoutTarget('body');
  const { getByLabelText } = render(<TextStyleBlock />);
  const italicToggle = getByLabelText(/itálico|italic/i);

  // Act
  fireEvent.click(italicToggle);

  // Assert
  expect(updateVariation).toHaveBeenCalledWith({
    bodyFontStyle: 'italic',
  });
});
```

---

### TC-03: Toggle Sublinhado (TextDecoration)

**Dado:** Usuário está editando TextElement
**E:** Controles de decoração estão visíveis
**Quando:** Usuário ativa "Sublinhado"
**Então:**
- `textDecoration` definido como `"underline"`
- Texto aparece sublinhado no canvas

```typescript
test('ativar sublinhado em TextElement', () => {
  // Arrange
  const { getByLabelText } = render(<ElementContentBlock />);
  const underlineToggle = getByLabelText(/sublinhado|underline/i);

  // Act
  fireEvent.click(underlineToggle);

  // Assert
  expect(updateTextElement).toHaveBeenCalled();
  const styles = updateTextElement.mock.calls[0][0].styles;
  expect(styles.textDecoration).toContain('underline');
});
```

---

### TC-04: Combinação Sublinhado + Tachado

**Dado:** Texto já sublinhado
**Quando:** Usuário ativa "Tachado"
**Então:**
- `textDecoration` contém ambos: `"underline line-through"`
- Ambas decorações visíveis no canvas

```typescript
test('combinar sublinhado e tachado', () => {
  // Arrange
  const { getByLabelText } = render(<ElementContentBlock />);
  fireEvent.click(getByLabelText(/sublinhado/i));

  // Act
  fireEvent.click(getByLabelText(/tachado|strikethrough/i));

  // Assert
  const styles = updateTextElement.mock.calls[1][0].styles;
  expect(styles.textDecoration).toBe('underline line-through');
});
```

---

### TC-05: Slider de Altura de Linha

**Dado:** Usuário editando TextElement
**E:** Slider de line-height visível
**Quando:** Usuário arrasta slider para 1.8
**Então:**
- `lineHeight` definido como `"1.8"`
- Altura da linha aplicada no canvas
- Valor numérico exibido

```typescript
test('ajustar altura da linha', () => {
  // Arrange
  const { getByLabelText } = render(<ElementContentBlock />);
  const slider = getByLabelText(/altura da linha|line-height/i);

  // Act
  fireEvent.change(slider, { target: { value: '1.8' } });

  // Assert
  expect(updateTextElement).toHaveBeenCalled();
  const styles = updateTextElement.mock.calls[0][0].styles;
  expect(styles.lineHeight).toBe('1.8');

  const textElement = document.querySelector('[data-layout-id^="textElement:"]');
  expect(getComputedStyle(textElement).lineHeight).toBe('1.8');
});
```

---

### TC-06: Slider de Opacidade

**Dado:** Usuário editando TextElement
**E:** Slider de opacidade visível
**Quando:** Usuário define opacidade como 0.5
**Então:**
- `opacity` definido como `"0.5"`
- Texto renderiza com 50% de opacidade

```typescript
test('ajustar opacidade', () => {
  // Arrange
  const { getByLabelText } = render(<ElementContentBlock />);
  const slider = getByLabelText(/opacidade|opacity/i);

  // Act
  fireEvent.change(slider, { target: { value: '0.5' } });

  // Assert
  expect(updateTextElement).toHaveBeenCalled();
  const styles = updateTextElement.mock.calls[0][0].styles;
  expect(styles.opacity).toBe('0.5');
});
```

---

### TC-07: Aplicação em Tempo Real

**Dado:** Usuário editando TextElement
**Quando:** Qualquer propriedade de estilo é alterada
**Então:** Canvas atualiza imediatamente (sem reload)

```typescript
test('aplicação em tempo real no canvas', () => {
  // Arrange
  const { getByLabelText } = render(<ElementContentBlock />);
  const canvas = document.querySelector('[data-post-export-root]');

  // Act
  const boldToggle = getByLabelText(/negrito/i);
  fireEvent.click(boldToggle);

  // Assert — canvas atualizado imediatamente (sem reload)
  const textEl = canvas?.querySelector('[data-layout-id^="textElement:"]');
  expect(getComputedStyle(textEl).fontWeight).toBe('700');
});
```

---

### TC-08: Persistência de Estilos

**Dado:** Usuário definiu múltiplos estilos
**Quando:** Post é salvo e recarregado
**Então:** Todos os estilos são preservados

```typescript
test('persistência de estilos múltiplos', async () => {
  // Arrange
  const { user } = setupUser();
  setLayoutTarget('headline');
  
  // Act - Configurar estilos
  await user.click(screen.getByLabelText(/negrito/i));
  await user.click(screen.getByLabelText(/itálico/i));
  await user.click(screen.getByLabelText(/sublinhado/i));
  
  // Salvar
  await user.click(screen.getByText(/salvar/i));
  await waitFor(() => screen.getByText(/salvo/i));
  
  // Recarregar
  reload();
  
  // Assert
  expect(screen.getByLabelText(/negrito/i)).toBeChecked();
  expect(screen.getByLabelText(/itálico/i)).toBeChecked();
  expect(screen.getByLabelText(/sublinhado/i)).toBeChecked();

  const headline = document.querySelector('[data-layout-id="headline"]');
  expect(getComputedStyle(headline).fontWeight).toBe('700');
  expect(getComputedStyle(headline).fontStyle).toBe('italic');
  expect(getComputedStyle(headline).textDecoration).toContain('underline');
});
```

---

### TC-09: Validação Zod

**Dado:** Schema de `PostVariation`
**Quando:** Valores inválidos são passados
**Então:** Zod lança erro de validação

```typescript
test('schema valida campos de estilo', () => {
  // Valores válidos
  const validVariation = {
    headlineFontWeight: 'bold',
    bodyFontStyle: 'italic',
    headlineTextDecoration: 'underline',
  };
  expect(() => PostVariationSchema.parse(validVariation)).not.toThrow();
  
  // Valores inválidos
  const invalidVariation = {
    headlineFontWeight: 'super-bold', // inválido
  };
  expect(() => PostVariationSchema.parse(invalidVariation)).toThrow();
});
```

---

### TC-10: Valores Padrão

**Dado:** Post sem estilos explícitos
**Quando:** Post é renderizado
**Então:** Valores padrão são aplicados

```typescript
test('valores padrão aplicados', () => {
  // Arrange - Post sem overrides de estilo
  const snapshot = { headline: 'Título', body: 'Corpo' };

  // Act
  const { container } = render(<PostCardV2 snapshot={snapshot} />);

  // Assert
  const headline = container.querySelector('[data-layout-id="headline"]');
  expect(getComputedStyle(headline).fontWeight).toBe('700'); // bold padrão
  expect(getComputedStyle(headline).fontStyle).toBe('normal');
  expect(getComputedStyle(headline).textDecoration).toBe('none');

  const body = container.querySelector('[data-layout-id="body"]');
  expect(getComputedStyle(body).fontWeight).toBe('400'); // normal padrão
});
```

---

## 🔗 Dependências

- `TextStyleBlock.tsx` (criado na Fase 1.1)
- `ElementContentBlock.tsx` (já existe, estender)
- `shared/postspark.ts` — adicionar campos
- `shared/postsparkSchemas.ts` — atualizar schema
- `PostCardV2.tsx` — aplicar estilos

---

## 📝 Notas de Implementação

1. **Controles em TextStyleBlock:**
   - Mostrar apenas quando target = headline, body, ou textElement
   - Para TextElement: slider line-height e opacity
   - Para headline/body: toggle negrito/itálico/sublinhado

2. **Valores válidos:**
   - `fontWeight`: `"normal"`, `"bold"`, ou 100-900
   - `fontStyle`: `"normal"`, `"italic"`
   - `textDecoration`: `"none"`, `"underline"`, `"line-through"`, `"underline line-through"`
   - `lineHeight`: `"1.0"` a `"2.5"`
   - `opacity`: `"0"` a `"1"`

3. **Acessibilidade:**
   - Toggles devem ter `aria-pressed`
   - Sliders devem ter `aria-valuenow`

---

## 📊 Matriz de Rastreabilidade

| Caso de Teste | Critério de Aceite | Propriedade |
|---------------|-------------------|-------------|
| TC-01 | CA-01 | fontWeight |
| TC-02 | CA-02 | fontStyle |
| TC-03 | CA-03 | textDecoration (underline) |
| TC-04 | CA-03 | textDecoration (combined) |
| TC-05 | CA-04 | lineHeight |
| TC-06 | CA-05 | opacity |
| TC-07 | CA-01-05 | Aplicação em tempo real |
| TC-08 | CA-07 | Persistência |
| TC-09 | CA-06 | Validação Zod |
| TC-10 | CA-01-05 | Valores padrão |
