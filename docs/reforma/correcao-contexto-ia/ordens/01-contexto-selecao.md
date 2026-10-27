# OS-01 — Fonte e pedido complementar chegam à seleção

Estado: **PRONTA**
Papel: executor-blindado; um responsável por todos os caminhos desta ordem.
Base verificada: `main`, HEAD `40c08323d9f4f3d0fd097a04844f81f9dc9d4b61`, conteúdo local descrito no [roadmap](../ROADMAP.md), com preparação/perfis v2 já alterados.
Depende de: nenhuma ordem; exclusividade dos caminhos antes de executar.
Execução: sequencial; precede OS-02. Não executar correção nesta etapa de planejamento.

## Objetivo e aceite

Corrigir C2 e a omissão de instrução complementar associada a C7 no consumidor ativo. O seletor deve poder escolher usando a mesma fonte adicional disponível ao redator, sem mudar a oferta ou comprar outra etapa.

- AC-1: em execution, fonte sentinela ausente de `rawInput`/notas e instrução sentinela exclusiva de `input.content` aparecem na mensagem efetiva do seletor, identificadas como fonte e pedido. Não basta aparecerem em `prepared.contextContent`.
- AC-2: provar com catálogo compacto v2 real em fixtures: até 12 ofertas segue sem chamada Jev; acima de 12, o transporte controlado do Jev e o seletor recebem a mesma condição material. Manter participação/perfis/hashes, três IDs finitos e razões válidas. Capturar também o payload após o adapter de modelo, não só argumento do helper.
- AC-3: ideation textual e URL continuam recebendo sua fonte; execution mantém intervenção, CTA e requisitos literais/semânticos/proibidos. Fonte com negação/unidade/condição ao final é preservada; contexto acima de 24.000 falha explicitamente e lote Jev excedido não é truncado.
- AC-4: seleção completed e preparação salva são reutilizadas sem chamar seletor/Jev; uncertain não é recomprado. Não regravar resultado antigo para ajustá-lo à projeção nova.
- AC-5: workflow com definições selecionadas recebe a fonte e pode entregar bundle válido sob copy/parecer fixtures declaradas. Isso comprova conectividade, não adequação semântica real da escolha.

## Leitura e contrato

- [CONTRATOS.md §§1–2](../CONTRATOS.md); diagnóstico C2/C7 e mapa §§2–3/5–8.
- `server/ai/workflows/generationPreparation.ts`: `prepareOrchestratedGeneration`, projeção `brief`, `sourceEvidence`, `selection`, perfis/recibos e resultado preparado.
- `server/ai/generationOrchestrator.ts`: `buildUserPrompt` e `buildExecutionBriefContext` — helpers compartilhados, somente leitura nesta ordem.
- `server/designCatalog/designShortlist.ts`: `designShortlistBrief`, limite do envelope, caminho sem Jev.
- `shared/generationRequest.ts`, `shared/sourceContext.ts`, `shared/compactDesignProfile.ts`; `server/ai/providers/modelAdapters.ts`.
- Testes existentes de preparação, shortlist, eleição, transporte LLM e workflow; leitura adicional dirigida permitida.

## Escrita autorizada

- `server/ai/workflows/generationPreparation.ts` — editar somente composição da entrada textual de seleção/Jev e deduplicação exata necessária; manter contratos/recibos e fallback histórico.
- `server/ai/workflows/generationPreparation.test.ts` — editar: cobertura das duas faixas de catálogo e compatibilidade das entradas antigas.
- `server/ai/workflows/generationSelectionContext.test.ts` — criar: regressão de C2, transporte efetivo com adapter, conexão preparação → copy e retomada controlada, com dependências/HTTP injetados.
- `DOCUMENTO_MESTRE.md` — acrescentar somente resultado funcional verificado desta ordem; não reescrever histórico ou alterações locais.

Resultado exclusivo: `docs/reforma/correcao-contexto-ia/resultados/01-contexto-selecao.md` — criar ao executar, com modelo de resultado da skill (estado, arquivos próprios, AC → evidência, comando/cwd/exit, limitações/operações externas).

Protegidos: tudo fora da lista; em especial `shared/*`, helper legado, router, store/RPCs, shortlist/modelRouter, adapter LLM, fontes/configurações do provedor, CanvasLab, migrations, manifests/lockfile e documentos da investigação. Não alterar payload de imagem nesta ordem (INV-02).

Artefatos de comandos: somente cópia descartável e saídas temporárias descritas no roadmap. Não copiar de volta log, cache, bundles ou arquivo gerado.

## Dependências e integração

O mesmo executor faz imports e wiring dentro dos caminhos autorizados. Usar campos já existentes no payload local; nenhuma abstração global. OS-02 integra os campos de marca a esta mensagem. OS-03 detém a passagem do conjunto até commit/compilação do editor. Caso os caminhos se revelem insuficientes, emitir `[BLOQUEIO DE FRONTEIRA]` com necessidade concreta; não ampliá-los por iniciativa própria.

## Verificações

Na raiz da cópia descartável atual, conforme roadmap:

```bash
pnpm exec vitest run server/ai/workflows/generationSelectionContext.test.ts server/ai/workflows/generationPreparation.test.ts server/designCatalog/designShortlist.test.ts server/ai/workflows/designElection.test.ts server/ai/workflows/designElection.postgres.test.ts server/_core/llm.test.ts
pnpm exec tsc --noEmit --incremental false
```

O primeiro arquivo será criado nesta ordem; os demais e o runner já existem. O teste novo deve falhar na base pela ausência das sentinelas, passar com a correção e proibir rede não mockada. Incluir matriz execution/ideation, <=12/>12 e recibos catálogo antigos/v2; fixtures não contam como avaliação de modelo. Registrar contagem real, falhas preexistentes e mensagens capturadas sanitizadas.

## Operações externas

Nenhuma. Não iniciar worker, chamar LLM/Jev real, fazer scrape real, consultar dados remotos ou publicar. PGlite descartável e HTTP controlado são suficientes.
