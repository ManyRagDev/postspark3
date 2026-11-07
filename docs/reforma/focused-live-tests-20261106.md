# Testes reais pontuais — 6 de novembro de 2026

**Resultado: a geração econômica e a jornada do editor funcionam, mas a meta de três propostas ainda não foi atingida.** Os dois pedidos terminaram com duas propostas prontas e uma bloqueada. As falhas foram reais; nenhuma foi convertida artificialmente em aprovação.

Branch: `codex/acervo-82`. Ambiente local isolado, catálogo de 82 designs, revisão automática v2. Dois prompts sintéticos idênticos aos usados anteriormente, para comparar o comportamento. Nenhuma implantação ou alteração de pedidos históricos.

## Resultado medido

| Caso | Propostas prontas | Tempo do pedido | Chamadas pagas | Custo informado pelo provedor |
|---|---:|---:|---:|---:|
| Estático — cafeteria Lume | 2 de 3 | 51,9 s | 12 | US$ 0,009403884 |
| Carrossel — leitura diária, 3 lâminas | 2 de 3 | 56,4 s | 10 | US$ 0,011642576 |
| Total | 4 de 6 | — | 22 | **US$ 0,021046460** |

Tokens de entrada: **134.784**. Tokens de saída: **18.036**. São contagens de uso devolvidas pelos provedores, incluindo os reparos. As chamadas de texto reportaram zero tokens de reasoning. Nenhuma operação de geração de imagem nesta rodada.

Não houve HTTP de erro, chamada incerta, custo desconhecido, interrupção por orçamento ou repetição automática de pedido. Os reparos previstos dentro de cada pedido estão incluídos. A revisão de integridade dos recibos passou nos dois casos; isso não significa aprovação das duas propostas bloqueadas.

Os pedidos foram executados com propostas em sequência para caber na reserva conservadora; os tempos acima não medem a latência da concorrência normal de produção. O custo real foi 3,5% do teto de US$ 0,60. O teto de 24 chamadas não foi atingido. As tarifas conservadoras incluem a faixa de contexto longo; o transporte preserva os tetos originais de preço dos modelos, e cache explícito fica bloqueado nesta campanha. Cotação pública capturada antes da execução: `artifacts/acervo82/full/focused-price-check-20261106.json`.

## Falhas identificadas

**Estático, terceira proposta:** o reparador retornou “Venha à”, sem complemento no conteúdo da arte. A imagem renderizada mostra “Venha” e “à” em posições separadas, sem o nome Lume que completaria a frase. O revisor apontou perda de texto, mas combinou a categoria `visible_text_loss` com `consequence:none`; repetiu essa inconsistência no reparo formal. A proposta terminou `review_evidence_invalid`. Não é o erro anterior de confundir ideias com requisitos. Há um problema de redação e uma inconsistência no parecer; ignorar o parecer entregaria uma peça linguisticamente incompleta.

**Carrossel, primeira proposta:** o reparador recebeu um limite de 14 caracteres e devolveu **“Comece aos pou” nas três alternativas**. O renderer exibiu corretamente os 14 caracteres recebidos; não houve corte no Canvas. A revisão apontou perda de sentido e bloqueou a proposta. O orçamento compartilhado de correção já havia sido usado no encaixe, portanto não houve nova chamada de correção.

**Overhead adicional:** no primeiro estático, o modelo inseriu um elogio estético em `findings` sem alvo visual válido. O reparo formal removeu esse registro e aprovou a mesma arte. Essa chamada foi contada no custo.

O próximo ajuste deve concentrar-se na integridade linguística das alternativas curtas e na representação de comentários estéticos no parecer. Fazer o texto caber geometricamente não assegura que a frase esteja completa. As instruções atuais já proíbem truncar palavras; apenas repetir essa instrução não demonstra uma solução.

## Jornada real no navegador

Uma proposta entregue de cada pedido foi aberta pelo histórico, editada no CanvasLab, salva, reaberta pela biblioteca e salva novamente:

- Estático: post local **148**, download PNG **3072 × 3840**.
- Carrossel: post local **149**, três lâminas reabertas e ZIP com **três PNGs 3072 × 3840**.
- Texto editado preservado; documento normalizado e composições autoritativas idênticos após reabrir e salvar.
- Diferenças brutas limitadas ao preenchimento de `step` vazio com `SLIDE 01/02/03` e remoção de `logoUrl` vazio.
- Zero erros de página e zero novas gerações durante a jornada do editor.

As galerias e a peça estática rejeitada foram inspecionadas visualmente. A admissão da geração ocorreu pela API tRPC autenticada; a etapa de histórico/editor/salvamento/exportação foi operada no navegador real. Não foi testado novamente o botão de criação do Studio. Fontes por URL, imagem de entrada e geração de imagem também ficam fora desta rodada curta.

## Evidências e preservação

- Pedido estático: `bce0f360-6a25-4f34-8884-11614f0bc7ce`.
- Pedido carrossel: `f6001566-01d8-44c6-bc81-1e9b1c44dead`.
- Dados consolidados por chamada: `artifacts/acervo82/full/sessions/automatic-focused-20261106/results.json`.
- Para cada caso: `admission.json`, `snapshot.json`, `operations.json`, `evidence.json`, `browser.json`, documentos salvos antes/depois e PNG/ZIP exportados.
- As 22 respostas HTTP e seus payloads estão em `wire/`, sem cabeçalhos de autenticação.
- Ledger, recibos e configuração da rodada anterior permaneceram idênticos por SHA-256.

A rodada confirmou a economia e a persistência, mas **não sustenta declarar a geração de três alternativas homologada**. São apenas dois prompts, sem estimativa estatística de qualidade.
