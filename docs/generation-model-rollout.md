# Ativação e verificação dos modelos de geração

Roteiro corrigido do relatório de novembro/2026. O objetivo é gerar pelo Studio
com Claude Haiku 5.5, DeepSeek V4.1 Flash e Gemini 3.8 Flash, conservando recibos,
cobrança, revisão obrigatória e o documento autoritativo CanvasPostModel.

## Admissão no Supabase

A migração [0053](../drizzle/0053_generation_model_choices.sql) foi aplicada em
03/11/2026 no projeto `spbuwcwmxlycchuwhfir`, schema `postspark`. As duas funções
admitem gemini, claude, deepseek e gpt; o último conserva compatibilidade histórica.
Posts e recibos anteriores não são reescritos. A migração exige as funções de
0044/0045, preserva a transação de admissão/reserva e a configuração da primeira
admissão. O caminho staged também registra o modelo em generation_runs.

Use [esta consulta somente de leitura](../scripts/sql/verify-generation-model-choices.sql).
Ela retorna as duas assinaturas exatas, inclusive quando falta uma função, e
confere allowlist, search_path e execução restrita ao service_role. Todos os
indicadores devem ser verdadeiros. O LIKE com aspas do relatório original não
serve para essa verificação. A consulta de catálogo complementa os testes
comportamentais e a jornada real.

A migração [0054](../drizzle/0054_generation_execution_requirements.sql) também foi
aplicada em 03/11/2026. Ela alinha a trava de entrega V10 à projeção material das
obrigações: uma diretriz como “sem foto” não exige uma frase adicional no post.
As demais provas de revisão, a imutabilidade e as permissões continuam exigidas.

## Configuração e implantação

Frontend/API são publicados na Vercel, projeto postspark3. O executor de produção
está no AWS Lightsail postspark-worker-prod, região us-east-2, conforme
[a operação AWS](../ops/aws/README.md). Railway não é o destino atual do executor.

| Variável | Padrão |
| --- | --- |
| OPENROUTER_CLAUDE_MODEL | anthropic/claude-haiku-5.5 |
| OPENROUTER_DEEPSEEK_MODEL | deepseek/deepseek-v4.1-flash |
| OPENROUTER_STATIC_MODEL | google/gemini-3.8-flash |
| OPENROUTER_CAROUSEL_MODEL | google/gemini-3.8-flash |

OPENROUTER_API_KEY precisa estar configurada nos processos que chamam o provedor.
As rotas Gemini também podem herdar OPENROUTER_TEXT_MODEL; confira a resolução
efetiva e generation_config. Revisão, mídia e shortlist têm políticas próprias.
As variáveis são capturadas na inicialização: alterar o painel exige recarga do
processo ou novo deployment. Retomada e Gerar mais preservam o recibo original.
O preparador privado do ambiente AWS inclui os novos slugs e
GENERATION_STRATEGY_VERSION, sem copiar credenciais AWS ou de billing.

1. Conclua tipagem, testes e build da fonte que será entregue.
2. Confira pedidos ativos, catálogo e versões implantadas. Coordene a pausa de
   novas admissões ao trocar leitores e executor, preservando pedidos existentes.
3. Aplique apenas migrações incrementais pendentes e confira assinaturas e
   permissões. A 0053 já está aplicada no projeto citado.
4. Construa/verifique a imagem pelo procedimento AWS antes de ativá-la. Publique
   frontend/API da fonte correspondente na Vercel e confira ambos os destinos.
5. Reative admissões e faça a homologação. Build READY ou heartbeat isolado não
   comprova geração, salvamento e reabertura.

## Reasoning, autoria e métricas

Claude e DeepSeek usam effort none nas etapas que consomem generation_config.
O transporte envia `reasoning: { effort: "none", exclude: true }`. Exclude omite
o raciocínio da resposta; isoladamente, não impede consumo. Métrica de reasoning
ausente permanece desconhecida, em vez de virar zero.

O playbook afirmativo orienta a autoria; sua presença não certifica a saída.
Obrigações de conteúdo têm kind content e precisam de conteúdo identificável.
Diretrizes de formato, tom, mídia e limites factuais têm kind execution: continuam
no contexto editorial, nas verificações de mídia e na revisão das fontes, sem
exigir uma frase adicional ocupando o layout. Recibos sem kind conservam a
semântica anterior. A revisão material recebe as obrigações de conteúdo, mantendo
as instruções originais no contexto editorial. O planejamento determinístico
registra explicitamente a ausência de chamada paga.

O benchmark usa o adaptador de produção e aguarda a resposta completa. Distingue
custo informado pelo provedor, estimativa e custo desconhecido; mede cobertura
factual nos textos publicáveis. Novos arquivos têm measurement
isolated_editorial_call_v2 e não sobrescrevem os registros antigos, cujo relógio
parava antes da leitura completa da resposta.

```sh
node --import tsx server/benchmarks/run-comparative-benchmark.ts --smoke
```

O smoke faz uma chamada paga por modelo; sem --smoke, são três casos por modelo.
É copy isolada, sem revisão, mídia, persistência ou reabertura. A amostra de
03/11/2026 observou aproximadamente 7,33 s / US$ 0,00274 no Gemini,
5,21 s / US$ 0,00062 no Claude e 5,43 s / US$ 0,00073 no DeepSeek. Os três
recibos informaram reasoning_tokens=0. Uma chamada por modelo não representa
média, percentil ou garantia futura. A economia de 98% por post não está
comprovada: a jornada tem outras chamadas e possíveis reparos/mídia.

## Homologação

Teste cada modelo em estático e carrossel: modelo configurado e efetivo, propostas
prontas na galeria, revisão, abertura no CanvasLab, salvamento e reabertura do
mesmo canvas_model. Confira repetição idempotente, entrega parcial, falha e Gerar
mais de um recibo antigo. Não repita uma inferência com resultado incerto; use a
recuperação existente ou aguarde a expiração prevista.

| Formato | Reserva | Débito com propostas prontas | Nenhuma pronta |
| --- | --- | --- | --- |
| Estático | 10 Sparks | 1 + 3 por proposta pronta | 0 |
| Carrossel | 40 Sparks | 4 + 12 por proposta pronta | 0 |
| DEV / FOUNDER | 0 | 0 | 0 |

Três propostas estáticas prontas debitam 10 Sparks; uma debita 4. Uma conta DEV
não comprova débito comercial. Confira reserva, liquidação e ledger, incluindo
repetição sem duplicação e devolução da parcela não entregue. A troca dos modelos
não altera os preços.

```sh
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run server/ai/workflows/generationModel.postgres.test.ts server/ai/generationModel.test.ts server/_core/llm.test.ts server/routers/generation.test.ts client/src/pages/StudioApp/components/v2/StudioCreateViewV2B.test.tsx server/ai/workflows/generationBilling.postgres.test.ts server/benchmarks/run-comparative-benchmark.test.ts
node --import tsx scripts/inspectGenerationRun.ts --id UUID --post-id INTEGER --output artifacts/verification/model-rollout.json
```

Os testes PostgreSQL usam PGlite e exercitam as duas funções reais de admissão,
permissões, configurações, preços reservados, rollback e recibos históricos.
Quantidade de testes é resultado, não critério fixo de 40 ou 42. O último comando
inspeciona dados persistidos e precisa ser acompanhado da verificação no navegador.
Registre separadamente os resultados locais, os remotos e as versões implantadas.

## Resultado registrado em 03/11/2026

As migrações 0053/0054 estão aplicadas no Supabase. Os quatro slugs da tabela
foram definidos nos ambientes Production e Preview da Vercel. O worker utiliza
os mesmos padrões do código e preserva seu arquivo privado de ambiente.

- Vercel: `dpl_HM4Bba4WztqKVBvvTDPdKuwESY3V`, promovido em
  `https://www.postspark.com.br`, fonte `aws-18fc7d8971dc76a8`.
- AWS Lightsail: imagem `postspark-worker:aws-18fc7d8971dc76a8`, no host existente
  `postspark-worker-prod`, `us-east-2`; renderizador real verificado em 15 slides,
  três sequências concorrentes, sem chamadas de IA ou banco nesse probe.
- Fonte: snapshot do workspace, incluindo alterações locais existentes, sem
  commit ou push. O empacotamento excluiu ambientes, chaves, logs e testes.
- Tipagem aprovada; 242 testes aprovados em 17 arquivos, um teste opcional de
  renderização não executado (inclui os 15 testes do verificador de runtime).
  O build remoto de frontend/API/renderizador ficou READY. Chunks grandes
  continuam como aviso de otimização, sem falha de build.
- O health foi corrigido para não carregar o parser de migrações quando não há
  arquivos SQL locais no deployment. A auditoria CLI com SQL conserva o parser.

Jornada autenticada na porta 3000, usando o Supabase e provedores reais, conta DEV:

| Modelo | Pedido | Entregas observadas | Post salvo/reaberto |
| --- | --- | --- | --- |
| Claude | `d1605926-d1de-4289-a3fb-fe7654de856d` | 3 prontas, concluído | 114 |
| DeepSeek | `64385803-48b6-4348-afca-9eedd1ec2bf4` | 3 prontas, concluído | 115 |
| Gemini | `6c3c80ac-91bc-4237-b21c-f94a80ce5373` | 2 prontas, parcial; terceira expirada | 116 |

Os três documentos foram reabertos visualmente no CanvasLab. O verificador de
dados confirmou propriedade, identidade, formato e composição, incluindo a
sincronização da legenda do post com as composições. Nos dois pedidos concluídos,
as provas de catálogo, revisão e chamadas do provedor também passaram. O pedido
Gemini encerrou como parcial às 04:25:33 UTC, com duas entregas preservadas e
liquidação DEV de zero Sparks. A terceira revisão permaneceu sem confirmação do
provedor e expirou; sua evidência não deve ser declarada completa. Nenhuma chamada
incerta foi repetida. Os recibos dos testes que falharam durante o diagnóstico
foram preservados.

A cobrança comercial foi exercitada nas funções PostgreSQL reais em PGlite,
incluindo reserva, liquidação, entrega parcial, repetição e rollback. A conta DEV
da jornada não é evidência de débito pago. Carrosséis e GPT histórico têm cobertura
automatizada de contratos e persistência; não se deve descrevê-la como uma nova
geração comercial em produção. A sessão de produção é separada da porta 3000.

O health público de produção retornou `ok: true`, `mode: probed`, sem issues.
A jornada autenticada pelo domínio publicado confirmou Claude com três propostas
prontas no pedido `d7b63b55-fe3e-4744-acfb-34fe3a3d3e5c`, execução `external`,
estratégia 1 de produção preservada. O post 117 foi salvo/reaberto visualmente no
CanvasLab e passou em todas as checagens de dados, revisão e recibos do provedor.
DeepSeek também concluiu três propostas no pedido
`3f0c146b-aee3-4c4f-90c6-afbb1f31dd6c`, incluindo recuperação de composição;
o post 118 foi salvo/reaberto no domínio público e passou no verificador completo.
Gemini concluiu três propostas no pedido `caa8ee19-cd5c-4dc7-a589-c2b3035a8100`;
o post 119 foi salvo/reaberto no CanvasLab e passou no verificador completo de
dados/recibos. Os três pedidos de produção concluíram nove propostas prontas,
com a mesma sessão DEV e estratégia 1 vigente; a estratégia 2 foi homologada
separadamente na jornada local conectada ao Supabase real.
A fonte da publicação permanece o snapshot indicado; ajustes posteriores no
verificador CLI reconhecem ranking por confiança e a ordem não semântica do
conjunto de fontes, sem modificar os recibos ou o runtime publicado.
Evidências e captura de tela estão em
`artifacts/verification/model-rollout-2026-11-03/` (artefatos locais, não publicados).
