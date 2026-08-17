# SPEC-003 — geração única, orçamento de chamadas e latência

**Status:** 🟡 parcial — conferência global de 2026-08-12 confirmou o caminho `ideation`, mas refutou o orçamento como contrato de todo `post.generate`: `execution` e context budget ainda podem adicionar chamadas LLM. Terminalidade financeira também está incompleta. Correções CR-004 e CR-005 em [`CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md).
**Dependências:** SPEC-001 e SPEC-002 estáveis
**Dor:** `post.generate` concentra muitas responsabilidades e executa etapas generativas sequenciais, enquanto shadow graph e pipeline experimental coexistem sem governar o resultado

## Resultado

`post.generate` torna-se uma borda fina sobre um único orquestrador tipado. O caminho feliz produz as variações completas com uma chamada generativa principal; reparo é pontual e limitado. Billing, trace, validação, diversidade, snapshot e persistência continuam transacionais e observáveis.

## Estado real herdado

1. `server/routers.ts` contém o fluxo principal, incluindo reserva, preparação, geração, diversificação, avaliação/revisão, captions, originalidade, composição visual, snapshot, persistência e commit/refund.
2. Há chamadas `invokeLLM` distintas para geração, diversificação e revisão; captions e originalidade acrescentam etapas próprias.
3. `server/ai/generationPipeline.ts` apenas prepara estratégia/contexto.
4. `server/ai/generationGraph/pipeline.ts` e `shadow.ts` são chamados tardiamente e ficam inertes por flags `false` por padrão.
5. O comentário de `AI_GRAPH_PIPELINE` diz que não há consumidor, mas `server/routers.ts` chama o pipeline.
6. Slides inválidos podem ser completados por fallback antes do retorno; qualquer conteúdo fabricado precisa ser validado antes de ser aprovado.
7. Reserva, commit e refund de Sparks já existem e não podem perder idempotência.

## Orçamento operacional

O orçamento é parte do contrato e deve aparecer em testes e trace:

| Categoria | Caminho feliz | Caminho com reparo |
|---|---:|---:|
| chamada generativa de copy/caption/slides | 1 | 1 |
| chamada generativa de reparo | 0 | no máximo 1, contendo apenas slots rejeitados |
| retry de transporte/provider | registrado separadamente | limitado pela configuração existente |
| embeddings/originalidade | pode ocorrer em paralelo; não altera copy silenciosamente | mesma regra |

Planejamento de estratégia e captions devem ser determinísticos ou incorporados ao contrato da chamada principal. Extração de site/imagem é uma etapa de entrada distinta e deve ser medida separadamente, não escondida na contagem da geração.

## Contrato do orquestrador

Entrada mínima:

- identidade autenticada e `userUuid` já resolvidos na borda;
- input validado de `post.generate`;
- contexto/site intelligence/brand quando disponível;
- idempotency key e reserva de billing;
- configuração de modelo e deadline explícitos.

Saída discriminada:

```ts
type GenerationOutcome =
  | { status: "approved"; runId: string; snapshots: PostVisualSnapshot[]; metrics: GenerationMetrics }
  | { status: "rejected"; runId: string; issues: GenerationIssue[]; metrics: GenerationMetrics }
  | { status: "failed"; runId: string; error: GenerationFailure; metrics: GenerationMetrics };
```

O esboço é contrato: a implementação deve preservar a distinção entre rejeição de qualidade e falha operacional. Nenhum `catch` genérico transforma silenciosamente uma categoria na outra.

## Implementação

1. Extrair do router um orquestrador canônico com dependências injetáveis para provider, clock, persistência e billing.
2. Definir um schema estruturado único para a resposta principal: três variações, captions, hashtags e cinco slides quando carrossel.
3. Incorporar estratégia suficiente no prompt principal e remover a necessidade de uma chamada generativa separada só para diversificação.
4. Validar schema, número de slots, slides, copy e contrato visual antes de qualquer aprovação.
5. Aplicar diversidade determinística por família/layout/seed; divergência de copy que exija IA entra no único reparo permitido.
6. Fazer o reparo operar apenas nos slots rejeitados e reexecutar todas as validações desses slots.
7. Produzir captions na chamada principal. Fallback determinístico deve ser marcado; síntese LLM tardia deixa o caminho síncrono.
8. Executar originalidade/embeddings em paralelo quando possível e registrar fallback. Essa etapa não pode reescrever copy sem passar pelo reparo e nova validação.
9. Normalizar e validar carrosséis antes do juiz final. Slide fabricado por fallback recebe status de fallback e passa pelas mesmas validações.
10. Consolidar trace/eventos em um contrato versionado, incluindo estágio, tentativa, provider, modelo, latência, tokens, custo estimado, fallback e resultado por slot.
11. Retirar `runGenerationShadowGraph`, `runGenerationPipeline` e seus flags do caminho quando a nova orquestração cobrir suas capacidades úteis. Não deixar duas máquinas de estado.
12. Manter a transação lógica: reservar antes do custo, commitar uma vez somente para `approved`, refundar em `rejected` ou `failed`.
13. Deixar `server/routers.ts` responsável por autenticação, input/output tRPC e tradução de erros, não pela topologia inteira.

## Critérios de aceitação

- [ ] Há um único orquestrador produtivo para `post.generate`.
- [ ] Provider falso prova exatamente uma chamada generativa no caminho feliz e no máximo uma chamada de reparo.
- [ ] Retries, fallbacks e embeddings aparecem separados no trace; nenhuma contagem é inferida por log textual.
- [ ] O caminho feliz retorna exatamente três snapshots válidos; carrossel tem exatamente cinco slides válidos por variação.
- [ ] Conteúdo criado por fallback é identificado e validado antes do retorno.
- [ ] Rejeição de qualidade e falha operacional são tipos diferentes até a borda.
- [ ] Reserva/commit/refund são idempotentes e cada execução termina em um estado financeiro terminal.
- [ ] Flags e chamadas de graph/shadow deixam de existir ou possuem uma única função não concorrente comprovada. Não podem continuar como “talvez futuro”.
- [ ] A baseline de latência/custo antes e depois é produzida pelo trace com o mesmo corpus; o relatório mostra p50, p95, chamadas, tokens e custo, sem prometer melhora não medida.
- [ ] Geração por texto, URL e imagem mantém comportamento; indisponibilidade de enriquecimento tem fallback explícito.
- [ ] Testes cobrem deadline, retry, provider fallback, schema inválido, reparo, carrossel, refund e double-submit.
- [ ] `npm run check`, `npm test` e testes de integração do router passam.

Uma execução com provider real é necessária para encerrar totalmente a spec. Se credenciais ou autorização de custo não existirem, marcar `🟡 parcial` e anexar todas as provas locais.

## Fora de escopo

- mudar preços ou custo em Sparks;
- trocar fornecedor/modelo como decisão de produto;
- criar fila/worker/cron sem evidência de necessidade;
- migrar para LangGraph ou framework equivalente;
- redesenhar a UI.

## Conferência exigida

Conferência total, rederivando contagem de chamadas, resultados financeiros e eventos a partir de testes/trace, não do relatório do executor.
