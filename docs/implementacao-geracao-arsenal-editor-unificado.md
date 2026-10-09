# Implementação da geração e do editor unificado do PostSpark

Versão 1. Data: 2 de outubro de 2026. Destinatário: agente responsável pela implementação. Estado: especificação de trabalho, ainda não executada por este documento.

## 1 Missão e resultado esperado

Entregar o percurso funcional **briefing no TheVoid → propostas de posts → edição no CanvasLab → salvar → reabrir → exportar**, com conteúdo comunicativo, variedade visual, catálogo utilizável e liberdade de edição. Integrar as famílias originais e os designs artísticos à mesma representação para novos posts, preservando documentos históricos e recursos existentes.

O usuário deve receber um design pronto para usar e poder modificar textos, formas, imagens, fontes, grupos e disposição quando desejar. A interface terá modos compacto e completo com os mesmos comandos e documento. A curadoria de referências permanece administrativa.

Este documento transforma a auditoria em entregas executáveis. Seu par é o [roteiro de conferência independente](</home/many/Documentos/Projetos linux/PostSpark 3/docs/conferencia-geracao-arsenal-editor-unificado.md>). Ambos usam os requisitos R01–R22. Não declarar conclusão enquanto requisitos obrigatórios estiverem pendentes ou sem evidência.

## 2 Contexto obrigatório para começar

Repositório: `/home/many/Documentos/Projetos linux/PostSpark 3`.

Ler antes de alterar código:

1. `AGENTS.md` aplicável e [DOCUMENTO_MESTRE.md](</home/many/Documentos/Projetos linux/PostSpark 3/DOCUMENTO_MESTRE.md>), especialmente arquitetura ativa e §§13.34–13.42.
2. [Auditoria que fundamenta a tarefa](</home/many/Documentos/Projetos linux/PostSpark 3/docs/relatorio-auditoria-geracao-editor-unificado-2026-10-02.md>), integralmente.
3. [Plano do editor](</home/many/Documentos/Projetos linux/PostSpark 3/docs/plano-editor-unificado-canvaslab.md>), sobretudo matriz de recursos.
4. [Contratos Arsenal](</home/many/Documentos/Projetos linux/PostSpark 3/docs/contratos-arsenal-v2.md>) e [plano Arsenal](</home/many/Documentos/Projetos linux/PostSpark 3/docs/plano-arsenal-pgvector-thevoid.md>), considerando os adendos de conteúdo variável e 4:5.
5. [Conferência independente](</home/many/Documentos/Projetos linux/PostSpark 3/docs/conferencia-geracao-arsenal-editor-unificado.md>) para conhecer antecipadamente as provas exigidas.

O código atual prevalece para identificar o comportamento existente. Este documento define o comportamento a construir. Divergências materiais entre documentos, código e novas instruções do proprietário precisam ser registradas; não usar um trecho histórico para revogar conteúdo variável ou liberdade de edição.

### 2.1 Arquitetura ativa

- Frontend React/Vite em `client/`; backend Express/tRPC em `server/`; contratos em `shared/`.
- `/thevoid` e `/studio` montam `StudioAppV2BPage`, galeria e CanvasLab. `Home`/`WorkbenchV2` são compatibilidade histórica, sem rota ativa.
- Persistência runtime usa Supabase diretamente; SQL/Drizzle não são a única camada.
- `CanvasPostModel` é autoritativo. Em composição, `composition.content` é a fonte semântica; campos legados são projeções.
- `CanvasPostStage` é o renderer oficial. Edição, medição, galeria e exportação devem permanecer coerentes com ele.
- O despacho V3 examinado atende posts estáticos. A preservação e integração dos carrosséis deve ser explícita.

### 2.2 Estado de referência da auditoria

Reconsultar ao iniciar; estes valores não são constantes do sistema:

- Supabase `spbuwcwmxlycchuwhfir`: 11 versões draft, 21 documentos de busca, nenhuma versão aprovada em 02/10/2026.
- Importação de 69 receitas: 18 importadas; 51 bloqueadas pelo primeiro erro — 35 semântica, sete geometria/estilos, seis arco/extrusão e três fonte/peso.
- 12 famílias compartilhadas foram convertidas, mas há 14 famílias no CanvasLab. `stroke-impact` e `cinematic-depth` ficaram fora; `glitch-signal` corresponde a `cyber-glitch`.
- A conversão usa `shared/creative`, com diferenças em relação ao Stage ativo. Preservar as famílias exige comparação com a referência correta.
- Caso BizuMiner: run `53704704-a586-46c8-853d-fde1326efa9e`, post 95. Quatro blocos presentes e visíveis; copy nova, excesso de texto e hierarquia ruim. Não partir da hipótese de cópia literal/perda confirmada.
- Fallback V3 usa seletores `content:<id>:text`, mas verifica `source === "headline"` para peso. No caso real todos os textos receberam Arial 64/400.
- `accepted_count` aparece zero porque o caminho retorna `evaluations: []`; isso não comprova rejeição de todas as propostas.
- Há divergência entre o billing ativo de reservas e a estrutura `next_*` remota. O bypass administrativo não valida conta comum.

## 3 Requisitos rastreáveis

| ID | Requisito obrigatório | Prova de conclusão |
| --- | --- | --- |
| R01 | Baseline, inventário e proteção do trabalho existente | Manifesto de revisão, dirty state, hashes e referências preservadas |
| R02 | Contrato editorial distingue contexto, adaptação e literalidade | Casos reais/sintéticos com fatos, intenção e separação arte/legenda corretos |
| R03 | Conteúdo variável e edição livre | Quantidades e trechos pedidos preservados; digitação sem caps editoriais arbitrários |
| R04 | Fallback com hierarquia, medição e diversidade | Papéis V3 reconhecidos; renders distintos e legíveis; degradação identificada |
| R05 | Prontidão e origem verdadeiras | Estados off/vazio/incompatível/erro/pronto diferenciados e coerentes com traces |
| R06 | Recuperação compacta, compatível e diversificada | Filtros, perfis/âncoras, shortlist e escolha reproduzíveis |
| R07 | Acervo convertido com preservação | Inventário das 14 famílias e das 69 receitas de referência, equivalência e pendências resolvidas |
| R08 | Publicação e assets íntegros | Evidências vinculadas a hashes; catálogo elegível para o piloto; grants funcionando |
| R09 | Documento canônico e versões compatíveis | Envelope novo e leitores antigos com round-trip sem perda |
| R10 | Comandos e mutação comuns | Uma operação modifica a fonte correta, entra no histórico e aparece no Stage |
| R11 | Painel compacto/completo unificado | Mesmas capacidades por origem e paridade desktop/mobile |
| R12 | Tipografia, fontes, rich text e efeitos | Alterar, desfazer, salvar, reabrir e exportar sem substituição/perda silenciosa |
| R13 | Relações, grupos e edição livre coerentes | Crescimento centralizado, override manual e liberação sem salto |
| R14 | Múltiplas mídias, fundo, logo e camadas autorais | Inserção funciona inclusive sem slot original; assets persistem |
| R15 | Formatos e carrosséis | 1:1/4:5/9:16 atuais, 5:6 histórico, replicação por escopo e IDs íntegros |
| R16 | Persistência e portabilidade | HTTP autenticado, reabertura, exportação e receitas com fidelidade |
| R17 | Traces e métricas por etapa | Correlacionar pedido até entrega/salvamento; avaliação ausente explicitada |
| R18 | Billing regular reconciliado | Reserva, commit/estorno, retry e concorrência sem cobrança incorreta |
| R19 | Auth, ownership e isolamento de assets | Usuário não acessa/altera dados ou ativos não autorizados |
| R20 | Transição e rollout compatíveis | Leitores antes de escritores; rollback conserva documentos novos |
| R21 | Qualidade e desempenho demonstrados | Corpus, rubrica visual, medidas de busca/compilação e limites declarados |
| R22 | Documentação e entrega auditáveis | Mestre atualizado; matriz de requisitos, decisões, logs e pendências entregues |

R07 não pode ser encerrado como “69 arquivos existentes”. Toda entrada deve ter um destino verificado. Se uma capacidade ainda impedir conversão fiel, o requisito permanece parcial até correção ou mudança explícita de escopo pelo proprietário.

## 4 Invariantes de implementação

1. Preservar mudanças preexistentes e backups. Não restaurar a árvore inteira para limpar o trabalho de terceiros.
2. Conteúdo autoritativo único; não sincronizar três cópias editáveis entre campos legados, composição e extras.
3. Base/peças publicadas imutáveis. Edições pertencem à instância do usuário.
4. A LLM recebe cartões compactos, não o acervo completo. Ela escolhe IDs permitidos; elegibilidade é validada pelo sistema.
5. Congelar conteúdo após redação/revisão. Compilação geométrica não corta, resume nem desloca texto para legenda silenciosamente.
6. Limite técnico de payload/geração é diferente de regra editorial e de edição manual. Preservar os contratos antigos ao lê-los.
7. Fonte real carregada antes de medir; mesma configuração tipográfica na medição e no Stage.
8. Digitar não reduz a fonte continuamente nem bloqueia frases maiores por comprimento de demonstração.
9. Trocar modo compacto/completo ou recipiente desktop/mobile não altera o documento.
10. Escolher estilo não troca cores do usuário implicitamente. Paleta é comando próprio.
11. Migração de histórico somente quando uma edição exige; abrir/fechar não recria o post.
12. Exportação não é publicação em rede social. Sucesso estrutural não é aprovação visual.

## 5 Mapa de responsabilidade no código

Os caminhos desta tabela são relativos à raiz indicada na seção 2. Conferir nomes/símbolos atuais antes de editar.

| Responsabilidade | Pontos de entrada |
| --- | --- |
| Entrada, prontidão, galeria | `client/src/pages/StudioApp/StudioAppV2BPage.tsx`, `components/StudioGalleryView.tsx`, `components/StudioMobileFlashcards.tsx` |
| Handler e contratos LLM | `server/routers.ts`, `server/ai/generationOrchestrator.ts`, `arsenalGenerationOrchestrator.ts`, `briefInterpretation.ts`, `postGenerator.ts` |
| Conteúdo e representação | `shared/variableContent.ts`, `arsenalContent.ts`, `arsenalGeneration.ts`, `designArsenal.ts`, `arsenalRecipe.ts` |
| Busca, publicação, assets | `server/designCatalog/`, `server/routers/designCatalog.ts`, `shared/designDescriptors.ts`, `designDescriptorMetric.ts` |
| Composição no cliente | `client/src/pages/CanvasLab/lib/arsenalGenerationCompiler.ts`, `arsenalFallback.ts`, `arsenalComposition.ts`, `arsenalAssets.ts` |
| Editor e Stage | `CanvasLabPage.tsx`, `components/CanvasPostStage.tsx`, `ArsenalCompositionContents.tsx`, `RichTextRenderer.tsx` |
| Comandos e persistência | `lib/documentCommands.ts`, `saveAdapter.ts`, `fitSavePayload.ts`, `slideReplication.ts`, `server/db.ts` |
| UI reaproveitável | `GuidedEditor.tsx`, `CanvasSidebar.tsx`, `CanvasMobileDrawer.tsx`, `ArsenalCompositionInspector.tsx`, `VariableContentEditor.tsx` |
| Migração do acervo | `harness/designFamilies/`, `harness/arsenalV2/`, `shared/creative/families.ts`, metadados de `components/types.ts` |
| Billing e runtime | `server/billing.ts`, `runtimeManifest.ts`, `verifyRuntime.ts`, `drizzle/` |

## 6 Contratos a fechar antes da interface

### 6.1 Briefing e conteúdo

Representar intenção editorial (`criar`, `adaptar`, `literal`, ou equivalentes tipados), fatos, trechos obrigatórios, tom, marca, formato, mídia real e preferência de densidade. Reutilizar `ContentStrategy`/`EditorialMeaningPlan`; não criar uma chamada LLM obrigatória para cada abstração.

Quando o pedido é contexto para um post estático promocional, orientar leitura rápida na arte e explicação na legenda. Pedidos detalhados ou literais prevalecem. A decisão precisa ser registrada e testável.

Preservar V3, IDs de blocos e tipos text/list/metric/quote/comparison. A mesma versão de schema e requisitos vale para principal e reparo limitado. Não forçar título/corpo/CTA quando o pedido não os exige. Não inventar evidências de métricas/citações.

Após a validação editorial, registrar revisão/hash do conteúdo. O compilador pode trocar uma geometria compatível; reescrever conteúdo exige nova revisão editorial ou ação explícita do usuário.

### 6.2 Cartões e capacidade de design

Cada cartão deve ser derivado da definição e conter identidade/versionamento, formatos, papéis/cardinalidades, densidade validada, expansão, mídia necessária/opcional, marca/fontes, restrições e linguagem visual. Manter até cinco cartões no contrato de shortlist atual; hidratar só o necessário. Preservar o orçamento vigente de tentativas, documentando qualquer alteração justificada.

Busca: publicação e compatibilidade → proximidade estrutural → diversidade → oferta. Ampliar perfis além de Minimal Air. Não contabilizar três formatos de um blueprint como três linguagens visuais.

O vetor é uma projeção derivada; manter a métrica/versão de 48 eixos enquanto não houver necessidade demonstrada de alteração. Não criar índice aproximado ou trocar métrica como solução para catálogo vazio.

Preservar a recombinação por grupos funcionais: texto com superfície, janela com mídia, selo e título com suas transformações. Cada grupo deve declarar entradas, dependências, incompatibilidades, ancoragem, escala e ordem/sobreposições intencionais. Validar compatibilidade antes de compor e auditar o resultado; proximidade vetorial ou aprovação de uma peça isolada não aprova automaticamente a combinação. Ampliar a partir das combinações já demonstradas, sem exigir um gerador universal de layouts para concluir a integração.

### 6.3 Composição e fontes autoritativas

Implementar o envelope de composição V3 e receita portátil V5 previstos no plano, preservando leitores V2/V1–V4. Se a execução encontrar essas versões já ocupadas, registrar a evolução compatível necessária; não reutilizar um número com semântica diferente.

Conteúdo V2/V3, contrato de quantidade V1/V2, envelope, bundle, receita e compiler têm ciclos próprios. Não renumerar todos por conveniência.

O envelope novo precisa representar camadas autorais, instâncias ocultas/removidas, overrides tipados, efeitos, fontes do usuário, mídia/fundo/logo, grupos e relações editadas. Usar referências estáveis para texto e assets. Elementos resolvidos continuam sendo projeção verificável, não um segundo texto autoritativo.

Novos textos manuais devem ter uma origem semântica única e sua ligação visual; não se tornam campos obrigatórios de todas as receitas. Duplicação cria novos IDs. Exclusão não deixa relações apontando para instâncias inexistentes. A origem publicada mantém seus hashes.

### 6.4 Comandos e seleção

Criar contexto comum que resolva slide, seleção, espaço de coordenadas, capacidades e revisão atual. Criar adaptador de documentos históricos e adaptador da composição comum. O painel consome comandos, não detalhes dos campos legados.

Todo comando deve especificar alvo, pré-condições, patch autoritativo, efeitos derivados, política de relação e transação de histórico. Centralizar mudanças persistentes no funil do CanvasLab. Rascunho de formulário é transitório; aplicar opera sobre a revisão corrente.

Cobrir texto, rich text, tipografia, cores, transformações, agrupamento, ordem, duplicar/excluir, mídia, logo, fundo, paleta, formato, restaurar e replicar aparência. Respostas assíncronas não podem sobrescrever uma edição posterior. Arraste/digitação precisam de agrupamento de undo adequado.

### 6.5 Estados e traces

Separar validade semântica, compilação, avaliação visual, entrega e persistência. Usar origem real (`catalog`, `bundled`, `fallback`, `legacy`, ou equivalentes tipados). Registrar motivo do fallback e candidato tentado.

Revisar a semântica de `accepted_count`: avaliação inexistente não significa rejeição. Novos contadores ou estados devem ter definição explícita e leitura compatível. Relato do frontend é correlacionado e validado contra run, usuário e oferta.

## 7 Sequência de trabalho

### F0 Inventário e referência protegida

Requisitos: R01, R22. Correspondência: preparação da auditoria.

1. Registrar revisão Git, diff e arquivos preexistentes, versões de ferramentas, portas/servidores e ambiente alvo. Não interromper um servidor desconhecido.
2. Confirmar contexto do Supabase antes de qualquer escrita; consultar estado atual, migrations e políticas. Carregar as skills aplicáveis de Supabase/Postgres para mudanças nessa camada.
3. Preservar manifesto/backup do acervo. Registrar hashes das receitas/fontes/PNGs de referência. Não sobrescrever os artefatos históricos.
4. Inventariar as 14 famílias ativas, as 69 receitas e os formatos atuais, incluindo bloqueios e renderer de referência.
5. Criar matriz R01–R22 inicialmente pendente e plano de evidências.

Saída: baseline rastreável e pasta de evidências nova. Nenhum dado operacional é aprovado por inferência.

### F1 Recuperar qualidade de geração e fallback

Requisitos: R02–R05, R17. Correspondência: Entrega A da auditoria.

1. Corrigir resolução do papel V3 no fallback; remover dependência de `source === "headline"` para seletores diretos.
2. Resolver escala tipográfica por papel e geometria medida. Garantir contraste, margens e legibilidade sem cortar conteúdo.
3. Criar alternativas de fallback no formato comum, com identidade e qualidade verificadas. Reutilizar estruturas adequadas do produto; não publicar drafts para mascarar fallback.
4. Conciliar instruções editoriais e separar arte/legenda. Três propostas podem compartilhar a proposição e diferir visualmente.
5. Ajustar prontidão e nomes da galeria para refletir origem/motivo reais. Diferenciar off, vazio, incompatível, falha e pronto.
6. Corrigir contadores e eventos para distinguir geração de entrega renderizada.

Saída: caso BizuMiner e conteúdo literal com comportamento correto; resultados visuais e traces antes/depois. F1 é uma estabilização, não o encerramento da integração.

### F2 Documento e comandos comuns

Requisitos: R09, R10, R12–R16, R20. Correspondência: Entrega B.

1. Implementar schemas, leitores/escritores, command context e adaptadores conforme seção 6.
2. Criar uma composição de referência com texto, superfície, grupo rotacionado, imagem, logo, efeito e camada autoral adicionada.
3. Levar cada alteração até o Stage, undo/redo, salvamento HTTP, reabertura e exportação.
4. Atualizar todos os leitores restritivos, payload fitting, importação/arquivo portátil e normalizadores. Nenhum campo autoral pode ser descartado para caber no payload.
5. Definir edição de propriedade controlada por relação: materializar resultado atual, liberar apenas os vínculos afetados e permitir reativação previsível.

Saída: fatia completa de edição e persistência. O novo shell depende deste percurso funcionando.

### F3 Conversão e publicação do acervo

Requisitos: R07, R08, R12–R14, R21. Correspondência: Entrega C.

1. Usar o Stage ativo como referência de preservação das famílias; registrar variações históricas diferentes como variantes identificadas.
2. Resolver semanticamente campos, fragmentos e ornamentos por manifesto extensível, sem mapear todo desconhecido para corpo.
3. Implementar capacidades gerais para campos com estilos/rotação, fontes/pesos e efeitos necessários. Adaptar visualmente somente com evidência e limitação explícitas.
4. Diferenciar mídia obrigatória/opcional e substituir imagens sintéticas apenas por assets adequados ao ensaio.
5. Criar variantes 4:5 reais e preservar 5:6 histórico.
6. Comparar original ativo, receita convertida e conteúdo substituído no Stage oficial.
7. Registrar revisões e publicar pela operação guardada quando houver aprovação válida do artefato final. Aprovações anteriores só são reutilizáveis com correspondência demonstrada de identidade e condições.
8. Formar piloto com diversidade real e cobertura sem foto, com foto, lista e composição por superfícies; concluir o restante do inventário.

Saída: matriz por design/variante, pacotes, previews e publicação verificável. Ausência de aprovação humana necessária fica pendente; continuar demais entregas independentes.

### F4 Busca e seleção integradas

Requisitos: R05, R06, R08, R17, R21. Correspondência: Entrega D.

1. Derivar cartões consistentes com definições; ampliar perfis/âncoras e testes de relevância.
2. Filtrar por disponibilidade real de mídia, marca, fontes, formato e cobertura antes de ordenar.
3. Preservar shortlist pequena, diversidade e hidratação limitada.
4. Estruturar preferências de estilo; evitar que sejam apenas texto concatenado ao briefing.
5. Eliminar consultas redundantes ao catálogo antigo ou adaptar explicitamente sua saída quando for alternativa real.
6. Verificar seleção, compilação e fallback pelo endpoint ativo, incluindo candidatos recusados.

Saída: recuperação com rastreabilidade e materialização real, sem depender de todos os JSONs no prompt.

### F5 Painel compacto e completo

Requisitos: R10–R14, R19. Correspondência: Entrega E.

Montar um shell por tarefas e seleção. Reaproveitar componentes úteis antigos, conectados aos comandos comuns. A presença de `composition` não deve selecionar outro editor com menos ferramentas.

| Contexto | Ferramentas compactas | Ferramentas completas adicionais |
| --- | --- | --- |
| Post | Texto, visual, paleta, fundo, imagem e logo | Camadas, guias, geometria, assets e diagnóstico |
| Texto | Editar, fonte, tamanho, cor, alinhamento e destaque | Peso, rich text, entrelinha, espaçamento, contorno, sombra, giro e caixa |
| Grupo com superfície | Texto, fundo, respiro e alinhamento | Padding, limites, relações, transformação e desagrupamento |
| Imagem/logo | Trocar, enquadrar, tamanho e posição | Opacidade, recorte, giro, overlay, ordem e múltiplas colocações |
| Formas/camadas | Cor, mover, duplicar e excluir | Traço, geometria suportada, agrupar, alinhar e distribuir |
| Slides | Navegar, duplicar e ordenar | Replicar aparência por escopo e adaptar composição |

Separar “Texto na arte” de “Texto da publicação”. Expor relações com linguagem de uso, como “Manter centralizado”; hashes/IDs técnicos ficam em diagnóstico administrativo.

Cobrir desktop e mobile: teclado virtual, foco, rolagem, toque, seleção pequena e acessibilidade. Trocar modo não muda o documento. Evitar redução da prancheta por formulários longos no modo compacto.

Saída: matriz de recursos funcionando para histórico, família convertida, design artístico e fallback.

### F6 Formatos e carrosséis

Requisitos: R15, R16, R03. Correspondência: Entrega F.

Preservar geração atual de carrosséis e integrar edição/replicação comum. Declarar explicitamente a cobertura do Arsenal nessa modalidade; não presumir que um fluxo V3 estático migrou automaticamente carrosséis.

Implementar projeção uniforme e proposta de variante nativa com prévia. Replicar aparência por escopo preservando conteúdo e mídia do destino quando solicitado. Duplicar, ordenar e excluir slides sem colisão de IDs. Verificar mistura de históricos/composições durante a transição.

Saída: carrossel completo editável, salvo, reaberto e exportado. Pedido estático só é paginado com decisão explícita.

### F7 Operação real e liberação

Requisitos: R16–R21. Correspondência: Entrega G.

1. Reconciliar billing com o ledger real. Inspecionar assinaturas, estado de reservas e idempotência antes de propor SQL; não criar ledger paralelo nem renomear RPCs por semelhança.
2. Validar usuários comuns, bridge de autenticação, ownership e acesso a assets.
3. Preparar migrations incrementais apenas para diferenças necessárias; atualizar runtime manifest e contratos. Não reaplicar 0019–0024 por rotina.
4. Validar reserva, commit, estorno, retry, timeout e concorrência. Definir cobrança em relação à entrega efetiva sem duplicação.
5. Publicar leitores compatíveis antes de habilitar escrita nova. Preparar rollback que preserve leitura dos documentos criados.
6. Executar corpus, medições e fluxo real, incluindo geração por catálogo aprovado e fallback.

Saída: evidências separadas de pronto local, pronto no ambiente validado e liberado em produção. Respeitar a autorização efetiva da tarefa para rollout/deploy; este arquivo não substitui aprovações de catálogo nem autoriza alterações irreversíveis por si só.

### F8 Encerramento e passagem

Requisitos: R01, R22 e todos os anteriores. Correspondência: Entrega H.

Consolidar contratos vigentes e atualizar o mestre. Remover duplicação somente após paridade comprovada. Entregar a pasta de evidências e a matriz de requisitos ao conferente. Relatar pendências sem chamá-las de implementação completa.

## 8 Dependências e limites do escopo

F0 precede alterações. F1 pode avançar junto ao desenho de F2. F3 e F4 dependem dos contratos relevantes estabilizados; publicação depende de evidências. F5 depende dos comandos e do documento de F2. F6 usa a mesma infraestrutura. Investigação de F7 pode começar cedo; liberação depende das evidências das demais fases. F8 encerra o conjunto.

Não introduzir como dependência: nova suíte de OCR/segmentação, remoção automática de fundo, reconstrução da imagem sob letras, treinamento de modelo estético, HNSW sem medição, leitura de todos os JSONs pela LLM ou um editor de curadoria obrigatório para o usuário final.

Migrations, execução com provedores e deploy seguem o escopo autorizado na tarefa que acionar a implementação. Quando uma decisão externa for realmente necessária, apresentar o artefato concreto já preparado e continuar trabalho independente. Não fabricar evidência humana nem interromper por escolhas rotineiras de implementação.

## 9 Verificação exigida durante a execução

Executar testes e verificações quando este roteiro for acionado com o mandato de implementar e validar. Priorizar testes focados após cada alteração e suíte completa antes da entrega. Os resultados históricos da auditoria não substituem uma execução na revisão entregue.

Comandos existentes, a confirmar no `package.json` da revisão:

```bash
timeout 180 pnpm check
timeout 300 pnpm test
timeout 120 pnpm run verify:runtime
```

Cada comando deve ser executado separadamente, com saída e exit code guardados. Timeout não é sucesso: diagnosticar, preservar logs e só ampliar o prazo com motivo. Verificar o escopo dos scripts de E2E antes de executá-los, pois podem usar serviços e dados reais.

Para validar compilação sem sobrescrever o `api/index.js` gerado que já existe na árvore, usar diretório temporário próprio, por exemplo:

```bash
timeout 180 pnpm exec vite build --outDir /tmp/postspark-editor-unificado-client
timeout 180 pnpm exec esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outfile=/tmp/postspark-editor-unificado-server/index.js
```

O build oficial de deploy continua seguindo os scripts do projeto. Não alegar deploy porque o build isolado passou.

Verificações obrigatórias adicionais:

- Regressão BizuMiner e casos de literalidade/quantidade, usando o roteiro de conferência.
- Comparação visual no Stage oficial das famílias e dos designs artísticos.
- Cada comando: efeito → undo → redo → salvar → reabrir → exportar.
- Formatos, projeção, fonte carregada e oclusão; comparar limites no espaço final.
- Fluxo HTTP autenticado com conta comum e catálogo publicado.
- Conteúdo e assets preservados nas receitas anteriores e no novo envelope.
- Corpus de 30 briefings com denominadores e rubrica; não contar benchmark repetido como variedade de casos.
- Metas históricas: shortlist adequada ≥90%, materialização ≥95%, fallback inesperado ≤5%, com critérios e exceções declarados.

Usar as definições de denominador do caso T19 do roteiro de conferência. Classificar a compatibilidade antes de observar o resultado da recuperação. Entregar contagens absolutas de casos elegíveis, incompatíveis e falhos; uma coleção vazia não pode obter aprovação artificial por retirar todos os casos do denominador.

Não alterar thresholds, apagar casos ou atualizar imagens de referência apenas para fazer o teste passar. Mudança intencional precisa de justificativa e revisão visual.

## 10 Pacote obrigatório de entrega

Criar uma pasta nova sob `artifacts/editor-unificado/` com identificação da revisão/execução. Nomes sugeridos:

| Arquivo ou pasta | Conteúdo |
| --- | --- |
| `manifest.json` | Data, revisão Git, estado de trabalho, ambiente, versões e hashes dos artefatos |
| `requirements.json` | R01–R22: estado, implementação, evidências, limitações |
| `decisions.md` | Decisões de schema, compatibilidade, billing e desvios justificados |
| `catalog-inventory.json` | Origem, versão, formato, fontes, mídia, status e motivo por receita/variante |
| `contracts.md` | Schemas e semântica final, produtores/consumidores e migrations |
| `test-results/` | Comandos, exit codes, duração e logs da revisão entregue |
| `visual/` | Referência, resultado, formatos e variações; hashes e rubrica |
| `flows/` | Runs/posts de teste, passos HTTP/UI e prova de salvar/reabrir/exportar |
| `handoff.md` | Resumo para o conferente, como reproduzir e pendências |

Evitar segredos, cookies, chaves, tokens e dados privados desnecessários nos artefatos. Usar dados sintéticos ou autorizados nos testes; não editar o post 95 original para demonstrar correção.

## 11 Critério final e instrução de acionamento

Concluído significa que R01–R22 têm evidência suficiente no escopo acordado, que não há perda/regressão obrigatória e que o percurso real funciona. “Implementado sem verificação” e “aguardando aprovação/publicação/infraestrutura” são estados parciais, que devem ser descritos como tais.

Ao entregar, informar o que mudou, como foi validado, o ambiente/revisão, as migrations aplicadas ou pendentes, as aprovações usadas, a situação do billing, os arquivos de evidência e o status do documento-mestre.

Texto sugerido para acionar o agente:

> Implemente o documento `docs/implementacao-geracao-arsenal-editor-unificado.md` neste repositório e execute as validações nele previstas. Leia primeiro o documento-mestre, a auditoria e o roteiro de conferência. Preserve o trabalho existente e avance pelas dependências até concluir. Entregue evidências por requisito R01–R22 e registre impedimentos reais sem declarar conclusão parcial como completa. Respeite as autorizações existentes e prepare qualquer decisão externa necessária de forma concreta e revisável.
