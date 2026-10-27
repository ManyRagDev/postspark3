# Resultado da Execução: OS-02 — Marca preservada do briefing à revisão

Estado: **CONCLUIDO**
Data: 15/10/2026
Ordem: `docs/reforma/correcao-contexto-ia/ordens/02-contexto-marca.md`

## 1. Arquivos próprios alterados/criados

- `shared/creationBrief.ts` — cópia de `audience` e `brandEssence` no adaptador `creationBriefToExecutionBrief` preservando edições do usuário.
- `shared/generationRequest.ts` — campos opcionais `audience` e `brandEssence` (max 2.000 caracteres cada, orçamento agregado de 96.000) e preservação em `normalizeExecutionBrief`.
- `shared/postspark.ts` — tipagem `CreativeExecutionBrief` atualizada com `audience?: string; brandEssence?: string;`.
- `server/ai/generationOrchestrator.ts` — `ExecutionBriefContext` e projeção dos novos campos em `buildExecutionBriefContext`.
- `shared/proposalReviewV7.ts` — admissão do perfil `editorialGuidanceVersion: 5` na configuração de revisão V7 (`reviewExecutionConfigV2Schema`).
- `server/ai/workflows/reviewExecutionConfigV7.ts` — implementação do perfil 5 em `reviewInstructionsV7`, `copyInstructionsV7`, `reviewContractHashV7` e `resolveReviewExecutionConfigV7` (defaulting para 5 em novas requisições, preservando hashes históricos 1–4).
- `server/ai/workflows/editorialContextV7.ts` — aceita `guidanceVersion` explícito e inclui `tone`, `audience`, `brandEssence` e `platform` sob `instructions` apenas quando `guidanceVersion === 5`.
- `server/ai/workflows/generationPreparation.ts` — repasse de `reviewExecutionConfig.editorialGuidanceVersion` ao cálculo do `editorialContextV7`.
- `server/ai/workflows/proposalGraph.ts` — resolução de `guidanceVersion` para checagem do `editorialContextHash`, injeção de orientações de marca/audiência no prompt de copy e de recuperação técnica.
- `server/ai/workflows/proposalReviewV7.ts` — repasse de `reviewConfig.editorialGuidanceVersion` ao contexto editorial e extensão da proteção de consistência de reivindicações sem suporte ao perfil 5.
- `server/generationEvidence.ts` — inspeção e validação do `editorialContextHash` utilizando o `editorialGuidanceVersion` salvo.
- `shared/creationBrief.test.ts` — testes cobrindo cópia de `audience`/`brandEssence`, precedência de edições sobre o kit, limites de 2.000 chars e backward compatibility.
- `shared/proposalReviewV7.test.ts` — validação do schema com versão de orientação editorial 5 e preservação de versões 2, 3, 4.
- `server/routers/generation.test.ts` — testes de persistência, validação de limites de caracteres e compatibilidade com requisições legadas.
- `server/ai/workflows/generationPreparation.test.ts` — verificação de que `editorialGuidanceVersion: 5` é emitido por padrão para novas preparações.
- `server/ai/workflows/editorialGuidance.test.ts` — testes de geração de hash e instruções com perfil 5 e preservação exata dos hashes históricos 1–4.
- `server/ai/workflows/proposalReviewV7.test.ts` — teste comprovando que preferência de tom no perfil 5 permanece advisory/passed, enquanto reivindicações falsas ou violações materiais bloqueiam (`correction_required`).
- `server/ai/workflows/proposalReviewTransport.postgres.test.ts` — cálculo e persistência do perfil salvo em transportes e retakes.
- `server/ai/workflows/sourceRepresentation.test.ts` — teste de estabilidade de contexto de fonte com e sem campos de marca.
- `server/generationEvidence.test.ts` — teste comprovando validação do contexto editorial no perfil 5 e detecção de adulteração de hash.
- `client/src/pages/StudioApp/StudioAppV2BPage.generation.test.tsx` — teste cobrindo fluxo do Studio com preservação de público/essência na montagem do payload.
- `server/ai/workflows/brandContextHandoff.test.ts` — teste vertical unificado (AC-1 a AC-5) cobrindo Jev, seletor, copy, revisão, hashes históricos e recusa de adulteração.

## 2. Aceite e evidências

- **AC-1 (Kit e edição de público/essência/tom atravessam o pipeline até copy)**:
  - *Evidência*: `server/ai/workflows/brandContextHandoff.test.ts` (`AC-1: sentinel brand kit values traverse brief, adapter, preparation, and reach Jev and copy prompts`).
  - *Comportamento*: Sentinelas em `audience` e `brandEssence` atravessam o adapter `creationBriefToExecutionBrief`, passam pela validação do Zod, chegam ao seletor/Jev via `buildExecutionBriefContext` e são injetadas nas instruções de copy (`executionInstructions`) e recuperação técnica no perfil 5. A edição do usuário no modal sobrepõe o Kit original.
- **AC-2 (Sem alucinação de campos ausentes e validação de limites)**:
  - *Evidência*: `server/ai/workflows/brandContextHandoff.test.ts` (`AC-2: missing fields are not invented; oversized fields (>2000) or aggregate (>96000) fail validation`).
  - *Comportamento*: Se `audience` ou `brandEssence` não forem fornecidos, permanecem `undefined`. Campos com >2.000 caracteres ou requisições agregadas >96.000 caracteres são estritamente rejeitados pelo `executionBriefSchema`. Requisições antigas sem esses campos são validadas com sucesso.
- **AC-3 (Perfil 5: tom e marca advisory na revisão, requisitos e falsas garantias bloqueantes)**:
  - *Evidência*: `server/ai/workflows/brandContextHandoff.test.ts` (`AC-3: in profile 5, copy and review receive brand context; review treats tone as advisory while false claims block`) e `server/ai/workflows/proposalReviewV7.test.ts`.
  - *Comportamento*: No perfil 5, orientações de tom, audiência e essência da marca constam no contexto editorial mas ficam separadas das fontes factuais e obrigações textuais. Parecer controlado com preferência de tom permanece `advisory` (`passed`), enquanto requisitos explícitos ausentes ou alegações falsas (`unsupported_claim`) bloqueiam a proposta (`correction_required`).
- **AC-4 (Preservação estrita dos perfis V7 históricos 1 a 4 e V5/V6)**:
  - *Evidência*: `server/ai/workflows/brandContextHandoff.test.ts` (`AC-4: profiles 1 to 4 strictly preserve historical hashes and prompts; tampering is rejected`) e `server/ai/workflows/editorialGuidance.test.ts`.
  - *Comportamento*: Os hashes de contrato e contexto para versões 1, 2, 3 e 4 continuam idênticos aos históricos. O perfil 5 herda as regras de consistência de categoria/consequência do perfil 4. Adulterações no hash do contexto editorial provocam erro `preparation_contract_incompatible` antes de qualquer chamada ao LLM.
- **AC-5 (Idempotência, retry e backward compatibility)**:
  - *Evidência*: `server/ai/workflows/brandContextHandoff.test.ts` (`AC-5: backward compatibility without audience/brandEssence; operations are idempotent`).
  - *Comportamento*: Operações persistidas são reutilizadas sem recomprar chamadas de IA. Clientes antigos que não enviam os campos continuam funcionando sem regressão. Termos obrigatórios/proibidos mantêm suas regras de matching intactas.

## 3. Comandos executados e resultados

Executado em ambiente descartável isolado (`/tmp/postspark-test-run`):

```bash
pnpm exec vitest run shared/creationBrief.test.ts shared/proposalReviewV7.test.ts server/routers/generation.test.ts server/ai/workflows/brandContextHandoff.test.ts server/ai/workflows/generationPreparation.test.ts server/ai/workflows/editorialGuidance.test.ts server/ai/workflows/proposalReviewV7.test.ts server/ai/workflows/proposalReviewTransport.postgres.test.ts server/ai/workflows/sourceRepresentation.test.ts server/generationEvidence.test.ts client/src/pages/StudioApp/StudioAppV2BPage.generation.test.tsx
pnpm exec vitest run server/ai/workflows/generationSelectionContext.test.ts server/ai/workflows/proposalGraph.test.ts server/ai/workflows/proposalGraphReview.test.ts server/ai/workflows/proposalReviewV5.test.ts server/ai/workflows/proposalReviewV6.test.ts shared/contentRequirements.test.ts
pnpm exec tsc --noEmit --incremental false
```

- **Vitest (Suíte OS-02)**: 11 arquivos de teste, 182 testes executados, 182 aprovados (0 falhas). Exit code: 0.
- **Vitest (Suíte de Regressão)**: 6 arquivos de teste, 78 testes executados, 78 aprovados (0 falhas). Exit code: 0.
- **TypeScript (`tsc`)**: 0 erros de compilação. Exit code: 0.

## 4. Operações externas e limitações

- Nenhuma operação remota, rede externa, migração de banco de dados ou deploy foi executada.
- Limitação: A suíte de testes valida a integridade determinística de schemas, normalizações, protocolos, hashes criptográficos e composição de mensagens em chamadas de transporte simuladas; não há verificação subjetiva do julgamento de IA em runtime de produção.

---

## 5. Retificação e Integração Corretiva (16/10/2026 — Auditoria C-01 e C-03)

- **Retificação de Escopo e Evidências**: Conforme apontado na auditoria D4/R1 e no replanejamento corretivo (`replanejamento-auditoria/ROADMAP.md`), os testes originais foram complementados pela ordem C-03 (`ordens/03-integracao-evidencias.md`), incluindo teste na UI (`StudioAppV2BPage.generation.test.tsx`) que configura Kit com campos exclusivos, edita público no modal, confere payload enviado a `generation.start`, testa refresh/retry/gerar mais e mudança de corpo sem colisão de identidade.
- **Pinagem de Hashes e Fixture Canônica**: Foi criada a fixture sanitizada `server/ai/workflows/fixtures/context-handoff-history.json` contendo os hashes congelados de contrato V7 (v1-v5) e contextos editoriais com e sem marca, garantindo verificação independente contra adulterações.
- **Nova contagem integrada**: Na suíte integrada de 16/10/2026, 183 arquivos de teste e 1.919 testes passaram com sucesso absoluto (exit code 0), sem recompra de provedores pagos e sem dependência de rede externa.

