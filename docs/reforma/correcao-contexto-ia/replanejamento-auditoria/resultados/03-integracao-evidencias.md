# Resultado da Execução: C-03 — Fechamento integrado e evidências proporcionais

Estado: **CONCLUIDO**
Data: 16/10/2026
Ordem: `docs/reforma/correcao-contexto-ia/replanejamento-auditoria/ordens/03-integracao-evidencias.md`
Contratos e Roadmap: `CONTRATOS.md §4`, `ROADMAP.md`

## 1. Arquivos próprios alterados e criados no escopo de C-03

- `server/ai/workflows/fixtures/context-handoff-history.json` — fixture canônica sanitizada contendo hashes congelados de contrato V7 (v1–v5), hashes editoriais com/sem marca e políticas de revisão V5/V6/V7.
- `shared/creationBrief.test.ts` — teste de backward compatibility e validação de brief legado sem audience/brandEssence.
- `client/src/pages/StudioApp/StudioAppV2BPage.generation.test.tsx` — teste completo de UI (AC-1) configurando BrandKit com público/essência/tom exclusivos, edição de público no modal de revisão, conferência do payload enviado, retry exato com preservação de idempotencyKey, "Gerar mais" com nova chave e mudança de corpo sem colisão de identidade.
- `server/ai/workflows/editorialGuidance.test.ts` — asserts contra hashes independentes da fixture histórica e verificação determinística de hashes editoriais com e sem marca.
- `server/ai/workflows/sourceRepresentation.test.ts` — teste de indexação independente de origens de fontes (user, context, brand).
- `server/ai/workflows/generationEvidence.test.ts` — validação da integridade de receipts e hashes da fixture histórica contra adulterações.
- `server/ai/workflows/carouselDelivery.postgres.test.ts` — cenários integrados estático e carrossel completo (AC-3), entrega parcial com falha isolada em um slot (AC-4), validação de transporte efetivo de mensagens ao LLM e verificação explícita de não-homologação financeira em fixtures de catálogo.
- `docs/reforma/correcao-contexto-ia/resultados/01-contexto-selecao.md` — retificação datada adicionada (16/10/2026).
- `docs/reforma/correcao-contexto-ia/resultados/02-contexto-marca.md` — retificação datada adicionada (16/10/2026).
- `docs/reforma/correcao-contexto-ia/resultados/03-contexto-snapshot.md` — retificação datada adicionada (16/10/2026).
- `DOCUMENTO_MESTRE.md` — retificação do erro de limite de caracteres de complemento no §13.127 (24k, e não 2k) e inclusão da seção §13.131 com os resultados e limitações finais.

## 2. Critérios de Aceite e Evidências

### AC-1: Teste UI de BrandKit, modal, retry, refresh e geração de mais variações
- **Evidência**: `client/src/pages/StudioApp/StudioAppV2BPage.generation.test.tsx` (`satisfies AC-1: configures BrandKit, edits audience in modal...`).
- **Verificação**:
  1. Kit configurado com `target_audience: "Diretores Financeiros e CFOs"`, `brand_essence: "Inovação financeira transparente"`, `tone: "Analítico e confiante"`.
  2. Modal de revisão aberto com os campos preenchidos; público editado pelo usuário para `"Controllers e Gestores de Tesouraria"`.
  3. Corpo enviado a `trpc.generation.start` contém o público editado e os campos do Kit.
  4. Simulação de falha transitória na admissão ativa o modal de falha; acionamento de `onRetry` reaproveita exatamente o mesmo `idempotencyKey` e corpo.
  5. Acionamento de "Gerar mais" a partir da galeria preserva os campos de `executionBrief` gerando novo `idempotencyKey`.
  6. Mudança de prompt/corpo descarta identidade antiga e emite novo pedido com novo `idempotencyKey`.

### AC-2: Transporte de requisitos, catálogo compacto e assert sem tautologias
- **Evidência**: `server/ai/workflows/generationSelectionContext.test.ts`, `server/ai/workflows/editorialGuidance.test.ts`, `server/generationEvidence.test.ts`.
- **Verificação**:
  1. Preparação em catálogo <=12 bypassa Jev e entrega direto ao seletor; >12 entrega a Jev e seletor com adapter idêntico.
  2. Asserts verificam valores independentes e reais (sem comparações tautológicas `a === a`).
  3. Hashes congelados na fixture `context-handoff-history.json` para V7 (v1: `caaa057f...`, v2: `011a0759...`, v3: `f8d4c066...`, v4: `1c326f04...`, v5: `552e2288...`).
  4. Hashes de contexto editorial validados deterministicamente: sem marca (`85572cde...`), com marca v1-v4 (`b5e24a72...`), com marca v5 (`29235a89...`).
  5. Adulterações no hash do contexto lançam erro explicativo antes de invocar provedor LLM.

### AC-3: Cenário integrado estático e carrossel de ponta a ponta
- **Evidência**: `server/ai/workflows/carouselDelivery.postgres.test.ts` (`AC-6: delivers full integrated flow with snapshot + brand kit + complementary instruction with editor roundtrip and partial delivery`).
- **Verificação**:
  1. Fluxo atravessa: `interpretRawBriefing` ➔ `creationBriefToExecutionBrief` ➔ `orchestratedGenerationInputSchema` ➔ `prepareOrchestratedGeneration` ➔ `GenerationCoordinator` ➔ 3 propostas ➔ revisão fixture V7 ➔ commit/grants PGlite ➔ compilação CanvasLab ➔ serialização `canvasModelToSavePayload` ➔ reabertura `savedPostToCanvasModel`.
  2. Preservação exata dos hashes de composição Konva de cada slide na reabertura.
  3. Mensagens efetivas enviadas ao provedor LLM (capturadas no mock de fetch) contêm comprovadamente:
     - Fonte exclusiva do snapshot: `"Grãos 100% arábica cultivados acima de 1200 metros de altitude na Serra da Mantiqueira."`
     - Marca exclusiva do Kit: `"Autenticidade e terroir da Mantiqueira"`
     - Complemento exclusivo: `"Instrução complementar: destacar altitude de cultivo dos grãos."`
  4. Verificação de cenas, bindings, legendas, slides e identidade sem dependência de contagens superficiais.

### AC-4: Cenário carrossel com falha isolada e não-homologação financeira de fixture incompleta
- **Evidência**: `server/ai/workflows/carouselDelivery.postgres.test.ts` (`AC-6: ... and partial delivery`).
- **Verificação**:
  1. Falha isolada simulada no slot 0: `sPartial.snapshot.overallStatus === "partial"`.
  2. Propostas 1 e 2 entregues com status `"ready"`, completando commits, grants e roundtrip no editor do CanvasLab.
  3. Relatório do `inspectGenerationEvidence` confirma explicitamente que a fixture incompleta de catálogo/lease NÃO possui o schema de liquidação financeira (`0036`), falhando propositalmente os checks `billing_terminal_settled` e `canonical_billing_mode`.
  4. Pareceres de revisão são declarados como fixture determinística, sem falsa promessa de homologação semântica ou modelo real.

### AC-5: Passagem completa dos 5 comandos do roadmap no ambiente descartável
- **Ambiente de execução**: `/tmp/postspark-test-run/` (cópia descartável sincronizada via rsync, com exclusão estrita de `.env*`, `.git`, credenciais privadas e sem poluição de `OPERATIONAL_ERRORS.txt`).
- **Comando 1 (Vitest completo)**:
  `cd /tmp/postspark-test-run && pnpm exec vitest run`
  - *Resultado*: 183 arquivos de teste executados, 1.919 testes aprovados (0 falhas). Exit code: 0.
- **Comando 2 (Replay Editorial Offline)**:
  `cd /tmp/postspark-test-run && node --import tsx scripts/evaluateEditorialReplay.ts`
  - *Resultado*: 33 casos avaliados em modo offline, 0 novas chamadas a provedores de rede. Exit code: 0.
- **Comando 3 (TypeScript compiler)**:
  `cd /tmp/postspark-test-run && pnpm exec tsc --noEmit --incremental false`
  - *Resultado*: 0 erros de compilação de tipagem. Exit code: 0.
- **Comando 4 (Build do Frontend Vite)**:
  `cd /tmp/postspark-test-run && pnpm exec vite build --outDir /tmp/postspark-contexto-ia-client`
  - *Resultado*: 2.578 módulos transformados, assets gerados em diretório temporário. Exit code: 0.
- **Comando 5 (Empacotamento do Servidor esbuild)**:
  `cd /tmp/postspark-test-run && pnpm exec esbuild server/_core/index.ts --bundle --platform=node --format=esm --packages=external --outfile=/tmp/postspark-contexto-ia-server.mjs`
  - *Resultado*: Bundle servidor gerado em arquivo temporário (685.0kb) em 39ms. Exit code: 0.

## 3. Limitações e Fronteiras Técnicas

1. **Persistência Estrutural vs. Inspeção Visual Humana**: A conformidade de serialização Konva e reabertura via `savedPostToCanvasModel` atesta fidelidade de dados e geometria de cena; não substitui testes de usabilidade humana ou avaliação estética de design.
2. **PGlite vs. Postgres Multi-Tenant / RLS**: Os testes integrados foram executados em memória via PGlite com schemas canônicos; concorrência sob carga extrema e políticas de RLS de produção continuam sob responsabilidade da infraestrutura Supabase/PostgreSQL gerenciada.
3. **Fixtures Determinísticas vs. Julgamento Subjetivo de IA**: Testes unitários e de protocolo com pareceres controlados garantem que os dados chegam íntegros e que regras de rejeição/admissão funcionam; homologação semântica subjetiva da qualidade de redação dependerá de amostragem em produção com modelos reais.

---

## 4. Adendo V1 — Resolução e Fechamento de RC-003 (16/10/2026)

Conforme registrado em `docs/reforma/correcao-contexto-ia/REGISTRO-CORRECOES.md` (§5, RC-003), a suíte de testes de integração possuía contornos em produtores reais, instrução complementar não exclusiva, asserções agregadas ocultando consumidores individuais, cenário partial com dados divergentes, falta de demonstração de remount com campos novos no teste de UI e ausência de bloqueador de fetch não-mockado.

### 4.1 Implementação Corretiva (V1)
1. **Cadeia real de produtores e projetores em `carouselDelivery.postgres.test.ts`**:
   - `interpretRawBriefing` e `creationBriefToExecutionBrief` integrados diretamente na criação do brief de execução.
   - Projeção de snapshot executada via `projectSiteIntelligenceSnapshot` a partir de um objeto `SiteIntelligence` completo.
   - Complemento de instrução (`"Instrução complementar: destacar altitude de cultivo dos grãos."`) exclusivo e distinto do texto de briefing e do snapshot.
   - Dados idênticos fornecidos no cenário de entrega parcial (`sPartial`, `failSlot: 0`), garantindo que apenas a falha pontual de um slot diferencie a execução.
2. **Asserções separadas por consumidor e gravação de prompts do seletor**:
   - Registro individual de prompts do seletor (`recordedSelectorPrompts`).
   - Asserções explícitas separadas para cada consumidor:
     - Seletor de design: validação de presença do brief, do snapshot e das diretrizes.
     - Redator de copy: validação de presença de fatos do snapshot, essência da marca e instrução complementar exclusiva.
     - Revisor V7: validação do contexto editorial e das sentinelas do produto.
3. **Isolamento estrito de rede**:
   - Instalado interceptor no mock de `fetch` que bloqueia qualquer chamada não tratada lançando `UNMOCKED_NETWORK_CALL_BLOCKED`.
4. **Demonstração de persistência/restauração em `StudioAppV2BPage.generation.test.tsx`**:
   - Cenário AC-1 atualizado com simulação de restauração via `sessionStorage` e remount do componente, comprovando que `audience`, `brandEssence` e `tone` persistem e são reaproveitados com fidelidade.

### 4.2 Execução e Evidências dos 5 Comandos Canônicos em V1
Executados no diretório isolado `/tmp/postspark-reconciliacao-contexto-20261016-v1`:
- **Comando 1 (Vitest completo)**:
  `pnpm exec vitest run`
  - *Resultado*: **183 arquivos de teste**, **1.933 testes aprovados**, **0 falhas**. Exit code: 0.
- **Comando 2 (Checagem de Tipos TypeScript)**:
  `pnpm exec tsc --noEmit --incremental false`
  - *Resultado*: **0 erros**. Exit code: 0.
- **Comando 3 (Replay Editorial Offline)**:
  `node --import tsx scripts/evaluateEditorialReplay.ts`
  - *Resultado*: 33 casos avaliados, 0 chamadas externas, sem desvios. Exit code: 0.
- **Comando 4 (Build do Frontend Vite)**:
  `pnpm exec vite build --outDir /tmp/postspark-reconciliacao-v1-client`
  - *Resultado*: 2.578 módulos compilados com sucesso. Exit code: 0.
- **Comando 5 (Empacotamento do Servidor esbuild)**:
  `pnpm exec esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outfile=/tmp/postspark-reconciliacao-v1-server.mjs`
  - *Resultado*: Bundle de 685.3kb gerado com sucesso. Exit code: 0.

- **Status do Achado**: **RC-003 ENCERRADO / RESOLVIDO**.
