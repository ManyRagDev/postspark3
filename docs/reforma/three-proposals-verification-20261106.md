# Três propostas: recuperação econômica e verificação — 2026-11-06

Implementação na branch `codex/acervo-82`. Nenhuma geração paga, implantação de produção ou alteração de pedidos/posts históricos nesta etapa.

## Comportamento implementado

- Nova revisão automática `automaticReviewVersion=2`: instruções menores, sem plano criativo nem inventário de ideias sem vínculo com requisitos materiais. Fontes, requisitos reais, textos visíveis, imagens e julgamentos factuais continuam presentes.
- Normalização local da confusão comprovada entre IDs de ideias e requisitos: somente checks positivos, únicos e com unidades válidas, quando o inventário de requisitos da intenção é vazio. Não remove dúvidas, falhas factuais, requisitos reais ou unidades faltantes. A validação V10 completa decide a aprovação.
- Recibo original preservado; ajuste registrado em `discardedFields` e conferido pelo auditor contra a resposta bruta. Adulterar marcador ou julgamento invalida a prova.
- Reserva examinada localmente antes da escolha: estrutura, proveniência e dependências de mídia. Design com imagem própria continua elegível. Slot vazio sem tarefa de imagem é pulado. Texto saudável é reaproveitado quando cabe. Não há filtro eliminatório de estilo nem aumento do número de tentativas.
- Diagnósticos existentes passam a registrar entregas, falhas, pendências, normalizações e conclusão das três propostas. Custos informados pelo provedor ficam separados de estimativas e custos desconhecidos.
- Configurações históricas sem o marcador mantêm hashes, prompts e regras anteriores. Os seis configs reais dos smokes anteriores continuam válidos.

## Prova sobre o caso real

Pedido `c37e1c2c-c79c-48dc-9176-e742024d0634`, slot 0, tentativa de reserva: o replay das duas respostas capturadas reproduziu `intent_requirement_coverage` antes da correção e `passed` depois. As respostas são da revisão inicial e do reparo formal que repetiu o mesmo erro. A primeira já é suficiente com a normalização: esse reparo formal deixa de ser necessário neste caso.

A reconstrução com Fontkit e fontes locais verificadas reproduziu exatamente 3 slides, 27 unidades e 33 âncoras do recibo. Arte, copy, recibos e as duas propostas irmãs prontas permaneceram idênticos por hash. Controle com afirmação sem suporte continua `correction_required`; unidade ausente continua rejeitada.

É replay offline de julgamentos reais previamente capturados, não uma nova avaliação visual. O pedido histórico permanece `partial`; seu status não foi reescrito. Isso comprova a remoção desse bloqueio específico, não uma taxa de 100% em novas gerações.

Evidência: `artifacts/acervo82/full/sessions/automatic-stack-20261106/automatic-review-replay.json`.

O segundo replay, sobre as reservas do static-v4, pulou REF-12 (raster ausente sem tarefa permitida) e escolheu R9-12. A copy original não coube no segundo candidato: a decisão correta foi `write_for_design`, sem alegar reutilização. Esse teste verificou duas reservas capturadas, não novos julgamentos ou downloads de mídia.

Evidência: `artifacts/acervo82/full/sessions/automatic-stack-20261106/static-v4/reserve-local-preflight-replay.json`.

## Volume de texto

| Parte medida offline | Antes | Depois | Redução |
|---|---:|---:|---:|
| Instruções da revisão automática | 10.615 caracteres | 3.637 caracteres | 65,7% |
| JSON textual do usuário no recibo inicial do caso real, projetando intenção/plano | 19.903 caracteres | 17.627 caracteres | 11,4% |

As medidas não incluem cobrança de imagens ou tokenização do provedor. Não representam percentual de economia total da API. O schema e a evidência factual continuam presentes. O reparo formal, quando ainda necessário, também deixa de repetir a resposta inválida inteira no prompt.

## Verificação

- Verificação consolidada: **3.044 testes aprovados e 10 opcionais omitidos**, incluindo o replay capturado habilitado nesta máquina. A execução ampla teve inicialmente 3 falhas nos testes de captura por caminho de Chromium incorreto; o arquivo foi reexecutado com `CAPTURE_CHROMIUM_EXECUTABLE_PATH` apontando para o navegador instalado e seus 5 testes passaram. Depois, o teste integrado adicional foi aprovado junto com os demais testes do arquivo afetado (14 aprovados, 1 render opt-in omitido).
- Teste integrado automático v2: preparo e coordinator produzem três propostas `ready`; uma revisão tem a confusão positiva injetada. São exatamente 3 redações e 3 revisões, sem reparo formal. O recibo bruto conserva o check original.
- O teste publica um catálogo isolado em PGlite, admite a configuração, persiste os três commits V10 e passa pela auditoria. A retomada pelas propostas salvas mantém resultados/recibos sem nova chamada. Liquidar novamente mantém um único débito de 10 Sparks. Isso verifica o protocolo de persistência/retomada das entregas; não constitui nova jornada manual de edição/salvamento do CanvasLab.
- TypeScript e builds de frontend, backend e renderer aprovados; bundles escritos em `/tmp`, sem substituir `api/index.js` ou `dist/`.
- Diffcheck dos arquivos desta etapa aprovado. O diff global continua apontando dois CRLF preexistentes em `shared/postspark.ts`, fora desta mudança.
- Revisão independente sem defeitos novos confirmados. Nenhuma migração adicional foi necessária para esta etapa.

O replay capturado depende de artefatos locais privados e é explicitamente opt-in: `POSTSPARK_CAPTURED_REVIEW_REPLAY=1 pnpm exec vitest run server/ai/workflows/automaticReviewReplay.test.ts`. Em checkout limpo ele é omitido por padrão; com opt-in, ausência de evidência falha explicitamente. Os testes sintéticos de normalização, proteção factual, auditoria e integração não dependem desses arquivos.

Os testes com respostas controladas comprovam os contratos e limites de chamadas; não medem a qualidade semântica futura dos modelos. A frequência estatística de três entregas deve ser acompanhada nas próximas gerações pelos contadores novos. Nenhuma chamada adicional ao OpenRouter foi feita nesta etapa.
