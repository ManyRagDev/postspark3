# OS-03 — Snapshot com origem e limites explícitos

Estado: **PRONTA**
Papel: executor-blindado; responsável também pela passagem integrada final.
Base verificada: `main`, HEAD `40c08323d9f4f3d0fd097a04844f81f9dc9d4b61`, checkout local preservado.
Depende de: OS-01/02 para o fechamento integrado. A correção de snapshot é funcionalmente independente; programação padrão mantém a ordem sequencial por propriedade do documento-mestre e da integração.
Execução: sequencial, após OS-02. Não executar correção nesta etapa de planejamento.

## Objetivo e aceite

Corrigir a perda de proveniência/qualidade e mistura de regras na projeção de snapshot (parte comprovada de C6). Usuário e revisão não devem tratar síntese/fallback como evidência integral do site. Não modificar limites de coleta, criar DNA automático ou recuperar informação já descartada.

- AC-1: snapshot controlado conserva no contexto identificador/origem/fingerprint/data, texto exato de cada evidência salva, `id/sourceUrl/kind` e `quality.fallbackUsed/warnings`. Metadado ausente histórico é desconhecido; fallback false/true e warning são distinguíveis nas mensagens efetivas de seletor/copy/revisor. Validar os campos consumidos em execução: evidência/estrutura malformada falha explicitamente antes de chamar modelo, sem omissão/coerção silenciosa.
- AC-2: evidências, resumo/âncoras sintetizados e orientação são identificados separadamente. A projeção ativa não acrescenta regras “fonte única”, cores mandatórias, âncoras obrigatórias ou proibição de cópia; dados externos imperativos continuam dados. Conflito usuário/site não cria requisitos novos: sob `visual_only` e obrigações explícitas, o transporte/política preservam prioridade do pedido. Não alegar obediência real de modelo a partir da fixture.
- AC-3: evidência no final do snapshot é preservada até o limite combinado de 24.000; acima dele há `SourceContextLimitError`, sem corte ou remoção de warnings para caber. Condição que já foi cortada na coleta não é declarada recuperada/confirmada. Projeção não afirma leitura integral do website.
- AC-4: carregamento usa o proprietário atual; snapshot inexistente/inacessível mantém falha, sem consultar outro usuário ou fazer rescrape/fallback silencioso. Texto/URL sem snapshot mantêm caminho atual. `siteIntelligenceToPrompt` e consumidores históricos continuam intactos.
- AC-5: contexto/preparação completed são reaproveitados byte a byte; snapshot mutado depois não muda pedido preparado, hash ou parecer salvo. Operação uncertain continua sem recompra.
- AC-6: integrar OS-01/02 com snapshot sintético, marca exclusiva do Kit e instrução complementar: preparação → seleção → três propostas → revisão fixture → commit/grants PGlite → bundle → compilação/serialização/reabertura CanvasPostModel. Fonte e orientação chegam aos consumidores certos; cenas/bindings/legenda/slides sobrevivem. Testar estático e carrossel, inclusive entrega parcial quando uma proposta falha. Preservar limites financeiros explicitamente não cobertos pela fixture.

## Leitura e contrato

- [CONTRATOS.md §§1/4](../CONTRATOS.md), diagnóstico C6, INV-04, resultados OS-01/02 e PLANO-AVALIACAO §3.
- `server/ai/workflows/generationRuntime.ts`: `loadGenerationContext`, operação de preparação e reutilização de prepared.
- `server/siteIntelligence.ts`: carregamento e projeção antiga; `shared/postspark.ts`: `SiteIntelligence/SiteEvidence`; `server/siteContent.ts`: limites anteriores. Somente leitura destes três arquivos.
- `generationContext.test.ts`, `generationRuntime.test.ts`, `carouselDelivery.postgres.test.ts`, `generationPostgres.fixture.ts`, compilador/saveAdapter do CanvasLab e testes de billing local. Não inferir homologação remota a partir de PGlite.

## Escrita autorizada

- `server/ai/workflows/generationRuntime.ts` — projeção textual específica da geração no ramo de snapshot, aproveitando dados já carregados; sem alterar journal/coordenador/billing.
- `server/ai/workflows/generationContext.test.ts` — evidências/origem/qualidade, acesso por proprietário, limites e caminhos texto/URL; ajustar mocks da projeção antiga.
- `server/ai/workflows/generationRuntime.test.ts` — snapshot alterado após preparação e reaproveitamento/uncertain, sem atualização de contexto salvo.
- `server/ai/workflows/siteSnapshotContext.test.ts` — criar: snapshot → transporte real controlado para seleção/copy/revisor, com limites e autoridade observável.
- `server/ai/workflows/carouselDelivery.postgres.test.ts` — ampliar integração existente com entrada de marca/snapshot/complemento, estático/carrossel/partial e roundtrip do editor. Usar SQL de fixture já existente; nenhuma migration de produto.
- `DOCUMENTO_MESTRE.md` — acrescentar comportamento implementado, resultado da integração e pendências de qualidade/ambiente.

Resultado exclusivo: `docs/reforma/correcao-contexto-ia/resultados/03-contexto-snapshot.md` — criar ao executar; registrar também passagem do conjunto, AC → evidência, contagens/exit/cwd e limitações de modelo/finanças/produção.

Protegidos: tudo fora da lista, especialmente snapshot persistido, `siteIntelligence.ts`/projeção legada, coleta/síntese, schemas/shared, preparação/revisão corrigidas pelas ordens anteriores, router/autenticação, SQL/RLS/Storage/billing, editor/renderer, manifests/lockfile, `api/index.js`, investigação e planos. Integração não autoriza corrigir módulo protegido: emitir `[BLOQUEIO DE FRONTEIRA]` e replanejar a ordem dona.

Artefatos de comandos: PGlite em memória, cópia descartável/logs/cache nela e builds nos caminhos `/tmp` do roadmap. Não gravar outputs privados, gerados ou log operacional no checkout.

## Dependências e integração

O executor desta ordem detém o wiring local da projeção e os casos integrados. Não criar novo contrato de `sourceReferences` ou mudar assinaturas de runtime/preparação. A string retornada é pinada pela operação de contexto existente e segue pelas entradas corrigidas na OS-01; marca e cálculo de hash seguem OS-02. Os testes devem exercitar essas funções, sem remontar manualmente uma mensagem idealizada que contorne o defeito.

## Verificações

Na raiz da cópia descartável atual:

```bash
pnpm exec vitest run server/ai/workflows/generationContext.test.ts server/ai/workflows/generationRuntime.test.ts server/ai/workflows/siteSnapshotContext.test.ts server/ai/workflows/carouselDelivery.postgres.test.ts server/siteIntelligence.test.ts server/siteContent.test.ts server/ai/workflows/generationBilling.postgres.test.ts
```

Somente `siteSnapshotContext.test.ts` será criado nesta ordem. Em seguida, executar os cinco comandos de passagem integrada do roadmap (suíte completa, replay offline, TypeScript e builds temporários). Não repetir a suíte sem mudança ou falha que justifique. Tests de transporte usam fixtures identificadas; não comprar parecer real para fazer aceite determinístico passar.

No relatório, manter os dois checks financeiros não comprovados da fixture de entrega distinguíveis dos testes PGlite específicos de billing; não fabricar campos para obter relatório verde. Passagem local não significa avaliação humana, RLS/produção ou operação financeira real homologadas. Se aparecer defeito material novo, registrar fronteira/evidência e bloquear a conclusão afetada, sem remover aceite.

## Operações externas

Nenhuma. Não buscar URL viva, gerar nova síntese, consultar snapshot real, mudar dados remotos, aplicar migration, publicar design ou fazer deploy. Ganho semântico real permanece dependente da avaliação autorizada futura.
