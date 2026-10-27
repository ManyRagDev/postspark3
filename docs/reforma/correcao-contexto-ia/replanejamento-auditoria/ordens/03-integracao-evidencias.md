# C-03 — Fechamento integrado e evidências proporcionais

Estado: **PRONTA**
Papel: executor-blindado; responsável pela integração do pacote.
Base verificada: `main`, HEAD `40c0832`, alterações locais anteriores preservadas.
Depende de: C-01 e C-02 verificadas; exclusividade dos testes/documentos confirmada.
Execução: sequencial.

## Objetivo e aceite

Resolver D4/R1 e verificar o conjunto entregue, conforme [CONTRATOS §4](../CONTRATOS.md), sem acrescentar implementação produtiva nesta ordem.

- AC-1: teste UI configura Kit com público/essência/tom exclusivos, edita público no modal e confere corpo enviado. Refresh, retry exato de admissão e Gerar mais preservam os novos campos e identidade correta; mudança do corpo não reutiliza identidade antiga. Cliente antigo válido e separação advisory/requisitos mantidos.
- AC-2: preparação compacta <=12/>12, seleção/copy/revisão após adapter e política de materialidade recebem fonte/complemento/marca/requisitos nos lugares corretos. Asserts do resultado/status e zero recompra substituem comparações tautológicas. Recibos históricos/contextos dos perfis ausente/1–5 têm valores esperados independentes, V5/V6 continuam no dispatch antigo e adulteração falha antes de modelo.
- AC-3: cenário integrado estático **e** carrossel atravessa interpretRawBriefing/edição/adaptador/schema, snapshot objeto pelo loadGenerationContext/projetor real, preparação/seleção, três propostas/revisão fixture, commit/grants PGlite, bundle/compilação/serialização/reabertura. Fonte exclusiva do snapshot, marca exclusiva do Kit e complemento exclusivo de input.content aparecem nas mensagens efetivas. Conferir cenas/bindings/legenda/slides e identidade, não apenas tamanho da lista.
- AC-4: carrossel com os mesmos dados e falha isolada entrega duas propostas válidas, preserva seus commits/grants e roundtrip; não atribuir homologação financeira à fixture incompleta. Conflito site/usuário com visual_only mantém prioridade do pedido e obrigações. Parecer fixture é declarado, sem promessa de julgamento de modelo real.
- AC-5: passagem completa do roadmap em cópia sem credenciais/rede não mockada, com receitas/assets necessários; nenhum log/bundle volta ao checkout. Matriz original/corretiva não contém aceite obrigatório ausente marcado concluído. Retificar resultados anteriores e §13.127, mantendo histórico e limitações da auditoria; contagens correspondem aos comandos efetivos.

## Leitura e contrato

- Roadmap/adendo, resultados C-01/C-02, auditoria D4/R1 e matriz dos aceites originais.
- StudioAppV2BPage, CreationBrief/schema, preparação/runtime, revisão V7 e inspector; somente leitura produtiva.
- Fixtures PGlite, `carouselDelivery.postgres.test.ts`, compilador e saveAdapter; `shared/assemblyPilotKit.json` para insumos da cópia.

## Escrita autorizada

- `client/src/pages/StudioApp/StudioAppV2BPage.generation.test.tsx` — Kit/modal/retry/refresh/Gerar mais.
- `shared/creationBrief.test.ts` — contrato da edição/adaptador e entrada antiga.
- `server/routers/generation.test.ts` — admissão persistida/identidade/limites, sem mudar router.
- `server/ai/workflows/generationSelectionContext.test.ts` — ligação da seleção a bundle válido e transporte.
- `server/ai/workflows/brandContextHandoff.test.ts` — integração de marca, journal real controlado e asserts de chamadas.
- `server/ai/workflows/siteSnapshotContext.test.ts` — transporte do projetor até revisor e conflito de autoridade.
- `server/ai/workflows/carouselDelivery.postgres.test.ts` — cenário integrado completo/partial e roundtrip.
- `server/ai/workflows/editorialGuidance.test.ts` e `server/ai/workflows/sourceRepresentation.test.ts` — expectativas históricas independentes.
- `server/ai/workflows/proposalReviewTransport.postgres.test.ts` e `server/ai/workflows/proposalReviewV7.test.ts` — perfil pinado, protocolos/recibos e política controlada.
- `server/generationEvidence.test.ts` — verificação de contexto histórico/novo e adulteração.
- `server/ai/workflows/fixtures/context-handoff-history.json` — criar fixture sanitizada de configuração/contexto/recibos pinados, com fonte identificada (baseline local ou reconstrução sintética).
- `docs/reforma/correcao-contexto-ia/resultados/01-contexto-selecao.md`, `02-contexto-marca.md`, `03-contexto-snapshot.md` — acrescentar retificação datada e referência a evidências novas; não apagar registro original ou substituir contagens antigas por novas sem distingui-las.
- `DOCUMENTO_MESTRE.md` — corrigir status atual, erro do limite de complemento em §13.127 (24k, não 2k) e registrar resultado/pendências finais.

Resultado exclusivo a criar: `docs/reforma/correcao-contexto-ia/replanejamento-auditoria/resultados/03-integracao-evidencias.md`.

Protegidos: todos os módulos produtivos e tudo fora da lista, inclusive políticas/schemas de revisão, store/SQL, fixtures financeiras canônicas, billing, UI produtiva, editor/renderer, manifests/lockfile, `api/index.js`, auditoria independente e contratos/ordens. Esta ordem não autoriza corrigir código para fazer integração passar; devolver falha funcional a C-01/C-02 ou emitir bloqueio de fronteira.

## Dependências e integração

O executor detém o wiring **dos testes** e a matriz final. Não substituir projetor/adaptador por objetos manualmente montados. Mocks devem limitar serviços externos; funções internas relevantes são exercitadas. Bloquear fetch não mockado nos testes alterados e restaurar globals. Reutilizar fixtures de pixels/pareceres existentes, identificadas; não iniciar renderer/worker conectado nem geração real.

## Verificações

Na raiz da cópia descartável descrita no roadmap, a suíte completa inclui todos os testes autorizados. Executar os cinco comandos de passagem do [roadmap](../ROADMAP.md#passagem-e-ambiente), incluindo replay, TypeScript e builds temporários. Não repetir suíte sem alteração/falha que justifique. Se houver falha de insumo/cópia, registrar e reexecutar o necessário, sem declarar que um full run diferente passou.

O resultado contém AC → evidência, contagens reais, cwd/exits, exclusões de credenciais, transporte bloqueado, checks financeiros não cobertos pela fixture separados da suíte de billing, e limites de RLS/modelos/produção. Persistência/reabertura de dados não equivale à inspeção visual interativa da UI: registrar essa limitação, sem chamar fixture de homologação visual real.

## Operações externas

Nenhuma. PGlite em memória, HTTP/pixels/pareceres controlados, zero compras novas, consultas remotas, deploy ou migrations. Homologação semântica futura permanece nas investigações originais.
