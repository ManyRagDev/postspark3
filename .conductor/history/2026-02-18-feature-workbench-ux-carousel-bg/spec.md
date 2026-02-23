# Spec: Melhorias de UX no Workbench e Fundos de Carrossel

## Objetivo
Melhorar a experiência de edição no Workbench, focando em transições visuais mais fluidas e gestão eficiente de backgrounds em posts do tipo carrossel.

## Regras de Negócio

### 1. Transição de Proporção (Aspect Ratio)
- A mudança entre 1:1, 5:6 e 9:16 deve ser animada de forma suave.
- O centro do post deve permanecer fixo durante a transição.
- O redimensionamento deve ser fluido, evitando saltos bruscos de layout.

### 2. Gestão de Backgrounds em Carrosséis
- Ao alterar o background (cor sólida, galeria ou IA), o usuário deve ter a opção de:
    - Aplicar apenas ao slide atual.
    - Aplicar a todos os slides do carrossel.
- **Backgrounds da Galeria/Cores**: Quando aplicado a todos, replica a mesma configuração em cada slide.
- **Geração por IA**: 
    - Deve exibir um aviso claro de que a geração em múltiplos slides consumirá créditos proporcionalmente.
    - Idealmente, permitir gerar um por um para controle de custo.

## User Review Required
> [!IMPORTANT]
> A transição suave de proporção pode exigir ajustes no componente `PostCard` para garantir que os elementos internos se adaptem sem quebrar durante a animação.
