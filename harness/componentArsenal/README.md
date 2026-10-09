# Arsenal de componentes — preparação e revisão

Este harness reutiliza as fontes preservadas da biblioteca, representação e revisão de qualidade. Os preparadores não chamam IA, não decodificam referências nem aplicam migrations. O importador remoto consome `package.components` e `assetFiles`, verifica bytes e mantém novos registros em draft até evidência humana válida. Importar não publica componentes.

Execute `node --import tsx harness/componentArsenal/build.ts [diretório-de-saída]` e `node --import tsx harness/componentArsenal/check.ts [mesmo-diretório]`. O padrão de preparação cria `artifacts/component-arsenal/prepared-<timestamp>`. Use um diretório novo para cada revisão destinada à importação. O relatório distingue falha de preparação, draft de composição, referência fotográfica e estudo tipográfico. Original, hash do manifesto e aprovação histórica ficam no snapshot; eles nunca são sobrescritos.

Os bindings são autorados por referência, agrupando títulos partidos em uma única fonte semântica. Cada camada preserva geometria, peso, cor, rotação e extrusão; `contentFragment` distribui palavras do conteúdo atual entre essas camadas sem duplicar a mensagem. As fontes estáticas usam o peso real de seus bytes; qualquer correção exige revisão visual. As fontes variáveis compartilham manifesto imutável e mantêm pesos válidos em cada peça.

A preparação ainda usa caixas do layout original como limite de encaixe. Um draft preparado não demonstra reflow geral, qualidade visual ou aptidão para todos os papéis de carrossel. Slots de imagem aguardam mídia do usuário e as fotos históricas não são publicadas como assets reutilizáveis.

As 87 receitas originais deduplicadas permanecem intactas. `editorExtensions.ts` porta explicitamente Stroke Impact e Cinematic Depth a partir do renderer oficial e das fontes verificadas: seis receitas novas em 1:1, 5:6 histórico e 9:16, com hashes de código/bytes e limitações reais. As 14 famílias têm fontes concretas; comparação visual e aprovação desses novos ports continuam pendentes.

Cada componente 5:6 recebe uma derivação 4:5 com novo ID/hash e proveniência `authorship.formatAdaptations`. A projeção uniforme preserva geometria, estilos, relações, peças e conteúdo; não apaga os componentes históricos. Cada adaptação exige revisão própria. IDs derivam de toda a definição imutável, incluindo metadata e contratos.

Lista e comparação têm componentes específicos com bindings canônicos, cartões de capacidade e ensaios curto, médio, longo e literal. Listas preservam arrays/IDs de itens e superfícies vinculadas; comparações preservam rótulos e textos de ambos os lados. Adaptações quiet genéricas não anunciam os papéis list/comparison. `check.ts` verifica essa elegibilidade, partição integral de texto, hashes/fontes, schemas, roundtrip e solver oficial com medição nativa. Falhas originais permanecem explicitadas em `TECHNICAL_REVIEW.md`; não recebem exceções ou aprovação automática.

`index.html?dataset=revision-7-cta` carrega a galeria de revisão no Stage oficial. Este é o pacote final desta etapa:500 componentes candidatos em93 receitas (87 originais+6ports),16 fontes e94 adaptações4:5. Genericquiet têm título, corpo e CTA canônicos; CTA/corpo são novos slots opcionais quando a fonte não os possuía. Janela1c2 conserva frame+controles originais, papel0623 conserva papel/sombra reais, ambos vinculados ao fluxo. Aspas puras são ornamentos fixos; labelChromatic recebe cor mais escura em autoria rastreável, com snapshot intacto.

Revisões5/6/7-cta permanecem imutáveis, com `ARTIFACT_LOCK.json` e `REPLACED_COMPONENTS.json`; não prepare novamente no mesmo diretório. A revisão6 mantém497 IDs da revisão5;7-cta mantém369 IDs da revisão6. `reviewReport.ts [diretório]` explicita o destino das24 referências e todas as ausências conhecidas. As preparações locais7/7-final/7-ready não são datasets entregues para importação.

Abra a galeria por Vite; links de PNG baixam apenas artefatos de revisão, sem criar evidência humana de publicação. Ela mostra receitas de origem e composições convertidas, registrando falhas de encaixe. O Stage em modo diagnóstico não comprova edição/persistência do fluxo de produto; a revisão real de componentes fica no Admin2.

## Importação e conferência no ambiente conectado

As migrations aditivas0025–0029 e o pacote `revision-7-cta` foram aplicados ao schema `postspark`. O lote ativo possui500 drafts e16 fontes verificadas;512 revisões anteriores estão arquivadas, preservando documentos/grants existentes. Relatórios dentro dos diretórios de revisão registram importação, reexecução idempotente e arquivamento.

`node --env-file=.env --import tsx harness/componentArsenal/import.ts DIRETORIO_DO_PACOTE ADMIN_UUID [--missing-only]` exige administrador, valida hashes/bytes e importa somente definições imutáveis. Nunca imprimir credenciais. A opção incremental verifica que IDs já existentes não foram arquivados ou alterados. `archiveSuperseded.ts` exige o ledger do lote substituído e o relatório completo do novo lote; não elimina definições nem grants.

Depois de gerar e salvar pela aplicação autenticada, execute `node --env-file=.env --import tsx harness/componentArsenal/verifyDelivered.ts RUN_UUID POST_ID ADMIN_UUID DIRETORIO_DO_RELATORIO [DIRETORIO_DO_PACOTE]`. Esta conferência é somente leitura, não chama IA: verifica hashes do banco/pacote/original, recompila com fontes reais e compara o documento salvo com a entrega pinada. Ela complementa screenshots, PNG/ZIP e a conferência de reabertura no navegador; não os substitui.

Promoção continua separada: revisar o artefato concreto no Admin2, aprovar o hash correspondente e publicar. `COMPONENT_ARSENAL_MODE=admin` mantém o piloto restrito; `all` usa somente componentes aprovados e exige critérios de aceite completos.


## Fase2 — vocabulário autorado

O lote incremental válido é `revision-8-vocabulary-final`:524 drafts, incluindo500 definições anteriores intactas e24 adições (18 ornamentos de seis conjuntos/formatos e seis variantes internas/finais de papel, janela e extrusão). As demais referências conservam seus conjuntos anteriores; não declarar cobertura integral de variantes internas. Publicação continua pendente de evidência humana.

Os helpers `ornamentComponents.ts` e `carouselIdentityComponents.ts` usam peças reais, novas identidades imutáveis e limitações explícitas. Dependências textuais/superfícies não são ornamentos livres. Tratamentos geométricos permanecem em content; typography é doadora de família/peso. `preview.ts` não duplica automaticamente motivos extraídos na composição original.

Conferência mínima: `node --import tsx harness/componentArsenal/verifyVocabulary.ts DIRETORIO [BASELINE]` valida hashes, retenção, uma copy por nova variante, posição de um motivo e três prévias com fontes reais. Não chama LLM, rede ou banco, nem percorre uma matriz exaustiva. Consulte `REVIEW.html` e os relatórios de conferência/importação do lote. Prévia nativa usa wrap opt-in; não estabelece aprovação humana ou execução do fluxo autenticado.
