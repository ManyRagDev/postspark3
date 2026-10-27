# Registro reconciliado de correções — contexto de IA

Data: 16/10/2026. Modo: **reconciliação de divergências** com a skill `auditor-red-team`. Referência auditada: **V0**, definida abaixo. Parecer: **AJUSTES_NECESSARIOS**, restrito a RC-001, RC-002 e RC-003.

Há dois defeitos funcionais reproduzidos e uma pendência obrigatória de testes/evidências. As perdas originais de transporte e a retomada histórica sem entrada verificável não devem continuar sendo apresentadas como defeitos atuais: receberam correções com evidência positiva. Não há fundamento para abrir nova refatoração, trocar modelos, criar migrations ou rever o mecanismo financeiro nesta reconciliação.

Este registro consolida os relatórios; não altera os contratos nem implementa correções. “Confirmado” significa demonstrado no código V0 ou na evidência entregue, não incidente observado em produção. “Já resolvido” se limita ao comportamento verificado. Hipótese e ambiguidade não se transformam em ordem de implementação por repetição em auditorias.

## 1. Referência estável e alterações pendentes

| Elemento | Identificação observada antes de escrever este registro |
| --- | --- |
| Raiz | `/home/many/Documentos/Projetos linux/PostSpark 3` |
| Branch | `main` |
| HEAD completo | `40c08323d9f4f3d0fd097a04844f81f9dc9d4b61` |
| Instante do congelamento | `2026-10-16T17:32:06.994267+00:00` — 14:32:06 em America/Sao_Paulo |
| Estado local | 97 entradas rastreadas alteradas e 146 arquivos não rastreados; 243 entradas com `git status --porcelain=v1 --untracked-files=all` |
| Staged | Diff de zero bytes |
| SHA-256 do status bruto | `7717ed0a7638fde6e7935243e32582fc18ebdaf57f1d96d14b5e309c6c025935` |
| SHA-256 do diff local rastreado | `bfc6fcabe3622a2f8661a4da830ca55d1d5440683a065ff3f79281aabb5f17a5` |
| Identidade do conteúdo auditado, incluindo não rastreados | 1.148 arquivos; SHA-256 agregado `6ad053bd472f34ef2cb70ee554b49bd275bf35da41f9aad435cedaec2840ca9d` |

**HEAD sozinho não identifica esta entrega.** Os módulos produtivos `generationPreparation.ts`, `generationRuntime.ts`, `designShortlist.ts`, `shared/creationBrief.ts` e `shared/generationRequest.ts` estão modificados. `shared/contentRequirements.ts` e os testes `generationSelectionContext.test.ts`, `siteSnapshotContext.test.ts`, `carouselDelivery.postgres.test.ts` e `StudioAppV2BPage.generation.test.tsx` são não rastreados. `generationRuntime.test.ts`, `DOCUMENTO_MESTRE.md`, `package.json` e `pnpm-lock.yaml` também possuem alterações locais. O diretório das ordens/resultados está não rastreado neste checkout.

O status geral inclui outras mudanças de frontend/backend, migrações e exclusões legadas. Não existe evidência para atribuir todo esse diff às três corretivas. As correções não estão isoladas em commits próprios que permitam um bisect inequívoco. Nenhum desses arquivos foi alterado nesta reconciliação.

Método da identidade V0: arquivos regulares, sem links simbólicos, sob `client`, `server`, `shared`, `drizzle`, `scripts`, `harness`, `designs`, `lib`, `tests`, `patches` e `api`; excluir componentes `node_modules`, `.git`, `.aws`, `.codex`, `.backup`, nomes `.env*`, sufixos `.pem`, `.key`, `.log` e `OPERATIONAL_ERRORS.txt`. Acrescentar Markdown de `docs/reforma/correcao-contexto-ia` e `docs/agent-work/correcao-contexto-ia`, e os arquivos de raiz `AGENTS.md`, `DOCUMENTO_MESTRE.md`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts` e `vite.config.ts`, quando existentes. Excluir o próprio `REGISTRO-CORRECOES.md`. Ordenar caminhos relativos, calcular SHA-256 dos bytes de cada arquivo e depois SHA-256 da concatenação UTF-8 `caminho + NUL + hash_hex + LF`. Não é um novo mecanismo do produto; é a identificação desta auditoria.

A identidade foi recalculada depois das verificações e permaneceu igual. O hash do log operacional original também permaneceu igual; seu conteúdo não foi lido nem copiado. A única escrita no checkout desta tarefa é este registro. As cópias de auditorias anteriores em `/tmp/postspark-auditoria-contexto-20261015`, `/tmp/postspark-auditoria-corretivas-20261016` e `/tmp/postspark-test-run` não existem mais na inspeção atual. Portanto, comparações anteriores contra essas cópias são evidência histórica declarada, não comparação repetida hoje. Não interpretei a ausência dessas cópias como arquivos novos na entrega.

### Fontes reconciliadas

| Documento | Papel nesta reconciliação |
| --- | --- |
| [Roadmap original](./ROADMAP.md), [contratos originais](./CONTRATOS.md), ordens OS-01–03 e respectivos resultados | Requisitos de transporte, fronteiras e alegações iniciais de conclusão. |
| [Primeira auditoria](../../agent-work/correcao-contexto-ia/auditoria-entrega.md) | Achados D1–D4 e risco R1. Não presumidos corretos sem confronto com V0. |
| [Roadmap corretivo](./replanejamento-auditoria/ROADMAP.md), [adendo contratual](./replanejamento-auditoria/CONTRATOS.md), ordens C-01–03 | Referência vigente dos aceites corretivos. O adendo resolve explicitamente a transição de pedidos históricos. |
| [Resultado C-01](./replanejamento-auditoria/resultados/01-selecao-retomada.md), [C-02](./replanejamento-auditoria/resultados/02-validacao-snapshot.md), [C-03](./replanejamento-auditoria/resultados/03-integracao-evidencias.md) | Declaram as três entregas concluídas; comparados com implementação, testes e reproduções atuais. |
| [Segunda auditoria](../../agent-work/correcao-contexto-ia/replanejamento-auditoria/auditoria-entrega.md) | Achados A1–A3; reconciliados abaixo, sem criar uma segunda lista concorrente. |
| [DOCUMENTO_MESTRE.md](../../../DOCUMENTO_MESTRE.md), §13.127–131 | Histórico de execução/replanejamento e declarações de fechamento. Revisado, sem edição nesta tarefa. |
| [INVESTIGACOES.md](./INVESTIGACOES.md) | Decisões e hipóteses já separadas do escopo executável; nenhuma foi promovida a correção nesta auditoria. |

As auditorias em `docs/agent-work` são ignoradas pelo Git, embora estejam disponíveis localmente e tenham integrado a identidade V0. Não se deve presumir que acompanhem um futuro commit. As evidências necessárias aos achados atuais estão reproduzidas neste registro.

## 2. Índice único de achados

Os IDs abaixo são estáveis: conservar o ID quando o estado mudar; não renumerar, apagar ou reabrir itens resolvidos sem nova contraprova na versão identificada.

| ID | Classificação atual | Prioridade | Causa/tema | Correspondência histórica | Dependências para fechamento |
| --- | --- | --- | --- | --- | --- |
| **RC-001** | **Confirmado** | **P1** | Recibo de seleção não validado integralmente antes dos modelos | A1; limite residual do mecanismo criado para D1 | C-01; não depende de RC-002 |
| **RC-002** | **Confirmado** | **P2** | Validação/projeção parcial dos campos consumidos do snapshot | D2 remanescente, A2 | C-02; independente de RC-001 |
| **RC-003** | **Confirmado — evidência/aceite** | **P2** | Integração exigida parcialmente contornada e conclusão superestimada | D4, A3; parcela documental de R1 | C-03; fechamento integrado depende de RC-001/002 |
| **RC-004** | **Já resolvido no recorte testado** | P1 histórica | Transporte de fonte/complemento/marca/requisitos | G1/G2, C1 editorial/C2/C3, D3 | Nenhuma nova correção; conservar cobertura existente |
| **RC-005** | **Já resolvido no recorte testado** | P1 histórica | Preparação histórica paga sem entrada verificável; reuso de efeitos completed | D1 original | Nenhuma nova correção; incompatibilidade residual é RC-001 |
| **RC-006** | **Hipótese não comprovada** | Sem prioridade corretiva | Uso/exposição de credenciais ou chamadas remotas no ambiente anterior | Inferências possíveis a partir de R1 | Investigação somente se a ocorrência histórica precisar ser estabelecida |

P1 em RC-001 decorre da possibilidade plausível de invocar efeitos externos antes de uma incompatibilidade já detectável. Os contadores observados são de fixtures: não se observou compra nem cobrança real. P2 em RC-003 é descumprimento de aceite/evidência; não é uma terceira regressão funcional demonstrada.

## 3. RC-001 — validação do recibo anterior aos efeitos

**Requisito violado.** Adendo §2: recibo completed é autoritativo; formato/configuração/identidade que não possam ser honrados devem provocar recusa **antes de Jev/seletor**, sem reconstruir/substituir a entrada. C-01 AC-2 exige retomada compatível sem recompra.

**Evidência de código.** [generationPreparation.ts:56](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/generationPreparation.ts:56>) declara `brief: z.unknown()` e valida somente a forma da configuração V2. Em torno das linhas 779–794, o pin é lido, apenas `jevModel` é comparado ao ambiente e a shortlist recebe `selectionInput.brief as any`. A configuração salva só é validada semanticamente em caminho posterior, por [assertReviewExecutionConfigV7](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/reviewExecutionConfigV7.ts:89>). O guard do runtime, [generationRuntime.ts:719](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/generationRuntime.ts:719>), reutiliza o schema permissivo.

**Reprodução independente em V0.** Na cópia isolada, executar o preparador real com catálogo compacto v2 de 14 ofertas de `electionCatalogFixture`, `reconcileCatalogCoverage` e `shortlistCompleteDesigns` reais. Injetar avaliador Jev e seletor controlados com contadores. A operação `selection_input` devolve um recibo completo inicialmente válido. Alterar apenas o campo da variante; manter todos os demais obrigatórios. Ao retornar a preparação, aplicar a validação existente da configuração salva.

| Variante | Aceito pelo schema | Jev / seletor | Resultado atual |
| --- | --- | --- | --- |
| Controle com brief válido | Sim | 1 / 1 | Preparação válida |
| `brief: null` | Sim | 1 / 1 | Brief nulo chega ao seletor; preparação retorna |
| `brief: 123` | Sim | 1 / 1 | Número chega ao seletor; preparação retorna |
| `configurationHash` da configuração substituído por 64 zeros | Sim | 1 / 1 | Validação posterior acusa `preparation_contract_incompatible` |
| Pin originalmente válido, seguido de mudança apenas em `ENV.openRouterProposalReviewModel` | Sim | 1 / 1 | Mesma incompatibilidade, detectada depois das chamadas |

A última variante não requer corrupção no armazenamento: basta interrupção após o pin e alteração legítima da configuração antes de retomar. Nenhum modelo real foi chamado; as dependências controladas receberam o que o código produtivo enviaria. A sonda injeta o retorno do journal no preparador; o runtime também aceita sua forma, mas não foi simulada cobrança de ponta a ponta.

**Causa compartilhada/duplicação.** Brief permissivo e configuração incompatível são dois casos da mesma ausência de validação completa do recibo antes dos efeitos. Não precisam de duas arquiteturas ou ordens. O teste de recibo inválido em `generationRuntime.test.ts:753` usa `{brief:123}` sem os outros campos obrigatórios: passa por rejeitar as ausências, não por demonstrar validação do brief.

**Impacto.** Seleção sem briefing válido ou efeitos externos tentados antes de recusa previsível. Não comprova incidência comercial. O novo mecanismo corrige D1 histórico, mas introduz uma fronteira cuja validação está incompleta.

**Condição objetiva de fechamento.** Com recibos completos e uma única incompatibilidade por caso, todos os casos acima devem recusar com o erro contratual de preparação, estágio selection, sem retry automático e com contadores Jev/seletor iguais a zero. Brief válido textual e as partes de imagem já suportadas continuam aceitos; pin compatível continua reutilizado literalmente. Não recalcular pin, inventar versão/hash, migrar dados nem trocar modelo para fazer a retomada passar. Cabe em C-01 e no validador de configuração já existente.

## 4. RC-002 — contrato do snapshot não integralmente aplicado

**Requisito violado.** Adendo §3/C-02: campos consumidos presentes devem ter o tipo acordado; null não equivale a ausência textual; quality presente é objeto e warnings presentes são array; objetivos pertencem ao domínio existente; URL/fingerprint/data aceitos não são normalizados na projeção. Erro deve identificar o campo antes dos modelos.

**Evidência de código.** [generationRuntime.ts:173](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/generationRuntime.ts:173>), função `validateSiteIntelligenceSnapshot`, dispensa null em metadados, quality e vários campos de negócio/arrays. `business.goals` é validado apenas como array de strings. O tipo em [shared/postspark.ts:1156](</home/many/Documentos/Projetos linux/PostSpark 3/shared/postspark.ts:1156>) define `educate|authority|sell|engage|lead`. A projeção em torno de 357–374 usa o resultado de `.trim()` como metadado e acessa `.length` de warnings aceito como null.

**Reprodução independente em V0.** Chamar `validateSiteIntelligenceSnapshot` e depois `projectSiteIntelligenceSnapshot` com esta base, alterando uma propriedade por vez:

```json
{
  "id": "rc-snapshot",
  "brand": {},
  "business": {},
  "editorial": {},
  "evidence": [{
    "id": "e1", "kind": "body",
    "sourceUrl": "https://example.test/page", "text": "  Fato literal  "
  }]
}
```

| Alteração isolada | Resultado atual observado | Resultado exigido |
| --- | --- | --- |
| `sourceUrl:null` na raiz | Aceita; origem desconhecida | Rejeitar tipo do campo |
| `business.summary:null` | Aceita; não informado | Rejeitar tipo do campo |
| `quality:null` | Aceita como ausência | Rejeitar estrutura presente inválida |
| `quality:{warnings:null}` | Guard aceita; projetor lança `Cannot read properties of null (reading 'length')` | Rejeitar `quality.warnings` antes de projetar |
| `business:{goals:["garantir-lucro-automatico"]}` | Aceita; valor chega aos objetivos do contexto | Rejeitar objetivo fora do domínio |
| `sourceUrl`, `fingerprint`, `extractedAt` com espaços nas extremidades | Aceita; remove os espaços ao projetar | Preservar o valor aceito; checar vazio sem normalizar a saída |

Controles positivos: `quality:{fallbackUsed:false,warnings:[]}` preserva false e nenhum aviso; `fallbackUsed:"false"` e sourceUrl numérica são rejeitados; texto bruto da evidência mantém exatamente os espaços. Esses casos corrigidos não continuam pendentes só porque a validação ainda tem lacunas.

**Causa compartilhada/duplicação.** D2/A2 descrevem o mesmo guard parcial, seguido por projeção que pressupõe um contrato mais forte. Os contracasos são a matriz de um único achado, não novas frentes de normalização ou schema global.

**Impacto.** Entrada inválida pode virar informação desconhecida, objetivo inválido pode chegar ao prompt e warnings null perde o diagnóstico de campo em um TypeError. Não foi demonstrada existência desses dados em produção nem efeito geral na qualidade editorial.

**Condição objetiva de fechamento.** A matriz deve rejeitar explicitamente os tipos/valores inválidos antes dos modelos e conservar bytes dos metadados aceitos. Exercitar também ausência histórica, vazio permitido, true/false, warnings ausentes/[], objetivos válidos, evidência com espaços e limite combinado 24.000 sem corte. Corrigir apenas campos consumidos e seus usos atuais; não exigir extensões desconhecidas, reconstruir snapshots ou alterar banco. Cabe em C-02.

## 5. RC-003 — integração e declaração de conclusão

**Requisito violado.** C-03 AC-1–5 e adendo §4 exigem cadeia real dos produtores/adaptadores/projetor até entrega, mensagens efetivas por consumidor, retomada com efeitos observáveis, cenários completos/partial, conflito de autoridade, proteção de rede e relato proporcional. A aceitação não se resume a contagem verde.

**Evidências verificadas em V0.**

| Lacuna delimitada | Evidência atual e reprodução | Condição objetiva de fechamento |
| --- | --- | --- |
| Cadeia integrada contorna produtores | `carouselDelivery.postgres.test.ts:130` injeta `loadContext`; em 426 monta texto do snapshot manualmente; monta executionBrief sem chamar `interpretRawBriefing`/`creationBriefToExecutionBrief`. Conferir imports e helper do cenário. O resultado C-03, AC-3, afirma que essas funções foram atravessadas. | Exercitar os produtores e o projetor reais no cenário estático e no carrossel exigidos; manter apenas serviços externos controlados. Retificar a afirmação até isso existir. |
| Complemento não exclusivo; partial com dados diferentes | Em 456–467 `input.content` também é rawInput; o carrossel repete o padrão. Partial em 565 não leva o mesmo brief/marca completo. | Complemento exclusivo de input.content, marca exclusiva do Kit e evidência exclusiva do snapshot; mesmos dados no partial, falhando somente um slot. |
| Assert agregado oculta consumidor ausente | Em 473, concatena todas as mensagens e procura cada sentinela no conjunto. Fonte em uma etapa basta para passar mesmo ausente em outra. | Conferir sentinelas separadamente em Jev quando aplicável, seleção, copy e revisão após adapter, além de resultado/status. |
| Refresh não demonstra os campos novos | `StudioAppV2BPage.generation.test.tsx:627` verifica Kit, edição, retry, Gerar mais e mudança de corpo; não faz remount/refresh com os mesmos campos novos. Outros testes de refresh não usam essas sentinelas. | Refresh/restauração preserva os campos novos e identidade apropriada no teste previsto em AC-1. |
| Retomada permanente não prova o que seu título promete | `generationRuntime.test.ts:786` usa prepare mockado devolvendo backup pronto. O novo teste byte a byte usa verificação mockada; não demonstra parecer/configuração V7 real pinada. | Reuso com preparador/journal reais controlados e contadores; prepared/contexto/parecer compatíveis conservados conforme AC-2. Sem exigir reconstrução de histórico incompatível. |
| Snapshot até workflow ainda parcialmente simulado | `siteSnapshotContext.test.ts:422` captura argumentos antes do adapter e ignora o resultado do workflow em torno de 562. Não há cenário de conflito usuário/site visual_only nos testes examinados. | Capturar a mensagem efetiva e resultado; conflito conserva prioridade do pedido/obrigações sob visual_only. |
| Fixture nova não é recibo histórico de revisão | `context-handoff-history.json` contém hashes/versões/rotas. `server/generationEvidence.test.ts:463`, apesar do título contra adulteração, compara hash e versão, sem adulterar recibo nessa adição. Há testes antigos reais de adulteração: não foram desconsiderados. | Se usados como prova de recibos pinados 1–5, incluir/configurar os dados e asserts independentes previstos, com procedência real ou sintética explícita. Descrever exatamente o que cada teste prova. |
| Proteção de rede entregue incompleta | Os testes de handoff e `vitest.setup.ts` não instalam bloqueio de fetch não mockado. A proteção externa desta auditoria não é alteração permanente da suíte. | Bloquear transporte não mockado nos testes alterados conforme ordem e restaurar globals. Não se exige chamada real. |
| Fechamento documental acima da prova | Resultados C-01–03 e mestre §13.129–131 declaram conclusão integral. O resultado C-03 afirma travessias ausentes e usa `/tmp/postspark-test-run`, destino expressamente excluído pelo roadmap corretivo. | Retificar histórico/status/matriz sem apagar resultados anteriores; referenciar provas efetivas e pendências. Não declarar conformidade retroativa do ambiente anterior. |

**O que já tem prova útil.** A suíte realmente exerce commit/grants PGlite, cenas/bindings, roundtrip de `CanvasPostModel` estático e carrossel e entrega parcial. Há cobertura de Kit/edição/retry/Gerar mais. As sondas atuais RC-004/005 atravessam fronteiras funcionais que alguns testes contornam; isso fecha a suspeita funcional nesses recortes, mas não completa o cenário integrado obrigatório nem modifica os testes versionados. Não se concluiu que o produto perde esses dados só porque falta o teste.

**Causa compartilhada.** Fronteiras relevantes são substituídas por valores já ideais; a prova de presença é agregada; títulos e resultados descrevem um alcance maior. Acrescentar nomes, hashes ou contagem de testes sem atravessar essas fronteiras tratou a aparência da evidência, não sua causa.

**Condição de fechamento do ID.** Satisfazer as linhas acima dentro dos arquivos/testes já autorizados de C-03, fechar RC-001/002 e então atualizar a matriz de aceites com resultados observáveis. Não requer novo comportamento produtivo, homologação semântica real, novo runner ou infraestrutura. A parte documental pode ser corrigida desde já, porém só documentação não satisfaz os aceites executáveis ausentes.

## 6. Itens encerrados e hipóteses delimitadas

### RC-004 — transporte original: já resolvido no recorte testado

**Requisito.** OS-01/02/03 e C-01 AC-4: fonte complementar, orientação de marca e requisitos efetivos devem chegar aos consumidores sem promoção automática de orientação a obrigação.

**Verificação atual.** Sonda em V0 usou `interpretRawBriefing` com Kit sintético exclusivo, edição de público, `creationBriefToExecutionBrief`, schema público, projetor real do snapshot, preparador/shortlist reais e uma execução real do workflow com parecer/pixels controlados. Foram usados três requisitos exclusivamente em `contentRequirements`: literal, meaning e forbidden; nenhum dependia dos arrays legados. Complemento não estava no rawInput/notas. Fonte e warning eram exclusivos do snapshot. Seleção/copy/revisão passaram pelo `invokeLLM`/adapter real até fetch controlado.

Resultado: `ready`; pin completed; todas as sentinelas esperadas presentes em **cada** consumidor capturado: dois lotes Jev, seleção, copy e revisão. As sentinelas incluíam público editado, essência, tom, fonte, warning, complemento e os três requisitos tipados. Nenhuma chamada real foi feita.

**Fechamento.** Suficiente para não reabrir C1 editorial/C2/C3/D3 como perda atual de transporte. A aceitação de false/[] e a preservação de evidência bruta de RC-002 também encerram esses contracasos antigos específicos. Não é homologação de criatividade nem a integração completa de três propostas até editor: essa cobertura permanece exclusivamente em RC-003. Nova ordem para este ID exige contraprova atual específica.

### RC-005 — retomada histórica: já resolvido no recorte testado

**Requisito vigente.** Adendo §2 substitui a expectativa de continuar toda preparação histórica: sem prepared e com efeito pago mas sem pin completed válido, **falhar fechado** é a compatibilidade aprovada. Prepared já salvo continua autoritativo sem exigir pin retroativo. Não há ambiguidade residual nessa decisão.

**Evidência.** `generationRuntime.ts:700–738` consulta operações e recusa estados/entrada incompatíveis antes de chamar prepare. Os testes do runtime a partir de 658 cobrem journal histórico sem pin, falha na leitura, formato/estado inválido e prepared salvo; passaram na execução atual. As sondas inválidas completas que esses testes não cobrem estão em RC-001, sem duplicação aqui.

Sonda adicional atual: preparador e shortlist reais, catálogo compacto de 14 ofertas, journal local em memória. Interromper imediatamente depois de salvar o primeiro lote Jev completed e antes de prepared; executar novamente com o mesmo journal/pin. Resultado observado:

```json
{
  "scenario": "RC005_valid_pin_resume",
  "fixture": true,
  "initialError": "RC005_INTERRUPTION_AFTER_COMPLETED_JEV",
  "firstJev": 1,
  "finalJev": 1,
  "selectorCalls": 1,
  "selected": 3,
  "pinCompleted": true
}
```

**Fechamento.** D1 original não permanece aberto: proteção histórica e caminho compatível tiveram evidência positiva. Não exigir reconstituição de pedidos antigos pagos sem pin; isso contrariaria o adendo. A prova permanente mais forte exigida pela ordem está em RC-003; a validação prévia dos pins incompatíveis, em RC-001.

### RC-006 — ambiente anterior: hipótese não comprovada

**Requisito/evidência.** Roadmap exigia cópia nova sem credenciais e rede não mockada. O executor declarou uso de `/tmp/postspark-test-run`; a segunda auditoria registrou presença de `.env`/`.aws` nesse destino. O desvio de procedimento/relato está consolidado em RC-003. A presença histórica foi relatada, mas não pôde ser inspecionada novamente porque o diretório está ausente hoje.

**O que não está demonstrado.** Não há prova de que aqueles arquivos tenham sido carregados, de chamada remota nova, cobrança ou exposição. Excluir arquivos na sincronização não prova retirar arquivos já existentes no destino; por outro lado, presença de arquivo não prova uso. Nenhum dos agentes recebe razão automática nessa inferência.

**Reprodução e encerramento.** Não é reproduzível retroativamente somente com o checkout atual. Se houver necessidade de estabelecer incidente histórico, são necessários registros sanitizados dos comandos/ambiente e do destino efetivamente executado e, se aplicável, logs de provedor já autorizados. Esta tarefa não os consultou nem autoriza consultas novas. Sem evidência adicional, conservar “não comprovado”, não ordenar correção produtiva, limpeza ou rotação. Para o aceite local atual, a nova execução isolada oferece prova positiva suficiente do comportamento verificado; não precisa provar uma negativa histórica impossível.

## 7. Atribuição: preexistência, regressão e correções de sintomas

| Categoria | Conclusão sustentada |
| --- | --- |
| Problema preexistente já corrigido | D3, requisitos exclusivamente tipados ausentes de Jev/seletor, foi identificado como preexistente à primeira entrega. A sonda atual confirma o transporte; RC-004 encerrado. |
| Falhas originais corrigidas | Fonte/complemento e campos editoriais de marca passaram pelos consumidores; proteção histórica sem pin passou; não são somente mudanças cosméticas. RC-004/005. |
| Defeito em mecanismo introduzido pelas corretivas | A chave/schema `selection_input` foi criada em C-01; sua permissividade e incompatibilidade tardia são observáveis hoje, RC-001. Essa atribuição ao mecanismo novo é sustentada por contrato, resultado e código, mas não prova incidente nem permite identificar commit introdutor separado no checkout sujo. |
| Persistência de defeito contratual | RC-002 mantém parte de D2. A auditoria anterior atribuiu o TypeError de warnings à nova combinação guard/projeção. A falha atual foi repetida; a comparação binária antes/depois não pôde ser repetida hoje porque a cópia anterior desapareceu. Não classificar todo RC-002 como regressão nova comprovada contra uma base anterior preservada. |
| Evidência insuficiente, não regressão funcional | RC-003. Mais testes e roundtrip válidos não provam as fronteiras substituídas por mocks; ausência da prova também não prova falha funcional. |
| Demais alterações locais | Preexistentes a esta auditoria, com origem não individualizada. Nenhuma atribuição global de regressão, mudança fora de escopo ou remoção de testes às corretivas é justificável apenas pelo diff contra HEAD. |

Não foi identificada nesta reconciliação uma mudança produtiva fora do escopo que exija nova correção. A segunda auditoria relatou comparação do delta corretivo com a cópia anterior: somente os dois módulos produtivos autorizados, além de testes/fixtures. Essa comparação histórica não é reapresentada como observação nova. Não se encontrou fundamento atual para reabrir SQL, renderer, autenticação ou billing.

Correções anteriores que ficaram nos sintomas: o schema do recibo testa um objeto incompleto em vez de cada campo incompatível num recibo válido; o guard do snapshot rejeita vários tipos, mas conserva exceções de null e não verifica o domínio de goals; a integração acrescenta sentinelas manuais e presença agregada, em vez de exercitar seus produtores/consumidores. São as causas já reunidas em RC-001/002/003, não uma lista adicional de melhorias.

## 8. Verificações seguras efetivamente executadas

Compass não estava disponível no inventário de ferramentas; investigação por `rg`, leitura dirigida, status/diffs e execução local. Sem subagentes, deploy, commit, reset, limpeza, scrape, worker conectado ou mutação remota.

Foi criada a cópia nova `/tmp/postspark-reconciliacao-contexto-20261016-v0`, com conteúdo local incluindo não rastreados necessários, dependências instaladas e as seis receitas públicas de `shared/assemblyPilotKit.json`. Antes de executar, foi verificada ausência de `.env*`, `.git`, `.aws` e log operacional original na cópia. O logger pode criar seu próprio log temporário nessa raiz; nenhum conteúdo volta ao checkout.

Ambiente dos comandos: `env -i` preservando PATH/HOME/LANG; nenhuma variável de credencial exportada. Preload Node substituiu fetch não mockado por erro `RECONCILIATION_UNMOCKED_FETCH_BLOCKED`. Testes que precisam do transporte usam seus mocks. Isso descreve a barreira aplicada nesta execução, não uma auditoria geral de todo protocolo de rede/dependências.

Versões: Node `v22.23.2`, pnpm `10.4.1`, Vitest `2.1.9`, TypeScript `5.9.3`.

| Comando, a partir da raiz da cópia | Observação independente |
| --- | --- |
| `pnpm exec vitest run` | Exit 0; **183 arquivos, 1.919 testes aprovados**, 39,87 s; início local 14:33:26. |
| `pnpm exec tsc --noEmit --incremental false` | Exit 0. |
| `node --import tsx scripts/evaluateEditorialReplay.ts` | Exit 0; 33 casos, 29 não medidos; política 1: três medidos/três acertos; política 2: um medido/uma falsa aprovação; zero chamadas novas. Não mede V7/perfil 5. |
| `pnpm exec vite build --outDir /tmp/postspark-reconciliacao-v0-client` | Exit 0; build concluído em 5,47 s; aviso existente de chunk >500 kB, sem abertura de tarefa de otimização. |
| `pnpm exec esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outfile=/tmp/postspark-reconciliacao-v0-server.mjs` | Exit 0; 685,0 kB. |
| Sondas por stdin com `node --import tsx --input-type=module` | Reproduções RC-001/002 e controles RC-004/005 descritos neste registro; avaliadores/pareceres/transporte controlados, sem cobrança. |

Logs temporários: `verificacao-vitest.log`, `verificacao-tsc.log`, `verificacao-replay.json` e `verificacao-vite.log` na cópia. Os resultados e contraprovas relevantes estão neste arquivo, pois `/tmp` não é referência durável. Não houve alteração de testes para obter a passagem. Uma tentativa de sonda com import incorreto foi corrigida antes da execução; não foi classificada como defeito do produto. O custo de chamadas reais nesta tarefa foi zero.

Passagem verde de testes/compilação não contradiz RC-001/002: seus contracasos completos não estão cobertos nos asserts entregues. PGlite e papéis administrativos de fixture não demonstram RLS de usuário comum; dados de editor persistidos não demonstram inspeção visual humana; parecer fixture não demonstra qualidade de modelo. Esses limites conhecidos não são novos bloqueadores do escopo local.

## 9. Ambiguidades e hipóteses já existentes, fora das corretivas

Não há ambiguidade bloqueante sobre os três defeitos confirmados: os requisitos citados já estão explícitos. A única disputa de compatibilidade que afetava D1 foi resolvida pelo adendo, conforme RC-005. As pendências abaixo conservam seus IDs originais e não são novas ordens:

| Referência existente | Classificação reconciliada | Falta para decidir/fechar | Efeito nesta entrega |
| --- | --- | --- | --- |
| INV-01 — DNA automático na URL | Ambiguidade de especificação de produto | Expectativa explícita e avaliação delimitada de custo/latência/falha | Não ligar análise automática para fechar contexto |
| INV-02 — imagem factual ou referência | Ambiguidade de especificação | Definir papéis/consumidores e demonstrar informação exclusiva dos pixels no transporte pertinente | Não ativar OCR/multimodalidade por presunção |
| INV-03 — paleta/fonte advisory ou filtro | Ambiguidade de especificação | Decidir semântica e medir elegibilidade com catálogo congelado | Não ampliar brandInput/filtros neste pacote |
| INV-04 — perda material em cortes anteriores | Hipótese não comprovada quanto ao dano no caso concreto | Fonte congelada, evidência salva e afirmação material ligadas por contraprova | Não ampliar contexto/coleta/storage |
| INV-05/06 — diversidade, recuperação, modelo/temperatura e qualidade geral | Hipóteses não comprovadas quanto à causa e frequência | Avaliação independente prevista, com condições controladas e eventual autorização de chamadas | Transporte positivo não é ganho editorial homologado |

Nenhuma dessas investigações foi iniciada aqui. Também não foram acrescentadas sugestões opcionais novas. Melhorias já mencionadas nos documentos anteriores — outro revisor/modelo, memória, diversidade, novas recuperações, leitura de mais URLs — continuam opcionais/fora do escopo e não impedem fechar as corretivas contratadas.

## 10. Fechamento e continuidade sem novo ciclo de escopo

**Há evidência suficiente para uma ordem de correção funcional somente para RC-001 e RC-002**, dentro de C-01 e C-02 já autorizadas. RC-003 exige completar os testes/aceites e retificar evidências dentro de C-03; não autoriza refatoração produtiva. Não é necessário replanejar a arquitetura.

Sequência de dependência: registrar a versão posterior como V1 com o delta e os hashes pertinentes; verificar os contracasos de RC-001/002; concluir a integração de RC-003 nessa mesma versão; então reconciliar resultados/mestre. A execução deve respeitar a propriedade sequencial já estabelecida nas ordens. Não repetir toda a investigação nem exigir novos defeitos para justificar outra rodada.

RC-004/005 permanecem fechados salvo contraprova específica posterior. RC-006 e INV-04/05/06 exigem evidência adicional para qualquer imputação causal; INV-01/02/03 exigem decisão de produto antes de especificar implementação. Não usar hipóteses ou sugestões opcionais para manter indefinidamente a entrega aberta.

O encerramento integral pode ser declarado quando os três IDs confirmados atingirem suas condições objetivas na mesma versão identificada. Não depende de provar qualidade universal, ausência de todo bug ou um incidente remoto que não foi demonstrado. **Nesta V0, as declarações de conclusão integral não estão justificadas.**

### Apêndice — hashes dos pontos críticos em V0

| Arquivo | SHA-256 |
| --- | --- |
| `server/ai/workflows/generationPreparation.ts` | `2845c7f0cfeafc07d46da900df40aa95d77f42c12f6f97cbab6a766206e79876` |
| `server/ai/workflows/generationRuntime.ts` | `f0441221980c8901d3f31108dff419e592c0c15fd9b3201f888eb7a2468ff9a6` |
| `server/designCatalog/designShortlist.ts` | `51d841161bf06e5357f451db9b34ebd8baad6397dedf619f969bc45d80aa0a7a` |
| `server/ai/workflows/reviewExecutionConfigV7.ts` | `b6e28fda9f6b41f0723612ad5bcb76af64c9124f5bb6f4ca0d3ba3ee82a76eee` |
| `server/ai/workflows/generationSelectionContext.test.ts` | `73f22583c6919c68de952a85d9d56cfc2c8f9dd22c99615cd5af3a7548b9876f` |
| `server/ai/workflows/generationRuntime.test.ts` | `498d47a56e3b0764427aa8adef48e2b84d0e42ae2729b4fecd7e49df80ab06d0` |
| `server/ai/workflows/carouselDelivery.postgres.test.ts` | `9631720ad08cae6088c445628cce91242dd5d0276bf4932eea0c79d1ef799706` |
| `server/ai/workflows/siteSnapshotContext.test.ts` | `9dd517085fe69d72ff3fc71b3672b1f85b09e0260b87c427e58856f353472060` |
| `client/src/pages/StudioApp/StudioAppV2BPage.generation.test.tsx` | `08911c45ad927da502e8b4fce4242aff0d94359fcef0686f4417d35ca1431897` |
| `shared/generationRequest.ts` | `09653fabedde29de8e6c0c4ad1f4fdd0caa7b4b4354566188f8afe947b46d896` |
| `shared/creationBrief.ts` | `a4c3f47480160450981605d94ecdcce02e75ae77985f9a06f49bf7bfb036bd8e` |
| `shared/contentRequirements.ts` | `ccb0788670721d8ef5511f389357bb8af80376372285cc14518f8356e6097e97` |
| `package.json` | `00035bec986ee13719228d08b6d477cc36ec8a98aed53450834dac68d57d811e` |
| `pnpm-lock.yaml` | `c014f020856c1420d152bc6359a112a6f8b30a9033178ba063e5446ecbdf83ef` |
| `replanejamento-auditoria/CONTRATOS.md` | `635f9c82505ca9cd84dffa328f369e67278004ed4c1308d7fcd5cd4700356cf1` |
