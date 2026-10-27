# Adendo contratual proposto — correções D1–D4

16/10/2026. Referência para C-01–03; não é código implementado. Complementa os [contratos originais](../CONTRATOS.md). Em conflito, prevalecem as decisões explícitas deste adendo sobre retomada parcial e a operação local autorizada. Não relaxa materialidade, autorização, limites ou aceites.

## 1. Fronteiras mantidas

`generation.start` continua mutation tRPC autenticada, POST `/api/trpc/generation.start` e alias `/trpc`, batching/SuperJSON existentes. Proprietário vem de `ctx.user.id`; divergência de `ownerId` é FORBIDDEN/403. Entrada inválida é BAD_REQUEST/400 e ausência de sessão UNAUTHORIZED/401 em chamada simples. `generation.get/cancel`, inputHash/idempotencyKey, resposta pública, reserva/liquidação e cookie bridge não mudam.

Continuam `executionBriefSchema`, `effectiveContentRequirements`, `contextContent: string`, `PreparedGeneration`, política 7/preparação 3/perfil editorial 5, perfis compactos v2, `selection_v2`, bundle `complete-design-v1` e `CanvasPostModel`. Os contextos/configurações/pareceres salvos dos perfis ausente/1, 2, 3, 4 e 5 mantêm semântica e hashes. V5/V6 continuam no dispatch existente. Nenhum schema público, SQL, RLS, API de Storage ou regra financeira nova.

## 2. Seleção: requisitos efetivos e entrada durável

Entrada pública já disponível: brief validado/normalizado, pedido complementar e fonte carregada por proprietário. A preparação usa `effectiveContentRequirements(executionBrief)`; não cria outro normalizador. Jev e seletor recebem os mesmos `id`, `kind`, `value`, `scope`, `caseSensitive` e `match` aplicáveis, inclusive requisitos exclusivos de `contentRequirements`. Os termos legados continuam convertidos pelo helper. Orientação de marca e texto do site não viram requisitos automaticamente.

O payload mantém `brief`, `sourceEvidence` e `complementaryInstruction` com deduplicação exata atual; acrescenta `requirements` localmente. Não alterar `buildUserPrompt` global para resolver D3. Fonte 24.000 chars, brief agregado 96.000, público/essência 2.000 cada, `input.content` 24.000 e lote Jev 28.000 bytes continuam limitados. Excesso falha explicitamente, sem corte; adicionar requisitos ao envelope não autoriza aumentar o limite Jev. Case e destinos são dados, não veto heurístico novo ao catálogo.

### Recibo local anterior aos efeitos

Autoriza-se **uma** nova chave fixa `prepare:selection_input`, com o mecanismo `operation("selection_input", ...)` do journal atual, sem tabela, migration, hash adicional ou contador de versão. Seu resultado é um objeto JSON local, validado com Zod existente, contendo:

- `brief`: conteúdo serializável já produzido pelo helper atual, preservando o tratamento de imagem vigente;
- `sourceEvidence?` e `complementaryInstruction?`: strings exatas efetivamente enviadas;
- `requirements`: saída dos requisitos efetivos, com seus atributos;
- `reviewExecutionConfig`: a configuração V2 vigente, incluindo `editorialGuidanceVersion: 5`, resolvida antes dos modelos;
- `jevModel`: identificador atual usado no envelope Jev.

O catálogo, ofertas, perfis, preferências, histórico recente e fonte continuam pinados nas operações existentes. Não duplicar cenas/assets neste recibo nem persistir funções, signal ou callbacks. O recibo fixa a parte textual nova compartilhada pelos consumidores; não é envelope global de contexto. A política/instruções continuam versionadas somente pelo mecanismo existente.

Recibo completed é a entrada autoritativa, não é reconstruído do helper/default atual. A configuração saved é reutilizada no retorno prepared e no cálculo do contexto editorial; não resolver outro default ao final. Se formato/configuração/identidade do modelo pinado não puderem ser honrados, recusar antes de chamar Jev/seletor; nunca trocar modelo e mudar chaves por conveniência. Não alterar algoritmo de eleição, IDs, hashes de ofertas, critérios Jev, roteamento ou schema de resposta.

`selection_input` é local e usa `begin` normal. **Não** adicioná-lo à whitelist `begin_safe`: uma falha incerta desse recibo fica fechada para retomada automática nesta fatia. Isso evita migration e ampliação do mecanismo de replay; não constitui efeito pago.

### Transição histórica obrigatória

O runtime consulta `GenerationStore.listOperations(record.id, record.ownerId)` antes de preparar pedido sem `record.prepared`, sob lease/deadline existentes. Reutilizar `readJournalResult` para resultados com metadados. Leitura indisponível ou estado não reconhecido não significa journal vazio; falha antes de modelos. Não mudar contrato do store nem buscar outro proprietário.

| Estado durável observado | Comportamento obrigatório |
| --- | --- |
| `record.prepared` salvo, inclusive histórico | Reutilizar literalmente; não exigir recibo novo retroativamente, carregar snapshot de novo ou executar preparação. Manter verificações vigentes. |
| Sem prepared e sem efeito pago de preparação registrado | Pode criar o recibo novo antes da primeira chamada; preservar context/catalog completed. |
| Sem prepared, efeito `prepare:design-shortlist:*` ou `prepare:selection` registrado e sem `selection_input` completed válido | Interromper com `GenerationFailureError("preparation_contract_incompatible", "selection", false)` antes de criar pin novo ou invocar qualquer modelo. Vale para completed, started/uncertain e estado desconhecido. |
| Sem prepared, recibo novo completed válido e efeitos da mesma entrada completed | Retomar com entrada pinada, mesmas chaves, zero recompra dos efeitos concluídos. Pode executar apenas etapa ainda não iniciada, no orçamento existente. |
| Recibo/efeito novo uncertain, ou started que vira uncertain | Bloquear pelo mecanismo existente; não derivar outra chave para contornar a incerteza. |

Decisão de compatibilidade: não reconstruir a entrada de um pedido antigo já pago a partir de trace opcional. A interrupção conservadora é o comportamento aprovado nesta correção; não deve disparar automaticamente novo `generation.start`, nova idempotencyKey ou reembolso especial. A finalização/liquidação e reconciliação mantêm os caminhos atuais; não há promessa de estornar custos externos anteriores. Propostas prontas já salvas não podem ser apagadas.

Essa tabela substitui a interpretação de que todo preparo parcial histórico precisa ser continuado após mudança de prompt. O histórico é preservado; casos sem entrada verificável falham sem nova compra. Um recibo novo não pode ser retroativamente criado para um efeito antigo.

## 3. Snapshot: validação local dos campos realmente consumidos

Manter `loadGenerationContext(input, ownerId): Promise<string>` e a projeção no `generationRuntime.ts`. `loadSiteIntelligence` e a projeção legada não mudam. Validação acontece antes da composição do contexto e dos modelos; erro identifica caminho/categoria do campo, sem imprimir o snapshot ou segredos. Não converter erro de entrada em indisponibilidade do provedor.

- Raiz é objeto, nunca array/null. ID é string não vazia; `evidence` é array. Cada evidência tem ID não vazio, `kind` em `title|description|heading|body|visual` e texto string com conteúdo não branco. Preservar os bytes do texto aceito, inclusive espaços; checar branco não autoriza trim na saída.
- Metadados históricos ausentes ou string vazia de origem/fingerprint/data são desconhecidos. Quando presentes com valor, devem ter tipo string; não normalizar URL, data ou fingerprint na projeção. `null`, número, array ou objeto em campo textual não é ausência. URL de evidência ausente/vazia deve aparecer como desconhecida; não substituir silenciosamente pela URL geral do site como se fosse a origem daquela evidência.
- `quality` pode estar ausente. Se presente, é objeto. `fallbackUsed`, quando presente, é booleano real; warnings, quando presentes, são array de strings não vazias. Ausente é desconhecido, `[]` conhecido significa nenhum aviso, true/false são distintos. Não tratar `"false"` como booleano, nem `.join` como validação.
- Validar `brand`, `business`, `editorial`, `anchors`, `brand.colors` quando presentes como objetos e todos os seus campos usados na projeção. Strings escalares: nome/setor, resumo/proposta, cores individuais. Arrays de strings: produtos, serviços, públicos, problemas, diferenciais, objetivos, pilares, temas, tom, alegações proibidas, paleta, termos proprietários e objeções. `anchors.facts` é array de objetos com `text` string; identificadores consumidos devem ser strings. Objetivos respeitam os valores existentes em `SiteIntelligence`. Campos históricos opcionais ausentes usam marcação de desconhecido/não informado adequada.
- Não exigir campos não consumidos, validar scores para criar veto novo, rejeitar extensões desconhecidas ou transformar este guard local em serviço/schema global. Nunca coagir, ignorar item inválido ou retornar fonte vazia para continuar.

Continuam separadas síntese/âncoras derivadas, orientação, metadados e evidências brutas. Conteúdo imperativo externo é dado; prioridade do usuário e `visual_only` permanecem. Não extrair obrigação de `prohibitedClaims`. Conferir limite combinado de 24.000 no resultado completo; `SourceContextLimitError` acima, sem apagar warnings/evidências. Não recuperar cortes anteriores, rescrapear ou ressintetizar automaticamente. Contexto/prepared completed não é revalidado/reprojetado com dados novos durante replay.

## 4. Evidência e fechamento

Um teste que só compara hashes recalculados, mantém o mesmo objeto na memória ou mocka aprovação não prova retomada entre versões nem julgamento semântico. Capturar mensagens efetivas após adapter, resultado do workflow, status persistido, operações e contagens de chamadas. Fixtures declaram sua origem, inclusive reconstrução histórica sintética; valores históricos esperados não podem ser obtidos da função sob teste no próprio assert.

A integração atravessa Kit real sintético → modal/edição → adaptador/schema → admissão controlada → projetor real do snapshot → seleção → copy/revisão → commit/grants PGlite → bundle → compilador/saveAdapter/reabertura `CanvasPostModel`. Os cenários estático e carrossel usam marca exclusiva do Kit, complemento ausente de rawInput/notas e evidência exclusiva do snapshot. Falha de uma proposta não corrompe irmãs. Cenário de conflito usuário/site mantém prioridade do pedido sob visual_only e obrigações explícitas. Não é exigida LLM real.

Congelar expectativas independentes de contratos/contextos/recibos dos perfis ausente/1–5, além de preservar V5/V6. Pode usar baseline local anterior a estas correções, com procedência declarada; reconstrução sintética não é recibo real histórico. A declaração de qualidade/produção continua limitada como no roadmap.
