# Resultados preliminares — benchmark editorial de modelos

> **Status:** duas coletas operacionais preservadas; julgamento editorial humano pendente.

## Primeira bateria — baseline

Fonte local rederivável: `artifacts/editorial-model-benchmark/2026-09-13T14-37-28-007Z-126156a6/results.private.json`.

| Modelo | Respostas válidas | Latência média | Cobertura factual automática | Custo |
| --- | ---: | ---: | ---: | ---: |
| Gemini 3.8 Flash | 10/10 | 3,4 s | 94% | US$ 0,0233 |
| GPT-5 Mini | 9/10 | 7,0 s | 100% | US$ 0,0158 |
| Qwen 3.6 Flash | 7/10 | 6,6 s | 83% | US$ 0,0090 |
| DeepSeek V3.2 | 5/10 | 27,9 s | 100% entre as válidas | US$ 0,0153 |

O GLM 4.7 foi excluído após três timeouts consecutivos de 60 segundos. A bateria completou 40 tentativas por US$ 0,0635. O Gemini 3.8 Flash foi o vencedor operacional provisório, mas a qualidade editorial permaneceu pendente de avaliação cega.

## Segunda bateria — eliminatória de versões atuais

Fonte local rederivável: `artifacts/editorial-model-benchmark/2026-09-13T18-20-39-172Z-d11aa6ac/results.private.json`.

Foram usados cinco briefs representativos: promoção com poucos dados, caso clínico factual, tema vago, SaaS com escopo explícito e teaser com informações desconhecidas.

| Modelo | Respostas válidas | Latência média | Cobertura factual automática | Custo retido |
| --- | ---: | ---: | ---: | ---: |
| Gemini 3.8 Flash | 5/5 | 3,7 s | 100% | US$ 0,0123 |
| GPT-5.4 Mini | 5/5 | 5,1 s | 100% | US$ 0,0183 |
| GLM 5.3 Flash | 5/5 | 7,8 s | 100% | US$ 0,0023 |
| DeepSeek V4.1 Flash | 5/5 | 10,5 s | 100% | US$ 0,0067 |
| Qwen 3.8 Flash | 5/5 | 13,7 s | 100% | US$ 0,0018 |

O artefato final reteve 25/25 respostas estruturalmente válidas, sem erros e sem HTTP 429, por US$ 0,0414. No smoke, o GLM revelou que seu endpoint exige raciocínio habilitado; o harness foi corrigido para `low`. O Gemini produziu um JSON malformado em uma primeira tentativa isolada e passou na repetição. As células foram substituídas no artefato final, mas a ocorrência fica registrada aqui.

## Limite da conclusão

A medição automática cobre validade estrutural, latência, custo e presença lexical dos fatos esperados. Ela não mede naturalidade, clareza pragmática ou sensação humana e premium. Portanto, a segunda bateria confirma o Gemini como líder operacional de latência e revela GLM e Qwen como candidatos fortes de custo, mas não declara vencedor editorial.

Hash SHA-256 do resultado privado da segunda bateria: `943DC3CCD035BF095314ED9E0A3904E55B522E3829169810DD37417DB813AC0E`.
