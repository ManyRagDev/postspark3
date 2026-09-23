# Auditoria de briefing e prompting — PostSpark

**Escopo:** investigação estática do repositório em 21/09/2026. Nenhuma API de IA foi chamada e nenhum código de produto foi alterado.

**Convenção de evidência:** **FATO** é observado no código atual; **INFERÊNCIA** é uma conclusão operacional derivada dele; **NÃO DETERMINADO** depende de configuração, dados do ambiente ou comportamento probabilístico do modelo.

## 1. Resumo executivo

O Studio oficial do PostSpark (`/thevoid`) é, hoje, uma interface de **ideação de uma única entrada textual ou uma URL**. O usuário escreve em uma única caixa, escolhe **Post estático** ou **Carrossel** e, opcionalmente, escolhe uma família visual como preferência. A tela sempre envia `platform: "instagram"`, `creationMode: "ideation"` e chama `post.generate`.

**FATO:** para um carrossel, a geração principal é uma única chamada LLM que devolve **três variações**, cada uma com **exatamente cinco slides**. Não há um agente que gere um slide por vez, nem um agente independente de direção criativa antes da copy. A mesma chamada decide copy, narrativa de slides, paleta sugerida, layout sugerido, legenda, CTA e `imagePrompt`.

**FATO:** antes da chamada há planejamento semântico determinístico, não uma chamada LLM de planejamento. Depois há avaliação determinística, verificação de originalidade por embeddings e, somente se necessário, no máximo uma chamada LLM de reparo para os slots rejeitados. A avaliação LLM adicional é desligada por padrão (`AI_LLM_JUDGE_ENABLED=false`).

**FATO:** a imagem de fundo não é gerada automaticamente durante `post.generate`. A geração retorna um `imagePrompt`; no CanvasLab o usuário pode gerar uma imagem, subir uma imagem de fundo ou inserir imagens/logos como camadas. Portanto, a conexão copy–imagem na criação inicial é uma intenção textual (`imagePrompt`), não uma composição de imagens já renderizada.

**INFERÊNCIA:** para o BizuMiner, o melhor briefing no Studio atual é um texto único, curto porém explícito, contendo: tese, público, objetivo, limites factuais, tom/anti-tom, CTA e direção visual. Isso não é porque o produto tenha campos estruturados para esses itens — ele não tem no fluxo ativo — mas porque todos esses sinais concorrem no mesmo `content` enviado à única chamada de geração.

## 2. Pipeline end-to-end

### Fluxo efetivamente montado: Studio oficial

```text
Uma caixa de texto (ou URL) + modo estático/carrossel + gosto de família opcional
  ↓ `StudioCreateViewV2B` / `StudioAppV2BPage`
`post.generate` (texto ou URL; Instagram; ideation)
  ↓
se URL: coleta/análise do site, persistência de SiteIntelligence quando disponível
se texto: o conteúdo original permanece o contexto da requisição
  ↓
`prepareGenerationPlan` → plano semântico determinístico (proposições/fatos)
  ↓
uma chamada LLM estruturada → 3 variações de copy + slides + prompt visual
  ↓
validação estrutural + grounding/factualidade determinístico + originalidade
  ↓
no máximo 1 chamada LLM de reparo para slots rejeitados (condicional)
  ↓
fallback determinístico de legenda, se ela vier curta
  ↓
BrandVisualGuardian (somente se houver SiteIntelligence) + composição de famílias/layouts
  ↓
`PostVisualSnapshot` retornado pelo backend
  ↓
`variationToCanvasModel` → galeria → CanvasLab/Konva
  ↓
usuário edita copy/cores/layout e opcionalmente gera ou sobe imagens
```

| Etapa | Arquivo e função | Entrada → saída | Modelo/prompt | Transformações e dependências |
| --- | --- | --- | --- | --- |
| Captura | `client/src/pages/StudioApp/components/v2/StudioCreateViewV2B.tsx` | `prompt`, `postMode`, família declarada → callback | nenhum | Só valida texto não vazio. URL é detectada no cliente. Não há campos de objetivo, público, CTA, fatos ou assets. |
| Montagem da chamada | `StudioAppV2BPage.tsx`, `handleCreateSubmit` | texto/URL + `static|carousel` → `post.generate` | nenhum | Acrescenta `buildTasteInstruction` ao texto se houver família escolhida; para URL não acrescenta. Fixa Instagram, ideation e `model: "llama"` (mas a rota de tarefa prevalece). |
| Contrato e enriquecimento | `server/routers.ts`, `post.generate` | input tRPC → contexto e plano | nenhum | Valida schema; para URL tenta `analyzeSiteIntelligence`; para texto não faz enriquecimento externo. |
| Inteligência de site | `server/siteIntelligence.ts`, `analyzeSiteIntelligence` | URL → `SiteIntelligence` persistível | visão + LLM semântico, quando disponíveis | Coleta evidências, extrai BrandDNA, sintetiza negócio/editorial/âncoras. Evidências para o contexto são cortadas a 24.000 caracteres no handler; a síntese recebe até 28.000. |
| Plano de significado | `server/ai/generationPipeline.ts`, `prepareGenerationPlan`; `contentStrategy.ts` | conteúdo/evidências/brief → 3 estratégias e fatos requeridos | nenhum | Divide texto em até 6 segmentos; marca segmentos numéricos como fatos requeridos; constrói 1–3 proposições e as repete nas três direções visuais se necessário. |
| Geração principal | `server/ai/generationOrchestrator.ts`, `generatePostVariations` | request + plano + SiteIntelligence → 3 variações JSON | rota `carousel_generation` ou `static_generation` | Uma chamada LLM, schema estrito. É a etapa que escreve headline, body, slides, legenda, CTA, tags e `imagePrompt`. |
| QA/reparo | `generationOrchestrator.ts`, `evaluateCandidates`, `buildRepairPrompt` | candidatos → aprovados/reparados/rejeitados | reparo: `quality_revision`; juiz LLM opcional | Há avaliação determinística, embeddings de originalidade e até uma chamada de reparo. Embeddings não reescrevem copy. |
| Direção/composição | `shared/creative/visualDiversityPlan.ts`, `composeVariation` | variações → famílias, layouts e geometria | nenhum | Escolhe famílias determinística e diversamente; não reescreve texto. Com SiteIntelligence, fixa/ajusta cores e contraste antes da composição. |
| Adaptação ao editor | `client/src/pages/StudioApp/lib/studioGeneration.ts`, `variationToCanvasModel` | variação → `CanvasPostModel` | nenhum | Mapeia os cinco slides para o editor, aplica contraste e preserva o mesmo `imagePrompt` em todos os slides. |

## 3. Contrato de entrada

### 3.1 O que uma pessoa consegue informar na rota oficial

| Campo visível | Tipo/classificação | Chega à geração? | Observação |
| --- | --- | --- | --- |
| Ideia/tema na caixa de texto | obrigatório | sim, como `content` | É o único lugar para objetivo, público, fatos, tom, CTA e instruções de direção. |
| URL na mesma caixa | alternativa ao texto | sim, como `content`/fonte | O backend trata como site a analisar; o conteúdo útil passa a ser principalmente as evidências extraídas. Não há campo separado para “URL da marca + pedido do post”. |
| Formato Post/Carrossel | obrigatório por default (`static`) | sim, `postMode` | Carrossel força o contrato de cinco slides. |
| Família visual escolhida na vitrine | opcional | sim, anexada como texto para entradas textuais | Pede a família em exatamente uma das três variações; não é obrigação técnica e pode não prevalecer. |

**FATO:** `StudioCreateViewV2B` não expõe upload de imagem, objetivo, audiência, tom, CTA, número de slides, plataforma, fatos imutáveis, referência visual, cores ou marca estruturada.

**FATO:** a API `post.generate` aceita campos adicionais: `inputType`, `content` (mín. 1), `platform`, `imageUrl?`, `tone?`, `postMode?`, `model?`, `creationMode?`, `executionBrief?`, `siteIntelligenceId?`, `idempotencyKey?`, `debug?`. No caminho ativo, apenas `inputType`, `content`, `platform`, `postMode` e `model` são enviados.

### 3.2 Contrato rico existente, porém não exposto no Studio oficial

`CreativeExecutionBrief` (`shared/postspark.ts`; validação em `server/routers.ts`) suporta `format`, `platform`, `objective`, `tone`, `callToAction`, `interventionLevel`, `contentSourceType`, `rawInput`, até cinco `slides`, `mustKeep`, `mustInclude`, `forbiddenTerms`, `notes` e `brandInput` (site, logo, referência visual, cores, fonte e modo de adaptação).

**FATO:** `client/src/components/views/ExecutionBrief.tsx` implementa essa tela e `Home.tsx` a usa, mas `Home.tsx` é legado órfão: a rota oficial monta `StudioAppV2BPage`, que não envia `creationMode: "execution"` nem `executionBrief`.

**Conclusão operacional:** não trate esses campos como recursos disponíveis ao operador comum do Studio. Eles são capacidade de contrato/API e de UI legada, não o caminho de produção montado.

## 4. Contexto de marca / Motor Camaleão

### Como nasce e persiste

1. **FATO:** ao enviar uma URL, `post.generate` chama `analyzeSiteIntelligence` se `AI_SITE_INTELLIGENCE_ENABLED` estiver ligado.
2. **FATO:** `collectSiteContent` coleta páginas/evidências; `extractBrandDNA` combina extração de estilo, captura de screenshots quando disponível e análise visual; `synthesizeBusiness` usa LLM para negócio, público, diferenciais, tom, temas e âncoras.
3. **FATO:** o snapshot `SiteIntelligence` inclui `brand`, `business`, `editorial`, `evidence`, `anchors`, qualidade e timestamp; é salvo em `site_intelligence` por usuário quando a persistência está disponível e pode ser recarregado por `siteIntelligenceId`.
4. **FATO:** há cache por URL normalizada + fingerprint. Se a extração falhar parcialmente, existe fallback determinístico e warnings.

### O que entra na geração

`siteIntelligenceToPrompt()` injeta: nome/setor, resumo, proposta, produtos/serviços, públicos/problemas, diferenciais, objetivos, pilares, temas, tom, alegações proibidas, paleta e ritmo/dinâmica. Também dá regras de não inventar e de cor. Se as âncoras forem consideradas completas, injeta 3–5 fatos, 2–5 termos proprietários e uma objeção, exigindo ao menos um fato e termo por variação.

**FATO:** a função recorta as evidências que substituem o conteúdo para 24.000 caracteres, mas o bloco de prompt é montado de campos estruturados; não há limite explícito adicional no código para esse bloco.

**FATO:** o guardião visual posterior não protege texto/narrativa: ele aproxima `backgroundColor` e `accentColor` da paleta e ajusta `textColor` para WCAG ≥ 4,5:1. O CanvasLab faz uma segunda guarda de contraste.

**FATO:** para URL, o texto digitado pelo usuário é tratado como endereço; a identidade do site “prevalece” inclusive na UI. Para texto livre, não há carregamento automático de uma marca previamente cadastrada no Studio atual.

**INFERÊNCIA para BizuMiner:** cadastre/acuse a URL do BizuMiner somente se o site já expressar com precisão posicionamento, vocabulário, paleta e limitações. Uma vez que o `SiteIntelligence` esteja bom e possa ser referenciado pelo fluxo/API, não é necessário repetir cores, tom geral, proposta e termos proprietários em cada pedido. Na UI oficial, porém, não existe seletor de marca persistida: para um pedido textual normal, esses elementos precisam ser resumidos no próprio texto.

**NÃO DETERMINADO:** não foi possível confirmar, sem ambiente/dados, se a extração real do BizuMiner produzirá âncoras completas; âncoras só são mantidas quando há ao menos 3 fatos, 2 termos e 1 objeção válidos.

### Conflitos

**FATO:** em URL, regras de SiteIntelligence impõem paleta e orientam o modelo a respeitar negócio/alegações; o guardião torna parte visual efetiva. Em texto livre, uma preferência de família é só instrução inserida no conteúdo e pode ser vencida pela composição posterior.

**INFERÊNCIA:** em conflito “pedido textual vs. DNA”, cores/contraste do DNA têm a proteção mais forte; tom e posicionamento são instruções de LLM e não possuem árbitro determinístico equivalente. O briefing estruturado de execução instrui alta fidelidade, mas não está no Studio ativo.

## 5. Pipeline de carrossel

### Responsabilidades reais

| Pergunta | Resposta baseada no código |
| --- | --- |
| Número de slides | **FATO:** `postMode: carousel` fixa exatamente 5 (`CAROUSEL_SLIDE_TARGET`). A constante histórica que admite 3–10 não decide a geração atual. |
| Headline | **FATO:** a chamada LLM principal cria `headline` global e `headline` de cada slide. O primeiro deve ser gancho; headline global é resumo. |
| Narrativa e conteúdo por slide | **FATO:** a mesma chamada LLM gera o array. Prompt determina: 1 gancho, 2–4 desenvolvimento progressivo, 5 CTA. |
| CTA | **FATO:** LLM gera `callToAction` e slide 5; o prompt proíbe CTA em 1–4. |
| Layout/família visual | **FATO:** LLM sugere layout/paleta, mas `composeVisualDiversityPlan` determina família e composição finais entre as 3 variações. |
| Elementos visuais | **FATO:** famílias determinísticas geram geometria, tipografia e ornamentos. Não há decisão visual específica por slide na chamada. |
| Imagens | **FATO:** geração retorna um único `imagePrompt` por variação e o adaptador o replica em todos os slides. A imagem não é gerada automaticamente. |
| Conexão texto-imagem | **FATO:** somente via `imagePrompt` comum; depois o usuário pode definir fundo e camadas por slide no CanvasLab. |
| Conhecimento do slide anterior | **FATO:** todos os slides são itens de uma resposta JSON única e recebem a instrução de progressão; não há memória sequencial entre chamadas porque não há chamadas por slide. |
| Coerência narrativa | **FATO:** é instruída e há schema de cinco itens; não há crítico narrativo específico por transição de slides. **INFERÊNCIA:** coerência é provável, não garantida. |
| Coerência visual | **FATO:** há diversidade entre as três alternativas e uma família por variação; não há composição visual autônoma distinta para cada slide. |
| Revisão | **FATO:** validação estrutural/grounding/originalidade e no máximo um reparo LLM. O juiz LLM é opcional e default desligado. |
| Limites | **FATO:** headline de slide ≤50 caracteres e body ≤80 no system prompt (o JSON schema não fixa esses máximos); headline global ≤60, body global ≤180, CTA ≤40, tags ≤4. |
| Transformação posterior | **FATO:** slides incompletos podem ser fabricados deterministicamente a partir do body/CTA; captions <40 caracteres recebem fallback; caracteres de controle são removidos; o CanvasLab pode ser editado manualmente. |

## 6. Pipeline de copy e prompts relevantes

### 6.1 Planejamento determinístico

`server/ai/contentStrategy.ts` não chama modelo. Ele limpa uma formulação inicial de “crie um post”, quebra o texto por linhas/frases (máximo seis segmentos), calcula proposições literais e marca fatos numéricos como obrigatórios. `buildStrategyGenerationContext()` injeta as proposições, objetivo, público, ganho e a lista dos fatos obrigatórios na mensagem de sistema.

**Impacto:** o conceito inicial não é decidido por “agente estrategista”; é extraído deterministicamente do material fonte. A LLM concretiza editorialmente esse plano.

### 6.2 Prompt principal de geração

**Arquivo/funções:** `server/ai/generationOrchestrator.ts`, `buildSystemPrompt`, `buildGenerationInstructionCore`, `buildUserPrompt`, `buildVariationsSchema`.

| Item | Diagnóstico |
| --- | --- |
| A. Serve para | Gerar as três variações completas de post/carrossel. |
| B. Recebe | Conteúdo ou imagem; tom opcional; modo; plano interno; SiteIntelligence se houver; briefing de execução se existir. |
| C. Devolve | JSON estrito: headline, body, hashtags, CTA, caption, tone, `imagePrompt`, cores, layout, proporção, template, sections, otimizações por proporção, ângulo e, em carrossel, 5 slides. |
| D. Modelo | Rota `carousel_generation`: `OPENROUTER_CAROUSEL_MODEL`; default efetivo depende de env (código: `OPENROUTER_TEXT_MODEL` se definido; senão Gemini 3.8 Flash). O parâmetro `model: llama` da UI não vence uma `taskRoute` explícita. Fallback de provider é configurável. |
| E. Sobrevivência | Texto livre inteiro chega ao user prompt e é segmentado no plano; URL é substituída por evidências de site. |
| F. Marca | Só entra automaticamente com `SiteIntelligence`; inclui negócio/editorial/paleta/âncoras. |
| G. Qualidade | Especificidade e consistência do conteúdo-fonte, fatos preserváveis, qualidade das âncoras, limites de tamanho e não conflitar com o contrato de cinco slides. |

Regras materiais desse prompt: headline é manchete concisa; pede linguagem humana/específica, evita clichês; pede três famílias visualmente diferentes; para carrossel fixa a narrativa 1/2–4/5. Ele permite que as três opções compartilhem a mesma proposição; diversidade deve ser principalmente visual.

### 6.3 Prompt de reparo

**Arquivo/função:** `generationOrchestrator.ts`, `buildRepairPrompt` + `repairSystemPrompt`.

**FATO:** recebe apenas slots rejeitados, razões estruturais/qualidade, o conteúdo atual, e o tema (cortado a 3.000 caracteres em ideation) ou o briefing de execução. Solicita manter schema/tema e não inventar fatos. Roda em `quality_revision`, cujo modelo default de env é GPT-5.4 Mini se não houver `OPENROUTER_TEXT_MODEL` definido.

**Limite importante:** não é uma revisão humana, nem uma revisão garantida. Pode ser pulada por orçamento de deadline; falha não impede sempre a entrega se a validação final ainda aceitar o conjunto.

### 6.4 Prompt de inteligência de site

**Arquivo/função:** `server/siteIntelligence.ts`, `synthesizeBusiness`.

**FATO:** pede ao modelo extrair somente evidência sustentada, não inventar produtos/públicos/diferenciais/resultados e produzir negócio/editorial/âncoras em JSON. Rota `content_strategy`, default de env GLM 5.3 Flash quando o texto global não for definido.

### 6.5 Prompt visual de BrandDNA

**Arquivo/função:** `server/brandDNA.ts`, `analyzeWithVision`.

**FATO:** recebe até três screenshots e pede cores hex, personalidade, tipografia, efeitos, emoção e estilo de card. Rota `vision_analysis`, default Gemini 3.8 Flash. É usado para DNA de site, não para compor a arte de cada carrossel.

### 6.6 Prompt de imagem

**Arquivo:** `server/imageGenerateBackground.ts`, `wrapPrompt`.

**FATO:** quando o usuário aciona geração de imagem no editor, o sistema envolve o prompt fornecido como “background art”, proíbe texto/logos/watermark/UI falsa e exige espaço livre para copy. Solicita 1080×1080. Modelo default: Gemini 3.1 Flash Image Preview via OpenRouter; fallback Pollinations HD.

**Consequência:** não use imagem IA para screenshot de interface, histórico de preços, logo ou números que precisam ser verdadeiros. Esses assets devem ser enviados no CanvasLab.

## 7. Pipeline visual

Não existe uma etapa LLM autônoma de “direção criativa” no caminho ativo. A direção é distribuída assim:

1. **FATO:** LLM principal devolve `layout`, cores, proporção e `imagePrompt` junto com copy.
2. **FATO:** `composeVisualDiversityPlan` ignora uma direção criativa LLM explícita inexistente e escolhe determinística e sequencialmente famílias, tentando diversidade de layout/família/célula entre as três variações.
3. **FATO:** com SiteIntelligence, `BrandVisualGuardian` ajusta cores para paleta/contraste; sem SiteIntelligence não há trava de marca equivalente.
4. **FATO:** `variationToCanvasModel` usa metadados da família no CanvasLab, faz guarda de contraste e mapeia layout principalmente para alinhamento (`centered` vira centro; outros caem à esquerda).

**Resposta à direção “editorial, investigativo, limpo…”:** **INFERÊNCIA:** ela pode sobreviver se estiver escrita no texto livre, pois chega ao prompt principal; mas não há campo de direção com prioridade nem avaliador de aderência semântica à direção. A escolha de família no Studio é o sinal visual mais estruturado, porém solicita somente uma de três alternativas e não garante vitória. Não é prudente deixar toda a direção a cargo do sistema para uma marca que precisa evitar “varejo sensacionalista”.

## 8. Preservação de fatos e números

### Estado atual

**FATO:** no caminho de texto livre, o planejador marca segmentos que contêm números/unidades como `required`; os inclui no “PLANO INTERNO DE SIGNIFICADO”. A avaliação procura números e cobertura lexical dos fatos requeridos no texto visível e pode mandar o slot para reparo. Se houver SiteIntelligence com âncoras válidas, schema exige `anchorUsed` e `proprietaryTerms`, e a validação também os cobra.

**FATO:** não existe no Studio oficial um campo/estrutura visível chamado “fatos imutáveis”, “evidências” ou “dados bloqueados”.

**Resposta objetiva:** para o Studio atual, o lugar mais seguro disponível é o **texto único**, em um bloco explícito e literal de `FATOS OBRIGATÓRIOS — reproduzir sem alterar`, um fato por linha, seguido de uma regra de não inventar/estimar. Isso aciona mais sinais do planejador do que esconder os fatos no meio de uma narrativa. Ainda assim, é proteção parcial, não bloqueio de tokens.

**FATO:** o mecanismo com melhor semântica para fatos é `executionBrief.mustKeep`/`mustInclude` com `creationMode: execution`; ele não está exposto no Studio oficial. Mesmo nele, “locked” aparece no texto do prompt, não como trava determinística de igualdade.

**Risco:** o detector de número não conhece a verdade de um dado sem fonte de site/brief; ele verifica presença/cobertura, não reconcilia cada valor com um banco BizuMiner. Não há integração de facts/evidence estruturados, nem verificação contra marketplace/histórico.

## 9. Referências e assets

| Material | Entrada durante geração oficial | Uso real recomendado |
| --- | --- | --- |
| URL do site | sim, alternativa ao prompt | Útil para extrair identidade/conteúdo, desde que o site seja representativo. Não combine na mesma caixa com briefing detalhado. |
| Screenshot/interface | não na tela inicial | Subir no CanvasLab como fundo ou imagem adicional por slide. Não peça à IA para recriar interface fiel. |
| Foto real de produto | não na tela inicial | Inserir no CanvasLab como `extraImage`/fundo, depois ajustar por slide. |
| Logo | não na tela inicial | Upload no CanvasLab (`logoUrl`) e posicionamento manual. |
| Cores/fontes | não estruturadas na tela inicial | Preferir URL/BrandDNA quando fiel; senão aplicar no CanvasLab. O contrato legado de execution aceita cores/fonte, mas não a UI ativa. |
| Referência visual | não na tela inicial | URL de referência só existe no brief de execução legado; não se observa consumo efetivo dela pelo orquestrador além de ser escrita no prompt. |
| Imagem gerada por IA | sob demanda no CanvasLab | Boa para textura/ambiente abstrato sem texto; ruim para evidência factual. |

**FATO:** CanvasLab aceita uploads em Data URL para fundo, logo e imagens extras; imagens extras são persistidas dentro do `CanvasPostModel`. A geração de imagem por IA do editor é uma ação separada e paga em Sparks.

## 10. Pontos frágeis e informação perdida

1. **FATO:** no fluxo de URL, o pedido original não é combinado com uma pauta específica; `contextContent` passa a ser a evidência extraída. Para “use esta marca e escreva sobre X”, a UI atual não tem dois campos.
2. **FATO:** o número de slides é fixo em cinco, embora exista uma constante de faixa 3–10. Pedido de 7 slides conflita com a geração atual.
3. **FATO:** a direção visual do usuário é texto não tipado e disputa espaço com conteúdo; família preferida não é garantida.
4. **FATO:** uma imagem de referência do contrato execution não é encaminhada como conteúdo multimodal ao prompt principal; apenas aparece como texto no bloco de briefing. Não há garantia de “clonar” essa referência.
5. **FATO:** logo, imagem e screenshot não entram na chamada de criação do Studio. Logo não é aplicado automaticamente às variações.
6. **FATO:** o fallback local do cliente, em erro de IA, produz copy genérica de demonstração e pode contrariar briefing factual. Operação real deve detectar o toast de fallback e não publicar essa saída.
7. **FATO:** com `AI_LLM_JUDGE_ENABLED=false`, não há crítica LLM editorial de rotina. Avaliação determinística não entende com profundidade uma regra conceitual como “não transformar histórico em promessa”.
8. **INFERÊNCIA:** excesso de contexto livre pode degradar o resultado porque o planejador só segmenta até seis trechos e a única chamada deve atender copy, cinco slides, caption e direção de três variações. Priorize regras decisivas e fatos, não um manual completo de marca.

## 11. O que não repetir vs. o que informar explicitamente

### Não repetir, quando houver SiteIntelligence bom no request

- nome/setor, proposta, público e diferenciais já presentes no snapshot;
- paleta, contraste e estilo visual geral extraídos do site;
- pilares, tópicos prioritários, tom e alegações proibidas;
- âncoras factuais e termos proprietários extraídos com qualidade completa.

**Ressalva:** na UI oficial de texto livre, esse snapshot não é selecionável automaticamente. Portanto esta lista só vale para chamada via URL/API que realmente carregue `SiteIntelligence`.

### Informar explicitamente para cada peça

- a proposição/narrativa do post atual e quem deve entendê-la;
- objetivo editorial da peça, pois o Studio não tem campo para ele;
- fatos exatos, período, condição e marketplace, em bloco literal;
- o que a peça não pode alegar (previsão, urgência fabricada, garantia etc.);
- CTA desejado ou a instrução de não haver CTA comercial;
- tom e anti-tom que forem específicos desta pauta;
- se a peça deve usar imagem real e que ela será aplicada manualmente após gerar;
- direção visual que seja decisiva e uma escolha de família visual coerente, se houver.

## 12. Estrutura recomendada para briefing no Studio atual

Use uma única mensagem, com blocos curtos. A estrutura abaixo é derivada do fato de que o produto só transmite `content` e o planejamento privilegia frases/linhas, fatos numéricos e proposições literais.

```text
CARROSSEL PARA INSTAGRAM — 5 slides

TESE / MENSAGEM CENTRAL
[uma frase literal que deve sobreviver]

OBJETIVO E PÚBLICO
[o que a pessoa deve compreender e para quem]

NARRATIVA OBRIGATÓRIA
Slide 1: [gancho]
Slides 2–4: [progressão em 2–3 frases]
Slide 5: [CTA ou encerramento]

FATOS OBRIGATÓRIOS — REPRODUZIR SEM ALTERAR
- [fato com número, data, marketplace e condição]
- [outro fato]

LIMITES
- Não [alegação proibida].
- Não invente números, fontes, previsões ou urgência.

TOM E DIREÇÃO VISUAL
[3–5 atributos positivos e 2–3 antiatributos].
Use linguagem humana e precisa. [Preferência de família, se desejada.]

CTA
[CTA literal ou “sem CTA comercial; encerrar com...”]
```

**Por que estes blocos:** “tese” e “narrativa” dão ao planejador segmentos literais; “fatos” favorece a marcação requerida; “limites” alimenta o modelo, embora não exista enforcement semântico completo; “direção” instrui a mesma chamada que cria `imagePrompt`. Não inclua número de slides diferente de cinco.

## 13. Exemplo de briefing BizuMiner (não executar)

```text
CARROSSEL PARA INSTAGRAM — 5 slides

TESE / MENSAGEM CENTRAL
Antes de chamar de promoção, vale olhar o contexto do preço. O BizuMiner acompanha preços para dar mais clareza à decisão.

OBJETIVO E PÚBLICO
Apresentar o BizuMiner a pessoas que nunca ouviram falar da marca. Fazer a pessoa entender a proposta sem vender um produto específico e sem prometer economia futura.

NARRATIVA OBRIGATÓRIA
Slide 1: Um desconto anunciado não conta toda a história.
Slide 2: O percentual exibido pelo marketplace é só uma comparação pontual.
Slide 3: O contexto vem de observar o preço ao longo do tempo.
Slide 4: O BizuMiner mostra esse histórico para apoiar uma decisão, não para prever o futuro.
Slide 5: Encerrar com “Menos tempo procurando. Mais clareza para decidir.”

FATOS OBRIGATÓRIOS — REPRODUZIR SEM ALTERAR
- O BizuMiner registra preços ao longo do tempo.
- O BizuMiner mostra contexto de histórico para apoiar a decisão de compra.

LIMITES
- Não prever preços futuros.
- Não prometer economia, menor preço ou oferta imperdível.
- Não fabricar urgência.
- Não apresentar histórico como garantia.
- Não inventar números, períodos, marketplaces ou fontes.

TOM E DIREÇÃO VISUAL
Editorial, investigativo, limpo, humano e preciso. Números/evidência visual como apoio, mas sem interface falsa criada por IA. Evitar varejo sensacionalista, selos de urgência, explosões promocionais e linguagem de hype. Se for usar interface ou produto, será aplicado depois como screenshot real no CanvasLab.

CTA
Sem CTA comercial. Encerrar com a mensagem central da marca.
```

**INFERÊNCIA:** para este primeiro post, não é necessário repetir três páginas de DNA da marca se houver uma boa análise de site disponível. No Studio ativo, como não há seleção dessa análise para texto livre, este resumo ainda deve acompanhar o pedido até que o fluxo de marca seja operacionalmente conectado.

## 14. Dry-run conceitual do pedido hipotético

**Entrada:** “Criar o primeiro post do Instagram do BizuMiner… [apresentar a ideia de que desconto anunciado não conta toda a história e que acompanha preços para dar contexto]”, com modo Carrossel.

```text
texto livre
→ `post.generate` com Instagram/ideation/carousel
→ `contentStrategy`: segmentos do texto viram proposições; objetivo default será `engage` sem SiteIntelligence
→ `buildStrategyGenerationContext`: pede proposição literal e evita inventar autoridade
→ chamada `carousel_generation`: 3 alternativas × 5 slides + legenda/CTA/imagePrompt
→ validação: estrutura, presença de copy, diversidade, factualidade baseada nos segmentos
→ reparo condicional
→ composição determinística de três famílias e CanvasLab
```

| Onde pode falhar | Diagnóstico |
| --- | --- |
| Conceito se perder | **Médio:** o plano preserva a proposição literal, mas a LLM ainda tem liberdade editorial e precisa gerar três variações, uma legenda e cinco slides. |
| Marca ser diluída | **Alto sem SiteIntelligence:** não há BrandDNA automático para texto livre. **Médio com URL/snapshot bom:** paleta e contexto entram, mas tom ainda depende do modelo. |
| Fatos serem inventados | **Médio/alto:** sem dados concretos não há como a avaliação distinguir explicação válida de detalhe inventado. O pedido deve proibir e não incluir números não confirmados. |
| Instruções serem ignoradas | **Médio:** limites semânticos são instruções no mesmo prompt; não existe validador específico para “não prever”. |
| Excesso de contexto prejudicar | **Médio:** o planejador limita segmentos e a geração tem muitas responsabilidades. Use fatos e regras de maior risco, não anexos extensos. |

## 15. Grau de confiança das conclusões principais

| Conclusão | Confiança | Motivo |
| --- | --- | --- |
| Studio ativo tem uma única caixa de texto/URL e formato estático/carrossel | Alta | Componentes e chamada tRPC montados foram lidos. |
| Carrossel atual tem exatamente cinco slides | Alta | Constante, prompt, schema e validação concordam. |
| Uma única chamada principal gera copy/narrativa/CTA/prompt visual | Alta | Orquestrador e schema lidos. |
| Imagem não é gerada automaticamente no `post.generate` | Alta | Saída contém `imagePrompt`; geração de imagem é procedure separada acionada no editor. |
| Há no máximo um reparo LLM e juiz LLM é desligado por padrão | Alta | Orquestrador e `ENV` confirmam. |
| DNA de site protege visualmente mais que textualmente | Alta | Guardião determinístico só atua em cor/contraste; texto é prompt/avaliação. |
| ExecutionBrief é capacidade não exposta no fluxo oficial | Alta | Contrato/UI legada existem, mas rota montada não o envia. |
| Fatos livres ficam integralmente imutáveis | Baixa — e a resposta é não | Há guardas de presença/grounding, não bloqueio de igualdade ou fonte externa. |
| Modelos efetivos em produção | Média | Defaults de código foram verificados, mas variáveis de ambiente podem substituí-los. |
| Uma URL do BizuMiner produzirá DNA/âncoras de qualidade | Baixa | Depende do site acessível, conteúdo e resultados dos modelos externos. |

## 16. Evidências principais consultadas

- Entrada/rota oficial: `client/src/pages/StudioApp/StudioAppV2BPage.tsx`, `client/src/pages/StudioApp/components/v2/StudioCreateViewV2B.tsx`.
- Contrato e borda: `server/routers.ts`.
- Planejamento, geração, schema e reparo: `server/ai/contentStrategy.ts`, `generationPipeline.ts`, `generationOrchestrator.ts`, `postEvaluation.ts`.
- Marca/site: `server/siteIntelligence.ts`, `server/brandDNA.ts`, `server/ai/brandVisualGuardian.ts`.
- Composição/editor: `shared/creative/visualDiversityPlan.ts`, `shared/creative/compose.ts`, `client/src/pages/StudioApp/lib/studioGeneration.ts`, `client/src/pages/CanvasLab/`.
- Modelos/configuração: `server/_core/env.ts`, `server/ai/modelRouter.ts`, `server/_core/llm.ts`.

O índice Compass não estava exposto nesta sessão; por isso a investigação usou busca convencional dirigida (`rg`) e leitura dos trechos de execução relevantes. Não foi necessário atualizar `DOCUMENTO_MESTRE.md`: esta entrega documenta uma auditoria solicitada, sem mudança funcional, estrutural ou de integração no produto.
