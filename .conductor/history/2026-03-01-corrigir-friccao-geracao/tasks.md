# Tarefas Code-Level

## Domínio: IA e Qualidade Estrutural (Mimetismo de Marca)
- [ ] `[Server, LLM, System Prompt]` - Em `server/_core/llm.ts` (ou no router da API), reescrever a instrução de extração YAML/JSON quando o `inputType` for URL. Ordenar que o Post atue como um "Brand Clone": deve extrair a cor de fundo predominante do site, a cor de texto contrastante exata, e o accent.
- [ ] `[Server, LLM, Gemini QA Phase]` - Implementar no pipeline (dentro de `invokeLLM` ou na rota de geração) um step de revisão da inteligência: cruzar o JSON gerado contra o Screenshot do site. Fazer override das cores/layout geradas para forçar que pareça ter "saído do site do cliente".

## Domínio: Interface e Estado (Frontend Fricções)
- [ ] `[BrandOverlay, Refactor, Bugfix]` - Em `client/src/components/BrandOverlay.tsx`, identificar e remover ou limitar drasticamente o raio de curvatura excessivo (`borderRadius: "50%"`, prop `size` escalar) que gera círculos deformantes ao redor do post.
- [ ] `[Home, State Management, Clone]` - Na página `client/src/pages/Home.tsx` (~linha 224), ajustar a montagem de propriedades no `<WorkbenchRefactored />` para impedir a perda em `textElements` e `slides` ao transferir estado.
- [ ] `[HoloDeck, CSS, Responsive]` - Revisar em `client/src/components/views/HoloDeck.tsx` a renderização flex e de scale, garantindo total visualização na prévia de proporção `9:16`.
