# Plano Técnico: UX Workbench & Backgrounds de Carrossel

## Arquitetura de Transição
Para a transição suave de proporção, utilizaremos o **Framer Motion** no container do canvas:
- Substituir classes CSS fixas por propriedades de estilo animáveis.
- Utilizar a prop `layout` do Framer Motion para lidar com mudanças de dimensões automaticamente.
- Garantir que o `PostCard` interno use `width: 100%` e `height: 100%` para seguir o container pai.

## Fluxo de Backgrounds
1.  **Estado**: Adicionar um estado `bgScope` ("current" | "all") no Workbench.
2.  **UI**: No componente `BackgroundGallery` ou na seção de Design, adicionar um seletor de escopo.
3.  **Lógica de Slides**: 
    - Se `bgScope === 'all'`, a função `updateCurrentSlide` deve ser estendida para `updateAllSlides` quando as propriedades de background forem alteradas.
    - Propriedades afetadas: `backgroundColor`, `imageUrl`, `imageSettings`.

## Geração por IA em Carrossel
- Adicionar um modal de confirmação ou tooltip de aviso no botão "Gerar Imagem" se o escopo for "Todos os Slides".
- Texto sugerido: "Atenção: Gerar imagens para todos os slides consumirá 1 crédito por slide (Total: 5 créditos)".

## Arquivos Envolvidos
- `client/src/components/views/WorkbenchRefactored.tsx`: Lógica principal de edição e transições.
- `client/src/components/PostCard.tsx`: Garantir suporte a redimensionamento fluido.
- `client/src/components/ui/BackgroundGallery.tsx`: (Caso precise de alteração direta)
