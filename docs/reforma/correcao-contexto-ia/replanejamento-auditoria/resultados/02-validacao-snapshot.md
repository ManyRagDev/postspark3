# Resultado da Execução: C-02 — Snapshot sem coerção e com ausência explícita

Estado: **CONCLUIDO**
Data: 16/10/2026
Ordem: `docs/reforma/correcao-contexto-ia/replanejamento-auditoria/ordens/02-validacao-snapshot.md`
Contratos de Referência: `docs/reforma/correcao-contexto-ia/replanejamento-auditoria/CONTRATOS.md` §3

---

## 1. Arquivos alterados no escopo autorizado

- `server/ai/workflows/generationRuntime.ts` — implementação da validação estrita sem coerção (`validateSiteIntelligenceSnapshot`) e da projeção determinística (`projectSiteIntelligenceSnapshot`). Rejeita tipos primitivos incorretos (`fallbackUsed:"false"` string, warnings com null/números/objetos, metadados com tipos incorretos, síntese como objeto em vez de string, listas com itens inválidos, evidências com kind desconhecido ou texto vazio/branco). Preserva ausência explícita (`warnings: undefined` -> `desconhecido`; `warnings: []` -> `nenhum`; evidência sem URL própria -> `desconhecida`, sem substituir pela URL geral do site). Preserva os bytes exatos dos textos de evidências sem trim indevido na saída.
- `server/ai/workflows/generationContext.test.ts` — matriz de validação e ausência (AC-1 e AC-2): recusa explícita de `fallbackUsed:"false"`, warnings inválidos, `sourceUrl` numérico, `business.summary` como objeto, `business.products` não-array, `anchors.facts` malformado, kind desconhecido e texto de evidência em branco; verificação de distinção de ausência, preservação de URL ausente como `desconhecida` e aceitação de extensões desconhecidas/campos não consumidos.
- `server/ai/workflows/siteSnapshotContext.test.ts` — testes para AC-3 e AC-4: garantia de que textos aceitos, IDs, kind, origem, avisos da coleta e condições no final do texto chegam sem truncamento às mensagens do seletor, copy e revisor V7 após os adapters; e verificação de que o limite combinado de 24.000 caracteres dispara `SourceContextLimitError` sem cortes silenciosos.
- `DOCUMENTO_MESTRE.md` — atualização da seção §13.130 registrando a validação estrita e o comportamento de ausência explícita do snapshot.

---

## 2. Aceite e Evidências

### AC-1: Rejeição estrita antes dos modelos sem coerção
- **Cenários testados e verificados**:
  - `fallbackUsed: "false"` (string em vez de booleano): rejeitado com erro sanitizado identificando o campo (`quality.fallbackUsed inválido no snapshot: esperado booleano`).
  - `warnings` contendo null, números ou objetos: rejeitado (`quality.warnings inválido no snapshot`).
  - `sourceUrl`, `fingerprint`, `extractedAt` com tipo incorreto (ex: número): rejeitado antes da chamada aos modelos.
  - Síntese com `business.summary` em formato de objeto em vez de string: rejeitado.
  - Listas (`products`, `services`, etc.) como não-arrays ou contendo itens não-string: rejeitado.
  - `anchors.facts` malformado (texto vazio ou ausente): rejeitado.
  - Evidência com `kind` não pertencente a `["title", "description", "heading", "body", "visual"]`: rejeitado com erro indicando o tipo inválido.
  - Evidência com texto vazio ou composto apenas de espaços em branco: rejeitado.
- **Evidência**: `server/ai/workflows/generationContext.test.ts` (`fails explicitly on malformed snapshot structure before calling model (AC-1 matrix)`).

### AC-2: Ausência explícita e não substituição silenciosa de URL de evidência
- **Cenários testados e verificados**:
  - Metadados históricos ausentes projetados explicitamente como `"desconhecido"`.
  - `warnings: undefined` projetado como `"desconhecido"`, enquanto `warnings: []` é projetado como `"nenhum"`.
  - `fallbackUsed: true` e `fallbackUsed: false` claramente distinguidos.
  - Evidência sem `sourceUrl` (ou com string vazia) projetada estritamente como `[origem:desconhecida]`, sem adotar silenciosamente a URL geral do site.
  - Extensões desconhecidas e campos não consumidos não criam veto novo.
- **Evidência**: `server/ai/workflows/generationContext.test.ts` (`AC-2: distinguishes explicit absence, does not coerce missing evidence URL to general URL, accepts unconsumed extensions`).

### AC-3: Transporte íntegro de avisos, metadados e condições até seletor, copy e revisor
- **Cenários testados e verificados**:
  - Avisos da coleta (warnings) e condições terminativas/negativas ao final do texto chegam íntegros no seletor de designs, no redator de copy e no revisor V7 (`taskRoute: "post_evaluation"`).
  - Limite de 24.000 caracteres combinado da fonte validado sem truncamento silencioso; estouro dispara `SourceContextLimitError`.
- **Evidência**: `server/ai/workflows/siteSnapshotContext.test.ts` (`AC-3: accepted texts, IDs, kind, origin, warnings, and trailing conditions reach selector, copy and reviewer after adapter without trimming`).

### AC-4: Seções delimitadas, sem pseudo-regras e isolamento por proprietário
- **Cenários testados e verificados**:
  - Seções estruturadas: `METADADOS DO SNAPSHOT`, `SÍNTESE DO SITE`, `ORIENTAÇÕES CONTEXTUAIS DO SITE` e `EVIDÊNCIAS SALVAS DO SITE`.
  - Zero pseudo-regras imperativas ("fonte única", "cores obrigatórias", proibições arbitrárias de cópia).
  - Snapshot de outro usuário ou inacessível falha fechado sem rescrape silencioso.
  - Preparação completada reusa o contexto literalmente byte a byte, mesmo se o snapshot no banco for alterado posteriormente.
- **Evidência**: `server/ai/workflows/siteSnapshotContext.test.ts` (`AC-1 & AC-2`, `AC-4`, `AC-5`) e `server/ai/workflows/generationRuntime.test.ts` (`reuses prepared snapshot context byte-by-byte without reloading even if snapshot in db changes`).

---

## 3. Comandos Executados e Resultados

Executados no diretório isolado `/tmp/postspark-test-run/`:

### 3.1 Suíte C-02 (Vitest)
```bash
pnpm exec vitest run server/ai/workflows/generationContext.test.ts server/ai/workflows/siteSnapshotContext.test.ts server/ai/workflows/generationRuntime.test.ts server/siteIntelligence.test.ts server/siteContent.test.ts
```
- **Arquivos avaliados**: 5 arquivos de teste.
- **Testes executados**: 41 testes.
- **Resultado**: 41 aprovados, 0 falhas. Exit code: 0.

### 3.2 Checagem de Tipos TypeScript
```bash
pnpm exec tsc --noEmit --incremental false
```
- **Resultado**: 0 erros. Exit code: 0.

---

## 4. Operações Externas

- Nenhuma operação externa, scrape real ou requisição de rede realizada.
- Código produtivo protegido de `siteIntelligence.ts`, `siteContent.ts` e schemas compartilhados preservado sem alterações.

---

## 5. Adendo V1 — Resolução e Fechamento de RC-002 (16/10/2026)

Conforme registrado em `docs/reforma/correcao-contexto-ia/REGISTRO-CORRECOES.md` (§4, RC-002), a validação de snapshot em `generationRuntime.ts` tolerava valores `null` em metadados, qualidade e negócio (causando até `TypeError` na projeção ao tentar ler `.length` de `warnings: null`), não validava o domínio canônico de `business.goals`, e a projeção aplicava `.trim()` nos metadados aceitos, alterando a representação exata dos dados recebidos.

### 5.1 Implementação Corretiva (V1)
1. **Rejeição estrita de `null` em `validateSiteIntelligenceSnapshot`**:
   - `sourceUrl: null`, `normalizedUrl: null`, `fingerprint: null`, `extractedAt: null` rejeitados explicitamente antes dos modelos.
   - `quality: null` rejeitado como estrutura inválida.
   - `quality.warnings: null` rejeitado com diagnóstico explícito de campo inválido.
   - `brand: null`, `business: null`, `business.summary: null`, `business.valueProposition: null` e arrays nulos rejeitados.
2. **Validação estrita de domínio para `business.goals`**:
   - Cada item de `business.goals` deve pertencer obrigatoriamente a `["educate", "authority", "sell", "engage", "lead"]` (definido em `shared/postspark.ts:1156`).
   - Valores arbitrários fora do domínio (ex: `"garantir-lucro-automatico"`) são recusados com erro claro antes de qualquer projeção ou chamada de modelo.
3. **Preservação de bytes e espaçamentos em `projectSiteIntelligenceSnapshot`**:
   - `originUrl`, `fingerprint` e `extractedAt` verificam se não são vazios via `.trim().length > 0`, mas preservam os bytes e espaçamentos exatos das strings aceitas na saída projetada.
   - O projetor nunca mais quebra com `TypeError` por `warnings` nulo, pois este é estritamente barrado na validação.

### 5.2 Evidências e Testes de Homologação
- **Matriz de 6 casos em `server/ai/workflows/siteSnapshotContext.test.ts` (`RC-002: strict snapshot validation and exact projection`)**:
  1. `sourceUrl: null` na raiz rejeitado com erro identificando o campo.
  2. `business.summary: null` rejeitado com erro identificando o campo.
  3. `quality: null` rejeitado como estrutura presente inválida.
  4. `quality: { warnings: null }` rejeitado antes de projetar (sem `TypeError` silencioso).
  5. `business: { goals: ["garantir-lucro-automatico"] }` rejeitado por violação de domínio.
  6. Metadados com espaços nas extremidades aceitos e com bytes/espaçamentos originais preservados integralmente na projeção.
- **Controles positivos mantidos**:
  - `quality: { fallbackUsed: false, warnings: [] }` preserva `fallbackUsed: false` e `"nenhum"`.
  - Evidência sem URL própria projetada estritamente como `[origem:desconhecida]`.
  - Limite de 24.000 caracteres preservado.
  - Conflito usuário vs site sob `visual_only` mantém prioridade do pedido do usuário.
- **Resultados**: 15/15 testes em `siteSnapshotContext.test.ts` aprovados com exit code 0.
- **Status do Achado**: **RC-002 ENCERRADO / RESOLVIDO**.
