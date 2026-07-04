# 🧪 Especificação de Testes: Integração entre Blocos

**Especifica:** Comportamento integrado após unificação (`TextStyleBlock`) e migração de controles
**Baseado em:** `implementation-plan.md` Fase 1.1 e `01-spec-v1.md`

---

## 📋 Contexto

Após a criação do `TextStyleBlock`, os controles de estilo de texto migram de 4 blocos para um ponto central. É crítico validar que:
1. Nenhum controle foi perdido na migração
2. `LayoutBlock` continua funcional para grid, largura e padding
3. A transição de contexto (`layoutTarget`) funciona sem flicker ou estado inválido
4. `FontColorBlock` pode ser removido com segurança

---

## 🎯 Objetivos

1. Validar cobertura completa dos controles migrados
2. Garantir que `LayoutBlock` não perdeu funcionalidade essencial
3. Testar transições de `layoutTarget`
4. Confirmar remoção segura de `FontColorBlock`

---

## ✅ Critérios de Aceite

### CA-01: Cobertura Completa na Migração
- [ ] Todos os controles de `FontColorBlock` estão acessíveis via `TextStyleBlock`
- [ ] Controles de alinhamento migrados do `LayoutBlock` funcionam no `TextStyleBlock`
- [ ] `DesignBlock`/`ChameleonPanel` permanecem independentes (design tokens globais)

### CA-02: LayoutBlock Preservado
- [ ] Grid 3×3 de posições funciona
- [ ] Slider de largura do bloco (10-100%) funciona
- [ ] Slider de padding global (0-80px) funciona
- [ ] Presets de layout master funcionam (centered, left-aligned, split, minimal)

### CA-03: Transições de Contexto sem Flicker
- [ ] Ao clicar em headline → sidebar mostra controles de headline imediatamente
- [ ] Ao clicar em body → sidebar transiciona para controles de body
- [ ] Ao clicar no fundo → sidebar volta para modo global
- [ ] Estado dos controles reflete o elemento selecionado (sem valores residuais)

### CA-04: Remoção Segura de FontColorBlock
- [ ] Nenhum import quebrado após remoção
- [ ] WorkbenchV2 renderiza sem erros
- [ ] TypeScript compila sem erros

---

## 🧪 Casos de Teste

### TC-01: Migração Completa de Controles

**Dado:** `TextStyleBlock` implementado e `FontColorBlock` ainda presente
**Quando:** Compara-se a lista de controles expostos
**Então:** Todo controle de `FontColorBlock` tem equivalente em `TextStyleBlock`

```typescript
test('todos os controles de FontColorBlock migraram para TextStyleBlock', () => {
  const fontColorControls = [
    'font-family-dropdown',
    'headline-font-size-slider',
    'body-font-size-slider',
    'headline-color-picker',
    'body-color-picker',
    'accent-color-picker',
    'alignment-left-btn',
    'alignment-center-btn',
  ];

  for (const controlId of fontColorControls) {
    expect(
      screen.queryByTestId(controlId)
    ).toBeInTheDocument();
    // Ou: verificar que TextStyleBlock tem equivalente funcional
  }
});
```

---

### TC-02: LayoutBlock Mantém Funcionalidade Essencial

**Dado:** Alinhamento migrado para `TextStyleBlock`
**Quando:** Usuário interage com `LayoutBlock`
**Então:** Grid 3×3, largura e padding continuam funcionais

```typescript
test('LayoutBlock preserva grid, largura e padding após migração', () => {
  const { container } = render(<LayoutBlock />);

  // Grid 3×3 ainda existe
  const gridButtons = container.querySelectorAll('[title]');
  const positionButtons = Array.from(gridButtons).filter(
    btn => btn.getAttribute('title')?.includes('-')
  );
  expect(positionButtons.length).toBe(9);

  // Slider de largura funciona
  const widthSlider = screen.getByLabelText(/largura/i);
  expect(widthSlider).toBeInTheDocument();

  // Slider de padding funciona
  const paddingSlider = screen.getByLabelText(/padding|respiro/i);
  expect(paddingSlider).toBeInTheDocument();
});
```

---

### TC-03: Transição de layoutTarget sem Estado Residual

**Dado:** Usuário edita headline (fonte = "Inter", cor = "#ff0000")
**Quando:** Usuário clica em body
**Então:** Controles mostram valores do body, não do headline

```typescript
test('transição de contexto limpa estado residual', async () => {
  // Arrange - Selecionar headline e editar
  setLayoutTarget('headline');
  const fontDropdown = screen.getByTestId('font-family-dropdown');
  await user.selectOptions(fontDropdown, 'Inter');

  // Act - Selecionar body
  setLayoutTarget('body');

  // Assert - Controles refletem body, não headline
  const bodyFont = screen.getByTestId('font-family-dropdown');
  expect(bodyFont).toHaveValue(activeVariation.bodyFontFamily);
  // Não deve mostrar "Inter" (valor do headline)
});
```

---

### TC-04: Remoção de FontColorBlock não Quebra Build

**Dado:** `FontColorBlock.tsx` removido
**E:** Todos os imports atualizados para `TextStyleBlock`
**Quando:** Build é executado
**Então:** TypeScript compila sem erros

```typescript
test('WorkbenchV2 renderiza sem FontColorBlock', () => {
  // Arrange - FontColorBlock já removido dos imports
  // Act
  const { container } = render(<WorkbenchV2 />);

  // Assert - Nenhum erro de módulo não encontrado
  expect(container).toBeInTheDocument();
  // Verificar que TextStyleBlock está presente
  expect(screen.getByTestId('text-style-block')).toBeInTheDocument();
});
```

---

### TC-05: Modo Global vs Contextual

**Dado:** `layoutTarget = "global"`
**Quando:** Sidebar renderiza
**Então:** TextStyleBlock mostra controles globais (font-family, textTransform, alinhamento)

**Dado:** `layoutTarget = "headline"`
**Quando:** Sidebar renderiza
**Então:** TextStyleBlock mostra controles de headline + botão "Voltar"

```typescript
test('TextStyleBlock alterna entre modo global e contextual', () => {
  // Modo global
  setLayoutTarget('global');
  const { rerender } = render(<TextStyleBlock />);
  expect(screen.getByLabelText(/família de fonte/i)).toBeInTheDocument();
  expect(screen.queryByText(/voltar/i)).not.toBeInTheDocument();

  // Modo contextual
  setLayoutTarget('headline');
  rerender(<TextStyleBlock />);
  expect(screen.getByText(/título/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/voltar/i)).toBeInTheDocument();
});
```

---

### TC-06: Persistência entre Sessões

**Dado:** Usuário configurou headline com fonte "Inter", negrito, alinhamento direita
**Quando:** Post é salvo e página recarregada
**Então:** Todas as configurações são preservadas

```typescript
test('configurações de estilo persistem ao recarregar', async () => {
  // Arrange
  setLayoutTarget('headline');
  await user.click(screen.getByLabelText(/negrito/i));
  await user.click(screen.getByLabelText(/direita/i));

  // Act - Salvar e recarregar
  await user.click(screen.getByText(/salvar/i));
  reload();

  // Assert
  setLayoutTarget('headline');
  expect(screen.getByLabelText(/negrito/i)).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText(/direita/i)).toHaveClass('active');

  const headline = document.querySelector('[data-layout-id="headline"]');
  expect(getComputedStyle(headline).fontWeight).toBe('700');
  expect(getComputedStyle(headline).textAlign).toBe('right');
});
```

---

## 🔗 Dependências

- `TextStyleBlock.tsx` (criado na Fase 1.1)
- `WorkbenchV2.tsx` (atualizado para usar TextStyleBlock)
- `LayoutBlock.tsx` (atualizado para remover controles de alinhamento)
- `FontColorBlock.tsx` (removido após migração)

---

## 📝 Notas de Implementação

1. **Ordem de migração:** Criar TextStyleBlock → validar cobertura → remover FontColorBlock
2. **Testes de regressão:** Manter testes existentes de LayoutBlock e DesignBlock
3. **Seletores de teste:** Usar `data-testid` em vez de classes CSS para isolamento

---

## 📊 Matriz de Rastreabilidade

| Caso de Teste | Critério de Aceite | Foco |
|---------------|-------------------|------|
| TC-01 | CA-01 | Cobertura da migração |
| TC-02 | CA-02 | LayoutBlock preservado |
| TC-03 | CA-03 | Transições sem flicker |
| TC-04 | CA-04 | Remoção segura |
| TC-05 | CA-03 | Modo global vs contextual |
| TC-06 | CA-01, CA-03 | Persistência |
