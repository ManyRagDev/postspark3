# Rodada curta com assets de posts salvos — 14/11/2026

## Resultado e decisão inicial

O CLI instalado na VPS conseguiu processar imagens efetivamente usadas no
PostSpark. Ajustes de cor, recorte/dimensões, transparência, máscaras poligonais
e desfoque localizado são **candidatos ao primeiro piloto**, condicionado ao
contrato de dados e à integração. A remoção automática não deve ser a primeira
ferramenta oferecida como resultado confiável: houve sucesso de processo com
resultado visual inadequado.

Foram **12 execuções medidas**: oito receitas iniciais, uma variação de feather
após inspeção visual e três verificações de formato/reabertura. Não foi repetida
a bateria sintética de 28 execuções. Relatório e verificações detalhadas:
[AVALIACAO_POSTS_2026-11-14.json](AVALIACAO_POSTS_2026-11-14.json).

## Amostras e proteção dos originais

Consultas somente leitura selecionaram posts do proprietário administrativo já
configurado na instalação. A rodada usou:

| Post | Asset original | Origem efetivamente lida |
| --- | --- | --- |
| 94, revisão 1 | Cena de mercado, JPEG 600×600, 153.215 bytes | Imagem embutida no post salvo |
| 97, revisão 1 | Ilustração de gráfico, WebP 800×800, 18.468 bytes | Imagem embutida no post salvo |
| 135, revisão 82 | Logo com alpha, PNG 440×100, 4.960 bytes | Storage privado, proprietário/hash conferidos |

São imagens reais do acervo do produto, incluindo cenas/ilustrações; não se
afirma que sejam fotografias de câmera. Não constituem um conjunto de retratos,
cabelos ou produtos transparentes.

As cópias para processamento ficaram em diretórios privados, com hashes de
origem conferidos. Os comandos PhotoCraft foram executados como `photocraft`,
sem credenciais, banco ou rede IP, sob os limites operacionais já definidos
(duas CPUs equivalentes, 4 GiB, temporários privados).

Ao concluir, uma nova consulta somente leitura confirmou **igualdade dos três
registros consultados**, incluindo `canvas_model`, referências de imagem,
revisão e horário de atualização. Não houve salvar post, upload de derivado no
Storage, alteração de billing ou chamada de IA.

## Receitas e resultados

| Caso | Receita | Resultado conferido | Tempo / pico de RSS |
| --- | --- | --- | --- |
| Cor da cena | Brilho +8, contraste +8, saturação −12 | Mudança visual moderada, dimensões 600×600 preservadas | 0,23 s / 39,1 MiB |
| Desfoque localizado | Laço retangular + blur de raio 10 | Apenas a região `[420,480,600,640]` mudou; fora dela, pixels idênticos | 0,23 s / 39,0 MiB |
| Cor do logo | Brilho +12, contraste +5 | Alpha exatamente igual ao original | 0,05 s / 23,7 MiB |
| Remover sobras transparentes | `image.trim` baseado em transparência | 300×80, exatamente o recorte do bounding box do alpha original | 0,07 s / 23,8 MiB |
| Enquadramento da cena | Crop `(60,30,480,540)` + resize | PNG 800×900; novo enquadramento inspecionado | 0,26 s / 35,5 MiB |
| Máscara manual | Polígono + refinamento/feather 1 | Região escolhida preservada, exterior transparente e dimensões 800×800 | 0,17 s / 45,8 MiB |
| Seleção automática da cena | `select.subject` + máscara | Selecionou o tecido central da faixa; descartou bordas estampadas e franjas. Experimental | 2,01 s / 39,0 MiB |
| Seleção automática do gráfico | `select.subject` + máscara | Manteve quase todo o fundo e abriu recortes no piso. **Reprovado visualmente** | 0,66 s / 46,3 MiB |
| Suavizar o desfoque | Mesmo laço + refinamento com feather 12 + blur 10 | Transição mais suave, sem limite retangular duro. Área modificada se expande conforme o feather | 0,15 s / 40,2 MiB |

As duas primeiras receitas foram executadas simultaneamente, em diretórios
independentes; o par terminou em aproximadamente 0,284 s. Foi apenas um par,
sem teste de carga prolongada. Os tempos medem CLI/processo e não incluem
consulta ao post, download de Storage, rede de usuário ou publicação do asset.

As três verificações complementares foram:

- Gerar `.pcraft` diretamente da receita de máscara, mantendo o documento
  nativo: 0,17 s, 61,6 MiB.
- Reabrir esse `.pcraft` e exportar PNG: 0,13 s, 38,6 MiB. O PNG resultante foi
  **idêntico byte a byte** ao PNG da receita original.
- Converter o logo para WebP: 0,04 s, 16,5 MiB. Os pixels RGBA decodificados
  foram exatamente iguais aos do PNG original nesta amostra.

O feather alterou pixels no bounding box `[405,464,615,651]`, maior que o laço
original, como esperado para suavização. A interface futura precisa mostrar
essa extensão; o controle de feather não deve ser interpretado como corte
estrito no retângulo de seleção.

## O que a remoção automática demonstrou

Ambos os casos retornaram `selected: true`, exit code zero e PNG com alpha.
Isso comprova seleção técnica, mas **não comprova que o fundo desejado foi
removido**. No gráfico, cerca de 77,1% dos pixels permaneceram totalmente
opacos, incluindo o cenário de fundo; o piso foi parcialmente removido.

Na cena do mercado, o motor escolheu uma região saliente plausível, mas não a
faixa completa. Se o usuário pretendia preservar suas franjas ou outro objeto,
o resultado não atende ao pedido. O alvo precisa ser explícito e haver prévia,
cancelamento e correção manual. A rodada não aprova o comando como removedor
universal de fundo nem como segmentação semântica por IA.

## Caminho de retorno ao documento

Foram criadas duas **cópias JSON fora do banco**: post 94 com a imagem ajustada
e post 97 com a máscara manual. As referências correspondentes foram trocadas
nas cópias, serializadas e reabertas. Reverter somente essas referências
reconstitui exatamente os registros anteriores: textos, geometria e demais
propriedades permaneceram iguais.

O post 97 contém a mesma imagem em múltiplas posições/projeções, incluindo
fundo e camada autoral. A cópia de avaliação trocou todas as ocorrências para
conferir consistência. **Isso não define a regra do produto:** o adaptador
precisa receber slide/elemento alvo e atualizar suas projeções canônicas; não
substituir globalmente todas as URLs iguais quando o usuário editar só uma
instância. Recorte/trim também exigem uma regra explícita para coordenadas,
enquadramento e máscaras; a dimensão física do arquivo mudou nesses casos.

Essa conferência não montou as cópias no CanvasLab, não aplicou o funil de
mutação real nem salvou/reabriu no ambiente hospedado. Essa jornada permanece
como requisito de integração; a troca offline de JSON não a substitui.

## Referência de imagem indisponível encontrada

O post **132** aponta para um objeto de `postspark-media` que não foi encontrado
pela leitura do Storage e também não consta em `storage.objects`. Esse asset
foi excluído da rodada; o post e a referência não foram alterados. Não foi
tentada recuperação de backup nem se conclui que a imagem seja irrecuperável.

A futura API deve tratar origem ausente antes do processamento, com erro
explícito, sem substituir a imagem nem afirmar edição concluída. A recuperação
desse asset é uma pendência separada de manutenção de mídia.

## Evidências e reprodução

- Script offline: [evaluate-saved-assets.py](evaluate-saved-assets.py). Recebe
  um manifesto de três arquivos previamente preparados e verifica seus hashes;
  não acessa banco nem Storage. Usar um diretório de saída novo para repetir.
- VPS: `/var/lib/postspark-photocraft/evaluation-20261114/`, com entradas e
  resultados privados mantidos deliberadamente para revisão.
- Recibos e cópias privadas de documento:
  `/opt/postspark/photocraft/validation/real-posts-20261114/`.
- Comparação visual local:
  `/home/emanuel/.codex/visualizations/2026/11/13/01a1d619-c5ee-71f0-89e1-1c4446976e53/photocraft-posts/comparacao.png`.
- Arquivo JSON deste diretório: métricas de execução, conferências de pixels,
  integridade dos documentos e classificação visual; sem imagens embutidas,
  credenciais ou URLs assinadas.

Temporários de processamento removidos; a conferência encontrou zero entradas
no diretório temporário do serviço. API e worker PostSpark continuaram
saudáveis. Assets/resultados preservados para revisão são artefatos de teste,
não resíduos temporários abandonados.

## Próxima etapa delimitada

A rodada é suficiente para escolher um piloto inicial de ajustes de cor,
recorte/dimensões, máscaras manuais e desfoque com feather. Seguir para o
contrato de alvo, original/derivado, receita, preview/aplicar/cancelar e revisão
do documento, antes da API e da disponibilização do CLI ao backend Docker.

Remoção automática permanece experimental. Retratos, cabelo, produtos,
arquivos de câmera em alta resolução e concorrência prolongada não foram
homologados. Não há necessidade de ampliar indiscriminadamente os testes
agora; novas amostras devem responder às ferramentas que entrarem no piloto.
