# Plano de Implementação: Fix Positioning

## Arquivos
- `client/src/components/PostCard.tsx`

## Passos
1. Definir componente interno `ArchitectOverlay` dentro de `PostCard.tsx`.
2. Mover a lógica de `positionToCss` para dentro ou próximo desse componente.
3. Atualizar cada variável de layout (`storyContent`, `centeredLayout`, etc.) para usar `ArchitectOverlay` quando `advancedLayout` for definido.
4. Atualizar `splitLayout` para suportar `advancedLayout`:
   - Quando `advancedLayout` estiver ativo, o container `split` ainda renderiza a imagem no topo e o fundo embaixo, mas o container de texto deixa de ser um flex-box restritivo e passa a ser apenas um espaço visual, com o `ArchitectOverlay` posicionado sobre todo o card.
   - *Atenção*: O `ArchitectOverlay` deve ser filho direto do container principal do card (`relative`) para ter coordenadas corretas em relação ao card inteiro.

## Refatoração Estrutural
Ao invés de repetir `{al ? ... : ...}` dentro de cada layout, podemos ter uma estrutura assim:

```tsx
const content = advancedLayout ? (
  <ArchitectOverlay ... />
) : (
   // Renderiza o conteúdo padrão do layout específico
   // ...
);

// O layout específico renderiza APENAS O BACKGROUND/ESTRUTURA visual
// e injeta 'content' (se for flow) ou ignora (se for architect)?
```

Melhor: O `PostCard` renderiza o layout específico. O layout específico decide COMO renderizar o texto.
Se `advancedLayout` existe, TODOS os layouts devem renderizar o texto via `ArchitectOverlay`.

Vou substituir os blocos repetidos pela chamada unificada.
