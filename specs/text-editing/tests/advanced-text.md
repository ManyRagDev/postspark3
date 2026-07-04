# 🧪 Especificação de Testes: Texto Avançado

**Especifica:** Comportamento de funcionalidades avançadas de texto (letter-spacing, sombras, contornos, z-index)
**Baseado em:** `implementation-plan.md` Fase 3

---

## 📋 Contexto

Funcionalidades avançadas (`letterSpacing`, `textShadow`, `textStroke`, `zIndex`) não existem no contrato de dados nem na UI. Esta spec define sua adição.

---

## 🎯 Objetivos

1. Implementar letter-spacing/tracking
2. Implementar sombras e contornos de texto
3. Implementar controle manual de z-index
4. Aplicação em tempo real com preview

---

## 📐 Contrato

### Tipos — TextElement (adicionar)

```typescript
// shared/postspark.ts — Campos a adicionar

export interface TextElement {
  // ... campos existentes
  styles: {
    // ... existentes
    letterSpacing?: string;         // ✅ ADICIONAR: "-2px" a "5px"
    textShadow?: string;             // ✅ ADICIONAR: "x y blur color"
    WebkitTextStroke?: string;       // ✅ ADICIONAR: "width color"
  };
  zIndex?: number;                   // ✅ ADICIONAR: 0-100
}
```

### UI — TextStyleBlock / ElementContentBlock

```typescript
// Controles a adicionar:

interface LetterSpacingControl {
  value: string;  // "-2px" a "5px"
  step: "0.5px";
}

interface TextShadowControl {
  color: string;
  offsetX: string;  // "0px" a "10px"
  offsetY: string;  // "0px" a "10px"
  blur: string;     // "0px" a "20px"
}

interface TextStrokeControl {
  color: string;
  width: string;   // "0px" a "3px"
}

interface ZIndexControl {
  value: number;  // 0-100
}
```

---

## ✅ Critérios de Aceite

### CA-01: Letter-Spacing/Tracking

**Para TextElement:**
- [ ] Slider de -2px a 5px disponível
- [ ] Valor exibido em tempo real
- [ ] Aplica `letterSpacing: "${value}"`
- [ ] Step de 0.5px

**Para headline/body:**
- [ ] Opcional: slider em TextStyleBlock

### CA-02: Sombras de Texto (TextShadow)

**Para TextElement:**
- [ ] Controle de cor disponível
- [ ] Sliders para offsetX, offsetY, blur
- [ ] Toggle de ativação
- [ ] Preview em tempo real
- [ ] Aplica `text-shadow: CSS completo`

### CA-03: Contornos de Texto (TextStroke)

**Para TextElement:**
- [ ] Controle de cor disponível
- [ ] Slider de largura (0-3px)
- [ ] Toggle de ativação
- [ ] Preview em tempo real
- [ ] Aplica `-webkit-text-stroke: CSS completo`

### CA-04: Controle Manual de z-index

**Para TextElement e ImageElement:**
- [ ] Slider de 0 a 100 disponível
- [ ] Valor exibido
- [ ] Visualização de ordem de camada
- [ ] Elemento com zIndex maior renderiza sobre menor

### CA-05: Schema Zod Atualizado

- [ ] `postsparkSchemas.ts` valida novos campos
- [ ] Valores opcionais (undefined aceito)
- [ ] Ranges validados

### CA-06: Compatibilidade de Renderização

- [ ] `textShadow` renderizado corretamente
- [ ] `-webkit-text-stroke` com prefixo vendor
- [ ] Fallback para navegadores sem suporte

---

## 🧪 Casos de Teste

### TC-01: Letter-Spacing Negativo

**Dado:** Usuário editando TextElement
**E:** Slider de letter-spacing visível
**Quando:** Usuário define -1px
**Então:**
- `letterSpacing` definido como `"-1px"`
- Texto aparece com espaçamento condensado
- Legibilidade mantida

```typescript
test('aplicar letter-spacing negativo', () => {
  // Arrange
  const { getByLabelText } = render(<ElementContentBlock />);
  const slider = getByLabelText(/letter-spacing|tracking|espaçamento/i);

  // Act
  fireEvent.change(slider, { target: { value: '-1' } });

  // Assert
  expect(updateTextElement).toHaveBeenCalled();
  const styles = updateTextElement.mock.calls[0][0].styles;
  expect(styles.letterSpacing).toBe('-1px');

  const textElement = document.querySelector('[data-layout-id^="textElement:"]');
  expect(getComputedStyle(textElement).letterSpacing).toBe('-1px');
});
```

---

### TC-02: Letter-Spacing Positivo

**Dado:** Usuário editando TextElement
**E:** Slider de letter-spacing visível
**Quando:** Usuário define 2px
**Então:**
- `letterSpacing` definido como `"2px"`
- Texto aparece com espaçamento expandido

```typescript
test('aplicar letter-spacing positivo', () => {
  // Arrange
  const { getByLabelText } = render(<ElementContentBlock />);
  const slider = getByLabelText(/letter-spacing/i);

  // Act
  fireEvent.change(slider, { target: { value: '2' } });

  // Assert
  const styles = updateTextElement.mock.calls[0][0].styles;
  expect(styles.letterSpacing).toBe('2px');
});
```

---

### TC-03: Sombra de Texto Completa

**Dado:** Usuário editando TextElement
**E:** Controles de text-shadow visíveis
**Quando:** Usuário configura sombra
- Cor: `#000000`
- OffsetX: `2px`
- OffsetY: `2px`
- Blur: `4px`
**Então:**
- `textShadow` definido como `"2px 2px 4px #000000"`
- Sombra renderizada no canvas

```typescript
test('configurar sombra de texto completa', () => {
  // Arrange
  const { getByLabelText } = render(<ElementContentBlock />);
  
  // Act
  fireEvent.change(getByLabelText(/sombra cor|shadow color/i), { target: { value: '#000000' } });
  fireEvent.change(getByLabelText(/deslocamento x|offset x/i), { target: { value: '2' } });
  fireEvent.change(getByLabelText(/deslocamento y|offset y/i), { target: { value: '2' } });
  fireEvent.change(getByLabelText(/blur|desfoque/i), { target: { value: '4' } });

  // Assert
  expect(updateTextElement).toHaveBeenCalled();
  const styles = updateTextElement.mock.calls[0][0].styles;
  expect(styles.textShadow).toBe('2px 2px 4px #000000');

  const textElement = document.querySelector('[data-layout-id^="textElement:"]');
  expect(getComputedStyle(textElement).textShadow).toBe('rgb(0, 0, 0) 2px 2px 4px');
});
```

---

### TC-04: Contorno de Texto

**Dado:** Usuário editando TextElement
**E:** Controles de text-stroke visíveis
**Quando:** Usuário configura contorno
- Cor: `#ffffff`
- Largura: `1px`
**Então:**
- `WebkitTextStroke` definido como `"1px #ffffff"`
- Contorno renderizado no canvas

```typescript
test('configurar contorno de texto', () => {
  // Arrange
  const { getByLabelText } = render(<ElementContentBlock />);
  
  // Act
  fireEvent.change(getByLabelText(/contorno cor|stroke color/i), { target: { value: '#ffffff' } });
  fireEvent.change(getByLabelText(/contorno largura|stroke width/i), { target: { value: '1' } });

  // Assert
  expect(updateTextElement).toHaveBeenCalled();
  const styles = updateTextElement.mock.calls[0][0].styles;
  expect(styles.WebkitTextStroke).toBe('1px #ffffff');

  const textElement = document.querySelector('[data-layout-id^="textElement:"]');
  expect(getComputedStyle(textElement).WebkitTextStroke).toBe('1px rgb(255, 255, 255)');
});
```

---

### TC-05: z-index Manual

**Dado:** Usuário editando TextElement
**E:** Slider de z-index visível
**Quando:** Usuário define z-index como 50
**Então:**
- `zIndex` definido como `50`
- Elemento renderiza sobre elementos com z-index < 50
- Elemento renderiza sob elementos com z-index > 50

```typescript
test('definir z-index manual', () => {
  // Arrange
  const { getByLabelText } = render(<ElementContentBlock />);
  const slider = getByLabelText(/z-index|camada|layer/i);

  // Act
  fireEvent.change(slider, { target: { value: '50' } });

  // Assert
  expect(updateTextElement).toHaveBeenCalled();
  const updated = updateTextElement.mock.calls[0][0];
  expect(updated.zIndex).toBe(50);

  const textElement = document.querySelector('[data-layout-id^="textElement:"]');
  expect(getComputedStyle(textElement).zIndex).toBe('50');
});
```

---

### TC-06: Ordem de Sobreposição (z-index)

**Dado:** Canvas com 3 TextElements
- Elemento A: z-index 10
- Elemento B: z-index 20
- Elemento C: z-index 30
**Quando:** Canvas é renderizado
**Então:** Ordem visual é C → B → A (C no topo)

```typescript
test('ordem de sobreposição por z-index', () => {
  // Arrange
  const elements = [
    { id: 'a', text: 'A', x: 50, y: 50, zIndex: 10 },
    { id: 'b', text: 'B', x: 50, y: 50, zIndex: 20 }, // mesma posição que A
    { id: 'c', text: 'C', x: 50, y: 50, zIndex: 30 }, // mesma posição que A e B
  ];

  // Act
  const { container } = render(<PostCardV2 textElements={elements} />);

  // Assert — z-index CSS é o que define empilhamento
  const elA = container.querySelector('[data-layout-id="textElement:a"]');
  const elB = container.querySelector('[data-layout-id="textElement:b"]');
  const elC = container.querySelector('[data-layout-id="textElement:c"]');

  expect(getComputedStyle(elA).zIndex).toBe('10');
  expect(getComputedStyle(elB).zIndex).toBe('20');
  expect(getComputedStyle(elC).zIndex).toBe('30');
  // Validação visual de empilhamento requer teste de screenshot
});
```

---

### TC-07: Toggle de Sombra

**Dado:** Usuário editando TextElement
**E:** Controles de sombra visíveis
**Quando:** Usuário desativa toggle de sombra
**Então:**
- `textShadow` removido ou definido como `"none"`
- Sombra some do canvas

```typescript
test('toggle de sombra desativa sombra', () => {
  // Arrange
  const { getByLabelText, getByRole } = render(<ElementContentBlock />);
  const shadowToggle = getByRole('switch', { name: /sombra|shadow/i });
  
  // Configurar sombra primeiro
  fireEvent.change(getByLabelText(/sombra cor/i), { target: { value: '#000' } });
  
  // Act - Desativar
  fireEvent.click(shadowToggle);

  // Assert
  expect(updateTextElement).toHaveBeenCalled();
  const styles = updateTextElement.mock.calls[1][0].styles;
  expect(styles.textShadow).toBe('none');

  const textElement = document.querySelector('[data-layout-id^="textElement:"]');
  expect(getComputedStyle(textElement).textShadow).toBe('none');
});
```

---

### TC-08: Preview em Tempo Real

**Dado:** Usuário ajustando qualquer controle avançado
**Quando:** Valor muda
**Então:** Canvas atualiza imediatamente

```typescript
test('preview em tempo real de sombra', () => {
  // Arrange
  const { getByLabelText } = render(<ElementContentBlock />);
  const canvas = document.querySelector('[data-post-export-root]');
  const textElement = canvas?.querySelector('[data-layout-id^="textElement:"]');

  // Act
  const blurSlider = getByLabelText(/blur/i);
  fireEvent.input(blurSlider, { target: { value: '5' } });

  // Assert - Imediato (não aguarda submit)
  expect(getComputedStyle(textElement).textShadow).toContain('5px');
});
```

---

### TC-09: Validação de Range

**Dado:** Schema de `TextElement`
**Quando:** Valores fora do range são passados
**Então:** Zod lança erro ou ajusta para limite

```typescript
test('schema valida range de letter-spacing', () => {
  // Valores válidos
  const valid = { letterSpacing: '2px' };
  expect(() => TextElementSchema.parse(valid)).not.toThrow();
  
  // Valores inválidos (fora do range)
  const invalidTooLow = { letterSpacing: '-10px' }; // abaixo de -2
  const invalidTooHigh = { letterSpacing: '20px' }; // acima de 5
  
  // Zod deve ajustar ou rejeitar
  const result = TextElementSchema.safeParse(invalidTooLow);
  expect(result.success).toBe(false);
});
```

---

### TC-10: Compatibilidade de Navegador

**Dado:** Navegador sem suporte a `-webkit-text-stroke`
**Quando:** Texto com contorno é renderizado
**Então:** Fallback aplicado (texto sem contorno)

```typescript
test('fallback para text-stroke sem suporte', () => {
  // Arrange - Simular navegador sem suporte
  const originalSupport = CSS.supports('-webkit-text-stroke', '1px red');
  (CSS.supports as jest.Mock).mockReturnValue(false);

  const element = { id: 'test', text: 'Olá', x: 0, y: 0, styles: { WebkitTextStroke: '1px red', fontSize: '16px', fontFamily: 'Inter', color: '#fff', fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', lineHeight: '1.5', opacity: '1' }, rotation: 0, width: 'auto', height: 'auto' };

  // Act
  const { container } = render(<AdvancedTextNode element={element} />);

  // Assert - Texto renderiza sem erro, sem contorno aplicado
  const textElement = container.querySelector('[contenteditable]') || container.firstChild;
  expect(textElement).toBeInTheDocument();
  // Em navegador sem suporte, -webkit-text-stroke é ignorado
});
```

---

## 🔗 Dependências

- `ElementContentBlock.tsx` (estender)
- `TextStyleBlock.tsx` (opcional: letter-spacing para headline/body)
- `shared/postspark.ts` — adicionar campos
- `shared/postsparkSchemas.ts` — atualizar schema
- `AdvancedTextNode.tsx` — aplicar estilos

---

## 📝 Notas de Implementação

1. **Prefixo vendor:**
   - `-webkit-text-stroke` com prefixo
   - `text-shadow` sem prefixo (suporte universal)

2. **Valores válidos:**
   - `letterSpacing`: `"-2px"` a `"5px"`
   - `textShadow`: `"x y blur color"`
   - `WebkitTextStroke`: `"width color"`
   - `zIndex`: `0` a `100`

3. **Performance:**
   - Sombras podem ter custo de renderização
   - Limitar blur a 20px máximo
   - Considerar `will-change` para animações

4. **Acessibilidade:**
   - Sombras muito sutis podem reduzir contraste
   - Validar contraste WCAG

---

## 📊 Matriz de Rastreabilidade

| Caso de Teste | Critério de Aceite | Propriedade |
|---------------|-------------------|-------------|
| TC-01 | CA-01 | letterSpacing (negativo) |
| TC-02 | CA-01 | letterSpacing (positivo) |
| TC-03 | CA-02 | textShadow |
| TC-04 | CA-03 | WebkitTextStroke |
| TC-05 | CA-04 | zIndex |
| TC-06 | CA-04 | zIndex (ordem) |
| TC-07 | CA-02 | textShadow (toggle) |
| TC-08 | CA-01-04 | Preview em tempo real |
| TC-09 | CA-05 | Validação Zod |
| TC-10 | CA-06 | Compatibilidade |
