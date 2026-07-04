# Hierarquia de Design: HoloDeck vs Workbench

**Data:** 2026-07-02  
**Status:** ✅ **ARQUITETURA CLAR E DEFINIDA**

---

## 🎯 Visão Geral

A implementação de novos estilos segue uma hierarquia clara que separa **escolhas macro** do **ajustes específicos**:

```
HoloDeck (Macro) → Workbench (Micro)
     ↓                  ↓
  Paletas           Elementos
  Receitas          Posicionamento
  Temas             Overrides
  Layout Geral      Cores Específicas
```

---

## 📱 HoloDeck: Escolhas Macro

**Responsabilidade:** Escolha da linha de design geral

### O que o usuário define no HoloDeck:

1. **Paleta Cromática** (10 novas + 8 existentes)
   - Cores globais (background, text, accent)
   - Temperatura (warm/cool/neutral)
   - Nível de contraste (AA/AAA)
   - Categoria (high-contrast, cyber, warm, cool)

2. **Receita de Composição** (7 novas)
   - Template (simple, feature-grid, numbered-list, step-by-step)
   - Layout geral (centered, left-aligned, split, minimal)
   - Estrutura de elementos (quantidade de textElements/imageElements)
   - Background inicial (solid, gallery, gradient)

3. **Tema Visual** (8 existentes + TemporaryThemes)
   - Estilo de card (neobrutalist, glass, minimal, editorial)
   - Decorações globais (noise, glitch, glow, grid)
   - Tipografia base (fontFamily global)
   - Border radius e sombras

### O que é persistido ao escolher no HoloDeck:

```typescript
// PostVisualSnapshot após seleção no HoloDeck
{
  // 1. Paleta aplicada
  designTokens: {
    colors: { background, primary, secondary, text, card },
    typography: { fontFamily, textTransform, textAlign },
    structure: { borderRadius, boxShadow, border }
  },

  // 2. Receita aplicada
  template: "feature-grid",
  sections: [...],           // Estrutura inicial
  textElements: [...],        // Posicionamento inicial
  imageElements: [...],       // Imagens iniciais

  // 3. Layout geral
  layout: "centered",
  aspectRatio: "1:1",
  bgValue: { type: "solid", color: "..." },
  bgOverlay: { opacity: 0.5, color: "#000000" }
}
```

---

## 🎨 Workbench: Ajustes Específicos

**Responsabilidade:** Refinamento de elementos individuais

### O que o usuário ajusta no Workbench:

1. **Override de Cores por Elemento**
   - `headlineColor`, `bodyColor` (diferente do textColor global)
   - `backgroundColor` específico para um textElement
   - Opacidade individual de elementos

2. **Posicionamento Geométrico**
   - X, Y, width, height de cada textElement/imageElement
   - Rotação individual
   - Z-index (quando disponível)

3. **Tipografia por Elemento**
   - Tamanho específico (headlineFontSize, bodyFontSize)
   - FontFamily por elemento (headlineFontFamily, bodyFontFamily)
   - Peso, estilo, decoração (quando disponível)

4. **Background e Overlay Finos**
   - Ajuste de zoom, pan, brightness, contrast
   - Overlay opacity e color
   - Blend mode (quando disponível)

### O que é persistido ao ajustar no Workbench:

```typescript
// PostVisualSnapshot após ajustes no Workbench
{
  // Macro (mantido do HoloDeck)
  designTokens: { ... },  // Inalterado
  template: "feature-grid", // Inalterado

  // Micro (alterações específicas)
  sections: [
    { id: "sec-1", label: "...", x: 50, y: 30, width: 80 }, // Ajustado
    { id: "sec-2", label: "...", x: 50, y: 60, width: 60 }  // Ajustado
  ],

  textElements: [
    {
      id: "title-custom",
      text: "Título Customizado",
      x: 50, y: 40,              // Ajustado manualmente
      rotation: -5,              // Ajustado manualmente
      styles: {
        fontSize: "42px",        // Ajustado manualmente
        color: "#FF0000",        // Override da cor global
        opacity: "0.9"           // Ajustado manualmente
      }
    }
  ],

  // Overrides de slide (carousel)
  slides: [
    {
      slideNumber: 1,
      editorState: {
        variation: {
          headlineColor: "#00FF00", // Override específico do slide
          layoutSettings: {
            headline: { x: 50, y: 35 } // Ajuste específico do slide
          }
        }
      }
    }
  ]
}
```

---

## 🔄 Fluxo de Dados: HoloDeck → Workbench

### Diagrama de Decisão:

```
User Input (URL/Texto)
        ↓
post.generate (IA)
        ↓
3 Variações Criadas
        ↓
    HoloDeck (Escolha Macro)
        ↓
┌─────────────────────────────────────┐
│  1. Escolher Paleta                 │
│     ↓                               │
│  2. Escolher Receita                │
│     ↓                               │
│  3. Preview Visual Completo         │
│     ↓                               │
│  4. "Ajustar no Workbench"          │
└─────────────────────────────────────┘
        ↓
    Workbench (Ajustes Micro)
        ↓
┌─────────────────────────────────────┐
│  1. Arrastar elementos              │
│     ↓                               │
│  2. Ajustar cores específicas       │
│     ↓                               │
│  3. Modificar tipografia            │
│     ↓                               │
│  4. Ajustar background              │
└─────────────────────────────────────┘
        ↓
    Salvar (post.save)
        ↓
PostVisualSnapshot Completo (Macro + Micro)
```

---

## 🎯 Contrato de Prioridade

### Como o sistema resolve conflitos entre macro e micro:

**1. Cores:**

```typescript
// Ordem de precedência (do maior para menor)
const finalColor = 
  element.styles.color ||           // 1. Override do elemento (micro)
  variation.headlineColor ||       // 2. Override do campo (micro)
  designTokens.colors.text ||      // 3. Paleta global (macro)
  "#000000";                       // 4. Fallback
```

**2. Tipografia:**

```typescript
const finalFont =
  element.styles.fontFamily ||         // 1. Override do elemento (micro)
  variation.headlineFontFamily ||      // 2. Override do campo (micro)
  designTokens.typography.fontFamily || // 3. Paleta global (macro)
  "Inter";                             // 4. Fallback
```

**3. Posicionamento:**

```typescript
const finalPosition =
  layoutSettings.sectionLayouts[section.id]?.x || // 1. Ajuste manual (micro)
  templateDefaultPosition[section.id]?.x ||      // 2. Template (macro)
  50;                                             // 3. Fallback
```

---

## 🏗️ Implementação no Código

### 1. HoloDeck: UI de Escolha Macro

```typescript
// client/src/components/views/HoloDeck.tsx

export function HoloDeck() {
  const [selectedPalette, setSelectedPalette] = useState<PalettePreset | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<CompositionRecipe | null>(null);

  const handleSelectVariation = (variation: PostVariation) => {
    // Aplicar paleta e receita ANTES de abrir Workbench
    const withPalette = applyPaletteToVariation(variation, selectedPalette);
    const withRecipe = applyRecipeToVariation(withPalette, selectedRecipe);
    
    // Criar snapshot completo (macro)
    const snapshot = createPostVisualSnapshot(withRecipe);
    
    // Enviar para Workbench
    editorStore.setWithSnapshot(snapshot);
    navigate("/workbench");
  };

  return (
    <div className="holodeck">
      {/* 1. Preview das 3 variações */}
      <VariationGrid variations={variations} />

      {/* 2. Seletor de Paleta (Macro) */}
      <PaletteSelector
        palettes={PALETTE_PRESETS}
        selected={selectedPalette}
        onSelect={setSelectedPalette}
      />

      {/* 3. Seletor de Receita (Macro) */}
      <RecipeSelector
        recipes={COMPOSITION_RECIPES}
        selected={selectedRecipe}
        onSelect={setSelectedRecipe}
      />

      {/* 4. Botão "Ajustar no Workbench" */}
      <button onClick={() => handleSelectVariation(selectedVariation)}>
        Ajustar no Workbench →
      </button>
    </div>
  );
}
```

### 2. Workbench: UI de Ajustes Micro

```typescript
// client/src/components/views/WorkbenchV2/WorkbenchV2.tsx

export function WorkbenchV2() {
  const { visualSnapshot } = useEditorStore();

  // Workbench NÃO expõe paletas (isso é macro do HoloDeck)
  // Workbench expõe APENAS ajustes específicos

  return (
    <div className="workbench">
      {/* Canvas com elementos arrastáveis */}
      <CanvasWorkspace snapshot={visualSnapshot} />

      {/* Controles de ajuste MICRO */}
      <PropertyPanel>
        {/* Cores específicas do elemento */}
        <ColorBlock
          label="Cor do Título"
          value={visualSnapshot.headlineColor}
          onChange={(color) => updateField("headlineColor", color)}
        />

        {/* Tipografia do elemento */}
        <TypographyBlock
          label="Tamanho do Título"
          value={visualSnapshot.headlineFontSize}
          onChange={(size) => updateField("headlineFontSize", size)}
        />

        {/* Posicionamento geométrico */}
        <GeometryBlock
          element={selectedElement}
          onPositionChange={(x, y) => updateElementPosition(selectedElement.id, x, y)}
        />
      </PropertyPanel>
    </div>
  );
}
```

---

## 📊 Matriz de Responsabilidades

| Decisão | Onde é Feita | Macro/Micro | Persistido Em |
|---------|--------------|-------------|---------------|
| **Paleta de Cores** | HoloDeck | Macro | `designTokens` |
| **Receita de Layout** | HoloDeck | Macro | `template`, `sections` |
| **Background Inicial** | HoloDeck | Macro | `bgValue` |
| **Cor de 1 Elemento** | Workbench | Micro | `textElements[].styles.color` |
| **Posição de 1 Elemento** | Workbench | Micro | `textElements[].x, y` |
| **Tamanho de 1 Fonte** | Workbench | Micro | `headlineFontSize` |
| **Rotação de 1 Elemento** | Workbench | Micro | `textElements[].rotation` |
| **Zoom do Background** | Workbench | Micro | `imageSettings.zoom` |
| **Overlay Opacity** | Workbench | Micro | `bgOverlay.opacity` |

---

## ✅ Benefícios Dessa Hierarquia

1. **Clareza Mental para o Usuário**
   - HoloDeck = "Quero que estilo geral?"
   - Workbench = "Quero ajustar o quê?"

2. **Performance**
   - HoloDeck faz mudanças "baratas" (troca de tokens)
   - Workbench faz mudanças "caras" (re-render de canvas)

3. **Undo/Redo Simples**
   - Macro: voltar para HoloDeck e escolher outra paleta
   - Micro: undo/redo no Workbench

4. **Prevenção de Sobrecarga**
   - Usuário não fica perdido com 100 opções no HoloDeck
   - Workbench mostra contexto relevante ao elemento selecionado

5. **Separação Técnica Limpa**
   - `designTokens` (macro) vs `textElements[].styles` (micro)
   - Fácil de debugar
   - Fácil de testar

---

## 🚨 O Que NÃO Fazer

### ❌ Anti-Pattern 1: Misturar Macro e Micro no HoloDeck

```typescript
// ERRADO: HoloDeck com ajuste fino
<HoloDeck>
  <PaletteSelector />        ✅ Macro
  <FontSizeSlider />         ❌ Micro (isso vai pro Workbench)
  <ElementPositionPicker />  ❌ Micro (isso vai pro Workbench)
</HoloDeck>
```

### ❌ Anti-Pattern 2: Workbench sem Contexto Macro

```typescript
// ERRADO: Workbench expõe paletas (deveria estar no HoloDeck)
<Workbench>
  <PaletteSelector />        ❌ Macro (isso está no HoloDeck)
  <ElementColorPicker />     ✅ Micro
  <ElementPositionSlider />  ✅ Micro
</Workbench>
```

### ❌ Anti-Pattern 3: Salvar Apenas Micro sem Macro

```typescript
// ERRADO: Perder designTokens ao salvar
const savedPost = {
  textElements: [...],     ✅ Micro salvo
  imageElements: [...],     ✅ Micro salvo
  // designTokens perdido!  ❌ Macro não salvo
};
```

---

## 📝 Implementação Checklist

### Fase 1: HoloDeck (Macro)
- [ ] Adicionar `PaletteSelector` no HoloDeck
- [ ] Adicionar `RecipeSelector` no HoloDeck
- [ ] Aplicar paleta + receita ao criar snapshot
- [ ] Mostrar preview completo da combinação
- [ ] Botão "Ajustar no Workbench" claro e visível

### Fase 2: Workbench (Micro)
- [ ] Remover seleção de paleta do Workbench
- [ ] Adicionar controles contextuais por elemento
- [ ] Mantém `designTokens` como read-only
- [ ] Permitir overrides em `textElements[].styles`
- [ ] Salvar macro + micro junto

### Fase 3: Integração
- [ ] Testar fluxo HoloDeck → Workbench → Salvar
- [ ] Testar reabertura de post salvo
- [ ] Testar carousel com overrides por slide
- [ ] Documentar contrato de prioridade

---

## 🎯 Conclusão

Essa hierarquia **HoloDeck (Macro) → Workbench (Micro)** é:

✅ **Arquiteturalmente Sólida**  
✅ **Psychologicamente Correta**  
✅ **Tecnicamente Viável**  
✅ **Alinhada com PostVisualSnapshot**

**Status:** ✅ **APROVADO** para implementação

---

**Documento criado:** 2026-07-02  
**Versão:** 1.0  
**Baseado:** Feedback do usuário + análise de `shared/postspark.ts`
