> **Referência histórica:** o estado vigente foi consolidado em 2026-10-09. Leia [DOCUMENTO_MESTRE §13.86](../DOCUMENTO_MESTRE.md#1386-consolidação-do-pipeline-e-revisor-obrigatório-2026-10-09); as descrições abaixo de V4 padrão/V5 piloto foram superadas.

# Conferência independente da geração orquestrada

> Atualização posterior: os achados desta conferência foram tratados em [correcoes-geracao-orquestrada-2026-10-08.md](./correcoes-geracao-orquestrada-2026-10-08.md) e DOCUMENTO_MESTRE §13.74. Este arquivo preserva a fotografia anterior às correções.

Data: 2026-10-08. Referências: [blueprint](./blueprint-geracao-orquestrada.md), [auditoria de encaixe](./revisao-blueprint-preservacao.md), DOCUMENTO_MESTRE.md §§13.69–13.72 e código local.

**Parecer: implementação parcial; ativação do fluxo V5 bloqueada.** Há melhorias válidas na identidade e no salvamento, além de um protótipo concorrente por proposta. O fluxo do usuário continua em V4. A checklist de integração concluída e a descrição de fases completas excedem as evidências disponíveis. Os testes existentes passam, mas reproduções adicionais demonstram falhas de contrato, prontidão e tratamento de erros.

## Achados

### R01 — P1: galeria independente marcada como pronta, sem conexão ao produto

Evidência: `docs/tasks.md:22` marca a galeria independente concluída. `client/src/pages/StudioApp/StudioAppV2BPage.tsx:266–286` continua usando post.generate, designContractVersion 4 e await da materialização conjunta. Busca de referências a GenerationCoordinator/executeProposalWorkflow em server/client/shared encontra apenas os módulos novos e seu teste. Não há API generation.start/status/result/cancel nem consumidor dos eventos no Studio.

Impacto: A não fica disponível ao usuário enquanto B demora. Fotos nas sugestões também não passam pelo módulo novo. Trocar Promise.all por Promise.allSettled preserva resultados ao final, mas ainda espera todos. A implementação não encerra a fase de galeria/piloto do blueprint.

Recomendação: implementar a borda autenticada, leitura/progresso por proposta e adaptação individual, mantendo separação do documento editável. Corrigir a checklist para distinguir protótipo de integração. Critério: no percurso Studio → API → galeria, A pode ser aberta/baixada enquanto B executa.

### R02 — P1: faltam runtime durável e fronteira de entrega/cobrança

Evidência: `server/ai/workflows/generationCoordinator.ts:29–30` conserva propostas/listeners somente em memória; `:93–137` reinicia todas as propostas a cada start. `proposalGraph.ts:268–276` retorna ready logo após a resolução geométrica. Não existem checkpoint/lease, registro de operações, despacho persistente, entrega/grants versionados, liquidação parcial ou reconciliação nesse caminho. Não há dependência LangGraph instalada nem prova de checkpointer. O RPC local continua exigindo exatamente três propostas e run completed (`drizzle/0026_component_arsenal_validation.sql:60–62`).

Reprodução: iniciar duas vezes a mesma instância chama a geração textual duas vezes para a mesma identidade. deadlineMs expirado também permite nova chamada e entrega ready. O campo é declarado em `proposalGraph.ts:39`, mas não é aplicado. Não foi necessário efetuar chamadas pagas para demonstrar esses comportamentos.

Impacto: não há garantia de retomada, prevenção de repetição de custo ou recuperação após queda. ready não comprova entrega autorizada/liquidada. Isso bloqueia a fase 2 do blueprint e uma futura ativação paga; não significa que a rota V4 atual tenha passado a ignorar billing.

Recomendação: implementar persistência, operação idempotente, limites, retomada e protocolo de entrega/grants/liquidação antes de publicar ready. Framework/runtime continuam sujeitos às decisões operacionais previstas. Não conectar o protótipo diretamente ao handler e considerar a fase concluída.

### R03 — P1: falha total de materialização vira sucesso com galeria vazia (regressão ativa)

Evidência: `client/src/pages/StudioApp/lib/studioGeneration.ts:492–500` descarta todas as rejeições depois de registrá-las no console e resolve com []. `StudioAppV2BPage.tsx:284–301` testa a quantidade de variações do servidor, mas não a quantidade materializada; avança à galeria e mostra sucesso. Gerar mais anuncia três resultados independentemente da quantidade materializada (`:358–360`). Histórico usa o mesmo adaptador.

Reprodução: uma entrega V4 válida, com rede de fonte indisponível, faz materializeCatalogVariations resolver []. Um teste separado com o componente Studio real e filhos/serviços isolados confirma galeria vazia e toast “0 direções de arte criadas com IA!”.

Impacto: a falha perde o caminho de erro/ação de recuperação; o usuário pode receber zero posts depois de uma geração concluída no servidor. Falhas parciais também desaparecem sem motivo/ação no card.

Recomendação: conservar resultados e falhas por proposta. Zero materializações deve produzir falha estruturada; parcial deve informar quantidade real e permitir recuperar o mesmo resultado sem nova IA. Ajustar criação, gerar mais e histórico. A correção deve preservar a resiliência parcial introduzida.

### R04 — P1: ready pode conter bundle inválido, e o schema aceita ready vazio

Evidência: `server/ai/workflows/proposalGraph.ts:256` usa input.visualPreference ?? {}, embora completeDesignVariationV1Schema exija preferências completas. O módulo tipa o objeto, mas não o valida antes do retorno. `shared/generationContracts.ts:42–52` deixa bundle opcional em todos os estados e não vincula sua presença/integridade a ready.

Reprodução: entrada permitida, sem visualPreference, retorna ready; proposalDeliverySchema.safeParse rejeita a própria entrega por enabled/language/intensity ausentes. Separadamente, o schema aceita status ready sem bundle. Os testes novos do implementador verificam status/campos, mas não fazem esse round-trip canônico; alguns usam runId não UUID, igualmente incompatível com o bundle V1.

Impacto: o compilador do cliente recusa uma proposta anunciada como pronta. Tipagem TypeScript não evita a falha, inclusive porque há any nas fronteiras.

Recomendação: normalizar pelo schema canônico, validar saída e usar contrato discriminado por estado, com IDs/versões coerentes e bundle obrigatório para entrega pronta. Testar workflow → schema → compilação → save/reopen, incluindo ausência de preferências.

### R05 — P1: conferência padrão de texto não mede fontes nem quebra de linhas

Evidência: `server/ai/workflows/proposalGraph.ts:215–219` usa altura fixa fontSize × 1.2 e uma única linha quando measureText não é injetado. Não considera largura, fonte real, lineHeight ou wrapping. O projeto já possui createComponentTextMeasurer com Fontkit e conferência dos bytes das fontes.

Reprodução: um título longo retorna ready com o medidor padrão. Reavaliar a mesma cena com createComponentTextMeasurer e fontes empacotadas locais produz needs_adjustment/overflow:titulo-principal. A reprodução usa uma resposta textual simulada, sem IA real.

Impacto: o gate pode aprovar conteúdo cortado. Também pode gerar avaliações de colisão/contraste baseadas em geometria tipográfica incorreta. A proteção se enfraquece justamente quando nenhuma dependência real é fornecida.

Recomendação: exigir medição confiável e fontes verificadas na execução real; indisponibilidade de fonte deve ser falha operacional explícita. Não usar aproximação de teste como caminho padrão de aprovação. Validar equivalência ao CanvasLab antes de atribuir autoridade ao renderer.

### R06 — P1: evidência fraca de contraste bloqueia a entrega

Evidência: `server/ai/workflows/proposalGraph.ts:224–242` transforma todas as issues em findings warning e falha sempre que a cena está needs_adjustment. O motor inclui contrast:unknown quando há texto sobre imagem preenchida (`shared/arsenalGeometry.ts:656–658`), sem medir os pixels da foto.

Reprodução: composição com texto sobre foto e sobreposição autorada retorna failed tendo somente warning, evidence contrast:unknown:titulo-principal. Não existe defeito de contraste comprovado nesse finding.

Impacto: contraria a decisão explícita do proprietário: evidência fraca não autoriza correção ou veto. Designs com fotografia sob texto podem ser recusados por incerteza, mesmo após gerar e persistir a imagem.

Recomendação: separar diagnóstico inconclusivo de defeito técnico forte, preservando a peça sem veto quando não há evidência forte. Não remover todos os guards nem aprovar defeitos comprovados. O transporte V1 também rejeita qualquer issue; tratar diagnóstico fraco fora da lista bloqueante exige compatibilidade contratual, não apenas mudar o if do workflow.

### R07 — P2: mídia não garante propriedade/persistência nem respeita o slot

Evidência: `server/ai/workflows/proposalGraph.ts:168–171` chama o gerador com prompt e proporção fixa 4:5, sem ownerId, contexto geométrico ou referências. `:192–197` persiste apenas data URI; URLs externas são usadas diretamente. generateImage sem ownerId pode usar o storage proxy ou devolver data URI, em vez do caminho privado obrigatório do usuário.

Reprodução: gerador simulado retorna URL externa temporária; o workflow retorna ready, com zero chamadas ao persistidor privado. O slot da fixture tem 400 × 300, mas a requisição pede 4:5. A prova registra exatamente os argumentos enviados.

Impacto: expiração ou inacessibilidade posterior quebra reabertura/exportação, e a promessa de mídia privada não é assegurada. Recorte fixo pode prejudicar o assunto. Declarar ImageTaskContract não resolve isso: ele não é usado no workflow e não representa referências/capacidades suficientes.

Recomendação: propagar proprietário, resolver/persistir saída autorizada, derivar proporção/recorte do slot e transmitir referências reais. Reutilizar semântica de MediaTarget/imageRequestForTarget. Implementar roteamento por capacidade e impedir fallback incompatível antes de custo. Não presumir que uma URL externa já constitui entrega durável.

### R08 — P2: contrato novo perde controles de texto e preparação

Evidência: `server/ai/workflows/proposalGraph.ts:30–39` recebe prompt/contextContent, definição e preferências; não recebe executionBrief, nível de intervenção, mustKeep/mustInclude/forbiddenTerms, brandInput, origens dos fatos, política econômica ou versão de prompt. `:97–107` envia campos com id/role/kind/required, mas omite cardinalidade e capacidade tipográfica. instantiateCompleteDesign verifica campos/cardinalidade, porém não restaura intenção textual/fatos ausentes do contrato de entrada.

Impacto: ao conectar o módulo, os controles atuais podem perder efeito e listas podem falhar desnecessariamente. “Texto conciso e de alto impacto” não substitui o modo visual_only nem a obrigação de conservar literais. Hoje o V4 ainda recebe executionBrief, então essa perda é risco da integração futura, não regressão demonstrada no fluxo ativo.

Recomendação: extrair preparação/editorial do caminho atual com contrato versionado, transmitir obrigações/fontes e capacidade real dos campos, preservar campos controlados pelo usuário e validar a resposta estruturada. Testar os níveis de intervenção, texto literal, URL com marca e listas nativas.

## Matriz de implementação e evidência

| Requisito | Código/evidência | Situação |
| --- | --- | --- |
| Vínculo de post salvo por documento | savedPostIdsByDocId; teste real dos callbacks do Studio, A retorna após abrir B | Verificado no cenário local testado |
| ID estável do mesmo bundle V4 | cd-runId-slot; teste de recompilação existente | Verificado; identidade/revisão V5 ainda pendente |
| Concorrência independente | Coordenador mantém A ready enquanto B running em reprodução controlada | Protótipo local verificado, sem integração ao produto |
| Resiliência de materialização | allSettled preserva fulfilled ao final | Parcial; espera o lote e oculta falhas |
| Contrato/prontidão V5 | Schemas novos e workflow | Reprovado em round-trip e ready vazio |
| Revisão só por evidência forte | Motor geométrico conectado | Reprovado por unknown contrast e medição padrão |
| Mídia completa/privada por slot | composition.media e persistência de data URI | Parcial; URL externa e owner/contexto não garantidos |
| Runtime/checkpoints/limites | Estado em Map; deadline ignorado | Não implementado conforme fase 2 |
| Entrega/grants/billing parcial | RPC V4 intacto, nenhuma integração econômica nova | Não implementado |
| Galeria/progresso/reconexão | Studio continua V4/batch | Não implementado |
| Histórico/preferências/Admin V5 | Consumidores existentes não adaptados ao protocolo novo | Não implementado |
| Editor/save/reopen/export existentes | Suíte completa passa; modelo/compilação preservados nos testes | Evidência automatizada favorável; paridade visual completa não certificada |
| Carrosséis e formatos | V4 continua ativo | Preservados no caminho atual; V5 não validado |

## Fases do blueprint

Fase 0: baseline automatizada disponível; experimento de checkpoint/restart não demonstrado. Fase 1: parcial, com melhorias de identidade/save e schemas iniciais, mas contratos/capacidades incompletos. Fase 2: não concluída; faltam runtime, entrega e liquidação. Fase 3: protótipo de post único, bloqueado pelos achados. Fase 4: galeria/piloto não integrados. Fases 5–6: sem evidência de implementação V5.

A numeração/redução de fases em docs/tasks.md não substitui os critérios do blueprint. Nenhuma fase deve ser encerrada apenas porque pnpm test passou.

## Verificação executada e limites

- pnpm test: **129 arquivos, 1.310 testes passando**, exit 0. Há avisos de React e falhas de rede de fontes em logs; a suíte conclui, mas não certifica carregamento visual em navegador.
- pnpm check: **passou**, exit 0.
- Harness adicional: **três testes** dos callbacks do componente Studio passaram. Dois verificam separação A/B com resposta atrasada de primeiro save/atualização; o terceiro reproduz a mensagem de sucesso com galeria vazia. Serviços externos e componentes filhos são isolados; estado/callbacks da página são reais.
- Probe adicional: **nove cenários/assertions** executados, com fontes reais locais no caso de overflow. O arquivo de resultados registra os comportamentos observados, incluindo uma prova positiva de concorrência e os contraexemplos.
- Sem geração paga, acesso remoto ao banco, deploy ou alteração de código funcional. Não foi executado percurso autenticado completo no navegador: o V5 não tem rota/ligação ao Studio, e gerar pelo produto exercitaria V4. Provedores, storage real, billing pago, runtime e equivalência visual desktop/mobile continuam pendentes.
- Compass indisponível; investigação por busca/leitura dirigida. O texto das ressalvas do revisor anterior não foi localizado no workspace/chats consultados; este parecer é independente.

Evidências em [artifacts/verification/v5-independent-review-2026-10-08](../artifacts/verification/v5-independent-review-2026-10-08/): review-probe.ts, probe-results.json, studio-review.test.tsx, configuração isolada, logs e hashes dos arquivos examinados. O harness de reprodução documenta comportamentos atuais; seus passes não significam aprovação dos defeitos reproduzidos.

Próxima ordem de trabalho recomendada: corrigir a regressão ativa R03; fechar contrato/medição/política técnica R04–R06; concluir admissão/runtime/entrega/economia R02; transmitir preparação e mídia R07–R08; integrar e comprovar R01. Até lá, conservar V4 ativo e classificar o novo caminho como protótipo.
