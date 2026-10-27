# OS-02 — Marca preservada do briefing à revisão

Estado: **PRONTA**
Papel: executor-blindado; um responsável pela entrega vertical e contratos compartilhados.
Base verificada: `main`, HEAD `40c08323d9f4f3d0fd097a04844f81f9dc9d4b61`, alterações locais e resultado da OS-01 preservados.
Depende de: OS-01 concluída/verificada; compartilha preparação e testes. Confirmar exclusividade de todos os caminhos.
Execução: sequencial. Não executar correção nesta etapa de planejamento.

## Objetivo e aceite

Corrigir numa unidade C1 editorial e C3: público/essência editados não desaparecem no envio, e o revisor recebe tom/orientação contextual. Não promover gosto a erro fatal ou ligar filtros visuais do Kit.

- AC-1: Kit com público/essência/tom sentinelas, ausentes de texto/notas, atravessa `interpretRawBriefing` → modal/edição de público → adaptador → schema/normalização → admissão persistida → preparação → copy. Conferir os valores nas mensagens enviadas, inclusive após adapter. Edição atual prevalece sobre Kit original.
- AC-2: público/essência ausentes não são inventados. Campos >2.000 e agregado >96.000 são rejeitados pelo Zod; não há corte silencioso. Tipos espelhados aceitam os mesmos campos, sem `any` para ocultar perda. API antiga sem os campos continua válida.
- AC-3: no novo perfil 5, seleção/Jev, copy e revisão recebem público/essência/tom/plataforma aplicáveis. Na revisão, ficam separados de fontes factuais e obrigações. Parecer controlado com mera preferência de tom continua advisory/passed; requisito explícito destinado à arte e garantia falsa continuam capazes de bloquear. Teste de transporte/normalização não deve alegar competência semântica da LLM.
- AC-4: perfis V7 ausente/1, 2, 3 e 4 conservam instruções, hashes de contrato/contexto e recibos; V5/V6 continuam no dispatch antigo. Perfil 5 herda proteção de benefício limitado e consistência categoria/consequência de 4. Contexto/configuração adulterados são recusados antes de nova chamada; não atualizar o pin salvo.
- AC-5: refresh, retry de admissão e `Gerar mais` preservam os campos e identidade atuais; completed não chama modelo de novo e uncertain não é recomprado. Cliente antigo continua interoperável. Termos obrigatórios/proibidos, destino/case, visual_only e light_optimize mantêm semântica.

## Leitura e contrato

- [CONTRATOS.md §§1–3](../CONTRATOS.md), diagnóstico C1/C3, PLANO-AVALIACAO §§3/7; resultado da OS-01.
- `shared/creationBrief.ts`, `shared/postsparkSchemas.ts`, `shared/generationRequest.ts`, `shared/postspark.ts`; `StudioAppV2BPage.startGeneration`, modal e `studioGenerationState.ts`.
- Preparação, `executionInstructions` no proposalGraph, `editorialContextV7`, revisão V7 e `reviewExecutionConfigV7`.
- `server/generationEvidence.ts`: reconstrução/hash do contexto, e testes de transporte/journal/histórico. A evolução usa o versionamento já existente de orientação editorial.

## Escrita autorizada

- `shared/creationBrief.ts` — copiar público/essência no adaptador; sem alterar interpretação visual.
- `shared/generationRequest.ts` — campos opcionais/validação/agregado, preservando normalização existente.
- `shared/postspark.ts` — atualizar apenas `CreativeExecutionBrief`, espelho do schema.
- `server/ai/generationOrchestrator.ts` — apenas `ExecutionBriefContext` e projeção dos novos campos em `buildExecutionBriefContext`; sem alterar o gerador legado.
- `shared/proposalReviewV7.ts` — admitir perfil 5 na configuração existente; preservar schemas de resposta/registro/recibo e variantes antigas.
- `server/ai/workflows/reviewExecutionConfigV7.ts` — novo perfil pinado e instruções de orientação; preservar versões/hashes 1–4.
- `server/ai/workflows/editorialContextV7.ts` — orientação por perfil explícito; forma/hash antigos preservados.
- `server/ai/workflows/generationPreparation.ts` — fixar perfil novo e calcular contexto correspondente.
- `server/ai/workflows/proposalGraph.ts` — orientação na copy/recuperação e checagem do contexto pelo perfil pinado.
- `server/ai/workflows/proposalReviewV7.ts` — contexto/perfil e consistência de classificação herdada de 4.
- `server/generationEvidence.ts` — verificar contexto novo e histórico usando configuração salva.
- `shared/creationBrief.test.ts` — Kit/edição/adaptador/limites e entrada antiga.
- `shared/proposalReviewV7.test.ts` — aceitação da configuração nova e preservação da antiga.
- `server/routers/generation.test.ts` — payload persistido, validação e proprietário, sem mudar o router produtivo.
- `server/ai/workflows/generationPreparation.test.ts` — expectativa do perfil novo/entradas de seleção, sem relaxar cobertura v2.
- `server/ai/workflows/editorialGuidance.test.ts` — versões/hashes legados e perfil 5; não substituir valores históricos esperados.
- `server/ai/workflows/proposalReviewV7.test.ts` — orientação advisory, materialidade e perfil explícito das fixtures.
- `server/ai/workflows/proposalReviewTransport.postgres.test.ts` — replay/uncertain e cálculo pelo perfil salvo.
- `server/ai/workflows/sourceRepresentation.test.ts` — manter teste histórico do contexto, sem alterar normalização de fontes.
- `server/generationEvidence.test.ts` — reconstrução/inspeção histórica e nova, adulteração recusada.
- `client/src/pages/StudioApp/StudioAppV2BPage.generation.test.tsx` — modal/refresh/retry/gerar mais e corpo enviado; componente produtivo permanece protegido.
- `server/ai/workflows/brandContextHandoff.test.ts` — criar: teste vertical de mensagens, configuração/contexto histórico e correção cirúrgica com transporte bloqueado.
- `DOCUMENTO_MESTRE.md` — acrescentar somente contrato/efeito efetivamente implementados e limite da validação.

Resultado exclusivo: `docs/reforma/correcao-contexto-ia/resultados/02-contexto-marca.md` — criar ao executar com AC → evidência, comandos/cwd/exit, alterações próprias e limitações.

Protegidos: tudo fora da lista; `postsparkSchemas.ts`/`CreationBrief` já têm os campos e não precisam mudar; todos os componentes produtivos do Studio/modal, `brandInput` visual/filtros de catálogo, `sourceRepresentation.ts`, `contentRequirements.ts`, modelRouter/LLM/ENV, store/SQL/RLS/billing, CanvasLab, manifests/lockfile e investigação original. Não criar arquivo de contrato executável novo. Não ampliar permissão por atualização automática de testes fora da lista.

Artefatos de comandos: cópia descartável e saídas temporárias do roadmap; sem log operacional ou bundle gerado no checkout.

## Dependências e integração

Um escritor faz schema/tipos, imports, projeções e todos os consumidores do hash; não liberar só o tipo novo. Preparação, workflow, revisão e inspetor precisam concordar pelo perfil salvo. Há quatro chamadas produtivas a `editorialContextV7` nesses módulos; conferir todas e as fixtures de transporte. Se houver consumidor adicional que exija escrita fora da lista, emitir `[BLOQUEIO DE FRONTEIRA]` antes de editar. OS-03 valida o conjunto entregue/compilado com estes campos.

## Verificações

Na raiz da cópia descartável atual:

```bash
pnpm exec vitest run shared/creationBrief.test.ts shared/proposalReviewV7.test.ts server/routers/generation.test.ts server/ai/workflows/brandContextHandoff.test.ts server/ai/workflows/generationPreparation.test.ts server/ai/workflows/editorialGuidance.test.ts server/ai/workflows/proposalReviewV7.test.ts server/ai/workflows/proposalReviewTransport.postgres.test.ts server/ai/workflows/sourceRepresentation.test.ts server/generationEvidence.test.ts client/src/pages/StudioApp/StudioAppV2BPage.generation.test.tsx
pnpm exec vitest run server/ai/workflows/generationSelectionContext.test.ts server/ai/workflows/proposalGraph.test.ts server/ai/workflows/proposalGraphReview.test.ts server/ai/workflows/proposalReviewV5.test.ts server/ai/workflows/proposalReviewV6.test.ts shared/contentRequirements.test.ts
pnpm exec tsc --noEmit --incremental false
```

Somente `brandContextHandoff.test.ts` será criado nesta ordem. Preservar asserts históricos e comparar seus hashes antigos antes/depois; alteração de default para novas preparações não autoriza mudar fixture de perfil 4 para encobrir quebra. Provar AC-1 com sentinelas que não constam da fonte textual. Cobrir perfil 5 com/sem campos opcionais e retomada 1–4. Pareceres/pixels controlados devem ser identificados como fixtures.

## Operações externas

Nenhuma. Mudança aditiva de JSON/tipos, sem migration ou mutação de pedidos salvos. Não acionar UI conectada para gerar, LLM/Jev real, Supabase, billing remoto, publicação ou deploy.
