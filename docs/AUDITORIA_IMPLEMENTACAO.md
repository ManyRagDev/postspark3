# Auditoria e implementação do PostSpark

Este documento registra a baseline e os critérios de aceite das fases de melhoria
do pipeline de IA, do editor visual e da persistência. Ele complementa o
`DOCUMENTO_MESTRE.md`; o comportamento efetivo continua sendo confirmado pelo
código e pelos testes.

## Fase 0 - baseline

### Casos representativos

A suíte usa fixtures determinísticas para:

- SaaS B2B;
- e-commerce;
- serviços profissionais;
- site institucional;
- site com pouco conteúdo;
- conteúdo adequado a carrossel;
- post com template estruturado, `sections`, `textElements` e tokens visuais.

### Métricas de IA

| Métrica | Definição | Meta inicial |
| --- | --- | --- |
| Relevância temática | tema sustentado por assunto, público e evidência do site | >= 80/100 |
| Alinhamento ao objetivo | conteúdo contribui para educar, gerar autoridade, vender, engajar ou captar lead | >= 80/100 |
| Aderência de marca | tom e direção visual compatíveis com a identidade extraída | >= 80/100 |
| Originalidade | distância semântica de posts recentes, site e clichês do setor | >= 70/100 |
| Factualidade | afirmações relevantes possuem evidência ou são marcadas como hipótese | >= 90/100 |
| Taxa de revisão | candidatos que exigem uma revisão automática | <= 40% |
| Taxa de fallback | execuções que dependem de fallback por extração ou LLM | <= 10% |

### Métricas de editor e renderização

| Métrica | Definição | Meta |
| --- | --- | --- |
| Fidelidade HoloDeck -> Workbench | campos visuais preservados ao abrir a edição | 100% |
| Fidelidade salvar -> reabrir | snapshot reidratado sem perda de estado suportado | 100% |
| Paridade preview -> export | mesma composição, sem controles de edição | 100% |
| Cobertura de capacidades | item oferecido como editável/redimensionável funciona de fato | 100% |
| Sucesso em carrossel | override atual e aplicação global persistem corretamente | 100% |

### Testes de regressão adicionados

- normalização e persistência de `sections`;
- preservação de `designTokens`, imagem, template e `textElements`;
- edição estática no store;
- overrides por slide e aplicação em todos os slides;
- guard lexical de diversidade isolado do router.

As próximas fases devem ampliar esta baseline sem reduzir os critérios acima.

## Fase 1 - SiteIntelligence

O fluxo de URL passa a produzir um snapshot versionado e reutilizável:

- conteúdo semântico de até cinco páginas priorizadas;
- Brand DNA visual;
- produtos, serviços, proposta de valor, diferenciais e públicos;
- problemas, objeções e objetivos observados;
- pilares, temas prioritários, tom e alegações proibidas;
- evidências com URL de origem;
- fingerprint do conteúdo e indicadores de qualidade.

O snapshot é persistido em `postspark.site_intelligence` e identificado por
`siteIntelligenceId`. O HoloDeck e a geração recebem temas, contexto semântico e
tokens visuais derivados do mesmo objeto. O modo execution usa o mesmo caminho
quando o briefing contém `brandInput.websiteUrl`.

Compatibilidade:

- `post.extractBrandDNA` mantém `brandDNA`, `themes` e `fallbackUsed`;
- o endpoint acrescenta `siteIntelligence` e `cached`;
- `post.generate` ainda resolve a URL no backend quando o cliente não envia o ID;
- `/api/brand-dna` usa o pipeline novo sem persistir, pois não possui contexto
  autenticado.

## Fase 2 - planejamento de conteúdo

Antes de redigir as variações, o backend agora:

1. resolve o objetivo a partir do briefing ou dos objetivos observados no site;
2. propõe cinco estratégias com tópico, público, ângulo, gancho, promessa e
   evidências permitidas;
3. pontua relevância temática, alinhamento ao objetivo, fundamentação e
   distinção;
4. seleciona três estratégias evitando repetição de tópico e ângulo;
5. injeta cada estratégia como contrato exclusivo de uma variação.

Os módulos são:

- `server/ai/contentStrategy.ts`;
- `server/ai/postGenerator.ts`;
- `server/ai/generationPipeline.ts`.

Se a chamada estratégica falhar, um fallback determinístico ainda entrega cinco
candidatos pontuados, sem interromper a geração.

## Fase 3 - avaliação e revisão

Cada candidato passa por oito dimensões:

- aderência à marca;
- alinhamento ao objetivo;
- relevância para o público;
- factualidade;
- originalidade;
- clareza;
- adequação à plataforma;
- legibilidade visual.

Checagens determinísticas cobrem limites de copy, contraste WCAG, números sem
evidência e similaridade entre candidatos. Juízes LLM rodam em paralelo e são
combinados com as regras determinísticas. Se algum candidato reprovar, o
conjunto recebe uma única revisão orientada pelos feedbacks e é avaliado
novamente. Falha do juiz ou da revisão não interrompe a entrega.

O resultado fica em `generationMeta.evaluation`, junto com `strategyId` e
`revisionCount`.

## Fase 7 - modelos e observabilidade

- `gemini` usa `gemini-2.5-flash` pelo endpoint compatível do Google;
- `llama` usa `llama-3.3-70b-versatile` via Groq;
- selecionar Llama sem `GROQ_API_KEY` falha explicitamente, sem fallback oculto;
- cada chamada registra rótulo, provedor, modelo solicitado/efetivo, prompt,
  hash, tokens, latência e custo estimado;
- cada geração concluída persiste estratégias, avaliações, revisões e saída em
  `postspark.generation_runs`;
- custos são estimados pelas variáveis `LLM_INPUT_COST_PER_MILLION` e
  `LLM_OUTPUT_COST_PER_MILLION`, evitando preços hardcoded.

Snapshots visuais novos recebem `snapshotVersion: 1`.

## Fase 4 - originalidade semântica

O pipeline gera embeddings de 768 dimensões com `gemini-embedding-001` e compara
cada candidato com:

- os outros candidatos;
- evidências do site;
- até vinte posts recentes do usuário.

Quando a API de embeddings não está disponível, um vetor determinístico por
features textuais mantém o guard operacional. Similaridade com o próprio site
tem peso reduzido para não punir relevância temática. O resultado é incorporado
à avaliação e salvo em `generationMeta.originality`.

Os fingerprints, hashes e embeddings são persistidos em
`postspark.content_fingerprints`, vinculados ao `generation_run_id`.

## Fase 5 - renderer unico

O fluxo ativo passou a usar `client/src/components/PostRenderer.tsx` como porta
de entrada para os modos `preview`, `edit` e `export`.

- HoloDeck, Workbench V2 e biblioteca de posts salvos usam `PostCardV2`;
- previews recebem snapshots isolados e nao herdam estado global do editor;
- posts salvos exibem a composicao real, nao apenas a imagem de fundo;
- a raiz capturada pelo `html2canvas` contem somente o post em tamanho logico;
- zoom do workspace, loading, botoes e controles ficam fora da exportacao;
- exportacao usa escala 3 sobre a base de 360 px, produzindo 1080 px de largura.

Os Workbenches legados continuam no repositorio, mas nao fazem parte da rota
ativa montada por `Home.tsx`.

## Fase 6 - capacidades do editor

| Elemento | Conteudo/propriedades | Movimento | Redimensionamento |
| --- | --- | --- | --- |
| Headline e body | inline e painel | sim | largura |
| Badge e sticker | inline e painel | sim | largura |
| Barra de destaque | cor/estilo | sim | largura |
| Seta de carrossel | estilo/posicao | sim | largura |
| Card principal | estilo/layout | sim | largura |
| Sections estruturadas | label, descricao e icone | sim | largura |
| Text elements avancados | texto, fonte, cor, tamanho e rotacao | sim | largura/altura |
| Background | origem, filtros, zoom, pan e overlay | pan | zoom/crop |

`LayoutBlock` usa o mesmo `layoutTarget` do canvas. Selecionar um elemento abre
o contexto correto e evita que o painel edite uma layer diferente da selecionada.
As formas decorativas geradas automaticamente por tema nao sao apresentadas ao
usuario como layers independentes e permanecem deterministicas.

## Fase 8 - rollout e operacao

- runs concluidas e com falha sao persistidas;
- falhas de chamada LLM tambem entram no trace;
- conteudo bruto de prompts e outputs e opt-in por
  `AI_TRACE_STORE_CONTENT=true`; por padrao, o input vira hash SHA-256;
- metricas de qualidade sao denormalizadas pela migration
  `0008_add_generation_quality_metrics.sql`;
- `admin.getGenerationMetrics` agrega conclusao, aceitacao, revisao, fallback,
  erro de LLM, qualidade, latencia, tokens e custo;
- o painel Admin exibe a janela de sete dias e o estado das flags;
- etapas de maior risco possuem flags de rollback sem deploy de codigo.

O procedimento operacional esta em `docs/AI_OPERATIONS.md`.

## Feedback e latencia percebida

O `TheVoid` passou a representar a operacao completa, incluindo a extracao de
identidade anterior a geracao:

- barra de progresso explicitamente estimada e limitada a 94%;
- tempo decorrido e mensagens por fase;
- aviso para execucoes acima do tempo usual, sem declarar travamento;
- fallback de erro inline, mantendo o conteudo no campo;
- regiao acessivel com `role=status`, `role=progressbar` e `aria-live`.

Para reduzir espera sem alterar a qualidade, a consulta de posts recentes usada
na originalidade comeca em paralelo com estrategia e geracao. Nenhum juiz,
revisor, guard de marca ou controle de originalidade foi removido.

## Resiliencia entre modelos

`invokeLLM` agora aplica a seguinte politica:

1. executa Gemini;
2. repete apenas erros transitorios com backoff exponencial, jitter e
   `Retry-After`;
3. ao esgotar retries, envia chamadas textuais ao Groq;
4. converte `json_schema` para `json_object` e incorpora o schema ao prompt;
5. valida JSON, required, tipos, enums, arrays, refs locais e propriedades extras;
6. permite um reparo unico da resposta do Groq;
7. entrega o resultado ao mesmo pipeline de avaliacao e originalidade.

Chamadas multimodais e chamadas com tools nao usam o fallback textual.

## Auditoria de geracao e garantia de cardinalidade

O contrato atual de `post.generate` e:

```ts
{
  variations: PostVariation[];
  generationRunId: string;
  debug?: GenerationDebugTrace;
}
```

As tres variacoes sao redigidas por chamadas paralelas independentes, vinculadas
aos tres contratos estrategicos selecionados. Antes do retorno, um validador
central exige exatamente tres candidatos completos, distintos e, em carrossel,
com cinco slides cada.

QA visual, diversificacao e revisao usam schemas com cardinalidade tres e nao
podem substituir o conjunto por uma resposta parcial. Se o conjunto final
continuar invalido, a mutation falha explicitamente e o HoloDeck nao e aberto.

Para URLs, a coleta de paginas/evidencias antecede dois especialistas paralelos:

- `site_semantic_analysis`: negocio, publico, proposta de valor e pauta;
- `site_visual_identity`: screenshots, cores, tipografia e composicao.

O snapshot `SiteIntelligence` e compilado depois das duas respostas. O painel
temporario de auditoria no HoloDeck e Workbench mostra chamadas e transformacoes
somente quando `AI_UI_DEBUG_ENABLED` esta ativo. Seus blocos estao marcados com
`AUDIT_DEBUG_START` e `AUDIT_DEBUG_END`.
