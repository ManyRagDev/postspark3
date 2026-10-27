# Checkpoints — preservação editorial — 2026-10-10

## Objetivo e limites
Implementar as intervenções mínimas do relatório `docs/diagnostico-preservacao-editorial.md`, mantendo o pipeline único, o CanvasPostModel autoritativo e o limite durável de recuperação. Pedido atual autoriza implementação e checkpoints. Não executar novos testes pagos, importação de catálogo, deploy ou mudanças de banco nesta rodada.

## Base preservada (CP0 — concluído)
- Documento-mestre, relatório, contratos, revisão, journal e testes lidos.
- Compass indisponível; busca dirigida local.
- Checkout contém muitas alterações anteriores: não resetar nem atribuí-las a esta tarefa.
- Hashes iniciais e status em `artifacts/verification/editorial-implementation-2026-10-10/`.
- Falha central: citações válidas com interpretação semântica insuficiente. A copy antiga antecede o prompt de atomicidade atual. Pro incerto não deve ser recomprado.

## Implementação escolhida
1. CP1: auditoria explícita das afirmações essenciais da fonte, dentro da mesma revisão paga, independente dos IDs do plano. Política 3, evidências/citações validadas com os controles existentes; políticas antigas continuam legíveis. Sem prometer inferência semântica determinística.
2. CP2: impedir corte silencioso de contexto remoto; limites explícitos com erro orientando reduzir a fonte. Unificar timeout configurável do revisor/transport, preservando teto atual por padrão e orçamento/cancelamento.
3. CP3: fixtures editoriais positivas/negativas, testes de fonte fora do plano, reparo/recheck e replay sem recompra, benchmark offline com limites explícitos. Checks de tipos e suites afetadas.
4. CP4: revisão final, documento-mestre e instrução de retomada. Homologação com modelo real permanece pendente e discriminada.

## Estado atual
CP0–CP4 concluídos. Implementação e validação offline finalizadas; homologação semântica real pendente. Detalhes e retomada no final.

## Retomada
Ler este arquivo e §13.90 do DOCUMENTO_MESTRE.md, depois `git diff` dos arquivos citados. Não executar `verifyEditorialRegression.ts` supondo cache offline: pode disparar chamadas pagas. Artefatos e relatório em docs são ignorados pelo Git; este checkpoint fica na raiz para facilitar acesso.

## CP1 e CP2 — concluídos, validação inicial aprovada
- Política de revisão 3 exige `sourceCoverage` na mesma chamada, além de `factCoverage`; IDs da auditoria independem do plano. Validação reaproveita origem literal, texto nativo visível e fundamentação. Plano persistido permanece intacto. Políticas 1/2 continuam legíveis.
- Achados são deduplicados; excesso acima do contrato torna a revisão inconclusiva, sem cortar silenciosamente uma falha.
- Timeout configurável `PROPOSAL_REVIEW_TIMEOUT_MS` usado no wrapper e transporte e incluído no hash. Padrão de 20s mantido; máximo configurável 120s, sempre limitado pelo deadline do pedido. Nenhum modelo trocado.
- Contexto de geração não usa mais `.slice(0, 24000)`. Fonte acima do limite é recusada com orientação. Leitor de URL tinha outro corte, de 12k; geração solicita leitura completa até 24k. Demais consumidores mantêm o comportamento anterior. Site Intelligence já resumida a montante não foi reconstruída.
- 118 testes passaram em 7 arquivos; `pnpm check` inicialmente apontou incompatibilidade de callback `.map(scrapeUrl)` após o novo argumento; corrigido para callback explícito. Nova checagem aprovada em CP4. Logs: `tests-checkpoint.log`, `typecheck.log` na pasta de evidência.
- Sem chamadas pagas, DB, deploy ou novo framework. Avaliação semântica do modelo real continua pendente.
- Próximo: CP3 corpus independente e avaliação offline com respostas históricas; revisão final e documentação (CP4).

## CP3 — avaliação offline e regressões concluídas
- Corpus independente: `server/ai/workflows/fixtures/editorial-corpus.json` (11 casos; 4 históricos e 7 sintéticos).
- Comando SEM chamadas: `pnpm evaluate:editorial:offline`. Para comparar recibos novos já obtidos: `pnpm evaluate:editorial:offline --responses=arquivo.json` (mapa de caseId para status/policyVersion/model/evidenceKind, inputHash opcional). Sem `--responses`, usa somente os quatro pareceres históricos congelados.
- Avaliador: `server/ai/workflows/editorialEvaluation.ts`; CLI: `scripts/evaluateEditorialReplay.ts`. Não carrega .env, provider ou runtime de geração.
- Baseline: uma aprovação indevida na política 2 (BizuMiner); três aprovações factualmente corretas na política 1 (café); sete casos não medidos. Nenhuma métrica real para política 3.
- Teste integrado cobre fato omitido do plano → achado da fonte → reparo localizado → recheck → entrega → replay sem nova compra. Plano, legenda, hashtags e campos saudáveis preservados.

## CP4 — implementação e revisão técnica concluídas
- Suite completa: **159 arquivos / 1.668 testes**, `tests-final.log`, exit 0.
- Após conferir a precedência de achados locais sobre opiniões duplicadas do provedor: **77 testes de revisão**, `tests-review-final.log`, exit 0.
- `pnpm check`: aprovado, `typecheck-final.log`, exit 0. O erro de callback da primeira checagem foi corrigido; `typecheck.log` preserva a tentativa inicial.
- Build backend esbuild e frontend Vite: aprovados (`build-backend.log`, `build-client.log`). Saídas em `/tmp/postspark-editorial-20261010/`. Aviso preexistente de chunk frontend >500kB permanece. `api/index.js` não alterado.
- Diff de código/documentação sem erro de whitespace. `OPERATIONAL_ERRORS.txt` recebeu saídas esperadas de testes e foi preservado; seu whitespace de log não foi normalizado.
- Documento-mestre atualizado em §13.91 e relatório marcado como base histórica anterior à intervenção.
- Não houve chamada paga, escrita remota, importação/publicação, alteração de modelo padrão, ampliação do limite de recuperação ou commit.

## Estado final e próxima retomada
**Implementação desta rodada concluída e verificada offline.** Não restam processos de teste/build desta rodada aguardando acompanhamento.

**Pendente de homologação externa, não mascarado como concluído:** medir política 3 com respostas reais, comparar falsos positivos/negativos, inconclusões, custo e latência. Não há prova de que o modelo sempre enumerará todas as afirmações ou as avaliará corretamente. A auditoria explícita é um contrato verificável; sua eficácia semântica precisa de medição.

Para retomar:
1. Ler este checkpoint, §13.91 e o corpus. Conferir o checkout atual: há trabalho anterior não commitado.
2. Consultar `offline-baseline.json` e `VERIFICATION.json` na pasta de evidência.
3. Confirmar orçamento/escopo antes de nova avaliação paga. Não repetir a operação Pro incerta sem reconciliação. Respostas antigas não devem ser apresentadas como respostas ao prompt novo.
4. Caso autorizada, avaliar entradas positivas e negativas congeladas, registrar recibos e fornecer pareceres ao avaliador offline. `test_fixture` é excluído das métricas de modelo.
5. Não ampliar retries, trocar framework ou promover modelo antes de medir o problema restante. O catálogo remoto e a implantação não foram parte desta rodada.
