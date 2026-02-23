# Especificação de Funcionalidade: Correção da Seleção do Carrossel

## Problema
Ao selecionar a opção "Carrossel" na interface do TheVoid, o sistema gera erroneamente um "Post Estático". Isso impede a criação de conteúdo no formato carrossel.

## Análise Técnica (Atualizado)
- **Backend (`post.generate`)**: Lógica correta. Gera `slides` quando `postMode` é "carousel".
- **Shared Types (`PostVariation`)**: **Incompleto**. Não possui a propriedade `slides`, o que faz o frontend ignorar os dados retornados ou causar erro de tipo.
- **Frontend (`TheVoid`)**: Envia corretamente o `postMode`.
- **Frontend (`HoloDeck`/`Workbench`)**: Provavelmente não implementam a renderização de carrossel ou falham devido à tipagem incorreta.

## Solução Proposta
1. Atualizar `PostVariation` em `shared/postspark.ts` para incluir `slides?: CarouselSlide[]`.
2. Verificar e adaptar `HoloDeck` para exibir variações de carrossel.
3. Verificar e adaptar `WorkbenchRefactored` para permitir edição de carrossel.

## Objetivo
Garantir que a seleção de "Carrossel" propague corretamente o `postMode` (ou `type`) adequado para o restante do fluxo de geração, resultando na criação de um carrossel com slides.

## Regras de Negócio
1. Se o usuário seleciona "Carrossel", a variável de estado que determina o tipo de post deve ser `carousel`.
2. O componente de submissão (TheVoid/SmartInput) deve passar esse tipo corretamente para a função `onSubmit`.
3. O fluxo subsequente (Workbench ou similar) deve respeitar esse tipo e renderizar a prévia/interface de carrossel.
