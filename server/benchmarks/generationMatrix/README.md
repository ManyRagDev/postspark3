# Comparação integrada da geração

**Estado do ensaio em 01/11/2026:** permanecem autorizados US$ 4/80 chamadas; a ampliação US$ 10/320 está recusada e seu pacote segue `DECLINED_NOT_AUTHORIZED`. A continuação funcional R9/GPT entregou três carrosséis, 15 slides, com três escritas e três revisões reais, sem reparos. Reutilizou interpretação, JEV e seleção concluídos em fases anteriores; não constitui comparação nova ou matriz completa. Acumulado: **77 chamadas**, US$ **0,843837** confirmados e US$ **1,941435474** reservados sem recibo, total comprometido **US$ 2,785272474**. Restam US$ 1,214727526 e três chamadas, sem novo ensaio agendado. Ledger autoritativo: `artifacts/verification/unified-generation-r9-gpt-proposals-continuation-2026-11-01/shared-budget.json`; resultados e auditoria das artes no mesmo diretório. Ledgers e resultados históricos permanecem intactos.

Esta ferramenta executa a matriz Gemini/GPT × referência (strategy 1)/fluxo revisado (strategy 2). Usa as funções de produção de preparação, JEV, interpretação/planejamento, coordinator, escrita, reparo, medição tipográfica, geração de mídia, CanvasPostStage/Chromium e revisão. Nenhum veredito ou imagem é simulado no modo live.

O armazenamento operacional é um journal **local**. Não cria posts nem reserva Sparks no Supabase. Imagens geradas passam pelo backend real em rota strict e ficam como data URI local para renderização. A jornada de edição, persistência de CanvasPostModel, permissões dos assets, reabertura e exportação deve ser verificada separadamente no Studio. Os testes offline identificam seus transportes, pixels e julgamentos controlados como fakes.

## Proposta recusada de campanha com orçamento ampliado e jornadas locais

O protocolo 3 acrescenta `prepareNextRound.ts --origin ORIGINAL --out NOVO --revised-snapshot R9 [--catalog-revision REVISAO_STAGED]`. Esse comando somente escreve uma proposta: oito execuções novas e duas jornadas autenticadas, com teto **acumulado** de US$ 10/320 chamadas, incluindo todos os lançamentos e reservas antigos. Não inicia aplicação, provedor, conta, post ou Sparks. A execução depende de autorização específica; os comandos preparados ficam em `approval-plan.json` e no README da proposta.

`--shared-budget ARQUIVO --campaign-id ID` permite uma matriz nova sem herdar resultados/configurações antigos. Herda integralmente os custos em um ledger separado, com origem e cotações verificadas por hash. Os IDs dos pedidos incluem a nova campanha; são fixados os oito IDs permitidos, snapshots e diretório de execução. Uma pasta diferente não reinicia a quota da mesma campanha. `--continue-from` continua existindo para retomadas limitadas e é incompatível com esta modalidade.

`shared-budget.json` é a contabilidade autoritativa. O lock entre processos protege reserva e recibo, nunca o transporte. Backend, workers e matriz releem o mesmo saldo antes de transmitir; uma recusa interrompe novos envios em todos os processos. Reservas desconhecidas permanecem comprometidas. Um lock abandonado exige conferir o PID antes de removê-lo; jamais apagar/resetar o ledger para destravar. Os arquivos `operator/paid-calls.json` das matrizes são snapshots; use o ledger compartilhado para acompanhar a campanha completa.

`localAppBootstrap.ts` é um runner temporário para a aplicação real, com `--live`, teto, campanha e revisão staged explícitos. Ele verifica que cards/definições da revisão remota correspondem ao snapshot da matriz, confina o listener ao loopback e instala um preload herdado pelos workers por `NODE_OPTIONS`. Permite REST/Auth/Storage somente no Supabase configurado, bloqueando rotas de IA externas e Functions. Não modifica código de produto, `.env` ou segredos. As flags de modo local e revisão existem apenas nesses processos.

O snapshot revised é o overlay completo baseline + pacote anterior + R9 (428 registros neste ensaio), e o pacote R9 de185 permanece pinado separadamente. O preflight confere identidades, cards e definições do conjunto completo e do subset, depois compara os repertoires/perfis efetivos com os do R9 isolado usando cobertura/seleção reais para os dois briefings. Só tolera história suplantada quando o resultado elegível continua idêntico. Estratégia2 é definida temporariamente antes de importar ENV; a origem fica em localhost:3000. A jornada deve usar Instagram,4:5, rascunhos habilitados e nenhum projeto/filtragem de marca adicional, coerente com o catálogo verificado.

O guard aceita uma admissão de post único/Gemini e uma de carrossel de cinco slides/GPT, com os textos sintéticos fixados e sem projeto/imagem adicional. Retries idempotentes não abrem uma terceira jornada. Chamadas pagas precisam pertencer a um pedido admitido nessa campanha. São registrados modelo, pipeline, contrato, revisão de catálogo, pedido e operação; IDs retornados pelo provedor ligam o transporte à operação canônica do journal. Quando falta esse ID, a correlação permanece explicitamente incerta. Não se inventa uma chave para slots concorrentes.

Depois da autorização, o operador roda primeiro a matriz, confere o saldo global e inicia o bootstrap para conduzir as duas submissões e a verificação galeria → CanvasLab → salvar/reabrir/exportar. Essas jornadas usam autenticação, persistência e billing reais da aplicação; não criam conta automaticamente. O runner não clica nem envia formulários. As evidências históricas permanecem inconclusivas e não são incorporadas como resultados novos.

## Planejar sem chamadas

```bash
node --import tsx server/benchmarks/generationMatrix/run.ts \
  --out artifacts/verification/matrix-planned
```

O padrão é dry-run, sem leitura remota, renderer ou provedor. Produz `dry-run.json`: 9 casos × 4 braços = 36 execuções (cada uma solicita três propostas). `--cases serious-implicit,five-items` seleciona oito execuções. `--repeats 2` duplica a amostra. Casos: `serious-explicit`, `serious-implicit`, `five-items`, `comparison`, `light-launch`, `thin-input`, `condition`, `image-highlight`, `long-carousel`.

`--arms s2-gpt` seleciona somente GPT/fluxo revisado; também aceita `s1-gemini`, `s1-gpt`, `s2-gemini` e listas sem duplicatas. O padrão continua incluindo os quatro braços. Um subset não constitui comparação Gemini/GPT e mantém suas identidades determinísticas.

`--proposal-concurrency 1` permite uma validação com três propostas sequenciais pelo mesmo grafo de produção. O LangGraph agenda o próximo nó somente depois de terminar o anterior, antes de entrar no workflow ou abrir o prazo próprio de revisão. Não há fila artificial no transporte; reservas e recibos continuam compartilhados. O prazo global original da execução continua valendo. O padrão é o fan-out normal de três propostas; a aplicação não fornece esse parâmetro e seu comportamento não muda. Concorrência fica registrada no manifesto e nas métricas: o ensaio sequencial comprova os contratos/artefatos que produzir, mas não mede latência ou disputa de recursos do modo paralelo.

Para um novo pacote sob limites já autorizados, `prepareSharedBudget` pode receber `reconciliationFile` apontando para um suplemento de recibos. Ele valida o ledger original por hash, a identidade e correspondência unívoca dos recibos e preserva custos desconhecidos. `readSharedBudget` revalida essa herança em runtime. Recuperar um custo não aprova a proposta editorial nem autoriza aumentar o teto. Nenhum suplemento deve modificar a campanha recusada.

`--selection-replay RECIBO` é uma continuidade funcional restrita ao único braço `five-items-1-s2-gpt` interrompido antes da seleção, com70 chamadas herdadas em novo ledger4/80. Requer uma fase nova, outro campaign ID e os mesmos inputs/modelos/catálogos. Preserva run ID, resultado, prazo e interrupção antigos; registra novo fingerprint/deadline e não se apresenta como comparação nova. Reutiliza apenas operações completed: os12JEV precisam manter operationKey/requestHash exatos, e a interpretação precisa manter mensagens, modelo, limite de saída e opções observáveis. A resposta é validada novamente; o schema de transporte antigo não foi preservado, limitação explícita do recibo. Antes de uma seleção válida, qualquer operação diferente bloqueia o replay, sem refazer efeitos pagos. Depois dela, as operações novas de definições, escrita e revisão seguem normalmente. A continuidade pode encadear o recibo da seleção já paga; nenhum efeito incerto é recomprado. O dry-run dessa modalidade reconstrói o seletor com fetch proibido e salva evidência, sem invocar o modelo.

No fluxo revisado, o harness executa um preflight opcional depois da interpretação e antes do JEV. Usa o builder real da seleção e os maiores candidatos permitidos, preservando dicionários globais, para uma reserva conservadora. Se o saldo não comporta essa seleção, não compra JEV. A produção não fornece o hook. O preflight não antecipa o custo da própria interpretação nem garante os reparos/geração/revisão futuros; a reserva obrigatória de cada envio continua sendo o controle efetivo.

Antes do live, acrescente `--validate-catalogs` e os dois argumentos de catálogo para conferir identidades/definições sem IA. Essa opção explícita permite GETs de catálogo. Snapshots antigos que contenham só índice devem informar `revision` no wrapper (ou usar `--*-revision`): as definições são lidas do cache imutável ou de `catalog_revision_definitions` pela revisão, ID e hash, nunca da versão atual. Nenhuma escrita remota é feita.

## Execução real autorizada

Build do renderer e Chromium precisam estar disponíveis (`pnpm build:review-renderer`, `pnpm generation:setup-browser`). Use a credencial OpenRouter já configurada no ambiente, sem colocá-la na linha de comando. Exemplo com limites explícitos:

```bash
node --import tsx server/benchmarks/generationMatrix/run.ts \
  --live --max-usd 4 --max-calls 80 \
  --baseline-revision 12 \
  --revised-snapshot artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r8/catalog-rows.json \
  --include-drafts \
  --cases serious-implicit,five-items \
  --out artifacts/verification/matrix-live-small
```

`12` é apenas exemplo: indique a revisão real aprovada para o ensaio. Para cada estratégia, escolha `--*-revision N` **ou** `--*-snapshot caminho`. Snapshots aceitam array de rows, `{rows}` ou cache `{snapshot,hash}`; identidade/definições/assets são validados. R8 contém rascunhos: `--include-drafts` habilita explicitamente o escopo experimental nos quatro braços, sem aprová-los nem publicá-los. A mesma revisão é usada por Gemini e GPT dentro de cada estratégia. Usar catálogos diferentes entre estratégias compara o fluxo completo, não isola somente o modelo.

Para o corpus completo, `image-highlight` exige `--image-file caminho.png` (PNG/JPEG/WebP até 8 MB). Ele percorre leitura real de imagem e associação texto/imagem. `--source-url https://...` faz `condition` usar a página como fonte em vez do material sintético; a extração real é congelada e reutilizada nos quatro braços. Não há imagem inventada nem placeholder aceito como evidência. Preferências padrão e histórico vazio ficam iguais em todos os braços.

Os limites abrangem os POSTs reais OpenRouter de JEV, texto, visão, revisão, imagens e tentativas internas. No protocolo 2, somente as reservas e atualizações duráveis são serializadas; as chamadas preservam a concorrência do coordinator. Antes de cada transmissão, uma reserva conservadora considera preços públicos congelados, bytes/contexto de entrada, teto de saída, imagens e margem de 6%; chat recebe também `provider.max_price`. Uma chamada não começa se ultrapassar saldo ou quantidade. A primeira recusa interrompe a campanha antes de preparar novos braços. Chamadas já transmitidas continuam contabilizadas. HTTP status, IDs disponíveis e fila do registro durável são preservados. Chamadas sem custo confirmado conservam a reserva, inclusive após interrupção. Rotas pagas conhecidas externas (Google/OpenAI/Groq/Anthropic/Pollinations) e POSTs fora OpenRouter são bloqueados. A rota strict de mídia mantém seus próprios candidatos OpenRouter; cada tentativa é contabilizada.

O limite de chamadas é direto; o financeiro depende da cotação/medição externa e não substitui um limite de crédito da credencial. Se o provedor reportar custo acima da reserva, o excedente fica registrado e novas chamadas são bloqueadas. Reservas para imagens podem ser altas mesmo quando a conta final é baixa; US$ 4/80 chamadas pode terminar a amostra parcialmente. Não se repete automaticamente um efeito com recibo incerto para completar a matriz. Referências dos controles de preço: [OpenRouter max_price](https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/), [metadados de modelos](https://openrouter.ai/docs/api/api-reference/models/get-model).

## Artefatos e avaliação humana

- `blind.html` e `art/`: peças em ordem estável embaralhada, somente códigos cegos; notas de cobertura, tom/naturalidade, identidade, ritmo e legibilidade, com exportação de `human-ratings.json`. Não abra `operator/` antes de avaliar.
- `operator/manifest.json`: parâmetros/modelos, hashes de catálogo/fontes/código/renderer, ordem, políticas e limites.
- `operator/results.json` e `summary.json`: status por slot, revisão, configurações, motivos de falha, reparos/replanejamentos, tokens, formato estruturado, modelos efetivos, custos informados, reservas desconhecidas e latência.
- `operator/<execução>/`: preparação, planos, entregas, traces e journal com recibos por operação. O conteúdo pode conter briefing, pixels e saídas completas; mantenha a pasta no ambiente autorizado.
- `operator/paid-calls.json`: ledger gravado antes de transmitir cada chamada.

Para retomar após interrupção, repita **os mesmos argumentos** e acrescente `--resume`. Configuração, fontes, código, renderer, catálogos e limites devem coincidir. Resultados completos são reutilizados; efeitos incertos não são recomprados. O prazo original de dez minutos por execução permanece fixo. Há um lock por pasta: após encerramento abrupto, confirme que o PID de `operator/RUNNING.lock` morreu antes de remover esse arquivo e retomar. Para um novo ensaio ou maior orçamento, use outra pasta e trate-o como novas chamadas autorizadas.

Uma mudança de protocolo exige evidência separada. `planContinuation.ts --from ORIGINAL --out NOVO_PLANO` apenas lê a campanha e escreve seu balanço/plano, sem IA. Após coordenação/autorização, `--continue-from ORIGINAL` em **outra pasta** herda todas as chamadas/reservas e exige os mesmos limites totais, matriz, fontes, modelos e catálogos; executa somente braços intocados. Resultados anteriores permanecem no original, com hashes de origem no manifesto novo. Nenhuma operação incerta é repetida e nenhuma reserva é liberada por estimativa. A execução nem prepara o próximo braço quando o saldo não consegue reservar uma revisão obrigatória. Uma continuação não transforma a amostra anterior numa comparação limpa.

`SIGINT` no protocolo 2 impede novos envios e deixa o coordenador registrar os resultados/recibos em andamento; um segundo sinal pode encerrar o processo abruptamente. Interrupções do orçamento/operador recebem `campaignStatus: interrupted`, `campaignInterruption` e `modelOutcome: not_assessable_campaign_interrupted`, distinguindo-as de falhas efetivas do modelo. O CLI retorna código 2 nesses casos. Os braços não exercitados aparecem explicitamente no resumo.

Não declare vencedor pelos scores automáticos. Compare artes e avaliações humanas, documente os casos interrompidos e repita instabilidades sob orçamento próprio. Uma execução live local não demonstra a jornada completa do Studio.

## Verificação offline

```bash
pnpm exec vitest run server/benchmarks/generationMatrix
pnpm check
```

O teste PostgreSQL cobre duas propostas viáveis e uma insuficiente: preserva as duas prontas, encerra a terceira antes da escrita, retorna parcial, cobra 7 Sparks (1 preparação + 2 × 3) e retoma sem nova geração ou débito. Apenas decisões de modelo, pixels e métricas de fonte são controlados nesse teste; preparação/coordinator/composição/normalização da revisão e SQL de billing são reais.
