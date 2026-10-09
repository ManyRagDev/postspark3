# DNA de composição — plano de correção e curadoria interna

> **Próxima implementação — 2026-10-01:** seguir o [plano do arsenal com pgvector e TheVoid](./plano-arsenal-pgvector-thevoid.md). O [tutorial de curadoria dos JSONs](./tutorial-curadoria-json-designs.md) documenta a autoria atual para novas referências. Esses documentos não aplicam migrations nem ativam a coleção no produto; as seções abaixo conservam o histórico do desenvolvimento.

> **Atualização de execução — 2026-09-30, cabeçalho reconciliado em 2026-10-01:** o proprietário autorizou a recuperação por filtros/pontuação e integração rastreável. Foi implementado o recorte V1 descrito em [`catalogo-design.md`](./catalogo-design.md): curadoria de dois blocos nativos, versões/peças no Supabase, seleção na chamada existente e materialização no Canvas oficial. A migration 0018 foi aplicada via MCP e registrada como `20260930154457_postspark_design_catalog`, conforme §13.32 do documento-mestre; a falha de conexão mencionada anteriormente precedeu essa aplicação. As seções que adiam toda integração registram decisões históricas; grupos arbitrários, mídia, autoaprovação e telemetria de edição/publicação continuam pendentes no catálogo V1. A aprovação de blueprints exige revisão explícita no admin, não promove automaticamente os exemplos do arquivo local.


Status histórico desta base: adaptação V2 implementada em `/admin2`; replay de três receitas e quatro novas decodificações multimodais concluídos em 2026-09-29. Integração da coleção completa com `post.generate` permanece pendente; o recorte de catálogo V1 já foi implementado posteriormente.
Data da base: 2026-09-29; atualizações e próximos passos indicados acima.
Base: especificação `/dnapost`, decisões posteriores do usuário e inspeção do fluxo ativo Studio/CanvasLab.

### Atualização — representações e seleção por similaridade (2026-10-01)

**Ensaio implementado:** `harness/designRepresentation/`, com galeria em `artifacts/design-recreation/representation-pilot-2026-10-01T14-36-23-376Z/index.html`. As 69 receitas foram preservadas; 43 designs distintos entram no índice experimental. Não publica modelos no gerador.

As três necessidades são tratadas separadamente:

1. **Contexto da LLM:** cartões descritivos compactos; o modelo escolhe IDs de uma shortlist. Medida desta coleção: 688.514 bytes de JSON sem assets versus 14.942 bytes de cartões (97,83% menos), ou 1.682 bytes para cinco candidatos. Bytes não são tokens; acurácia da LLM não foi testada. O catálogo V1 atual já usa metadados curtos e não consome esta coleção.
2. **Similaridade:** vetores globais de estrutura/estilo e matrizes por grupo com relações declaradas. Índice derivado, versionado e ligado ao hash da receita. Busca exploratória encontrou parentes úteis e falsos positivos; precisa de calibração com exemplos rotulados, requisitos semânticos e estado de aprovação antes de ser um seletor de produção.
3. **Derivação:** relações explícitas de alinhamento, crescimento, padding e fluxo, reutilizando o motor de três componentes. Nove derivações usam tipografia das famílias originais. O tensor não aprende nem garante beleza/compatibilidade. A conferência detectou preposições isoladas em dois títulos, apesar de encaixe e contraste corretos; quebra de texto entra como critério geral a melhorar.

**Arquitetura indicada:** briefing → filtros de requisitos/aprovação → busca de candidatos → cartões para a LLM → IDs → receitas completas → compositor com relações → prévia/edição livre. Preservar parâmetros completos e identidade de marca. Não enviar os vetores numéricos brutos como substitutos de descrições à LLM. Não adicionar treinamento, banco vetorial ou embedding visual sem evidência de ganho.

Conferências do ensaio: TypeScript, invariâncias dos descritores, sensibilidade geométrica, regressão por hash das nove prévias aprovadas, nove roundtrips e preservação dos originais. Evidência visual nativa; não valida o Stage React. Relações persistidas no Admin2/CanvasLab e ampliação do catálogo ainda são etapas posteriores. Detalhes no documento-mestre e em `harness/designRepresentation/README.md`.

#### Continuação — evidências de que uma composição funciona

Implementado o ensaio `harness/designRepresentation/qualityRun.ts`, em `artifacts/design-recreation/quality-pilot-2026-10-01T14-56-36-703Z/`. Define quatro dimensões: integridade/legibilidade medida, composição medida, comunicação/aprovação visual humana e uso real não medido. Não resume todas em uma nota estética.

- 27 exemplares anteriormente aprovados estão registrados com receita/PNG hashes, descritores, condições observadas e escopo da aprovação. Não aprova automaticamente suas derivações.
- As nove derivações foram refeitas com quebras balanceadas, crescimento de superfície e alternativa de mídia separada. Cinco alertas passaram a zero segundo critérios explícitos; a revisão visual humana das novas saídas continua pendente.
- Evidências vinculam receita, render e briefing exatos. Não inferem `maxlength` ou intervalo garantido de validade a partir da amostra. Mudança de contexto ou parâmetros relevantes requer avaliação novamente, preservando liberdade de edição.
- A galeria recolhe preferência antes/depois, clareza e disposição de usar o resultado, em armazenamento local/exportação JSON. Ainda não há ingestão de feedback, treinamento, calibração de similaridade ou publicação no gerador.

Próximo uso dessa evidência: analisar preferências humanas para ajustar seleção/composição, mantendo distintos os exemplos aprovados, variantes apenas tecnicamente elegíveis e desempenho real ainda desconhecido. Priorização de candidatos usa requisitos e alertas antes da proximidade estrutural. A integração dos vínculos ao contrato oficial continua etapa separada.

### Próxima entrega — edição flexível e famílias nativas (2026-09-30)

**Status atualizado em 2026-10-01: conversão offline das 12 famílias concluída; edição flexível no Admin2 pendente.** O proprietário aprovou visualmente as nove combinações com as três frases do ensaio `combination-pilot` e pediu que as famílias originais também forneçam peças ao arsenal. Essa aprovação cobre o ensaio apresentado; não aprova antecipadamente novas combinações ou a conversão das famílias.

**Entrega executada após autorização:** `harness/designFamilies/` materializa 36 receitas V3 (12 famílias × três formatos), conservando as definições originais intactas e em backup datado com SHA-256/ZIP. A coleção em `artifacts/design-recreation/family-library-2026-10-01T02-59-27-361Z/index.html` reúne 45 cartões e 69 receitas importáveis, incluindo as referências e combinações anteriores copiadas sem alteração. A origem é o compositor original; o Stage atual e suas diferenças estão preservados/documentados. Há 191 definições de grupos no inventário auxiliar, ainda sem solver geral de compatibilidade ou publicação. Detalhes, aproximações e limitações no §13.31 do documento-mestre e em `harness/designFamilies/README.md`.

#### Inventário confirmado no código

`shared/creative/families.ts` contém as **12 famílias originais**, com regras de composição, requisitos de conteúdo e parâmetros visuais. `OFFICIAL_FAMILIES_META`, em `client/src/pages/CanvasLab/components/types.ts`, contém **14 famílias no editor ativo**. O editor usa `cyber-glitch` para a família antes chamada `glitch-signal` e acrescenta `stroke-impact` e `cinematic-depth`.

| Família original | Identificador no CanvasLab | Peças candidatas à extração/conversão |
| --- | --- | --- |
| Editorial Poster | `editorial-poster` | Hierarquia editorial, tratamento serifado, divisórias e marcações. |
| Chromatic Block | `chromatic-block` | Bloco de cor, título de impacto e sticker inclinado. |
| Brutal Split | `brutal-split` | Composição dividida, superfície contrastante e região de mídia. |
| Glitch Signal | `cyber-glitch` | Tratamento monoespaçado, efeitos de deslocamento e marcações técnicas. |
| Glass Veil | `glass-veil` | Cartão translúcido, borda, sombra e relação com a foto. |
| Kinetic Type | `kinetic-type` | Ritmo tipográfico, alternância de escala e rotações. |
| Data Punch | `data-punch` | Destaque de número, explicação e marcação de apoio. |
| Versus | `versus` | Estrutura de comparação e pares de conteúdo. |
| Quote Authority | `quote-authority` | Citação, aspas e atribuição vinculada. |
| Minimal Air | `minimal-air` | Espaçamento generoso, hierarquia simples e marcação discreta. |
| Mosaic Grid | `mosaic-grid` | Grade, blocos de seção e espaçamentos entre itens. |
| Duotone Wash | `duotone-wash` | Tratamento de imagem, sobreposição cromática e área de leitura. |

As duas extensões do editor entram no mesmo inventário para uma etapa subsequente: `stroke-impact` (tratamento de contorno/sólido) e `cinematic-depth` (composição e leitura cinematográfica). A primeira conversão cobre as 12 solicitadas; o número de peças únicas só será conhecido após decomposição e deduplicação.

**Não basta serializar metadados de família.** Há diferenças entre o compositor compartilhado e o Stage ativo: por exemplo, Quote Authority declara Lora em `shared/creative/families.ts`, enquanto o preset do CanvasLab usa Cinzel; Kinetic Type usa Anton no compositor e Syne no preset. Detalhes gráficos são desenhados condicionalmente dentro de `CanvasPostStage.tsx`, e `applyFamilyPreset` troca família/fonte preservando fundo e acento. Nesta entrega das famílias originais, o adaptador usa os compositores e registra as diferenças em relação ao editor; a futura integração ao produto deverá conferir o Stage ativo. A paleta de demonstração usa os metadados atuais com procedência explícita. A tabela descreve conjuntos candidatos: blur/filtros fotográficos e algumas relações entre cópias exigem as aproximações declaradas no relatório da conversão.

#### Contrato de reutilização

- Representar cada família como uma **receita-base** com peças de composição, tipografia, superfície/fundo, ornamentos e mídia, mais relações de alinhamento, padding, crescimento e fluxo vertical. Preservar um conjunto coerente inicial e permitir recombinação compatível.
- Derivar dados das definições existentes por adaptadores com versão/procedência. Não usar captura de tela, OCR ou LLM para redescobrir valores que o código já contém. Extrair regras de renderização para helpers compartilhados quando necessário, evitando manter cópias divergentes.
- Deduplicar peças por conteúdo canônico, mantendo os vínculos de origem. Uma mesma tarja/sombra pode servir a várias receitas; 12 famílias não implicam 12 peças únicas de cada tipo.
- Usar papéis de cor (`background`, `accent`, `text`, `surface`) e manter a paleta escolhida pelo usuário. As paletas de demonstração servem à prévia. Resolver contraste contra a superfície efetiva, incluindo transparência e foto quando aplicável.
- Distinguir restrições de conteúdo de escolhas estéticas: comparação requer dois lados; métrica requer dado fornecido; composição dependente de mídia declara essa necessidade; texto precisa de área legível. Não inventar uma estatística para preencher um destaque. Não multiplicar todas as categorias sem checar a composição completa.
- Limites `maxHeadlineChars` existentes podem orientar sugestões de geração, mas não se tornam bloqueios da edição livre. Crescer, quebrar por palavras e reorganizar membros vinculados; indicar conflitos e permitir ajustes/desvinculação.
- Registrar no trace a família/versão de origem, IDs das peças, parâmetros alterados, critérios de compatibilidade e motivo de adaptação/fallback. A receita administrativa não substitui o `CanvasPostModel` como documento do post.

#### Sequência da entrega

1. **Relações flexíveis no Admin2:** promover as regras do ensaio para um contrato versionado, com leitura das receitas anteriores, controles de texto/mídia, desvinculação e salvamento/reabertura dos vínculos.
2. **Conversão das 12 famílias:** construir os adaptadores e receitas-base usando esse mesmo contrato; registrar diferenças entre composição original e aparência do editor, além de capacidades ainda sem primitiva.
3. **Galeria comparativa:** mostrar cada família em sua composição-base e exemplos de cruzamento com as peças dos três designs aprovados. Usar conteúdos apropriados para comparação/métrica/lista, além de frases de comprimentos diferentes. Pontuação técnica não equivale a aprovação estética.
4. **Conferência e persistência:** verificar formatos oficiais, texto com acentos, mídia, ajustes manuais, JSON portátil e reabertura. Aprovação humana fica vinculada à versão conferida; publicação das novas receitas exige a evolução correspondente do catálogo, cujo recorte V1 ainda suporta somente dois blocos nativos.
5. **Integração posterior:** levar relações e valores resolvidos ao `CanvasPostModel`, preservando undo/redo, salvamento, exportação e identidade de marca. Só depois ampliar a seleção dessas peças no gerador. O catálogo V1 já conectado continua com seu escopo atual.

O pedido posterior priorizou a conversão preservada, executada em contrato V3 antes da etapa de edição flexível. A galeria e o ZIP já permitem importar as receitas pelo fluxo existente. O runtime permanece igual; nada foi publicado no Supabase. A geração e o TypeScript concluíram, com inspeção da imagem comparativa; não foram executados testes automatizados ou validação no navegador. Evidências obtidas por leitura local dirigida; MCP Compass indisponível nesta sessão.

### Escopo atual: MVP em `/admin2`

**Objetivo refinado pelo usuário:** produzir adaptações visualmente boas e reaproveitáveis, preservando hierarquia, equilíbrio, legibilidade e personalidade. Fontes aproximadas são suficientes. Perfeição de cópia não é critério de aprovação; a reprodução estável da receita salva permanece necessária. Essa decisão orienta a evolução do MVP e prevalece sobre metas anteriores de equivalência visual exata neste documento.

Em 2026-09-29, o próximo passo foi reduzido a imagem → receita JSON → recriação. O laboratório completo em `/admin` permanece disponível. `/admin2` tem análise vision própria com schema estrito, fontes abertas incorporadas, salvamento local e JSON portátil, além de comparação com a recriação no mesmo CanvasPostStage. Reabrir uma receita não chama IA. OCR, pontuação de fidelidade, curadoria de Peças e Blueprints não fazem parte desse MVP.

O modelo inicial configurável é `deepseek/deepseek-v4.1-flash` via `OPENROUTER_DESIGN_RECREATION_MODEL`, independente do modelo do laboratório completo. A escolha é baseada em suporte documentado a imagem/JSON e custo; a qualidade visual ainda precisa de avaliação com referências. Fotografias e texturas ficam declaradas como elementos ausentes, sem simular uma reconstrução completa. Nenhuma migration ou ligação com `post.generate` foi acrescentada. Detalhes do comportamento implementado estão no §13.31 do `DOCUMENTO_MESTRE.md`.

#### Atualização unificada — adaptação V2 implementada

**Evidências dos dois casos:** Brutalism preservou a hierarquia, com fonte mais baixa/larga e traço unido a “ISM”. Creative People (`41a9ed0a`) manteve palavras, hierarquia e paleta, mas o encaixe reduziu CREATIVE/PEOPLE de 130 para 94,39/92,87 px. A tarja perdeu inclinação, as pílulas viraram polígonos chanfrados e o botão perdeu contorno preto. O contrato antigo de polígonos vinculava contorno ao preenchimento; a cena fotográfica foi corretamente declarada ausente. A segunda execução registrou DeepSeek via Together, 1.000 tokens de entrada e 7.734 de saída; esses dados não são uma medição de custo ou latência.

1. **Comparação visual consistente:** mesma escala calculada pela largura disponível e altura máxima de 550 px; prévia com moldura neutra, sem arredondamento externo do CanvasLab.
2. **Preparação de fontes resiliente:** até três downloads concorrentes, conservação das fontes bem-sucedidas, falha isolada por arquivo e nova ação para preparar fontes/encaixe sem IA. Textos com fonte pendente mantêm o tamanho, evitando encaixe calculado com substituto do navegador.
3. **Hierarquia tipográfica:** instrução de escolher famílias por condensação, proporções e peso. Política `fill` para títulos pode ampliar até 30% por preparação explícita dentro da caixa; `preserve` evita ampliar apoio. Reduções acima de 20% em `fill` geram aviso para trocar fonte ou encurtar texto. Sem deformar letras. Dimensões e tamanhos finais ficam salvos; recriar/reabrir não refaz encaixe.
4. **Formas e expressividade:** `cornerRadiusPx` para retângulos/pílulas, preenchimento e contorno independentes nos caminhos, instruções mais explícitas para rotação e separação de elementos. Os novos estilos são exclusivos do contrato Admin2 e não alteram o schema de análise do laboratório completo.
5. **Função da mídia:** novas extrações incluem `role` e `essential` em `missingElements`. Guias opcionais mostram as regiões na prévia e ficam fora do PNG. Substituir ou gerar a imagem não foi implementado nesta etapa; textura continua sendo uma ausência declarada.
6. **Experimento de reutilização:** textos, famílias e pesos podem ser alterados por linha num painel recolhido. A ação cria e salva outra receita, com novo ID e `parentRecipeId`, preservando o registro anterior. Modelo/tokens continuam explicitamente sendo da análise original. Ainda não há redistribuição automática de um título inteiro entre múltiplas linhas; o curador fornece o texto por linha.
7. **Compatibilidade:** novo envelope `postspark.admin2.recipe` versão 2, decoder `admin2-vision-2`, renderer `admin2-konva-2`; leitor aceita V1 e V2. Abrir V1 conserva seus parâmetros. Preparar/adaptar cria uma derivação V2 explícita. Novos dados de formas/mídia exigem nova decodificação; não se inventa a geometria faltante em receitas antigas.

O `confidenceScore: 0` herdado das camadas não constitui avaliação de baixa qualidade feita pelo modelo. A atualização mantém uma chamada lógica vision, sem OCR, migração, vínculo com `post.generate`, remoção de fundo ou geração de mídia. Verificação desta entrega: tipagem TypeScript e revisão estática; a nova saída do modelo e o fluxo visual completo ainda dependem de execução no painel.

#### Ensaio executado e integração cirúrgica — 2026-09-29

**Escopo executado:** reprodução das receitas `306b5602` (Brutalism, V1), `41a9ed0a` (Creative People, V1) e `d160ef79` (papel rasgado, V2), comparação visual com os JPEGs originais, exportação/releitura de JSON, remontagem do CanvasPostStage e troca local de texto. Usa os mesmos módulos `readRecipeFile`, `ensureReferenceFontsLoaded`, `createTextAdaptation`, `fitRecipeText` e `CanvasPostStage` do Admin2. O executor é `harness/designRecreation/run.ts`; as evidências locais estão em `artifacts/design-recreation/2026-09-30T01-52-13-136Z/`. Não houve nova inferência: estes resultados não avaliam o prompt V2 nos dois exemplos V1 nem a taxa de acerto em referências novas.

**Resultados observados:**

- Os três PNGs reabertos tiveram SHA-256 idêntico ao respectivo PNG inicial neste navegador, com fontes incorporadas. Isso valida estabilidade deste percurso, sem provar equivalência entre navegadores nem o salvamento IndexedDB/tRPC.
- Brutalism conserva ordem e hierarquia textual, mas perde altura de letras, distribuição do traço separado e composição com prédios. Creative People conserva a decomposição básica, mas perde inclinação, altura dos títulos, contornos e cena inferior. As limitações geométricas V1 não foram reinterpretadas na reabertura.
- Na adaptação **TRUTH → CRIATIVIDADE**, a fonte caiu de **50,92 para 28,46 px** (aproximadamente 44,1%) enquanto a superfície ficou idêntica. Há camadas reutilizáveis, mas ainda não há um componente que relacione texto, fundo, margens e posição da pílula ABOUT.
- No papel rasgado, o suporte do texto foi corretamente declarado como `missingElements` essencial, porém sua ausência remove a ideia central. O sublinhado laranja perde contraste e a intenção de itálico existe nas notas, sem campo de estilo correspondente na extração/renderização diagnóstica.
- O PNG do papel saiu **736×969**, apesar da receita declarar **736×970**. A combinação de altura proporcional fracionária e `pixelRatio` em `exportPng4K` apresenta perda de um pixel neste caso. Corrigir e verificar dimensões explícitas na exportação diagnóstica antes de usar comparação pixel a pixel.

**Conclusão operacional:** desenvolver componentes relacionais pequenos e verificar sua adaptação a conteúdo novo. A reprodução estável de camadas foi demonstrada neste conjunto; a capacidade de montar bons posts com conteúdos novos ainda precisa desse passo. Ausências essenciais devem impedir aprovação de uma composição como completa, preservando a possibilidade de aprovar apenas uma peça independente.

##### Pipeline proposto

```text
Curador: imagem → receita diagnóstica → revisão → matriz/peça aprovada e versionada
Produto: conteúdo + identidade + mídia disponível
         → seleção compatível → composição determinística → CanvasPostModel
         → galeria → ajuste manual → salvamento/reabertura/exportação
```

A receita conserva a referência para diagnóstico. A matriz tem slots de conteúdo substituível e regras; palavras transcritas servem apenas como amostra. O post resultante guarda valores resolvidos e procedência, sem consultar ou reexecutar a receita da referência durante a edição. O `CanvasPostModel` permanece autoritativo.

##### Ordem de implementação proposta, sem conectar a geração nesta etapa

1. **Três componentes no laboratório:** tarja + texto + pílula ancorada; superfície de papel irregular com sombra + texto; região de foto com área de leitura reservada. Representar membro/parentesco, padding, alinhamento, rotação conjunta, limites de tamanho e política de overflow. Papel é aproximação procedural estável com seed; fotografia é asset substituível inteiro, sem recorte de pessoa, inpainting ou remoção de fundo. A LLM pode sugerir relações, mas componentes suportados e revisão determinam o que pode ser aprovado.
2. **Encaixe que preserve hierarquia:** incorporar a fonte antes de medir no mesmo `layoutRichText` do CanvasLab; representar normal/itálico e peso no contrato e no carregamento da fonte; distinguir caixa de composição da altura visual das letras. Tentar combinação preferida → combinação segura → adaptação dentro de limites → aviso. Não encolher indefinidamente: tamanho mínimo, número de linhas, proporção do destaque e padding são critérios. Alterar a superfície e reposicionar dependentes quando a regra permitir; nunca modificar um irmão sem uma relação explícita.
3. **Materialização editável isolada:** criar um adaptador puro de peça/matriz aprovada para `CanvasPostModel`, ainda acessível apenas pelo laboratório. `materializeReferenceDiagnostic` é uma prévia, não esse adaptador. Converter coordenadas de origem para a prancheta base 360, adaptar ao formato do produto e preservar conteúdo obrigatório. Começar com componentes compatíveis; rejeitar/advertir os não suportados, sem converter a composição inteira em bitmap.
4. **Edição e persistência no mesmo incremento:** estender apenas primitivas necessárias no modelo oficial. Hoje `extraShapes` é retângulo simples por slide, não selecionável; imagens extras são desenhadas após todos os textos e `zIndex` não organiza as categorias entre si. Implementar a ordem e seleção necessárias para colocar mídia atrás do texto e editar componente/membro. Registrar relações por IDs e regras junto dos valores resolvidos, sem duplicar o texto em dois lugares. Integrar ao fluxo de atualização/histórico do CanvasLab; manual override deve sobreviver a reabertura, troca de slide e undo/redo.
5. **Salvar antes de integrar à geração:** atualizar `normalizeCanvasModel`, contratos/versionamento, replicação de slides, restauração visual e exportação. Reabrir usa o documento salvo; não recompõe pela versão mais recente da matriz. Registrar ID/versão da peça ou Blueprint e assets/fontes resolvidos. Não embutir o pacote diagnóstico com todas as fontes/base64 em cada post: `fitSavePayload` limita requisições a 3,5 MB e só comprime imagens. Definir referências estáveis para assets/fontes. Nenhuma nova tabela é pré-requisito para provar o adaptador local.
6. **Entrada futura no Studio, após aprovação:** criar um único resolvedor compartilhado nos três caminhos de materialização — geração inicial, “gerar mais” e restauração de geração do histórico — junto a `variationToCanvasModel`, depois de `ensureDistinctFamilies` e antes da galeria. O adaptador atual usa defaults da família e não recebe camadas da receita; anexar JSON ao retorno da API sozinho não produzirá a composição. Preservar restrições de marca, contraste e termos obrigatórios, já tratados no pipeline. Seleção por compatibilidade/seed/versão, sem visão por post; fallback mantém o caminho atual. Gerações históricas precisam conservar a decisão de composição, para não trocar aparência quando o catálogo mudar.

##### Pontos de encaixe já existentes

| Responsabilidade | Ponto atual | Intervenção proposta |
|---|---|---|
| Curadoria privada | `shared/designRecreation.ts`, `server/designRecreation.ts`, `client/src/pages/Admin2/` | Relações, superfícies, estilo tipográfico e estados de aprovação; referência permanece privada. |
| Montagem do post | `client/src/pages/StudioApp/lib/studioGeneration.ts` | Adaptador explícito que recebe uma matriz compatível e devolve o documento oficial. |
| Render e edição | `CanvasLab/components/types.ts`, `CanvasPostStage.tsx`, `CanvasLabPage.tsx` | Poucas primitivas, ordem comum para os membros do componente, seleção e atualização pelo histórico existente. |
| Composição já disponível | `CanvasLab/lib/guidedComposition.ts` | Reutilizar o padrão de proposta pura → prévia → aplicação. Evitar que `composePost` genérico substitua silenciosamente fonte/estilo/posições da matriz. |
| Fundo e espaço de leitura | `CanvasLab/lib/imageGenerationContext.ts`, `GuidedBackgroundPanel.tsx` | Reaproveitar upload/geração existentes e ampliar contexto com região/foco/área protegida. `copySpace` atual é faixa vertical e só acompanha o prompt sugerido; prompt manual não recebe esse contexto. Isso orienta imagem nova, não garante coordenadas precisas. |
| Reabertura e tamanho | `CanvasLab/lib/saveAdapter.ts`, `fitSavePayload.ts` | Preservar novos campos conhecidos, valores resolvidos e assets, com round-trip verificado. |
| Geração backend | `server/ai/generationOrchestrator.ts` | Preservar Brand Guardian, diversidade e validações. Futuro plano de composição deve atravessar o contrato até o Studio; não adicionar outro gerador paralelo. |

##### Critérios de aceitação antes de ligar a `post.generate`

- Cada um dos três componentes aceita texto curto, longo e acentuado; respeita limites ou explica a incompatibilidade.
- Trocar texto reacomoda somente os membros vinculados e conserva destaque/legibilidade. A aprovação pertence à matriz e versão, não a uma frase de exemplo.
- A mídia fornecida ocupa sua região; texto usa suporte/área de leitura apropriados; a imagem original de referência não entra no post.
- Uma cor de texto é avaliada contra a superfície realmente atrás dela, inclusive papel/cartão, preservando as regras de contraste existentes.
- Prévia, editor e PNG exibem o mesmo documento e ordem de camadas. Dimensões exportadas são exatas.
- Salvar/reabrir, undo/redo, duplicar/replicar slide e mudar formato preservam relações e ajustes manuais ou pedem uma recomposição explícita.
- Testar o adaptador nas proporções oficiais `1:1`, `5:6` e `9:16`; as referências têm proporções livres e não podem ser simplesmente escaladas para qualquer formato.
- Sem mudança de autenticação, cobrança de Sparks ou publicação nesta fase. Persistência compartilhada e telemetria dependem de decisões posteriores; geração experimental continua privada.

**Referências selecionadas e executadas após autorização do usuário:** “Why Do You Actually Exist?” (`6da56cf3eb349b1ef42ab98eaf610f05.jpg`) como controle tipográfico; “Se eu pudesse te dar um atalho” (`94e0a100310160059384fb4c6ca5b2c4.jpg`) para foto de fundo e tarjas inclinadas; “I ask these Five questions first.” (`0623fb1c14937cd1e67e980b566710ba.jpg`) para papel como suporte de texto; “Trial & Error — CHALLENGE” (`1c2fb00a82a764bab2f4374d03f67886.jpg`) para cartões sobrepostos, sombras e foto em moldura. Essa seleção substitui a lista preliminar anterior. As três receitas anteriores permanecem como baselines locais. Caminhos, SHA-256, critérios e autorização registrados em `artifacts/design-recreation/next-selection.json`.

##### Resultado das quatro novas decodificações

Execução `artifacts/design-recreation/2026-09-30T02-19-47-618Z/`, com relatório `relatorio.md`, comparação visual independente `comparacao.html` e métricas `summary.json`. O usuário autorizou “pode rodar”. Foi usado o pipeline atual sem alterar prompt/schema: `prepareReference` → `decodeRecreation` → `finalizeRecipe` → `CanvasPostStage`. Uma chamada por imagem, sem retries nem fallback, DeepSeek V4.1 Flash / OpenRouter / Together.

| Caso | Camadas | Tempo da decodificação | Tokens entrada / saída | Achado principal |
|---|---:|---:|---:|---|
| Tipográfico | 19 | 23,24 s | 1.327 / 8.999 | Estrutura aproveitável; círculo preto com número preto; encaixe fragmenta tamanhos de uma mesma frase. |
| Foto e tarjas | 10 | 23,80 s | 1.327 / 8.960 | Rotações zero e pesos uniformes; inscrição do bonde vira camada editorial indevida. |
| Papel | 19 | 25,88 s | 1.327 / 10.982 | Suporte essencial ausente; fonte larga em título condensado; oval preenchido esconde texto. |
| Cartões | 40 | 26,67 s | 1.926 / 11.588 | Composição reconhecível; foto ausente, fontes e proporções ainda divergentes. |

As quatro respostas passaram pelo schema; as 16 solicitações de fonte/peso foram incorporadas e carregadas. As quatro reaberturas conservaram JSON e hash PNG. Os três primeiros PNGs perderam um pixel de altura (920 → 919); o último saiu 1200×1500 corretamente. Total informado: 5.907 tokens de entrada e 40.529 de saída. Não foi estimado custo em moeda. Latência mede o serviço de decodificação, antes de fontes/encaixe.

**Refinamento de prioridades:**

1. Acrescentar preenchimento transparente/nulo e verificar contraste sobre a superfície real: nos casos 1 e 3, o texto foi transcrito, mas desapareceu sobre uma forma preenchida com a mesma cor. Corrigir a dimensão de exportação no mesmo incremento de confiabilidade do renderer.
2. Representar trechos com cor/peso diferentes mantendo tamanho e linha de base compartilhados. No caso 1, três trechos inicialmente com 24 px terminaram com 18,29 / 17,11 / 24 px pelo encaixe independente. É evidência direta de que apenas separar palavras em camadas não resolve reutilização.
3. Melhorar extração de rotação e atribuição semântica: texto presente em uma fotografia pertence ao asset quando não for conteúdo editorial. `PAULA MATTOS` foi reconhecido como inscrição do bonde nas notas, mas o código visual ainda o criou como texto independente.
4. Classificar condensação/proporção e confrontar a família proposta: no papel, a escolha de Archivo Black e os tamanhos iniciais já perdem a altura visual antes do ajuste. Apenas mudar o encaixe não basta.
5. Priorizar superfícies de leitura aproximadas e componentes vinculados. A matriz de cartões fornece um caso promissor; a composição de papel ainda não é adequada para aprovação. Manter o próximo incremento no laboratório, antes da materialização/integração do produto descrita acima.

Schema válido e reabertura idêntica não equivalem a adaptação visual aprovada. Este conjunto não compara modelos nem mede taxa geral de acerto. Autenticação, tRPC, IndexedDB e persistência de posts não foram exercitados no executor isolado.

Decisões confirmadas:

- O mecanismo de curadoria será um painel privado em `/admin`, acessível somente por administrador.
- As postagens encontradas são referências temporárias de estudo. Elas não integram o arsenal do produto e não serão transformadas em templates ou posts editáveis.
- O arsenal guarda abstrações reutilizáveis: Peças, Blueprints e regras de composição.
- Recorte de pessoas/objetos, remoção de fundo e sobreposições que dependam dessas operações ficam fora desta etapa.
- O usuário final não vê referências, análises, JSONs, Peças ou Blueprints. Ele recebe somente variações materializadas como `CanvasPostModel`.
- A arquitetura será validada no laboratório com uma reconstrução diagnóstica de cada referência e três Blueprints manuais. A ligação com `post.generate` permanece suspensa até essa validação.
- A decodificação salva deve conter uma receita visual suficiente para reconstruir a referência estudada no laboratório, sem usar a imagem original como fundo. Essa receita não é uma Peça, um Blueprint, um post editável nem um item da biblioteca do usuário.

Checkpoint implementado em 2026-09-28:

- nova aba **DNA de composição** em `/admin`;
- análise multimodal administrativa com GPT-4o por padrão e JSON Schema estrito;
- hipótese tipográfica com traços visuais; o catálogo Fontsource/Google Fonts verifica disponibilidade e licença, mas não comprova semelhança visual;
- validação geométrica determinística posterior à análise;
- revisão local de Peças com constraints, confiança e auto-aprovação síncrona;
- três Blueprints manuais e compilador com fallback hierárquico;
- comparação visual entre entropia zero e parâmetros aplicados, ambas no `CanvasPostStage`;
- rascunho local no navegador, sem banco e sem persistência da imagem;
- nenhuma conexão com `post.generate`.

OpenCV, YOLO, persistência compartilhada, telemetria agregada e integração com a geração continuam planejados para etapas posteriores. O OCR V2 usa `tesseract.js` e a medição de pixels usa `@napi-rs/canvas`.

Checkpoint V2 em 2026-09-29:

- contrato `ReferenceReconstructionSpecV2` estrito com camadas em pixels, efeitos tipográficos, incertezas, procedência e fontes incorporadas;
- diagnóstico renderizado no `CanvasPostStage` nas dimensões originais, inclusive texto em arco, extrusão e ordem livre de camadas;
- análise multimodal granular com OCR por linhas e medição clássica de cobertura/pixels; falhas e ausências permanecem visíveis;
- edição das camadas, comparação global e por região, aprovação ligada ao hash da receita e inventário manual inicial do primeiro caso;
- IndexedDB V2 com receita/snapshot/baseline e pacote ZIP de reprodução sem a imagem de referência; V1 preservado como histórico;
- peso numérico corrigido em `layoutRichText` e campos materiais preservados no `saveAdapter`.

A execução do primeiro caso com modelo, OCR, fontes e revisão humana ainda precisa ocorrer no ambiente do administrador. Os limiares de similaridade são provisórios e não substituem a conferência de transcrição, tipografia e efeitos. A cena manual é um ponto de partida com incertezas declaradas, não uma reprodução já aprovada.

### Instalação local do OCR

Na raiz do projeto, execute `pnpm install`. A dependência `tesseract.js` roda no servidor Node e usa WASM; o binário Linux `tesseract` não é chamado pelo PostSpark. `@napi-rs/canvas` já é dependência do projeto. OpenCV e YOLO ainda não precisam ser instalados para este fluxo.

Por padrão, o Tesseract.js obtém os dados de inglês (`eng`) e português (`por`) do CDN no primeiro uso e mantém cache. Para executar sem essa busca de rede, coloque `eng.traineddata.gz` e `por.traineddata.gz` no mesmo diretório, defina `DESIGN_DNA_OCR_LANG_PATH` no `.env` para o caminho absoluto desse diretório e reinicie o servidor. Se o OCR falhar, o painel continua a análise e mostra o aviso de indisponibilidade; a conferência manual do texto continua necessária.

Correção de rumo em 2026-09-29: a primeira prévia encaixava a análise em três geometrias fixas e podia usar a referência inteira como fundo. Isso não verificava a decodificação. O laboratório agora parte das caixas e superfícies de cor extraídas, permite corrigir coordenadas e transcrição, mostra referência e CanvasLab lado a lado e só libera a aprovação das Peças depois de confirmação visual do administrador. As fontes sugeridas deixaram de exibir pontuações que não eram semelhança visual medida; há comparação de letras e busca pelo nome no catálogo aberto. A prévia diagnóstica não é salva como post.

Etapa intermediária de avaliação em 2026-09-29: o painel arquiva separadamente cada decodificação em IndexedDB no navegador do administrador, incluindo uma cópia local da referência preparada, a resposta original do modelo e os ajustes de curadoria. O rascunho ativo permanece no `localStorage`. Um pacote JSON versionado exporta análise original, análise ajustada, escolhas e reconstrução determinística, sem embutir a imagem; para revisão nesta conversa, o curador envia o post original e esse JSON. Esse arquivo local não é o arsenal do produto e não substitui a persistência futura no banco. Limpar dados do site pode removê-lo.

## 0. Correção prioritária — reproduzir a referência a partir dos dados salvos

### 0.1 Diagnóstico que muda a ordem do trabalho

A primeira avaliação real (`NO / SKILL, / NO / SEAT.`, imagem de 735 × 919 px) mostrou uma falha estrutural. A análise registrou um título uniforme centralizado e duas superfícies retangulares, enquanto a referência tem quatro linhas grandes, cores alternadas, contorno escuro, extrusão angular, texto em arco e vertical, filete e rodapé editorial. O título ocupa a maior parte da altura; o corpo fica somente no rodapé. A análise ainda marcou a geometria como válida porque verificou limites de caixas, não concordância com a imagem. O compilador trocou a proporção próxima de 4:5 por 5:6 e produziu uma prévia distante da referência. O JSON exportado contém essa prévia, mas o registro do IndexedDB não congela uma receita renderizável; reabrir recompila com o código atual.

**Meta da correção:** depois de salvar e fechar a sessão, abrir ou importar a decodificação e reconstruir o design no mesmo motor do CanvasLab, sem usar os pixels da referência como camada. A reconstrução precisa preservar os elementos visualmente determinantes. A referência arquivada serve somente à comparação. Fidelidade à referência e repetibilidade a partir do arquivo são verificações separadas: uma prévia pode ser estável e ainda estar errada.

### 0.2 Contrato autoritativo do diagnóstico

Introduzir `ReferenceReconstructionSpecV2`, fechado e validado, como **fonte da verdade da reprodução diagnóstica**. `DesignDnaAnalysis` bruto permanece evidência imutável; ajustes humanos produzem uma versão curada da receita. O `CanvasPostModel` materializado é um derivado para prévia/exportação, identificado pelo hash da receita que o gerou; se o hash divergir, o snapshot fica inválido. `CanvasPostModel` continua sendo a fonte da verdade para posts reais no produto. Peças e Blueprints são abstrações derivadas depois da conferência visual, não a receita da referência.

A receita V2 deve conter, com IDs estáveis e ordem explícita de camadas:

| Grupo | Dados necessários |
| --- | --- |
| Prancheta | largura e altura originais, fundo, espaço de coordenadas em pixels e transformação normalizada derivada; nenhuma conversão implícita de 4:5 para 5:6 |
| Texto | blocos, linhas e trechos independentes, transcrição literal, quebras explícitas, ordem de leitura, posição, largura, altura, alinhamento, rotação, cor e opacidade por trecho |
| Tipografia | família escolhida, peso numérico real, variante, tamanho, entrelinha, tracking, caixa do glifo, contorno com cor/espessura e efeito de extrusão com cor, direção e profundidade |
| Formas | retângulo, linha, polígono/caminho simples e ícone vetorial; geometria, preenchimento, traço, opacidade e camada; nenhuma inferência de máscaras ou recortes de objetos |
| Texto especial | orientação vertical e texto sobre arco/caminho com raio/centro/ângulos ou posições de glifos, sem reduzir a curva a uma única rotação |
| Dependências | manifesto de fontes e de qualquer asset permitido, com versão, origem, licença, hash e fallback declarado; ausência do asset bloqueia o status de reprodução completa |
| Evidência | vínculo por hash com imagem original e versão preparada, proveniência e confiança por elemento, campo explícito para texto ilegível/desconhecido, warnings e versões de schema, analisador, compilador e renderer |

Os efeitos devem ser parâmetros reproduzíveis, não apenas uma nota de “entropia”. A extrusão tipográfica do exemplo é um efeito de texto/vetor, sem remoção de fundo. Se um detalhe visual não couber numa primitiva suportada, a receita o marca como `unsupported` com sua região e importância; a reconstrução não recebe status de aprovada por aproximação silenciosa. O texto não pode ser inventado para preencher trechos ilegíveis.

### 0.3 Caminho de correção, em dependência

1. **Fixar o caso de referência.** Registrar um inventário manual das camadas e textos observáveis do exemplo, com regiões e ordem: quatro linhas do título, cores marfim/amarelo, contorno/extrusão, anotação vertical, frase em arco, filete, aspas, citação, referência bíblica e marca inferior. Isso define a primeira meta de comparação, sem promover ainda Peças genéricas.
2. **Fechar schema e motor de reprodução.** Criar o contrato V2 e um adaptador determinístico `ReferenceReconstructionSpecV2 → CanvasPostStage`. Permitir proporção exata no modo diagnóstico e implementar as primitivas necessárias ao exemplo, inclusive camadas ordenadas, contorno/extrusão, formas simples e texto em arco/vertical. Reaproveitar `layoutRichText` e `RichTextRenderer`; corrigir a interpretação de pesos numéricos para que medição e desenho usem a mesma fonte, peso e quebra de linha. O modo diagnóstico permanece efêmero e privado.
3. **Salvar antes de reanalisar.** Migrar o arquivo local para V2 preservando os registros V1, mas marcando-os `legacy_needs_review`. Salvar atomicamente imagem de evidência preparada, saída original, receita curada, `CanvasPostModel` materializado, manifesto de fontes/assets, versões, resultado da validação e decisão humana. Ao reabrir, mostrar primeiro a receita e o snapshot salvos; recompilar somente por ação explícita, indicando se a versão atual alteraria o resultado. Corrigir também o round-trip em `saveAdapter` dos campos materiais usados na prévia, sem persistir a referência como post do usuário.
4. **Medir e decodificar por elemento.** OCR deve devolver linhas, caixas, orientação e texto com confiança; OpenCV deve medir massas de cor, bordas, filetes, contornos e regiões de extrusão; o modelo multimodal atribui papéis e sugere propriedades visuais no schema estrito. Reconciliar cada hipótese com pixels e medições. Peças só são extraídas após uma receita executável, evitando títulos genéricos de alto `confidenceScore` quando elementos dominantes ficaram ausentes.
5. **Comparar a reconstrução.** Renderizar a receita salva no `CanvasPostStage`, comparar com a referência por regiões alinhadas e registrar cobertura de elementos, texto/OCR, caixas, cores dominantes, bordas e tipografia. Comparar também o resultado reaberto/importado com o render congelado. Falhas de elementos essenciais aparecem como incompatibilidade, não como `valid` por estar dentro do canvas.
6. **Curar e generalizar.** O painel oferece correção de cada camada, texto, geometria e estilo, com sobreposição visual e histórico. Somente após o caso estar fiel e reprodutível, avaliar 3 a 5 referências de estilos diferentes; então derivar Peças e Blueprints transferíveis e revisar as regras de autoaprovação. Não conectar ao `post.generate` nesta correção.

### 0.4 Pacote salvo e portabilidade

O registro V2 do IndexedDB e o pacote exportável devem conter a mesma receita autoritativa. Exportar e importar um pacote versionado com `spec.json`, snapshot materializado, manifesto e arquivos de fontes/assets necessários e licenciados. A imagem original pode acompanhar um pacote de **avaliação** separado, mas não é dependência da renderização; o pacote de reprodução deve funcionar sem ela. Quando um asset essencial não puder ser incluído, registrar a dependência pendente e impedir a classificação “autossuficiente”. A prévia PNG salva pode servir de baseline de comparação, nunca de fundo da reconstrução. O JSON V1 já exportado continua legível como evidência histórica, mas não ganha retroativamente o status de receita completa.

### 0.5 Critério objetivo para este primeiro post

O caso só passa quando o pacote salvo, após reabertura/importação, renderiza em 735 × 919 px ou na mesma proporção exata; preserva as quatro linhas e suas quebras, cores alternadas, contorno e extrusão visíveis; mantém anotação vertical, texto curvo e rodapé com filete, aspas, citação e referência. A fonte pode ser aproximada, desde que a escolhida esteja identificada e reproduzível, e a diferença visual seja declarada. Texto parcialmente ilegível permanece marcado como tal. A aprovação exige comparação lado a lado e métricas por região, além de confirmação humana. O resultado não precisa ser publicado nem salvo como post editável.

## 1. Objetivo e veredito

O objetivo é estudar uma série de postagens consideradas visualmente boas e decodificar pequenas decisões de design que possam ser reutilizadas e combinadas pelo PostSpark. Para comprovar a decodificação, o laboratório deve reconstruir temporariamente a estrutura de cada referência no CanvasLab e comparar as duas imagens. Essa reconstrução diagnóstica não transforma a postagem original em post editável ou item da biblioteca. Após a conferência, as decisões aprovadas ampliam a gramática visual disponível para composições novas.

Exemplos do que pode ser extraído:

- proporção e posição de áreas de texto;
- hierarquia entre título, apoio e CTA;
- margens, alinhamentos e ritmo de espaçamento;
- relação entre imagem e área de leitura;
- estratégias de contraste, overlay e distribuição de cores;
- rotações, assimetrias, ruído, sombras duras e outras formas controladas de quebra de padrão;
- tarjas, linhas, badges, caixas e ornamentos simples já suportados pelo CanvasLab.

JSON válido, confiança declarada por um modelo e semelhança com a referência não bastam para aprovar uma Peça. O resultado precisa ser geometricamente verificável, compatível com o renderer e útil quando combinado com conteúdo diferente.

## 2. Jornada proposta

### Curadoria interna

Enviar referências → medir com visão computacional → analisar semanticamente com modelo multimodal → validar por elemento → salvar a receita de reconstrução → reproduzir e comparar → corrigir no painel → extrair e revisar Peças candidatas → visualizar efeitos de entropia → combinar em Blueprints → aprovar e publicar no arsenal.

### Usuário final

Escrever o assunto → `post.generate` produzir a copy → sistema escolher um Blueprint compatível → compilador materializar a composição → galeria exibir variações → usuário personalizar no CanvasLab → salvar/exportar.

Não há etapa nova obrigatória para o usuário e nenhum contrato interno é exibido na interface do Studio.

O custo das análises internas pertence à curadoria e não debita Sparks do usuário. A geração de imagens solicitada pelo usuário conserva a cobrança existente.

## 3. Objetos e responsabilidades

| Objeto | Responsabilidade | Consumidor |
| --- | --- | --- |
| ReferenceInput | Imagem temporária usada como material de estudo | Pipeline interno de análise |
| DesignObservation | Evidências semânticas e geométricas, incertezas e parâmetros observados | Curadoria e extrator de Peças |
| ReferenceReconstructionSpecV2 | Cena visual curada e versionada que reconstrói uma referência somente no laboratório | Renderer diagnóstico, arquivo local e comparação |
| CompositionPiece | Uma decisão visual pequena, versionada e combinável | Curadoria, validador e Blueprints |
| CompositionBlueprint | Combinação curada de Peças e regras de adaptação | Compilador determinístico |
| CanvasPostModel | Post materializado, editável e persistido | Galeria, editor, histórico e exportação |

A referência não é um item do arsenal. No arquivo intermediário do laboratório, a versão preparada da imagem permanece como evidência enquanto o registro existir; o pacote de reprodução usa a receita e seus assets próprios. Na persistência compartilhada futura, a imagem de referência pode ser removida após o período de revisão conforme a política de retenção; a receita e as abstrações aprovadas continuam independentes dela.

O `CanvasPostModel` continua sendo o documento autoritativo do post. Uma alteração futura em uma Peça ou Blueprint não reescreve posts salvos. O modelo materializado preserva os valores necessários à reabertura e registra somente a proveniência da composição.

Design DNA e Brand DNA têm responsabilidades distintas. Design DNA governa composição; Brand DNA representa identidade de marca. Cores e fontes observadas em referências são sugestões estruturais e podem ser substituídas pela identidade escolhida para o projeto.

## 4. Análise estruturada das referências

### 4.1 Interface administrativa

A primeira interface será a procedure administrativa `designDna.analyze`, protegida por `adminProcedure`. `/dnapost` poderá existir futuramente como adaptador HTTP do mesmo serviço apenas se surgir um consumidor externo concreto.

Entrada:

- asset temporário validado no servidor;
- dica de categoria opcional, tratada somente como sugestão;
- perfil de análise e modelos definidos no servidor;
- versões do schema, prompt e pipeline geométrico;
- validação estrita sempre ativa.

O upload deve validar acesso, existência, tamanho, dimensões e tipo real dos bytes. Se houver suporte futuro a URL externa, o servidor validará protocolo, destino, redirecionamentos, limite de bytes, resolução e tempo de download.

### 4.2 Pipeline híbrido

#### Etapa A — preparação da imagem

- decodificar o tipo real;
- corrigir orientação EXIF sem alterar a proporção visual;
- registrar dimensões originais e hash do conteúdo;
- criar uma versão de trabalho normalizada, mantendo vínculo com as coordenadas originais;
- impedir que textos visíveis na imagem sejam tratados como instruções de sistema.

#### Etapa B — visão computacional clássica

Usar visão computacional para medições geométricas reproduzíveis:

- **OpenCV**: bordas, linhas dominantes, blocos de cor, contraste local, sombras, ruído aparente, ângulos, alinhamentos e espaços vazios;
- **OCR**: texto reconhecido por linha e palavra, caixas, orientação, agrupamentos, densidade, ordem de leitura e confiança; diferença entre texto ausente, ilegível e não detectado;
- **YOLO ou detector equivalente**: caixas de pessoas, produtos e objetos relevantes para estimar área ocupada e relação com a área de leitura.

YOLO será usado para detecção e medição de regiões. Esta etapa não inclui segmentação, recorte, remoção de fundo nem geração de máscaras executáveis.

A escolha concreta de biblioteca OCR, variante de YOLO e forma de executar OpenCV precisa ser provada no ambiente de deploy antes de virar dependência permanente. O pipeline permanece síncrono e administrativo; não introduz fila, cron ou worker dedicado.

#### Etapa C — análise multimodal semântica

Usar um modelo multimodal com visão, preferencialmente uma configuração GPT-4o ou Claude compatível com imagem e saída estruturada, para:

- classificar estilo e clima visual;
- descrever hierarquia e intenção de leitura;
- atribuir papéis às regiões medidas;
- identificar estratégias de composição;
- propor Peças candidatas;
- descrever assimetrias e quebras de padrão que não sejam capturadas apenas por bordas e OCR.

O modelo efetivo será configurado no servidor e roteado pela infraestrutura existente de `invokeLLM`. A adequação entre GPT-4o, Claude e outros modelos multimodais compatíveis será avaliada por referências reais; o contrato não ficará preso a um slug de modelo.

#### Etapa D — Validação Geométrica

Depois da análise multimodal, executar `validateGeometry()` para reconciliar as hipóteses semânticas com as medições clássicas:

1. converter todas as caixas para o mesmo espaço normalizado;
2. comparar caixas semânticas com OCR, linhas e objetos detectados;
3. verificar limites, rotação, relações espaciais, sobreposição e bleed declarado;
4. confrontar cada região e cor com pixels, bordas e cobertura da imagem de referência; incluir texto pequeno, rodapé e efeitos de alto impacto;
5. registrar divergências acima das tolerâncias versionadas;
6. recalcular `confidenceScore` a partir de concordância entre fontes e cobertura de elementos salientes;
7. rejeitar ou rebaixar candidatos geometricamente inconsistentes ou cenas com elementos salientes ausentes;
8. encaminhar ambiguidades à revisão humana sem clamp silencioso.

A confiança final não será apenas a confiança autodeclarada pelo LLM. Ela combinará evidências do modelo multimodal, OCR, OpenCV, detector de objetos e validação do curador. A fórmula e os pesos serão versionados.

#### Etapa E — extração de Peças candidatas

Depois da Validação Geométrica, o modelo entrega **hipóteses de camadas**; um montador determinístico, seguido da revisão humana, produz a receita diagnóstica executável. A saída do modelo não é tomada como cena final sem reconciliação. O pipeline só converte observações em pequenas Peças candidatas depois que a reconstrução da referência foi renderizada, comparada e aprovada. Características que exigem capacidades ausentes do CanvasLab ficam registradas em `warnings` e não viram Peças executáveis nesta etapa.

### 4.3 Schema JSON rigoroso — V1 histórico e V2 de reprodução

`designDna.analyze` usa `response_format.type = "json_schema"`, `strict: true`, `additionalProperties: false` em todos os objetos e validação no servidor. O contrato conceitual V1 abaixo descreve observações e Peças; **ele não é suficiente para reconstruir uma referência**. A correção introduz o contrato V2 fechado da seção 0.2 e não interpreta registros V1 como receitas completas.

```ts
type PieceKindV1 =
  | "structure"
  | "typography"
  | "media"
  | "color"
  | "decoration"
  | "entropy"
  | "rule";

type PiecePayloadV1 =
  | {
      type: "structure";
      regions: Array<{
        role: string;
        box: { x: number; y: number; width: number; height: number };
        rotationDeg: number | null;
      }>;
      relations: string[];
    }
  | {
      type: "typography";
      role: "headline" | "support" | "cta";
      relativeSize: number;
      lineHeight: number;
      maxLines: number;
      alignment: "left" | "center" | "right";
    }
  | {
      type: "media";
      box: { x: number; y: number; width: number; height: number };
      fit: "cover" | "contain";
      requiresImage: boolean;
    }
  | {
      type: "color";
      roles: Array<{ role: string; hex: string }>;
      overlayOpacity: number;
    }
  | {
      type: "decoration";
      primitive: "line" | "bar" | "badge" | "box" | "shadow";
      box: { x: number; y: number; width: number; height: number };
      rotationDeg: number;
    }
  | {
      type: "entropy";
      asymmetryScore: number;
      gridDeviationScore: number;
      rotationDeg: number;
      noiseIntensity: number;
      hardShadowIntensity: number;
    }
  | {
      type: "rule";
      ruleType: "min-gap" | "safe-margin" | "max-lines" | "priority";
      value: number;
      targetRoles: string[];
    };

interface CompositionPieceCandidateV1 {
  candidateId: string;
  kind: PieceKindV1;
  name: string;
  payload: PiecePayloadV1;
  constraints: {
    requires: string[];
    conflictsWith: string[];
  };
  evidenceRegionIds: string[];
  confidenceScore: number;
}

interface DesignObservationV1 {
  analysisId: string;
  schemaVersion: 1;
  reference: {
    contentHash: string;
    widthPx: number;
    heightPx: number;
    mimeType: string;
  };
  regions: Array<{
    id: string;
    role: "headline" | "support" | "cta" | "image" | "subject" | "background" | "decoration" | "unknown";
    box: { x: number; y: number; width: number; height: number };
    rotationDeg: number | null;
    bleed: boolean;
    source: Array<"multimodal" | "opencv" | "ocr" | "detector" | "curator">;
    confidenceScore: number;
  }>;
  hierarchy: {
    readingOrder: string[];
    density: "low" | "medium" | "high";
    alignment: "left" | "center" | "right" | "mixed";
  };
  entropy: {
    overallScore: number;
    asymmetryScore: number;
    gridDeviationScore: number;
    irregularSpacingScore: number;
    rotation: {
      dominantAngleDeg: number | null;
      dispersionDeg: number | null;
      affectedRegionIds: string[];
    };
    noise: {
      present: boolean;
      kind: "grain" | "speckle" | "paper" | "digital" | "unknown" | null;
      intensity: number;
      scale: number | null;
    };
    hardShadows: {
      present: boolean;
      offsetX: number | null;
      offsetY: number | null;
      blur: number | null;
      opacity: number | null;
      color: string | null;
    };
  };
  paletteRoles: Array<{ role: string; hex: string; coverage: number }>;
  typography: Array<{
    regionId: string;
    familyClass: string | null;
    relativeSize: number | null;
    lineHeight: number | null;
    weightClass: string | null;
  }>;
  candidatePieces: CompositionPieceCandidateV1[];
  unknowns: string[];
  warnings: string[];
  metadata: {
    requestedModel: string;
    effectiveModel: string | null;
    effectiveProvider: string | null;
    promptVersion: string;
    geometryPipelineVersion: string;
    durationMs: number;
    usage: unknown | null;
  };
}
```

Todos os scores ficam no intervalo `[0,1]`. Rotações usam graus. Caixas, offsets, blur e escalas geométricas observadas usam coordenadas normalizadas quando o campo não termina em `Px` ou `Deg`.

“Entropia” representa quebra de regularidade visual controlável no compositor. Não será apresentada como entropia estatística de Shannon sem um cálculo específico. Cada parâmetro deve ter semântica visual e consumidor no renderer; campos sem consumidor ficam como observação até serem suportados.

## 5. O que extrair

A **receita diagnóstica** registra todos os elementos observáveis necessários para reconstruir a referência, inclusive textos pequenos, formas e efeitos que não serão transferidos ao produto. Dela, extrair para o arsenal somente propriedades que possam apoiar busca, curadoria ou composição:

- regiões de título, apoio, CTA, imagem, fundo e decoração;
- caixas normalizadas, alinhamento, ordem visual e relações entre regiões;
- área de leitura e área ocupada por objetos, mantidas separadamente;
- tipografia relativa, entrelinha, largura de bloco e limite aparente de linhas;
- margens, separações mínimas e ritmo espacial;
- papéis das cores e pares relevantes para contraste;
- rotação por elemento e bleed intencional;
- assimetria, desvio de grid, espaçamento irregular, ruído e sombras duras;
- dependência de fotografia ou ilustração;
- formatos, densidades e papéis de slide compatíveis.

Uma imagem achatada não revela com certeza fonte exata, blend mode, opacidade original ou processo de produção. O pipeline registra a aparência observável e escolhe uma técnica suportada somente na Peça ou Blueprint.

## 6. Peças do arsenal

Uma `CompositionPiece` representa uma pequena decisão visual reutilizável, sem carregar a referência original:

```ts
interface CompositionPieceV1 {
  id: string;
  version: number;
  kind: PieceKindV1;
  name: string;
  payload: PiecePayloadV1;
  constraints: {
    requires: string[];
    conflictsWith: string[];
  };
  confidenceScore: number;
  supportedAspectRatios: Array<"1:1" | "5:6" | "9:16">;
  supportedDensities: Array<"low" | "medium" | "high">;
  sourceAnalysisIds: string[];
  status: "draft" | "approved" | "archived";
  approvalMode: "manual" | "auto_approved" | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
}
```

O JSON Schema de runtime expressará `PiecePayloadV1` como união discriminada e fechada, exigindo que `kind` e `payload.type` coincidam. `Record<string, unknown>` e payloads livres não serão aceitos por `designDna.analyze`; cada variante terá campos obrigatórios, nulabilidade explícita e `additionalProperties: false`.

`constraints.requires` lista capacidades ou outras Peças obrigatórias. `constraints.conflictsWith` lista capacidades, Peças ou condições que tornam a combinação inválida. IDs e vocabulário de capabilities serão fechados e versionados, evitando strings livres contraditórias.

`confidenceScore` fica entre `0.0` e `1.0` e guarda a confiança consolidada depois da Validação Geométrica. Mudanças manuais preservam o valor anterior no histórico e registram a nova origem.

### 6.1 Regra de auto-aprovação

Uma Peça candidata é promovida para `approved` com `approvalMode: "auto_approved"` quando:

- `confidenceScore > 0.9`;
- não recebeu revisão humana durante 7 dias completos;
- passou pela Validação Geométrica;
- a reconstrução diagnóstica foi confirmada visualmente pelo administrador;
- a receita salva foi reaberta e reproduzida sem a imagem de referência como camada;
- os elementos determinantes da Peça têm suporte no renderer e passaram pela comparação por região;
- suas capacidades exigidas são suportadas;
- não possui conflito impeditivo nem warning de procedência pendente.

Como o repositório não usa cron, fila ou worker, a promoção será avaliada de forma síncrona pelo serviço de domínio na primeira listagem administrativa ou carregamento do arsenal aprovado após o prazo. A transição será idempotente, auditável e reversível por arquivamento. Peças autoaprovadas aparecem destacadas no painel para revisão posterior.

## 7. Blueprints

Um `CompositionBlueprint` é uma combinação curada de Peças com regras de adaptação. Ele não corresponde a uma referência individual e pode reunir decisões provenientes de várias análises.

Cada Blueprint define:

- IDs e versões das Peças;
- formatos, densidades e papéis de slide compatíveis;
- requisitos de imagem;
- prioridades e relações geométricas;
- limites de linhas e fontes mínimas;
- parâmetros de entropia permitidos;
- regras de adaptação;
- fallback seguro;
- status e versão imutável quando publicado.

### 7.1 Três Blueprints manuais iniciais

Antes da extração multimodal, implementar três Blueprints hardcoded usando apenas capacidades atuais do CanvasLab:

1. `manual-editorial-asymmetry`: título deslocado, área de leitura ampla, barra de acento e assimetria leve;
2. `manual-image-reading-zone`: imagem de fundo, zona sólida/overlay para leitura e texto compacto;
3. `manual-controlled-disruption`: rotação pequena em decoração, desvio controlado de grid, sombra dura e contraste alto.

Eles exercitam composição, constraints, entropia, medição textual, fallback, persistência e telemetria sem depender do pipeline de visão.

## 8. Compilador determinístico

O compilador recebe Blueprint, conteúdo, formato, identidade visual, mídia disponível e capacidades do renderer. Ele devolve um `CanvasPostModel` materializado ou incompatibilidades acionáveis.

Há dois trabalhos relacionados e distintos: **reconstruir** a receita de uma referência com conteúdo e proporção fiéis, para verificação interna; e **compor** conteúdo novo a partir de Peças e Blueprints, com adaptação. Ambos usam o `CanvasPostStage` e o mesmo mensurador tipográfico, mas o compilador de Blueprints não pode substituir a receita de reprodução nem reduzir suas camadas a uma headline e dois retângulos. Aprovar ou rejeitar uma Peça não altera retroativamente a receita já salva.

```ts
compileComposition({
  blueprint,
  content,
  aspectRatio,
  brandStyle,
  assets,
  rendererCapabilities,
}): {
  canvasModel?: CanvasPostModel;
  appliedBlueprintId?: string;
  fallbackLevel: "preferred" | "safe" | "adapted" | "warning";
  warnings: CompositionWarning[];
  incompatibilities: CompositionIssue[];
}
```

### 8.1 `validateCompatibility()`

Antes de compor, `validateCompatibility()` verifica:

- todas as entradas de `constraints.requires`;
- todas as entradas de `constraints.conflictsWith`;
- formato e densidade textual;
- presença e tipo de mídia;
- fontes disponíveis;
- limites de linhas e tamanhos mínimos;
- capacidades reais do `CanvasPostStage`;
- compatibilidade entre Peças do mesmo Blueprint;
- suporte dos parâmetros de entropia solicitados.

Nenhuma incompatibilidade será resolvida descartando silenciosamente uma característica essencial.

### 8.2 Medição tipográfica única

O compilador, o adaptador da receita e o `CanvasPostStage` usarão o mesmo motor canônico `layoutRichText` e a mesma configuração de fonte, peso, tamanho, entrelinha, letter spacing, largura e chunks ricos. O motor atual interpreta `fontStyle` numérico como peso normal em certos caminhos; corrigir e versionar essa semântica antes de comparar fontes ou aceitar reconstruções. Medição e renderização só são válidas depois do carregamento da mesma fonte/variante. A eventual integração ao produto executará a materialização após `post.generate` no cliente, onde o mesmo mensurador está disponível.

Se o compilador for movido para o servidor, o algoritmo de layout continuará compartilhado e receberá um mensurador baseado em `fontkit`, validado contra o mensurador do browser. Não será mantida uma segunda implementação independente de quebra de linha.

O compilador pode reduzir tamanhos somente dentro dos limites editoriais declarados pelo Blueprint. Ele não corta, resume ou reescreve a copy silenciosamente.

### 8.3 Fallback hierárquico

Aplicar a seguinte ordem:

1. **combinação preferida**: Blueprint selecionado e todas as Peças previstas;
2. **combinação segura**: Blueprint alternativo compatível para o mesmo formato, densidade e mídia;
3. **adaptação**: ajustes autorizados de largura, posição, tamanho e intensidade de entropia dentro dos limites do Blueprint;
4. **warning**: materialização pelo layout seguro oficial, com warning estruturado e proveniência do fallback.

Cada mudança de nível é registrada. O usuário recebe uma composição utilizável; diagnóstico detalhado fica na telemetria e no painel administrativo.

## 9. Painel interno de curadoria

O painel será incorporado ao `/admin` existente e protegido no cliente e no servidor. Ele terá áreas para:

- sessões e referências temporárias;
- análise e Validação Geométrica;
- Peças candidatas, aprovadas, autoaprovadas e arquivadas;
- editor de constraints;
- montagem e versionamento de Blueprints;
- prévias com conteúdo curto, longo, com imagem e sem imagem;
- telemetria de uso e resultado.

### 9.1 Visualização de caos e entropia

O painel deve tornar explícito o efeito de cada parâmetro:

- preview lado a lado com valor zero e valor aplicado;
- sliders ou campos numéricos para rotação, assimetria, desvio de grid, irregularidade de espaçamento, ruído e sombra dura;
- overlay de caixas, eixos, grid e ângulos detectados;
- indicação da fonte de cada medida: multimodal, OpenCV, OCR, detector ou ajuste humano;
- valor observado, valor validado e valor executável mostrados separadamente;
- atualização da prévia pelo próprio `CanvasPostStage`;
- warnings quando o renderer não consumir determinado parâmetro;
- ação de restaurar o valor validado.

Na correção V2, acrescentar edição e inspeção de cada camada da receita: texto e quebra por linha, cores por trecho, contorno/extrusão, formas, ordem de desenho, texto vertical/curvo, fonte efetivamente carregada e comparação por região. Exibir separadamente estado da **receita salva**, prévia recompilada pela versão atual e referência original. A ação “estrutura corresponde” só fica disponível quando não houver elemento visual determinante ausente ou incompatibilidade impeditiva; confirmar deve gravar a versão exata da receita e o resultado da comparação.

Alterar a prévia não modifica uma versão aprovada. A publicação cria uma nova versão imutável do Blueprint ou da Peça.

## 10. Integração com o código atual

- `server/_core/llm.ts` e `server/ai/modelRouter.ts` continuam responsáveis por modelo, provedor, retries, fallback, Structured Outputs e trace.
- Criar uma rota de responsabilidade `design_analysis` com deadline total e fallback compatível com imagem e schema.
- `designDna.analyze` usa `adminProcedure`; chaves de servidor nunca chegam ao navegador.
- O analisador existente `server/designPatternAnalyzer.ts` permanece ligado à classificação de estilos de sites. Ele não representa Peças ou Blueprints de composição.
- Na **integração futura**, `post.generate` continuará responsável pela copy e sua resposta poderá carregar a seleção do Blueprint e dados necessários à materialização; essa mudança não integra a correção atual.
- Na **integração futura**, `client/src/pages/StudioApp/lib/studioGeneration.ts` chamará o compilador depois da geração e antes da galeria.
- `CanvasPostStage` continua sendo o renderer oficial da galeria, editor e exportação.
- A correção deve fazer `saveAdapter.ts` preservar os campos materiais da prévia V2; hoje o normalizador descarta parte de `extraShapes`, fonte/peso separados e supressão de adornos. Tracking e proveniência de Blueprints pertencem à integração posterior.
- Nenhum canvas paralelo será criado para o arsenal; o painel usa `CanvasPostStage` em modo de prévia.

Na primeira integração, o seletor usa os três Blueprints hardcoded. Depois, passa a consultar versões aprovadas persistidas. A troca da fonte dos Blueprints não altera a interface do compilador.

## 11. Telemetria e Feedback Loop

### 11.1 Campos no `CanvasPostModel`

Adicionar e preservar:

```ts
blueprintId?: string;
blueprintVersion?: number;
compilerVersion?: number;
editedAfterGeneration?: boolean;
published?: boolean;
```

Regras:

- `editedAfterGeneration` começa como `false` e muda para `true` na primeira mutação material de conteúdo ou aparência depois da materialização; troca de slide, zoom e seleção não contam;
- `published` só muda com um evento real e explícito de publicação;
- salvar, abrir ou baixar não será tratado como publicação;
- os campos entram no `canvas_model` e não fazem o post depender da versão atual do Blueprint.

O produto atualmente possui salvamento e exportação, mas não um fluxo confirmado de publicação em rede social. Até existir um evento real, a taxa de publicação aparecerá como `N/D`, evitando atribuir significado falso a downloads.

### 11.2 Eventos agregáveis

Além dos campos do documento, registrar eventos mínimos no servidor:

- `blueprint_materialized`;
- `post_edited_after_generation`;
- `post_saved`;
- `post_exported`;
- `post_published`, quando houver fonte real.

Os eventos carregam Blueprint/versão, formato, fallback aplicado e timestamp. Não armazenam a copy completa nem a imagem de referência.

### 11.3 Dashboard administrativo

Adicionar ao `/admin`:

- Blueprints mais materializados;
- taxa de edição após geração;
- taxa de salvamento;
- taxa de exportação;
- taxa de publicação, ou `N/D` sem evento real;
- distribuição dos níveis de fallback;
- incompatibilidades mais frequentes;
- comparação entre aprovação manual e `auto_approved`;
- desempenho dos parâmetros de entropia por Blueprint.

O feedback orienta revisão e arquivamento. Métricas não modificam automaticamente a composição de posts já criados.

## 12. Persistência, versionamento e referência temporária

Antes de qualquer migration no banco, o laboratório usa um arquivo local em IndexedDB. O registro **V1 existente** conserva ID, datas, referência preparada, saída original do modelo, estado ajustado, fonte, parâmetros e revisões; a exportação JSON V1 contém também uma prévia gerada no momento da exportação. Isso serve à avaliação, mas não é uma receita de reprodução completa. O registro **V2 planejado** acrescenta `ReferenceReconstructionSpecV2`, snapshot materializado vinculado por hash à receita, manifesto de dependências, versões/hashes de compilador e renderer, prévia baseline, validações por região e decisão humana associada à versão exata da cena. O autosave deve persistir esses dados numa única transação. O painel deve permitir reabrir, exportar e importar o pacote V2 sem depender do estado do rascunho ativo. Esta etapa não publica Peças nem Blueprints para o produto.

Na exportação V2, o pacote de reprodução inclui fontes e assets próprios necessários e permitidos; a referência preparada pode acompanhar somente a avaliação comparativa. O pacote deve reconstruir a cena sem ler essa imagem. Registros V1 são preservados e sinalizados como `legacy_needs_review`, sem migração fictícia de detalhes que não foram capturados. Uma atualização do compilador não modifica a receita ou o snapshot salvos; uma recompilação solicitada cria nova versão revisável e registra diferenças.

A implementação terá contratos próprios para:

- sessões de análise e referências temporárias;
- observações e resultados da Validação Geométrica;
- Peças e versões;
- Blueprints e versões;
- transições de status e auditoria;
- eventos de telemetria.

Versões publicadas são imutáveis. Correções geram nova versão. Estados permitidos: `draft`, `approved` e `archived`, com `approvalMode` indicando aprovação manual ou automática.

O asset temporário registra hash, MIME, dimensões, origem, direito de uso informado, autor do upload e política de retenção. O arsenal não depende de manter a imagem. Cache e deduplicação usam hash do conteúdo e versões de schema, prompt, pipeline geométrico e perfil de modelo.

## 13. Requisitos técnicos e tratamento de falhas

1. Usar `json_schema`, `strict`, schema explícito e validação no servidor.
2. Exigir endpoint compatível com imagem e parâmetros estruturados; no OpenRouter, avaliar `require_parameters: true` e a compatibilidade de cada fallback.
3. Diferenciar campo ausente, elemento inexistente e incapacidade de observação.
4. Separar normalização sintática de erro semântico; nenhum clamp silencioso depois da validação.
5. Calcular HSL e métricas derivadas no código quando os dados base forem suficientes.
6. Contraste é verificado por par e região. Uma classificação global não garante leitura sobre fotografia.
7. Distinguir timeout, truncamento, recusa, JSON inválido, schema incompatível e falha transitória.
8. Definir orçamento total que inclua retries, fallback, visão computacional e Validação Geométrica.
9. Registrar uso desconhecido como `null`, não zero.
10. Não registrar base64, URLs assinadas ou texto integral das referências nos logs.
11. Tratar dica de categoria e texto visível na referência como dados não confiáveis.
12. Gerar IDs separados para análise, Peça, Blueprint e materialização.
13. Medições de rotação usam graus; variância angular, se usada, declara unidade e cálculo.
14. Parâmetros de entropia só entram em Blueprints executáveis quando tiverem consumidor no renderer.

## 14. Ordem de implementação revisada

### Base já existente — manter isolada

- painel `/admin`, `designDna.analyze` V1, arquivo local V1, três Blueprints manuais, `validateCompatibility()` e prévia pelo `CanvasPostStage`;
- não conectar esse conjunto a `post.generate` enquanto a decodificação/reprodução estiver incompleta;
- tratar confiança e “geometria válida” atuais como sinais preliminares, nunca como aprovação visual.

### C1 — contrato V2 e inventário do caso

- fechar `ReferenceReconstructionSpecV2`, catálogo fechado de camadas/efeitos, coordenadas em pixels, metadados de fonte/asset, estados `supported`/`unsupported` e versões;
- anotar manualmente o post avaliado como referência de aceitação, incluindo cada linha e elemento pequeno observável;
- definir separadamente critérios de **fidelidade à imagem** e **repetibilidade do arquivo**.

### C2 — reprodução determinística no renderer oficial

- permitir proporção original no modo diagnóstico sem mudar silenciosamente os formatos do produto;
- corrigir o peso numérico em `layoutRichText`/`RichTextRenderer` e garantir fonte carregada antes de medir e desenhar;
- materializar texto por linha/trecho, contorno, extrusão, camadas ordenadas, formas vetoriais simples e texto vertical/curvo no `CanvasPostStage`;
- criar uma receita manual do primeiro post e demonstrar que o renderer consegue expressá-la antes de depender de nova extração por IA;
- preservar todos os campos materiais no round-trip do `saveAdapter`.

### C3 — arquivo local V2 e pacote portátil

- versionar IndexedDB sem perder registros V1; marcá-los `legacy_needs_review`;
- salvar receita, snapshot, versões, fontes/assets necessários, baseline renderizado e validações junto da análise original e dos ajustes;
- implementar reabertura pela receita salva, exportação/importação e comparação explícita ao recompilar com uma versão nova;
- provar que o pacote reproduz o primeiro post sem carregar a imagem original como fundo.

### C4 — extração granular e Validação Geométrica real

- adicionar OCR por linha/orientação e medições clássicas de cor, borda e formas; usar detector de objetos apenas onde houver mídia;
- adaptar `designDna.analyze` para propor camadas e papéis no schema V2 rigoroso, com parâmetros de entropia específicos por elemento;
- reconciliar texto, caixas, cores, efeitos e ordem com a imagem; diferenciar desconhecido de inexistente e bloquear alucinações textuais;
- só propor Peças reutilizáveis após a receita ter cobertura e capacidade de renderização suficientes.

### C5 — curadoria e comparação

- editar as camadas no painel e mostrar overlays, diferenças por região, fonte escolhida versus fonte observada e warnings impeditivos;
- comparar a referência, a renderização atual e o baseline salvo; registrar confirmação humana vinculada ao hash da receita;
- concluir o primeiro caso somente pelos critérios da seção 0.5 e da seção 15.

### C6 — generalização antes do arsenal

- repetir o fluxo com 3 a 5 posts diferentes para encontrar limitações que o primeiro caso não cobre;
- transformar decisões verificadas em Peças/Blueprints, testar adaptação a outro texto e revisar constraints e autoaprovação;
- manter referências, receitas diagnósticas e JSONs apenas no ambiente administrativo.

### Depois da validação, sob decisão separada

- planejar migration e persistência compartilhada de Peças/Blueprints, auditoria e dashboard de telemetria;
- integrar seleção e compilação após `post.generate` somente quando o proprietário autorizar essa etapa;
- preservar os três Blueprints manuais e fallback hierárquico, validar galeria, editor, salvamento/reabertura e exportação;
- ampliar gramática de carrossel e publicação real somente quando houver casos e eventos concretos.

## 15. Critérios de validação

A correção de reprodução estará validada quando:

1. o primeiro post for descrito por uma receita V2 com texto, linhas, cores, efeitos, formas, camadas e proporção originais, sem reduzir os elementos dominantes a caixas genéricas;
2. o `CanvasPostStage` renderizar essa receita sem usar a imagem de referência como fundo ou como camada oculta;
3. fechar/reabrir o IndexedDB e exportar/importar o pacote produzir a mesma cena, fonte e quebras de linha dentro da mesma versão do renderer; a comparação com o baseline identifica qualquer mudança de versão;
4. o round-trip do `saveAdapter` preservar cada propriedade material da prévia, inclusive peso, fonte separada, formas e ordem de camadas;
5. OCR/texto, geometria, cores, bordas e cobertura de elementos forem conferidos por região; nenhuma ausência importante puder ser mascarada por média global, score alto ou caixas dentro dos limites;
6. diferenças da fonte aproximada, trechos ilegíveis e capacidades não suportadas forem declarados; um item impeditivo bloquear a aprovação;
7. um administrador confirmar visualmente a correspondência da receita salva com a referência e essa confirmação se referir exatamente à versão avaliada;
8. registros V1 continuarem disponíveis como evidência histórica, sem receber status de “reproduzível” por conversão automática;
9. nenhuma capacidade de remoção de fundo ou recorte de objetos, migration no banco ou conexão com `post.generate` for necessária nessa etapa.

A utilidade do arsenal será avaliada depois, com 3 a 5 referências variadas e textos novos: Peças aprovadas devem funcionar fora da imagem de origem; `validateCompatibility()` deve barrar conflitos; fallback, entropia e medição textual devem ser observáveis. Mídia fotográfica/ilustrada sem asset próprio e efeitos ainda sem primitiva no CanvasLab ficam declarados como lacunas, nunca encobertos por reutilização da imagem original. Telemetria e comportamento de `editedAfterGeneration` só podem ser validados após a integração futura ao fluxo do produto.

## 16. Fora do escopo atual

- transformar referências em posts editáveis;
- manter as referências como biblioteca visível ao usuário;
- publicar a reconstrução literal da referência como template equivalente no produto;
- recorte automático, remoção de fundo e segmentação de pessoas/objetos;
- inferir camadas originais de um PNG achatado;
- gerar assets durante a análise;
- expor Peças, Blueprints ou JSONs no Studio;
- cobrar Sparks do usuário pela curadoria interna;
- criar fila, cron ou worker dedicado;
- inferir uma gramática completa de carrossel a partir de uma única imagem.

## Fontes consultadas

- OpenRouter, Structured Outputs: https://openrouter.ai/docs/guides/features/structured-outputs
- OpenRouter, Image Inputs: https://openrouter.ai/docs/guides/overview/multimodal/image-understanding
- OpenAI, API Reference — image inputs e JSON Schema: https://platform.openai.com/docs/api-reference
- `DOCUMENTO_MESTRE.md` e arquivos de runtime citados na seção 10.

Compass indisponível nesta sessão; evidências recuperadas por busca local dirigida.
