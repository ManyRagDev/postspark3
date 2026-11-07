# Perícia das duas propostas bloqueadas — 6 de novembro de 2026

## Conclusão

A primeira degradação semântica ocorreu no **reparo de encaixe**, depois de uma redação inicial completa. O código promoveu uma estimativa aproximada de capacidade a um limite obrigatório no schema da API; esse limite excluiu frases completas que cabem com as fontes reais. O reparador devolveu alternativas incompletas e a seleção local escolheu pela geometria, sem distinguir uma frase completa de uma interrompida. No estático havia ainda contexto factual insuficiente e cobertura circular entre campos alterados simultaneamente. A revisão posterior acrescentou problemas de classificação; os limites internos de recuperação encerraram as duas propostas.

As falhas não foram causadas por timeout, erro HTTP, esgotamento de tokens de saída, indisponibilidade do Supabase ou falta de saldo na campanha. Os embeddings/JEV já haviam terminado; a falha demonstrada está depois da seleção. Isso não constitui homologação geral da recuperação semântica nem dos 82 designs.

Escopo: rodada `automatic-focused-20261106`, branch `codex/acervo-82`, worktree `/home/emanuel/.codex/worktrees/acervo-82/PostSpark 3`. Investigação com recibos originais, leitura de código e replays locais com rede bloqueada. **Zero novas chamadas pagas, nenhuma alteração funcional, nenhuma gravação no banco.**

## Casos e primeira perda observada

| Caso | Texto original | Limite do reparo | Resposta/seleção | Desfecho |
|---|---|---:|---|---|
| Estático, proposta 3, REF-08 | `Venha conhecer a Lume` | 10 caracteres | DeepSeek devolveu `Conheça a`, `Venha à`, `Conheça`; o seletor escolheu `Venha à` | Parecer inválido após uma tentativa formal; `review_evidence_invalid` |
| Carrossel, proposta 1, terceira lâmina, R9-12 | `Comece com alguns minutos` | 14 caracteres | DeepSeek devolveu `Comece aos pou` nas três opções | Perda textual + dúvida factual sintetizada; `proposal_review_semantic_inconclusive` |

No estático, o campo opcional de marca também sofreu overflow: `LUME` recebeu limite de 2 caracteres e foi esvaziado. A marca permaneceu na legenda, mas desapareceu de todos os textos da arte. O esvaziamento desse campo não seria um defeito por si só se o título preservasse o convite completo à Lume.

**Correção de contagem:** `Comece aos pou` tem **14** caracteres, contando espaços; o relatório inicial dizia 13. O recibo nunca mudou. O texto incompleto já consta na resposta bruta da API. Parser, repartição tipográfica e Canvas não cortaram a palavra posteriormente.

## 1. A estimativa passou a valer como proibição

`shared/designMechanics.ts:92` estima caracteres de uma caixa pela fórmula:

```text
floor(largura / (fonte * 0.55)) * max(1, floor(altura / (fonte * 1.2)))
```

É uma aproximação com largura média, calculada na fonte autorada, sem medir os glifos da frase nem representar a redução de fonte efetivamente permitida. `shared/designSelection.ts:57` combina os fragmentos. No título do REF-08, capacidades `[5, 2, 10]` e pesos `[2, 1, 2]` produzem `floor(min(12.5, 10, 25)) = 10`. No R9-12, a caixa de 676,261 × 106,860, fonte 85,488, produz 14.

O escritor inicial recebe isso como **orientação**. Após overflow real, `enrichTargetedCopyRepairTargets`, em `server/ai/workflows/compactProposalCopy.ts:318`, aplica:

```text
maxCharacters = max(1, min(comprimento_atual - 1, estimativa))
```

A medição real ativa o limite, mas não determina seu valor. O schema impõe `maxLength` a `value` e a todas as alternativas (`compactProposalCopy.ts:346`). Esse limite é uma decisão nossa, não uma exigência do endpoint.

O overflow inicial era verdadeiro. No REF-08, o fragmento `conhecer` ocupa 243,594 numa caixa de largura 181,957, mesmo após redução para fonte 64. No R9-12, os títulos originais ocupam duas linhas, altura 138,918, numa caixa de 106,860, mesmo na fonte mínima 55,567. Portanto havia motivo para adaptar os textos; o problema foi como a adaptação foi limitada.

### Contraprovas com Fontkit e os mesmos assets

| Alternativa escrita manualmente para controle | Caracteres | Cabe no layout real | Permitida pelo schema enviado |
|---|---:|---|---|
| `Conheça a` | 9 | Não: a palavra cai na caixa estreita de ênfase | Sim |
| `Venha à` | 7 | Sim | Sim |
| `Conheça` | 7 | Sim | Sim |
| `Visite a Lume` | 13 | Sim | **Não**, teto 10 |
| `Conheça a Lume` | 14 | Sim | **Não**, teto 10 |
| `Comece devagar` | 14 | Sim | Sim |
| `Comece pequeno` | 14 | Sim | Sim |
| `Poucos minutos` | 14 | Sim | Sim |
| `Comece aos poucos` | 17 | Sim | **Não**, teto 14 |

Os controles que cabem também passam pela checagem de bloqueios do slide inteiro, incluindo colisões. A repartição em palavras preserva o texto original. Ela explica por que uma frase maior pode caber onde uma menor não cabe: a posição e a largura das palavras importam mais que o total de caracteres.

Esses controles demonstram capacidade física, **não** novas gerações aprovadas pelo modelo, revisão editorial ou entrega ao usuário. O teto estreito não obrigava uma saída ruim: havia frases completas permitidas até em 14 caracteres. Remover o teto, sozinho, não está demonstrado como solução suficiente.

## 2. O reparo estático recebeu contexto e cobertura inadequados

O nome Lume estava nos campos `current`; seria incorreto dizer que o reparador nunca recebeu a marca. Porém, os dois alvos chegaram com `facts:[]` e `protectedRequirements:[]`, sem objetivo da página, pedido original ou texto dos campos vizinhos.

`repairFacts` (`compactProposalCopy.ts:386`) exige pelo menos duas ocorrências comuns de palavras de quatro ou mais caracteres por sentença. A sentença que apresenta a cafeteria Lume pontua apenas 1; o convite para conhecer o espaço também pontua 1. Ambas são descartadas. O filtro lexical economiza contexto removendo justamente a informação que caracteriza o convite.

Além disso, a cobertura era circular:

```text
field-0 (LUME) -> "coberto pelo field-1"
field-1 (Venha conhecer a Lume) -> "coberto pelo field-0"
ambos os campos seriam reescritos na mesma resposta
```

`enrichTargetedCopyRepairTargets` calcula a cobertura sobre a copy anterior, sem excluir os outros alvos mutáveis. Assim, o sinal de cobertura não garante preservação após o conjunto de patches. A cobertura é declarada orientativa, mas continua sendo uma informação inadequada para decidir apagar conteúdo. O recibo não revela se o modelo internamente se apoiou nela.

No carrossel, a terceira lâmina **recebeu** em `facts` a frase completa do pedido, incluindo começar com alguns minutos e retomar no dia seguinte. Portanto a ausência de intenção não explica esse caso específico.

## 3. O seletor considera encaixe; as alternativas não garantem diversidade

`applyTargetedCopyRepair` (`compactProposalCopy.ts:473`) percorre `value` e `alternatives` em ordem e para na primeira opção cujo callback retorna encaixe. `proposalGraph.ts:860` verifica geometria e ocupação dos alvos, não completude linguística.

No estático, `Conheça a` não cabe; `Venha à` cabe e encerra a busca antes de `Conheça`. No carrossel, as três opções eram idênticas. O schema permite repetições; três posições no JSON não significam três alternativas reais.

O prompt já dizia **“não trunque palavras”**, preservar nomes e naturalidade. Repetir essa instrução, sem mudar o contrato e a seleção, não é uma correção demonstrada.

Os dois reparos usaram `deepseek/deepseek-v4.1-flash`, endpoint `deepinfra/fp8`, schema nativo estrito, reasoning desativado e máximo de 2.048 tokens de saída. Usos reais: **520/69** tokens de entrada/saída no estático e **622/133** no carrossel. Ambos terminaram com `finish_reason:stop`. Não há evidência para culpar isoladamente FP8, reasoning desativado, qualidade geral do modelo ou mecanismo interno de decodificação; isso exigiria comparação controlada adicional.

## 4. A revisão introduziu falhas independentes

**Estático bloqueado:** o parecer combinou `visible_text_loss` com `consequence:none`. O schema nativo aceita os campos separadamente, mas a normalização rejeita a combinação (`proposalReviewPolicyV10.ts:258`). A única tentativa formal recebeu regra, caminho, categoria, consequência e unidade exatos; o modelo repetiu a contradição. Isso explica o erro terminal de evidência inválida. Converter esse parecer em aprovação deixaria o convite incompleto.

**Carrossel bloqueado:** o modelo marcou a unidade do título como `uncertain`. A adaptação V10 trata vereditos não editoriais como avaliação factual (`proposalReviewPolicyV10.ts:222`); V9 sintetiza `unsupported_claim / false_claim / uncertain` (`proposalReviewPolicyV9.ts:132`). O resultado vira `inconclusive`. Em contraprova local, tratar o título como editorial, preservando o achado de perda de texto e alteração de mensagem, muda o resultado para `correction_required`, nunca `passed`.

**Estático aprovado, proposta 1:** o modelo inseriu um elogio estético sem alvo visual válido. Isso acionou `missing_visual_target`; a tentativa formal apenas removeu o elogio e aprovou a mesma arte. Foi uma chamada evitável, de US$ 0,0015598 e 5,385 segundos. A tentativa formal malsucedida da proposta 3 custou US$ 0,0016025 e 6,057 segundos. Juntas: **US$ 0,0031623 e 11,442 segundos de latência de chamadas**.

O ajuste anterior de revisão tratava IDs de ideias usados como requisitos. Nestes pareceres, `intentChecks:[]`; é outra classe de falha, não uma regressão demonstrada daquela normalização.

## 5. Por que não houve outra recuperação

Há limites diferentes:

- Uma tentativa de reparo formal do parecer por proposta; o erro da proposta 1 não consumiu o limite da proposta 3.
- Na política compacta, reparo de encaixe e correção editorial compartilham uma única recuperação (`proposalGraph.ts:724`). O encaixe já a consumira. Corrigir a classificação do carrossel não eliminaria essa segunda barreira.
- A recuperação de entrega permite duas tentativas totais (`generationCoordinator.ts:188`); ambos já estavam em `fb1`. A disponibilidade real de outras reservas não foi observada nos captures.

O limite financeiro externo não foi atingido: **22 de 24 chamadas, US$ 0,02104646 de US$ 0,60**, nenhum custo desconhecido e nenhuma interrupção por orçamento. A política economiza chamadas, mas torna decisiva a qualidade da primeira recuperação.

## Consumo e latência desta rodada

| Etapa | Chamadas | Tokens de entrada | Custo informado | Soma da latência das chamadas |
|---|---:|---:|---:|---:|
| Interpretação | 2 | 536 | US$ 0,00018088 | 3,563 s |
| JEV | 2 | 10.760 | US$ 0,00045192 | 0,833 s |
| Redação | 6 | 17.100 | US$ 0,00315900 | 17,212 s |
| Reparo textual | 4 | 2.651 | US$ 0,00057946 | 5,465 s |
| Revisão, incluindo duas tentativas formais | 8 | 103.737 | US$ 0,01667520 | 57,869 s |

A revisão concentra cerca de **79% do custo e 77% dos tokens de entrada**. Ela recebe imagens, além de texto; `prompt_tokens` do provedor não equivale a caracteres de um prompt textual. Esta perícia não decompôs a tokenização multimodal. A soma de latências por chamada não é a latência concorrente de produção. Os pedidos deste teste executaram propostas em sequência.

## Correções indicadas pela evidência

1. Manter a capacidade estimada como orientação; usar a medição real para aceitar candidatos e não excluir frases fisicamente viáveis por uma contagem aproximada.
2. Preservar um contexto mínimo explícito do reparo — objetivo, entidade e informação essencial — e calcular cobertura apenas sobre conteúdo que sobreviverá à alteração conjunta. Isso não exige reenviar o catálogo, layouts ou todos os textos.
3. Pedir alternativas efetivamente distintas na mesma chamada, eliminar duplicatas e evitar escolher uma frase evidentemente interrompida só porque coube. Qualquer verificação local deve preservar liberdade editorial, sem filtros rígidos sobre preferências estéticas.
4. Alinhar schema e normalização da revisão; separar dúvida factual de defeito textual/visual e evitar que elogios sem efeito bloqueante disparem uma nova chamada.
5. Reexecutar estes recibos como regressão antes de qualquer novo teste pago. Corrigir a primeira recuperação tem prioridade sobre ampliar limites e adicionar chamadas.

Não foram aplicadas correções funcionais nesta investigação. Os controles locais indicam o que corrigir; não demonstram que a meta de três propostas já foi alcançada.

## Evidências reproduzíveis

Sessão: `artifacts/acervo82/full/sessions/automatic-focused-20261106/`.

- Estático: `bce0f360-6a25-4f34-8884-11614f0bc7ce`; copy `gen-1793975878-6FI779ffLOarJ7GhPC6B`, reparo `gen-1793975881-odAPh573iuRb2DTMIARR`, revisões `gen-1793975882-hrmuiNir1gwDGCbXs8WH` e `gen-1793975889-avkLaO7WkVLwiHObI0NQ`.
- Carrossel: `f6001566-01d8-44c6-bc81-1e9b1c44dead`; copy `gen-1793975948-enW7u7OK3SZsyOubq2k4`, reparo `gen-1793975954-UJwSEiifclTueCFU4SlE`, revisão `gen-1793975956-07pFkZgf631NZZ9EMjbX`.
- `wire/`: requisições e respostas exatas; `static/operations.json` e `carousel/operations.json`: copy, candidatos e operações persistidas; `results.json`: uso/custo/latência por chamada.
- `diagnostics/repair-payload.json` e `.md`: payloads, schemas, contagens e filtro de contexto.
- `diagnostics/geometry-root-verified.json`: Fontkit, controles completos, escolha reproduzida e hashes dos inputs.
- `diagnostics/review-replay.mts` e `review-root-verified.jsonl`: oito pareceres reproduzidos, incluindo contraprovas explicitamente separadas, sem modificar recibos.

Comandos locais, executados a partir do worktree:

```bash
node --require ./scripts/testing/block-network.cjs --import tsx scripts/acervo82/full/focusedGeometryReplay.ts --output /tmp/focused-geometry-root-verified.json
node --require ./scripts/testing/block-network.cjs --import tsx artifacts/acervo82/full/sessions/automatic-focused-20261106/diagnostics/review-replay.mts
```

Os replays dependem dos captures privados e dos assets de fonte já disponíveis localmente. Não são testes genéricos independentes desses arquivos. A geometria e os oito pareceres foram conferidos novamente pelo agente principal, com bloqueio de rede. Hashes das fontes e dos arquivos de entrada permaneceram iguais.
