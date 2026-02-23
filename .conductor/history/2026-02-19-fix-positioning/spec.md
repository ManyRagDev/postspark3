# Especificação Técnica: Unified Absolute Positioning (Architect Mode)

## Problema
O controle de posicionamento absoluto (Architect Mode) apresenta inconsistências entre diferentes proporções (aspect ratios) e layouts. O layout "Split", em particular, ignora completamente as configurações de posição, e outros layouts duplicam a lógica de renderização, potencializando discrepâncias.

## Solução Proposta
Implementar uma camada de renderização unificada (`ArchitectLayer`) para elementos posicionados absolutamente. Essa camada será ativada sempre que `advancedLayout` estiver presente, sobrepondo-se à estrutura de layout padrão (Flow), mas preservando o fundo/gradiente característico de cada estilo.

## Componente: `ArchitectLayer`
Este componente será responsável por posicionar `headline` e `body` com base nas coordenadas do grid 3x3.

### Lógica de Posicionamento (`resolvePosition`)
Devemos garantir que as regras CSS sejam robustas para qualquer container pai relativo.

```typescript
function resolvePosition(pos: TextPosition, padding: number): React.CSSProperties {
  // Mesma lógica do MAP atual, mas centralizada
  // Garantir que transformações não conflitem
}
```

### Comportamento em Layouts
- **Story / Centered / Left / Minimal**: Removem a renderização de texto "flow" e renderizam apenas o fundo + `ArchitectLayer`.
- **Split**: 
  - **Se Architect Mode inativo**: Mantém comportamento atual (Img 55% / Txt 45%).
  - **Se Architect Mode ativo**: O visual deve se comportar como um container único (100% altura) com a imagem de fundo (se houver) cobrindo tudo, ou manter a divisão visual mas permitir que o texto flutue "por cima"?
  - *Decisão*: Se o usuário ativa o "Architect Mode", ele quer controle total. O layout "Split" deve se comportar como um "background style". Porém, o "Split" corta a imagem. 
  - *Ajuste*: No Split, se Architect Mode estiver on, mantemos a imagem no topo (55%) e o fundo embaixo, MAS o texto flutua livremente sobre TUDO (z-index superior).

## Unificação
Refatorar `PostCard.tsx` para extrair a lógica condicional:

```tsx
// Dentro de cada bloco de layout (ex: centeredLayout)
{advancedLayout ? (
  <ArchitectLayer settings={advancedLayout} ... />
) : (
  <div className="flex ...">...conteúdo padrão...</div>
)}
```

Isso garante que a matemática de posição seja idêntica em todos os lugares.
