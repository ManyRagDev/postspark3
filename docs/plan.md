# Plano de Implementação — Experiência Inteligente PostSpark (Fase Final)

## Visão Geral
Este plano estrutura a conclusão da transição do PostSpark para a sua "Experiência Inteligente e Confiável". As fundações (Traces, Tratamento de Erros, Modais de Fallback, Zod Schemas e integridade básica do `CanvasPostModel` v2) já foram implementadas nas Etapas 1, 2, 3 e 5.

Agora, o objetivo é entregar as capacidades avançadas de edição guiada por IA e aprimorar a robustez do motor visual `CanvasLab`.

## Fonte da Verdade e Invariantes
- A documentação de contexto obrigatória está em `DOCUMENTO_MESTRE.md`.
- O modelo autoritativo é o `CanvasPostModel`. O estado visual é mutado através de funções puras no `documentCommands.ts`.
- **Atenção:** O ecossistema legado (`Home.tsx`, `WorkbenchV2`, `HoloDeck.tsx`) é considerado **órfão** e não deve receber novas features. Operamos primariamente na rota `/thevoid` -> `StudioAppV2BPage` -> `CanvasLabPage`.
- Mantenha a separação entre *Estado Global* (defaults herdados) e *Estado Local* (override específico de um slide). Nunca escreva em ambos ao mesmo tempo.

## Fases da Arquitetura (Etapas Restantes)

1. **Etapa 4: Briefing persistente e inteligência de marca**
   Transição de uma experiência de "campo único" para uma etapa estruturada, permitindo ao usuário revisar a interpretação da IA (formatos, brand kit, URLs extraídas) antes do gasto de *Sparks*.

2. **Etapa 6: Fundo, crop e mídia**
   Garantia de que uploads de imagens sejam tratados de forma não destrutiva, evitando gargalos de performance (sem base64 pesados atrelados ao JSON) e adicionando flexibilidade de enquadramento (contain, cover, custom).

3. **Etapa 7: Paridade de elementos livres (textos e imagens extras)**
   Garantir que os nós do Konva para elementos extras tenham suporte de primeira classe: persistência correta de `onTransformEnd` (escala, rotação, translação) no `CanvasPostModel`, duplicação com geração de UUIDs, e gestão de camadas (z-index).

4. **Etapa 8: Editor assistido e produtividade**
   Implementação das melhorias de Qualidade de Vida (QoL) exigidas por um produto profissional: Auto-Save resiliente, Undo/Redo rastreável sobre o estado do documento e drag-and-drop de reordenação de slides.

5. **Etapa 9: Rollout, Testes e Documentação**
   Validações E2E finais e consolidação do `DOCUMENTO_MESTRE.md`.
