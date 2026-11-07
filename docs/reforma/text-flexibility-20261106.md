# Faixas tipográficas — implementação e verificação

Implementação na branch `codex/acervo-82`, worktree `/home/emanuel/.codex/worktrees/acervo-82/PostSpark 3`, disponibilizada no ambiente local 3182 em 2026-11-06. Não altera main nem catálogo persistido.

## Comportamento

- Configuração V5 fixa `textFlexibilityVersion:1` somente nas novas admissões automáticas do protocolo 4; configurações históricas sem o marcador conservam comportamento e hashes.
- `shared/textFieldFlexibility.ts` fornece uma política única para intervalos de fonte e estimativas consultivas de caracteres/linhas. Autoria opcional em `textFit.parameters.flexibility` exige version/minFontSize/preferredFontSize/maxFontSize; os designs existentes recebem limites derivados localmente, sem migração.
- Copy e reparo recebem `{chars:[min,max],lines:[min,max],scope:'field'|'item',distribution}` apenas nos campos selecionados. Metadados geométricos e intervalos de fonte permanecem locais. A instrução editorial compartilhada orienta concisão, campos opcionais vazios e aprofundamento na legenda, preservando obrigações de destino.
- `arsenalGeometry` procura a maior fonte dentro do intervalo que caiba com as métricas reais. Preserva conteúdo e overrides manuais; tamanho resolvido fica no CanvasPostModel. Se o mínimo não couber, mantém o defeito para o reparo já existente. Não acrescenta inferências ou tentativas.
- `proposalGraph` aplica a política na inspeção inicial, recuperação, após contraste e reparos. Estado e overrides resolvidos permanecem estáveis ao reabrir.

## Evidência de custo e contexto

Reconstrução do mesmo prompt Nexo usado na simulação: sistema+usuário passou de 4.490 a 4.691 caracteres (+201, 4,48%). Divisão aproximada por três resulta em +67 tokens; não é contagem do tokenizer nem uso faturado. Schema de resposta permaneceu igual e ficou fora dessa comparação. A chamada histórica correspondente teve 2.500 tokens de entrada; esse valor inclui diferenças de transporte e não deve ser substituído pela estimativa textual.

Prompts históricos sem o marcador foram comparados byte a byte ao código anterior. Projeções de cards e familyAssessmentProfile/JEV das 186 definições locais (82 famílias com variantes) mantiveram hashes idênticos, sem novos ranges. Nenhuma chamada paga foi realizada nesta implementação.

## Verificações

- Integração: 149 testes aprovados, um pulado, seis arquivos. Inclui estado canônico, reutilização de copy, revisão, persistência/commit em PostgreSQL com provedores controlados. Não equivale a inferência externa.
- Copy/contrato: 45 testes aprovados, incluindo faixas consultivas, lista por item, contexto compacto, histórico e Fontkit real.
- Geometria: 27 testes focados aprovados; inclui intervalos autorados, escala de grupos, limites, texto vazio, overrides, persistência e políticas anteriores. Os conjuntos podem se sobrepor; não somar seus totais.
- TypeScript completo sem erros; renderer local reconstruído.
- Replay com fontes reais e respostas já capturadas: Nexo CON-07, com reparo existente, tinha overflow em `text-6-0` a 44,454 px; agora cabe a 34,195 px e o preflight completo não aponta defeitos. O texto bruto original ainda possui outro overflow no corpo. Não houve nova redação ou aprovação por revisor externo.
- Browser autenticado: post de teste local **156**, salvo via API; aberto pelo histórico no CanvasLab; salvo novamente pela UI com composição integral idêntica; exportado pela UI em PNG 3072×3840. Nenhum erro JavaScript ou chamada de geração; ledger de gastos permaneceu byte a byte igual. PNG inspecionado visualmente.
- Reinício somente da porta 3182, PID 1119922, fingerprint `a20b8ce4d8c9328c34ece2512a10f35a2012d1f4d76713782d9e01aa35c5d552`. Ledgers e autorização de testes manuais preservados.

## Limitações observadas

As duas opções tipográficas reavaliadas do Festival permanecem com overflow no mínimo legível, inclusive usando os reparos capturados. A mudança não garante aprovação de todo texto, nem corrige o problema independente de string/lista da outra opção. A adesão do modelo às novas instruções ainda precisa ser observada em uma nova geração real. O teste de persistência usou composição reconstruída localmente com copy capturada, não uma nova jornada paga de ponta a ponta.

Evidências: `artifacts/acervo82/full/sessions/text-flexibility-20261106/` (`report.json`, `results.json`, `browser.json`, cenas, PNG, logs). Código principal: `shared/textFieldFlexibility.ts`, `shared/designArsenal.ts`, `shared/arsenalGeometry.ts`, `server/ai/workflows/compactEditorialContract.ts`, `compactProposalCopy.ts`, `proposalGraph.ts`, `reviewExecutionConfigV10.ts` e `shared/proposalReviewV10.ts`.
