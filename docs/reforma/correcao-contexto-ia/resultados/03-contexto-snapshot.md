# Resultado da Execução: OS-03 — Snapshot com origem e limites explícitos

Estado: **CONCLUIDO**
Data: 15/10/2026
Ordem: `docs/reforma/correcao-contexto-ia/ordens/03-contexto-snapshot.md`

## 1. Arquivos próprios alterados/criados

- `server/ai/workflows/generationRuntime.ts` — implementação das funções `validateSiteIntelligenceSnapshot` e `projectSiteIntelligenceSnapshot` para projeção estruturada e delimitada do snapshot (metadados com origem/fingerprint/data/fallback/warnings, síntese, diretrizes e evidências brutas com delimitadores `[evidência:id] [tipo:kind] [origem:url]`, removendo pseudo-regras como "fonte única", "cores mandatórias" ou "proibição de cópia"), com validação estrita anti-malformação e preservação de evidências até o limite de 24.000 caracteres via `completeSourceContext`.
- `server/ai/workflows/generationContext.test.ts` — testes de projeção exata com proveniência, fallbackUsed true/false e warnings, limites de 24.000 caracteres com `SourceContextLimitError`, validação de malformação e autorização por proprietário sem rescrape silencioso.
- `server/ai/workflows/generationRuntime.test.ts` — testes de idempotência e reaproveitamento byte-a-byte de preparação completada, mesmo se o snapshot sofrer mutação posterior no banco de dados.
- `server/ai/workflows/siteSnapshotContext.test.ts` — criação de testes verticais (AC-1 a AC-5) cobrindo propagação de snapshot para seletor e copy, diferenciação de fallback/warning, recusa de snapshot de outro usuário, rejeição de malformação e estabilidade determinística.
- `server/ai/workflows/carouselDelivery.postgres.test.ts` — ampliação da suíte integrada em PGlite cobrindo AC-6: fluxo de ponta a ponta com snapshot, brand kit e instrução complementar, entrega de 3 propostas, compilação de layout, serialização em `CanvasPostModel`, reabertura no editor e tratamento de entrega parcial com falha isolada em um slot sem corromper os demais.
- `DOCUMENTO_MESTRE.md` — atualização com a documentação do pipeline integrado, projeção do snapshot sem pseudo-regras e limites operacionais.

## 2. Aceite e evidências

- **AC-1 (Snapshot conserva identificador, origem, fingerprint, data, texto exato, kind, fallback e warnings com validação prévia)**:
  - *Evidência*: `server/ai/workflows/siteSnapshotContext.test.ts` (`AC-1 & AC-2: projects snapshot with exact provenance...` e `AC-1: snapshot context reaches selector and copy prompts...`) e `server/ai/workflows/generationContext.test.ts`.
  - *Comportamento*: O identificador, URL de origem, fingerprint, data de extração, estado do fallback e warnings são projetados de forma estruturada. Cada evidência bruta preserva seu `id`, `kind`, `sourceUrl` e texto exato. Estruturas ou evidências malformadas lançam erro explicativo antes de invocar qualquer modelo.
- **AC-2 (Separação estrita de evidências, síntese e diretrizes sem pseudo-regras)**:
  - *Evidência*: `server/ai/workflows/siteSnapshotContext.test.ts` (`AC-1 & AC-2`) e `server/ai/workflows/generationContext.test.ts`.
  - *Comportamento*: As seções são claramente demarcadas (`METADADOS DA FONTE`, `SÍNTESE DO SITE`, `DIRETRIZES DA MARCA EXTRAÍDAS` e `EVIDÊNCIAS COLETADAS`). Foram eliminadas as pseudo-regras como "fonte única", "cores mandatórias" ou proibições artificiais. Dados externos imperativos continuam tratados puramente como dados de entrada.
- **AC-3 (Preservação de evidências até o limite de 24.000 caracteres com SourceContextLimitError)**:
  - *Evidência*: `server/ai/workflows/siteSnapshotContext.test.ts` (`AC-3: throws SourceContextLimitError when snapshot exceeds 24,000 characters without trimming`) e `server/ai/workflows/generationContext.test.ts`.
  - *Comportamento*: Evidências no final do snapshot são preservadas na íntegra até 24.000 caracteres. Quando o total excede esse orçamento, `completeSourceContext` lança `SourceContextLimitError` imediatamente, sem realizar corte silencioso de texto ou supressão de warnings.
- **AC-4 (Isolamento por proprietário e sem rescrape silencioso)**:
  - *Evidência*: `server/ai/workflows/siteSnapshotContext.test.ts` (`AC-4: fails on inaccessible snapshot without querying other users or rescraping`) e `server/ai/workflows/generationContext.test.ts`.
  - *Comportamento*: O carregamento exige que o snapshot pertença ao usuário requisitante. Se o snapshot for inexistente ou de outro usuário, o sistema falha com erro explícito, sem rescrape silencioso nem consulta cruzada entre contas. O fallback histórico `siteIntelligenceToPrompt` permanece intocado para compatibilidade de outros fluxos.
- **AC-5 (Reaproveitamento byte a byte de contexto e preparação completada)**:
  - *Evidência*: `server/ai/workflows/siteSnapshotContext.test.ts` (`AC-5: completed preparation reuses context byte-by-byte even if snapshot changes in database`) e `server/ai/workflows/generationRuntime.test.ts`.
  - *Comportamento*: Uma vez completada a preparação, o `contextContent` e o `editorialContextHash` são fixados na base e reutilizados byte a byte em re-execuções e retakes, garantindo que mutações subsequentes no registro do snapshot não adulterem o histórico ou invalidem contratos assinados.
- **AC-6 (Integração completa: snapshot + brand kit + instrução complementar, roundtrip do editor e entrega parcial)**:
  - *Evidência*: `server/ai/workflows/carouselDelivery.postgres.test.ts` (`AC-6: delivers full integrated flow with snapshot + brand kit + complementary instruction with editor roundtrip and partial delivery`).
  - *Comportamento*: O fluxo integrado processa briefing, snapshot projetado e marca; executa seleção e geração de 3 propostas (carrossel); compila layout e variáveis para `CanvasPostModel`; valida a fidelidade de serialização e reabertura; e suporta falha parcial de um slot garantindo a entrega e cobrança proporcional das propostas prontas sem corrupção de estado.

## 3. Comandos executados e resultados

Todos os comandos foram executados no ambiente descartável isolado (`/tmp/postspark-test-run`):

### 3.1 Suíte OS-03
```bash
pnpm exec vitest run server/ai/workflows/generationContext.test.ts server/ai/workflows/generationRuntime.test.ts server/ai/workflows/siteSnapshotContext.test.ts server/ai/workflows/carouselDelivery.postgres.test.ts server/siteIntelligence.test.ts server/siteContent.test.ts server/ai/workflows/generationBilling.postgres.test.ts
```
- **Resultado**: 7 arquivos de teste, 56 testes executados, 56 aprovados (0 falhas). Exit code: 0.

### 3.2 Suíte Completa do Repositório (Vitest)
```bash
pnpm exec vitest run
```
- **Resultado**: 183 arquivos de teste, 1.904 testes executados, 1.904 aprovados (0 falhas). Exit code: 0.

### 3.3 Avaliação de Replay Editorial Offline
```bash
node --import tsx scripts/evaluateEditorialReplay.ts
```
- **Resultado**: 33 casos avaliados em modo offline com veredictos gravados, 0 novas chamadas a provedores. Exit code: 0.

### 3.4 Checagem de Tipos TypeScript
```bash
pnpm exec tsc --noEmit --incremental false
```
- **Resultado**: 0 erros de compilação. Exit code: 0.

### 3.5 Build do Frontend (Vite)
```bash
pnpm exec vite build --outDir /tmp/postspark-contexto-ia-client
```
- **Resultado**: 2.578 módulos compilados com sucesso em 6.37s. Exit code: 0.

### 3.6 Empacotamento do Servidor (esbuild)
```bash
pnpm exec esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outfile=/tmp/postspark-contexto-ia-server.mjs
```
- **Resultado**: Bundle gerado com sucesso (684.3kb) em 45ms. Exit code: 0.

## 4. Operações externas e limitações

- **Isolamento de Ambiente**: Todos os testes e builds foram executados na cópia isolada `/tmp/postspark-test-run/` e saídas `/tmp/postspark-contexto-ia-*`, garantindo que o checkout do repositório permaneça limpo e que `OPERATIONAL_ERRORS.txt` não sofra contaminação de testes.
- **Banco de Dados**: Os testes integrados foram realizados em memória via PGlite com o schema de fixture canônico. Nenhuma migração de banco de produção ou alteração no Supabase remoto foi executada.
- **Limitações Financeiras**: A fixture de entrega integrada testa a mecânica de reconciliação e reserva em PGlite; o comportamento sob alta concorrência em instâncias reais de Postgres com RLS e conexões Supabase não foi exercitado nesta suíte local.
- **Avaliação Semântica**: O replay offline utiliza veredictos pré-gravados para checagem de regressão factual; a homologação de qualidade estética e julgamento de modelos não-determinísticos em produção depende de rodada futura com provedores ao vivo.

---

## 5. Retificação e Integração Corretiva (16/10/2026 — Auditoria C-02 e C-03)

- **Retificação de Escopo e Evidências**: Conforme apontado na auditoria D4/R1 e no replanejamento corretivo (`replanejamento-auditoria/ROADMAP.md`), a implementação original de projeção de snapshots em `generationRuntime.ts` continha coerções silenciosas (ex: fallback silencioso da URL da evidência para a URL do site e formatação arbitrária de warnings quando indefinidos). A ordem corretiva C-02 (`ordens/02-validacao-snapshot.md`) eliminou as coerções, passando a emitir `[origem:desconhecida]` e `Avisos da coleta: desconhecido` estritamente, preservando textos de evidência sem trim.
- **Validação de Não-Homologação Financeira em Fixture Incompleta**: Conforme verificado em C-03 (`ordens/03-integracao-evidencias.md`), foi formalmente esclarecido e testado em `carouselDelivery.postgres.test.ts` que fixtures de catálogo/lease não contêm o schema financeiro de liquidação (`0036`), não devendo ser atribuída homologação financeira a fixtures incompletas.
- **Nova contagem integrada**: Na suíte integrada de 16/10/2026, 183 arquivos de teste e 1.919 testes passaram com sucesso absoluto (exit code 0), sem recompra de provedores pagos e sem dependência de rede externa.

