# Tentativa Lume na porta 3000 — 6 de novembro de 2026

Pedido investigado: `68265d38-4c04-45af-9035-6150a41fbcc5`.

## Causa demonstrada

As três redações, três imagens e três candidatos foram concluídos. Nenhum parecer de revisão foi recebido: as três chamadas de `google/gemini-3.8-flash`, via OpenRouter/Google AI Studio, retornaram HTTP 503, com `Deadline expired before operation could complete.` e status `UNAVAILABLE`.

As chamadas de revisão duraram 32,598 s, 31,519 s e 31,418 s. O timeout configurado localmente era 90 s. Portanto, houve expiração upstream; os registros não demonstram a causa interna no provedor. Cada revisão fez uma tentativa.

A revisão é uma etapa obrigatória desse fluxo, não uma etapa acionada apenas quando um defeito já foi detectado. Sem resposta, o runtime da main deixou as operações como `uncertain` e as propostas em `awaiting_reconciliation`, bloqueando a entrega e a repetição cega das chamadas. O tempo entre admissão e esse estado foi 72,488 s.

## Ambiente

- Porta 3000: repositório principal, branch `main`; seleção Gemini; política de encaixe `subpixel_v1`.
- Porta 3182: worktree `codex/acervo-82`, onde foram implementadas e verificadas as alterações recentes. A opção Automático usa a configuração nova.
- O pedido de cafeteria foi acompanhado do dossiê da BizuMiner. Isso é uma diferença de contexto relevante, mas não é a causa demonstrada do HTTP 503.

Nenhuma porta foi trocada e nenhum servidor foi reiniciado nesta investigação.

## Artes recuperadas

Os candidatos persistidos armazenam a composição autoritativa, deixando os elementos derivados para reconstrução. As composições foram resolvidas com as mesmas opções tipográficas do fluxo original e renderizadas pelo CanvasPostStage, sem nova redação, geração de imagem, revisão ou correção.

Os hashes das três imagens reconstruídas coincidem com os hashes registrados antes da chamada de revisão:

1. `7af12aeb290efe844dee04421283610057c47949d8782e06dd586b8a4fa75401`
2. `1c6968b845af3b7ce9f37d66e422996c5506324c7c82637876adfcefa482bf90`
3. `4eff610ddd172ddfed003e95981220d75678d07c0328a7802d38d6e833d2e906`

## Custo e limites da conclusão

Há US$ 0,239441589 confirmados em nove chamadas bem-sucedidas, dos quais US$ 0,202629 são das imagens. As três revisões não têm recibo de custo: `costSource: unknown`; zero no trace não comprova gratuidade.

Cada revisão tinha uma imagem e aproximadamente 49–51 mil caracteres de texto. Esse volume não demonstra, sozinho, a causa do erro 503. Não houve decisão editorial aceitando ou rejeitando qualquer uma das três artes.

Evidências originais: `.postspark-local/diagnostics/operational.jsonl` no repositório principal, linhas 274, 276 e 278; requests/operations e renderizações capturadas em `/tmp/postspark-port3000-evidence/`. O teste novo em codex é separado desta reprodução histórica.
