# Track 019 — Integração versionada, debugger e reversão

**Condição de início.** Apresentar o resultado da 018, a regra proposta e os impactos identificados. A implementação de qualquer alteração estrutural no seletor ativo depende da liberação explícita do responsável pelo PostSpark. A publicação em produção deve respeitar o escopo dessa liberação.

## Execução

- [ ] Integrar a política aprovada pelo ponto de entrada normal do TheVoid. Reutilizar o contrato de seleção e o catálogo existentes. Fixar na admissão do pedido as versões da política e das fichas, os parâmetros e a referência histórica efetiva necessária para reproduzir a decisão.
- [ ] Garantir que pedidos antigos, pendentes ou retomados conservem a política e as decisões registradas no seu recibo. Testar repetição e concorrência com a mesma chave de idempotência, incluindo retomada após a avaliação e após a escolha inicial.
- [ ] Mostrar no debugger, por proposta, os candidatos viáveis, a nota e confiança do JEV, os ajustes aplicados, a evidência específica e a diferença para o segundo colocado. Registrar se a escolha se deveu à adequação geral, vantagem específica ou desempate. Preservar o caráter passivo da telemetria mesmo quando a gravação falhar.
- [ ] Testar a reversão para a política anterior em novas admissões e concluir pedidos já iniciados com suas versões fixadas. Validar no fluxo completo o tempo até a galeria, a reabertura da peça, o total de chamadas e a liquidação de Sparks. Documentar a regra duradoura no `DOCUMENTO_MESTRE.md` quando implementada.

## Aceite

Um operador consegue explicar e reproduzir a escolha a partir do pedido, verificar que o observador não afeta o resultado e reverter a admissão de novos pedidos. Na retomada, o journal impede a repetição de uma avaliação já concluída e de um débito já liquidado. A evidência de liberação identifica versão, ambiente e resultados comparáveis aos da 018.

**Pontos de partida.** `shared/generationRequest.ts`, `server/ai/workflows/generationPlanning.ts`, `server/studioDebugger.ts` e `server/designFrequency.ts`.
