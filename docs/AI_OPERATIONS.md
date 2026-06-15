# Operacao do pipeline de IA

## Objetivo

Este runbook cobre rollout, monitoramento, rollback e privacidade do pipeline de
Site Intelligence, estrategia, avaliacao, originalidade e geracao.

## Ordem de deploy

1. Aplicar migrations `0005`, `0006`, `0007` e `0008`.
2. Configurar chaves Gemini/Groq e custos por milhao de tokens.
3. Manter `AI_TRACE_STORE_CONTENT=false`, salvo necessidade aprovada de debug.
4. Publicar backend e frontend.
5. Confirmar `admin.getAiRollout` e o card de qualidade no painel Admin.
6. Executar casos de URL, texto, execution e carrossel.

O runtime usa Supabase direto. As migrations Drizzle documentam e criam as
estruturas, mas nao substituem a configuracao real de RLS no ambiente.

## Flags

| Variavel | Default | Efeito ao desligar |
| --- | --- | --- |
| `AI_SITE_INTELLIGENCE_ENABLED` | `true` | URL usa scrape simples no generate; `/api/brand-dna` retorna 503 |
| `AI_CONTENT_STRATEGY_ENABLED` | `true` | usa estrategia deterministica |
| `AI_LLM_JUDGE_ENABLED` | `true` | mantem avaliacao deterministica e desliga juiz/revisao LLM |
| `AI_SEMANTIC_EMBEDDINGS_ENABLED` | `true` | usa embedding local deterministico |
| `AI_MODEL_FALLBACK_ENABLED` | `true` | mantem retries, mas nao troca Gemini por Groq |
| `AI_TRACE_STORE_CONTENT` | `false` | persiste hashes e metricas, sem prompt/output bruto |
| `AI_UI_DEBUG_ENABLED` | `false` em producao | remove prompts/respostas da resposta tRPC e oculta o painel de auditoria |

Parametros de resiliencia:

- `LLM_TRANSIENT_RETRIES=2`: retries adicionais para erros transitorios;
- `LLM_RETRY_BASE_DELAY_MS=700`: base do backoff exponencial com jitter;
- `LLM_REQUEST_TIMEOUT_MS=90000`: timeout por tentativa.

## Metricas

Fonte: `postspark.generation_runs`, endpoint
`admin.getGenerationMetrics({ windowDays })`.

| Metrica | Alerta inicial |
| --- | --- |
| Completion rate | abaixo de 95% em 1 hora |
| LLM call error rate | acima de 5% em 1 hora |
| Candidate acceptance | abaixo de 70% em 24 horas |
| Revision rate | acima de 40% em 24 horas |
| Fallback rate | acima de 10% em 24 horas |
| P95 de latencia | acima de 120 s em 1 hora |
| Custo estimado | crescimento acima de 50% sem aumento equivalente de runs |

Os limites devem ser recalibrados apos duas semanas de producao.

## Rollback

1. Desligar `AI_LLM_JUDGE_ENABLED` se houver custo ou latencia de avaliacao.
2. Desligar `AI_SEMANTIC_EMBEDDINGS_ENABLED` se embeddings falharem.
3. Desligar `AI_CONTENT_STRATEGY_ENABLED` se a etapa estrategica degradar.
4. Desligar `AI_SITE_INTELLIGENCE_ENABLED` apenas se a extracao de sites for a
   origem do incidente.
5. Desligar `AI_MODEL_FALLBACK_ENABLED` se o provedor secundario apresentar
   degradacao de schema ou qualidade.

Reiniciar ou republicar o runtime apos mudar variaveis. Nao apagar runs durante
o incidente; elas sao a evidencia para diagnostico.

## Diagnostico

1. Confirmar flags efetivas em `admin.getAiRollout`.
2. Separar falhas por `status`, modelo efetivo e label da chamada.
3. Comparar `promptHash` para identificar repeticao sem ler conteudo privado.
4. Verificar se o erro veio de configuracao, provedor, parse, avaliacao ou banco.
5. Conferir taxa de fallback e `error_message`.
   Runs com `prompt_snapshot[].fallbackFrom` contam como fallback de modelo.
6. Em divergencia visual, comparar o mesmo snapshot nos modos `preview`,
   `edit` e `export`.
7. Em relatos de demora, separar o tempo de `extracting` do tempo de
   `generating`. A barra do TheVoid e estimada; a latencia real deve ser
   confirmada em `generation_runs` e nas chamadas registradas no trace.

## Privacidade e retencao

- O default nao persiste prompts, input ou output bruto.
- Ativar `AI_TRACE_STORE_CONTENT` exige justificativa operacional e janela curta.
- `AI_UI_DEBUG_ENABLED` retorna conteudo bruto apenas na resposta atual e deve
  permanecer desligado em producao fora de uma janela de diagnostico.
- Chaves e tokens nunca entram no trace.
- `generation_runs.prompt_snapshot` remove `messages` e `response`, mesmo quando
  o painel efemero esta habilitado.
- Definir no Supabase uma politica de retencao para `generation_runs` e
  `content_fingerprints` conforme a politica do produto.
- A implementacao atual nao possui cron ou worker de limpeza; a retencao deve
  ser aplicada por infraestrutura externa ou rotina futura explicitamente criada.

## Validacao manual

- URL com site rico e site com pouco conteudo;
- texto sem site;
- execution com `websiteUrl`;
- Gemini e Llama;
- post estatico e carrossel;
- abrir HoloDeck, editar, salvar, reabrir e exportar em 1:1, 5:6 e 9:16;
- editar e redimensionar headline, body, badge, sticker, card, section e
  `textElement`.
- confirmar que HoloDeck nao abre com zero, uma ou duas variacoes;
- confirmar no painel debug os agentes `site_semantic_analysis`,
  `site_visual_identity` e `post_generation_1..3`;
- confirmar no banco que prompts e respostas brutas nao foram persistidos.
