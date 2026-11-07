# Perícia local de custos do smoke automático

Estado: final. Gerado em 2026-11-06T06:36:50.225Z.

Custo efetivo acumulado: **US$ 0.049734095**; contabilizado com reservas pendentes: US$ 0.054331680; saldo do teto de US$ 0,50: US$ 0.445668320. 50/56 chamadas. A autorização atual ampliou apenas o limite de chamadas de 32 para 56; o teto de dólares continua US$ 0,50. O static original, malsucedido, continua incluído: US$ 0,000876946 (3 chamadas).

## Integridade e orçamento

- usdCapUnchanged: OK
- callsCapMatchesCurrentAuthorization: OK
- withinUsdCap: OK
- withinCallCap: OK
- quotesHashPreserved: OK
- originalThreeCallsPreserved: OK
- amendmentHistoryPreserved: OK
- uniqueProviderIds: OK
- receiptCountMatchesCompletedLedger: OK
- receiptCostsMatchLedger: OK
- wireIntegrity: OK
- allLedgerEffectsTerminal: OK
- allLedgerCostsKnown: NÃO CONFIRMADO

## Chamadas

| # | Caso / etapa | Modelo | Entrada / saída / raciocínio | US$ real | Bytes request | Wire | JEV perguntas |
|---|---|---|---|---:|---:|---|---:|
| 1 | static / generation_intent_v1 | deepseek/deepseek-v4.1-flash | 1286 / 758 / 0 | 0.000498400 | 7486 | ausente | — |
| 2 | static / jev | typesafe/jev-1.13 | 5467 / 904 / — | 0.000229614 | 20045 | ausente | 20 |
| 3 | static / jev | typesafe/jev-1.13 | 3546 / 529 / — | 0.000148932 | 12727 | ausente | 12 |
| 4 | static-v2 / generation_intent_v1 | deepseek/deepseek-v4.1-flash | 256 / 170 / 0 | 0.000107240 | 1963 | sim | — |
| 5 | static-v2 / jev | typesafe/jev-1.13 | 5422 / 896 / — | 0.000227724 | 19751 | sim | 20 |
| 6 | static-v2 / proposal_copy_v3 | anthropic/claude-haiku-5.5 | 3088 / 299 / 0 | 0.000458300 | 6968 | sim | — |
| 7 | static-v2 / proposal_targeted_copy_repair_v1 | deepseek/deepseek-v4.1-flash | 475 / 144 / 0 | 0.000126980 | 3210 | sim | — |
| 8 | static-v2 / proposal_copy_v3 | anthropic/claude-haiku-5.5 | 3146 / 285 / 0 | 0.000457100 | 7080 | sim | — |
| 9 | static-v2 / proposal_targeted_copy_repair_v1 | deepseek/deepseek-v4.1-flash | 361 / 94 / 0 | 0.000090020 | 2520 | sim | — |
| 10 | static-v2 / proposal_copy_v3 | anthropic/claude-haiku-5.5 | 6484 / 520 / 0 | 0.000908400 | 13984 | sim | — |
| 11 | static-v2 / proposal_targeted_copy_repair_v1 | deepseek/deepseek-v4.1-flash | 1028 / 188 / 0 | 0.000222880 | 6345 | sim | — |
| 12 | static-v3 / generation_intent_v1 | deepseek/deepseek-v4.1-flash | 256 / 175 / 0 | 0.000109340 | 1963 | sim | — |
| 13 | static-v3 / jev | typesafe/jev-1.13 | 5401 / 899 / — | 0.000226842 | 19662 | sim | 20 |
| 14 | static-v3 / proposal_copy_v3 | anthropic/claude-haiku-5.5 | 3140 / 314 / 0 | 0.000471000 | 6703 | sim | — |
| 15 | static-v3 / proposal_targeted_copy_repair_v1 | deepseek/deepseek-v4.1-flash | 356 / 32 / 0 | 0.000063280 | 2397 | sim | — |
| 16 | static-v3 / proposal_review_v10 | anthropic/claude-haiku-5.5 | 13105 / 1446 / 0 | 0.002033500 | 139281 | sim | — |
| 17 | static-v3 / proposal_review_v10 | anthropic/claude-haiku-5.5 | 15357 / 1445 / 0 | 0.002258200 | 144297 | sim | — |
| 18 | static-v3 / proposal_copy_v3 | anthropic/claude-haiku-5.5 | 3699 / 364 / 0 | 0.000551900 | 7716 | sim | — |
| 19 | static-v3 / proposal_review_v10 | anthropic/claude-haiku-5.5 | 14136 / 1616 / 0 | 0.002221600 | 176328 | sim | — |
| 20 | static-v3 / proposal_copy_v3 | anthropic/claude-haiku-5.5 | 2390 / 230 / 0 | 0.000354000 | 5332 | sim | — |
| 21 | static-v3 / proposal_review_v10 | anthropic/claude-haiku-5.5 | 12185 / 898 / 0 | 0.001667500 | 141489 | sim | — |
| 22 | carousel / generation_intent_v1 | deepseek/deepseek-v4.1-flash | 280 / 157 / 0 | 0.000105140 | 2065 | sim | — |
| 23 | carousel / jev | typesafe/jev-1.13 | 5401 / 885 / — | 0.000226842 | 19782 | sim | 20 |
| 24 | carousel / proposal_copy_v3 | anthropic/claude-haiku-5.5 | — / — / — | — | 13848 | sim | — |
| 25 | carousel / proposal_copy_v3 | anthropic/claude-haiku-5.5 | 5492 / 744 / 0 | 0.000921200 | 11285 | sim | — |
| 26 | carousel / proposal_targeted_copy_repair_v1 | deepseek/deepseek-v4.1-flash | 1048 / 175 / 0 | 0.000220220 | 6453 | sim | — |
| 27 | carousel / proposal_review_v10 | anthropic/claude-haiku-5.5 | 21978 / 1217 / 0 | 0.002806300 | 601205 | sim | — |
| 28 | carousel / proposal_review_v10 | anthropic/claude-haiku-5.5 | 24789 / 2337 / 0 | 0.003647400 | 607176 | sim | — |
| 29 | carousel / proposal_copy_v3 | anthropic/claude-haiku-5.5 | 5827 / 712 / 0 | 0.000938700 | 11828 | sim | — |
| 30 | carousel / proposal_review_v10 | anthropic/claude-haiku-5.5 | 22039 / 2245 / 0 | 0.003326400 | 921048 | sim | — |
| 31 | static-v4 / generation_intent_v1 | deepseek/deepseek-v4.1-flash | 256 / 170 / 0 | 0.000107240 | 1963 | sim | — |
| 32 | static-v4 / jev | typesafe/jev-1.13 | 5395 / 905 / — | 0.000226590 | 19702 | sim | 20 |
| 33 | static-v4 / proposal_copy_compact_v1 | anthropic/claude-haiku-5.5 | 2434 / 371 / 0 | 0.000428900 | 5971 | sim | — |
| 34 | static-v4 / proposal_targeted_copy_repair_v1 | deepseek/deepseek-v4.1-flash | 389 / 32 / 0 | 0.000067900 | 2509 | sim | — |
| 35 | static-v4 / proposal_review_v10 | anthropic/claude-haiku-5.5 | 13822 / 1533 / 0 | 0.002148700 | 141454 | sim | — |
| 36 | static-v4 / proposal_copy_compact_v1 | anthropic/claude-haiku-5.5 | 2222 / 184 / 0 | 0.000314200 | 5362 | sim | — |
| 37 | static-v4 / proposal_copy_compact_v1 | anthropic/claude-haiku-5.5 | 2269 / 364 / 0 | 0.000408900 | 5525 | sim | — |
| 38 | static-v4 / proposal_targeted_copy_repair_v1 | deepseek/deepseek-v4.1-flash | 514 / 74 / 0 | 0.000103040 | 3374 | sim | — |
| 39 | static-v4 / proposal_review_v10 | anthropic/claude-haiku-5.5 | 13893 / 1696 / 0 | 0.002237300 | 216313 | sim | — |
| 40 | carousel-v2 / generation_intent_v1 | deepseek/deepseek-v4.1-flash | 280 / 138 / 0 | 0.000062395 | 2065 | sim | — |
| 41 | carousel-v2 / jev | typesafe/jev-1.13 | 5398 / 888 / — | 0.000226716 | 19771 | sim | 20 |
| 42 | carousel-v2 / proposal_copy_compact_v1 | anthropic/claude-haiku-5.5 | 3765 / 803 / 0 | 0.000778000 | 9590 | sim | — |
| 43 | carousel-v2 / proposal_review_v10 | anthropic/claude-haiku-5.5 | 23002 / 3430 / 0 | 0.004015200 | 537606 | sim | — |
| 44 | carousel-v2 / proposal_review_v10 | anthropic/claude-haiku-5.5 | 27806 / 3400 / 0 | 0.004480600 | 548378 | sim | — |
| 45 | carousel-v2 / proposal_copy_compact_v1 | anthropic/claude-haiku-5.5 | 3319 / 751 / 0 | 0.000707400 | 8359 | sim | — |
| 46 | carousel-v2 / proposal_targeted_copy_repair_v1 | deepseek/deepseek-v4.1-flash | 851 / 122 / 0 | 0.000170380 | 5385 | sim | — |
| 47 | carousel-v2 / proposal_review_v10 | anthropic/claude-haiku-5.5 | 22949 / 2738 / 0 | 0.003663900 | 616589 | sim | — |
| 48 | carousel-v2 / proposal_copy_compact_v1 | anthropic/claude-haiku-5.5 | 3215 / 586 / 0 | 0.000614500 | 8082 | sim | — |
| 49 | carousel-v2 / proposal_targeted_copy_repair_v1 | deepseek/deepseek-v4.1-flash | 363 / 43 / 0 | 0.000068880 | 2426 | sim | — |
| 50 | carousel-v2 / proposal_review_v10 | anthropic/claude-haiku-5.5 | 20994 / 2358 / 0 | 0.003278400 | 404927 | sim | — |

## Resultado por tentativa

A aprovação do auditor atesta a integridade dos registros; não significa que uma geração failed entregou posts.

| Caso | Classificação | Estado | Ready | Calls | US$ real conhecido |
|---|---|---|---:|---:|---:|
| static | failed_diagnostic_attempt | failed | 0 | 3 | 0.000876946 |
| static-v2 | failed_diagnostic_attempt | failed | 0 | 8 | 0.002598644 |
| static-v3 | diagnostic_attempt | partial | 2 | 10 | 0.009957162 |
| carousel | diagnostic_attempt | partial | 2 | 9 | 0.012192202 |
| static-v4 | diagnostic_partial_pending_local_image_guard_zero_dispatch | partial | 2 | 9 | 0.006042770 |
| carousel-v2 | final_verified_partial | partial | 2 | 11 | 0.018066371 |

## Latência e tokens por etapa

Latências são de cada transporte; a soma não mede a duração da jornada. Entrada/saída são usage real quando disponível.

| Modelo / etapa | Calls | Input | Output | Total tokens | Latência média / min / max (ms) | US$ conhecido |
|---|---:|---:|---:|---:|---|---:|
| deepseek/deepseek-v4.1-flash / generation_intent_v1 | 6 | 2614 | 1568 | 4182 | 2879.3 / 1514 / 7506 | 0.000989755 |
| typesafe/jev-1.13 / jev | 7 | 36030 | 5906 | 41936 | 387.3 / 312 / 476 | 0.001513260 |
| anthropic/claude-haiku-5.5 / proposal_copy_v3 | 9 | 33266 | 3468 | 36734 | 3715.8 / 580 / 5546 | 0.005060600 |
| deepseek/deepseek-v4.1-flash / proposal_targeted_copy_repair_v1 | 9 | 5385 | 904 | 6289 | 1022.8 / 568 / 2014 | 0.001133580 |
| anthropic/claude-haiku-5.5 / proposal_review_v10 | 13 | 246055 | 26359 | 272414 | 8962.5 / 6544 / 12157 | 0.037785000 |
| anthropic/claude-haiku-5.5 / proposal_copy_compact_v1 | 6 | 17224 | 3059 | 20283 | 3672.3 / 2409 / 5116 | 0.003251900 |

## Composição dos payloads

Contagens em caracteres UTF-16; imagens mostram bytes decodificados. O JSON associado contém bytes UTF-8, hashes, IDs, inventários e política do provedor por chamada.

| # | Evidência | System | User | Schema | Imagens / bytes | JEV state / questions |
|---|---|---:|---:|---:|---|---|
| 1 | local_diagnostic_messages_only | 1519 | 3399 | — | 0 / 0 | — / — |
| 2 | local_diagnostic_jev_payload | — | — | — | 0 / 0 | 1740 / 18150 |
| 3 | local_diagnostic_jev_payload | — | — | — | 0 / 0 | 1740 / 10852 |
| 4 | captured_wire | 569 | 303 | 607 | 0 / 0 | — / — |
| 5 | captured_wire | — | — | — | 0 / 0 | 1396 / 18195 |
| 6 | captured_wire | 1389 | 3282 | 1498 | 0 / 0 | — / — |
| 7 | captured_wire | 492 | 1204 | 934 | 0 / 0 | — / — |
| 8 | captured_wire | 1389 | 3338 | 1549 | 0 / 0 | — / — |
| 9 | captured_wire | 492 | 812 | 675 | 0 / 0 | — / — |
| 10 | captured_wire | 1389 | 7777 | 3487 | 0 / 0 | — / — |
| 11 | captured_wire | 492 | 3139 | 1972 | 0 / 0 | — / — |
| 12 | captured_wire | 569 | 303 | 607 | 0 / 0 | — / — |
| 13 | captured_wire | — | — | — | 0 / 0 | 1327 / 18184 |
| 14 | captured_wire | 1685 | 2250 | 1993 | 0 / 0 | — / — |
| 15 | captured_wire | 838 | 511 | 515 | 0 / 0 | — / — |
| 16 | captured_wire | 10615 | 9062 | 4375 | 1 / 84914 | — / — |
| 17 | captured_wire | 11226 | 12738 | 4375 | 1 / 84914 | — / — |
| 18 | captured_wire | 1685 | 2695 | 2491 | 0 / 0 | — / — |
| 19 | captured_wire | 10615 | 11016 | 4375 | 1 / 110997 | — / — |
| 20 | captured_wire | 1685 | 1639 | 1333 | 0 / 0 | — / — |
| 21 | captured_wire | 10615 | 7387 | 4375 | 1 / 88056 | — / — |
| 22 | captured_wire | 569 | 407 | 607 | 0 / 0 | — / — |
| 23 | captured_wire | — | — | — | 0 / 0 | 1482 / 18141 |
| 24 | captured_wire | 1685 | 5505 | 5411 | 0 / 0 | — / — |
| 25 | captured_wire | 1685 | 4474 | 4079 | 0 / 0 | — / — |
| 26 | captured_wire | 838 | 2792 | 2007 | 0 / 0 | — / — |
| 27 | captured_wire | 10615 | 18252 | 4375 | 3 / 423392 | — / — |
| 28 | captured_wire | 11749 | 22304 | 4375 | 3 / 423392 | — / — |
| 29 | captured_wire | 1685 | 4622 | 4421 | 0 / 0 | — / — |
| 30 | captured_wire | 10615 | 18347 | 4375 | 3 / 663153 | — / — |
| 31 | captured_wire | 569 | 303 | 607 | 0 / 0 | — / — |
| 32 | captured_wire | — | — | — | 0 / 0 | 1369 / 18175 |
| 33 | captured_wire | 1862 | 2479 | 812 | 0 / 0 | — / — |
| 34 | captured_wire | 838 | 615 | 515 | 0 / 0 | — / — |
| 35 | captured_wire | 10615 | 10291 | 4427 | 1 / 85478 | — / — |
| 36 | captured_wire | 1862 | 1993 | 812 | 0 / 0 | — / — |
| 37 | captured_wire | 1862 | 2101 | 812 | 0 / 0 | — / — |
| 38 | captured_wire | 838 | 1033 | 903 | 0 / 0 | — / — |
| 39 | captured_wire | 10615 | 10418 | 4427 | 1 / 141538 | — / — |
| 40 | captured_wire | 569 | 407 | 607 | 0 / 0 | — / — |
| 41 | captured_wire | — | — | — | 0 / 0 | 1441 / 18172 |
| 42 | captured_wire | 1862 | 5631 | 812 | 0 / 0 | — / — |
| 43 | captured_wire | 10615 | 19924 | 4427 | 3 / 374153 | — / — |
| 44 | captured_wire | 11226 | 28327 | 4427 | 3 / 374153 | — / — |
| 45 | captured_wire | 1862 | 4600 | 812 | 0 / 0 | — / — |
| 46 | captured_wire | 838 | 2195 | 1619 | 0 / 0 | — / — |
| 47 | captured_wire | 10615 | 19785 | 4427 | 3 / 433560 | — / — |
| 48 | captured_wire | 1862 | 4344 | 812 | 0 / 0 | — / — |
| 49 | captured_wire | 838 | 533 | 517 | 0 / 0 | — / — |
| 50 | captured_wire | 10615 | 15823 | 4427 | 3 / 278243 | — / — |

## Verificação da integração

O coordenador registrou 3016 testes aprovados, 10 ignorados, TypeScript e builds Vite/esbuild aprovados. Estes resultados não equivalem a seis entregas completas: carousel-v2 terminou com duas propostas ready e uma failed, com auditoria aprovada. static-v4 terminou partial (duas ready e uma expired), com billing liquidado; mantém no_unresolved_operations no auditor pela operação histórica barrada pelo guard local de imagem, sem dispatch ao provedor. A correção de mídia none/optional passou em 55 testes. O coordenador também confirmou reabertura visual no browser: post estático 146 e carrossel 147. Não houve inferência adicional para produzir esta perícia.

Reprodução local: `node artifacts/acervo82/full/sessions/automatic-stack-20261106/cost-forensics.mjs --final --output=/tmp/postspark-smoke-cost-report`, a partir da raiz do repositório. O script apenas lê artefatos e escreve o relatório.

## Escopo e limites

- Only local artifacts were read; no provider requests or new fees.
- The first three calls have no original wire capture: requestBytes/usage/cost come from receipts; JEV counts from durable assessmentContext; any message metrics from local diagnostics. The original intent JSON schema is unavailable; JEV uses its separate state/questions protocol without a chat response schema.
- Character counts use JavaScript UTF-16 length; byte counts use UTF-8. Embedded-image bytes are decoded base64 size, not provider image tokens.
- Unknown reasoning usage is null, never assumed zero. Remote image bytes cannot be measured from these artifacts.
- Schema size is JSON.stringify of the captured schema; message content sizes exclude surrounding JSON keys/escaping.
- Design inventory paths identify counted arrays; JEV counts assessed family/design candidacies, not all compositions in the catalog.
- A rejeição HTTP 400 não expôs usage/cost: a reserva permanece conservadoramente contabilizada, não convertida em custo zero.
- Comparar este smoke ao número anterior de 274544 tokens não é uma comparação controlada: requests, catálogo avaliado, tentativas, schemas e quantidade de revisões diferem. Bytes/caracteres/base64 não equivalem a tokens faturados.
