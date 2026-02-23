# Planejamento Técnico: Correção da Seleção do Carrossel

## Stack
- Frontend: React + Vite
- Estilização: TailwindCSS
- State Management: React useState / Props drilling

## Plano de Ação Refinado

1.  **Tipagem (`shared/postspark.ts`)**:
    *   Adicionar interface `CarouselSlide`.
    *   Adicionar `slides?: CarouselSlide[]` em `PostVariation`.

2.  **Frontend - Visualização (`HoloDeck.tsx`)**:
    *   Verificar como o `PostCard` renderiza o conteúdo.
    *   Se `variation.postMode === 'carousel'`, renderizar visualização de slides (ou indicar que é carrossel).

3.  **Frontend - Edição (`WorkbenchRefactored.tsx`)**:
    *   Adaptar para suportar edição de múltiplos slides.
    *   Adicionar navegação entre slides no editor.

## Arquivos Envolvidos
- `shared/postspark.ts`
- `client/src/components/views/HoloDeck.tsx`
- `client/src/components/views/WorkbenchRefactored.tsx`
- `client/src/components/PostCard.tsx` (provável componente usado no HoloDeck)
