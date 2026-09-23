# Benchmark editorial de modelos

Harness isolado para comparar modelos de texto sem passar pelas matrizes editoriais do pipeline de produção. Não consome Sparks, não grava no Supabase e não altera `OPENROUTER_TEXT_MODEL`.

## Comandos

```powershell
# Modo seguro: mostra a matriz e não chama a API
pnpm benchmark:editorial

# Bateria atual: GPT-5.4 Mini, Qwen 3.8 Flash, DeepSeek V4.1 Flash,
# GLM 5.3 Flash e Gemini 3.8 Flash
pnpm benchmark:editorial -- --execute

# Subconjunto e retomada no mesmo artefato
pnpm benchmark:editorial -- --execute --models "openai/gpt-5-mini" --cases "home-office-vago" --append "artifacts\editorial-model-benchmark\<run>"

# Resumo derivado, sem novas chamadas
pnpm benchmark:editorial:summary -- --run "artifacts\editorial-model-benchmark\<run>"
```

Requer `OPENROUTER_API_KEY` em `.env`. `--execute` é obrigatório para gerar custo real. A primeira resposta HTTP 429 encerra a bateria imediatamente e preserva resultados parciais. Cada chamada também tem timeout padrão de 60 segundos, configurável por `--timeout-ms`.

## Artefatos

- `review.blind.md`: ficha de avaliação humana sem nomes de modelos;
- `results.blind.json`: respostas e métricas sem o mapa de modelos;
- `results.private.json`: fonte completa para rederivação;
- `model-map.private.json`: chave de revelação; não abrir antes da avaliação;
- `machine-summary.private.{json,md}`: resumo operacional derivado.

O corpus em `corpus.ts` é sintético e versionado. Qualidade editorial não é calculada automaticamente: clareza, naturalidade e sensação humana/premium exigem julgamento cego do dono.

## Decisões da primeira bateria

- GLM 4.7 ficou fora da bateria principal após três timeouts consecutivos no smoke test.
- Gemini 3.8 Flash foi executado em JSON textual porque o structured output via OpenRouter retornou objeto vazio no smoke; a limitação fica registrada em `structuredOutputMode`.
- O schema foi deliberadamente achatado e `tone` permanece livre. O contrato mede significado e evidência sem impor um vocabulário editorial.

## Rodada eliminatória atual

- As duas baterias permanecem preservadas e documentadas em `BENCHMARK_EDITORIAL_RESULTADOS_2026-09-13.md`.
- Modelos antigos continuam disponíveis via `--models`, mas foram removidos do conjunto padrão.
- A eliminatória compara versões exatas, não aliases `latest`, para que a medição seja reproduzível.
- Os cinco casos recomendados para triagem são `promocao-dia-das-maes`, `clinica-confirmacao-factual`, `home-office-vago`, `saas-atendimento` e `produto-sem-detalhes`.
