# Especificação: Correção de Transferência e Edição de Design

## O Problema
O usuário relatou que o design (Cores/Tema) do Holodeck "não chega" ao Workbench.
Além disso, observou-se que a edição de cores no Workbench é bloqueada porque o componente `PostCard` prioriza as cores do Tema (`theme.colors`) sobre as cores da Variação (`variation.colors`).
Como o `Workbench` mantém o `activeTheme` ativo, as edições manuais na variação são ignoradas visualmente.

## Solução Técnica (Merge & Override)
Para garantir que o design chegue E seja editável:
1.  **Inicialização (Transferência):** Ao entrar no Workbench, se houver um `initialTheme`, suas cores devem ser imediatamente "impressas" no estado da `variation`.
    - Isso garante que os inputs de cor do Workbench mostrem "Verde" (se o tema for Cyber Core) em vez de "Branco" (default).
2.  **Prioridade (Edição):** O `PostCard` deve ser instruído a priorizar as cores da `variation` quando estiver no modo de edição (Workbench), mesmo que um objeto `theme` esteja presente para efeitos visuais (glitch, glow).

## Alterações Necessárias

### 1. `WorkbenchRefactored.tsx`
- **Inicialização:** Usar `useState` ou `useEffect` para mesclar `initialTheme.colors` em `variation` na montagem.
- **Renderização:** Passar prop `forceVariationColors={true}` para o `PostCard`.

### 2. `PostCard.tsx`
- **Nova Prop:** Adicionar `forceVariationColors?: boolean`.
- **Lógica de Cor:**
  ```typescript
  const effectiveBg = ...
    : (forceVariationColors && variation.backgroundColor)
      ? variation.backgroundColor
      : theme ? theme.colors.bg : ...
  ```
  *(Repetir para Text e Accent)*

## Por que isso resolve?
- **Transferência:** O usuário vê as cores do tema porque elas foram copiadas para a `variation`.
- **Edição:** O usuário vê suas edições porque o `PostCard` agora obedece à `variation`.
- **Efeitos:** O Tema continua sendo passado para renderizar efeitos especiais (Glitch/Grid), mantendo a identidade visual.
