# CanvasLab: edição unificada com conteúdo variável

Data: 2026-10-01. Estado: estudo do código e plano de implementação; a interface ainda não foi alterada nesta rodada.

Complemento de 2026-10-02: a [auditoria da geração, do Arsenal e do editor unificado](./relatorio-auditoria-geracao-editor-unificado-2026-10-02.md) cruza este plano com o código, a importação do acervo, os traces, o Supabase e o post BizuMiner salvo pelo proprietário. Ela detalha as correções editoriais e de fallback, a migração das famílias, os comandos comuns, a experiência compacta/completa e os critérios de conclusão. A publicação do catálogo e a cobrança regular são frentes próprias. Este plano continua não implementado; a auditoria é documentação, não alteração do produto.

## 1. Diagnóstico confirmado

O editor anterior continua implementado, mas não está disponível para todo post novo. `CanvasLabPage.tsx` escolhe a interface pela presença de `slides[currentSlideIndex].composition`:

- Sem composição: `GuidedEditor` na edição básica; `CanvasSidebar` no desktop e `CanvasMobileDrawer` no mobile na edição livre. Inclui as abas Texto, Estilo, Mídia e Logo e o inspetor contextual `PropertyInspector`.
- Com composição: outra barra de ações e `ArsenalCompositionInspector` substituem esses componentes. Isso ocorre também no fallback de conteúdo variável, independentemente de haver design publicado selecionado.
- `CanvasPostStage.tsx` igualmente escolhe entre renderizar a composição e renderizar o documento convencional. Logo, fundo, efeitos e elementos extras convencionais não passam automaticamente a fazer parte de uma composição.

Não basta recolocar o painel antigo ao lado do novo: seus handlers alteram campos que o ramo de renderização da composição não consome. O resultado seria uma interface com controles aparentemente funcionais, mas sem efeito na prancheta.

### O que o anexo permite concluir

No compilador `arsenalGenerationCompiler.ts`, o nome **Editorial** é atribuído quando `report.selectedCandidateId` está ausente; quando há candidato selecionado, o nome é **Arsenal**. As três opções anexadas são, portanto, compatíveis com o fallback editorial. Sua disposição simples vem de `arsenalFallback.ts`, e não demonstra o resultado visual de três designs publicados.

O anexo não informa o motivo exato da ausência de candidato. Para distinguir catálogo vazio, seleção desligada, incompatibilidade ou falha de adaptação, é necessário consultar o relatório/trace daquela geração. O último estado remoto verificado na rodada anterior tinha drafts e nenhuma versão publicada; isso não constitui uma nova consulta ao banco nesta rodada.

Este problema de apresentação e o problema de acesso aos controles são distintos. Publicar designs não recupera os controles antigos; unificar os controles não publica designs.

## 2. Experiência proposta

Um único CanvasLab, com os mesmos comandos e organização para posts convencionais, composições do Arsenal e fallback editorial. O usuário escolhe **Edição básica** ou **Edição avançada** conforme a tarefa. A origem do post não escolhe outro editor.

**Edição básica:** conservar as ações Editar texto, Fundo e imagem, Destaque e Reorganizar visual. Oferecer ajustes simples de texto, fonte, tamanho, cor, foto e logo; propostas de reorganização mostram antes/depois e só alteram o documento ao aplicar. Conteúdo variável mostra os blocos existentes, sem criar campos obrigatórios de título e corpo.

**Edição avançada:** conservar as abas **Texto · Estilo · Mídia · Logo**, com o inspetor do elemento selecionado dentro desse painel. Acrescentar uma seção **Camadas e grupos**, com ordem, seleção, duplicação, exclusão e transformações. Relações automáticas de layout ficam nas opções avançadas do contexto selecionado, com descrição compreensível do efeito de liberar um ajuste.

Desktop e mobile compartilham seções, comandos e capacidades. Sidebar e drawer continuam sendo recipientes diferentes, adequados à tela. Trocar modo ou recipiente não recompila o post nem altera conteúdo, posição ou estilo.

## 3. Matriz de preservação e adaptação

| Recurso existente | Situação na composição nova | Implementação necessária |
| --- | --- | --- |
| Edição básica e propostas antes/depois | Barra alternativa; não reutiliza as ações guiadas | Comandos guiados que entendam o documento ativo e conservem todos os blocos |
| Texto, listas, legenda e hashtags | Editor variável existente; formulário V2 também existe | Seção Texto comum, com formulários conforme o contrato de conteúdo e seleção por ID |
| Alinhamento, tamanho, peso, cor e formatação por trecho | Contrato/renderização já comportam vários ajustes; painel expõe parte deles | Reaproveitar comandos de conteúdo, overrides e rich text; completar controles contextuais |
| Catálogo de fontes, upload e Google Fonts | Seletor limitado às fontes da composição | Resolver/importar assets de fonte do usuário, carregar antes da medição e preservar na reabertura |
| Sombra, contorno e fundos de destaque do texto | Efeitos antigos não têm equivalência completa no contrato novo | Extensão tipada de apresentação e implementação no Stage oficial, com contraste auditado |
| Famílias visuais e reorganização | `applyFamilyPreset` convencional não reorganiza uma composição | Propostas compatíveis com o conteúdo; conservar estilos convencionais e nunca escrever presets ignorados |
| Paleta e cores por elemento | Overrides individuais; fundo dentro da composição | Comando de paleta com papéis explícitos, usando `brandPolicy` quando declarado; estilo não muda cores implicitamente |
| Fundo por IA, texturas e upload | Upload apenas do primeiro slot de mídia encontrado | Seção Mídia comum, seleção de todos os slots e suporte a fundo/imagens livres; reutilizar fluxo e cobrança existentes |
| Enquadramento, recorte, posição, giro, opacidade e overlay | Foco do slot e parte das transformações disponíveis | Adaptadores de enquadramento e apresentação, com geometria e persistência explícitas |
| Logo, posição e arraste | Logo convencional fica fora do ramo da composição | Elemento autoral com papel de logo e controles existentes, sem modificar o catálogo publicado |
| Adicionar, duplicar, excluir e ordenar textos/imagens | Extras convencionais não integram a composição | Camadas autorais persistidas na composição, separadas das peças imutáveis do catálogo |
| Grupos e ajustes automáticos | Inspetor novo oferece grupos/relações | Incorporar ao modo avançado; preservar congelamento do resultado ao liberar relações |
| Formato, zoom, ímã, desfazer/refazer, salvar e exportar | Estrutura comum já existe | Conservar comandos comuns e verificar os novos campos em todos os caminhos |
| Slides e replicação de aparência | Replicação desabilitada quando há composição | Adaptador com escopo explícito por slide, preservando conteúdo e identificadores de cada destino |
| Restaurar variante e arquivo portátil | Disponíveis no inspetor novo | Integrar às ações do editor, mantendo prévia/confirmação e todos os dados autorais |

A matriz é critério de entrega. Um recurso ainda sem implementação não pode aparecer como um botão que salva apenas um campo ignorado. Restrições específicas de uma operação devem explicar a causa no contexto, sem remover permanentemente o conjunto de recursos anteriores.

## 4. Arquitetura e contratos

### 4.1 Documento e comandos

`CanvasPostModel` continua sendo o documento autoritativo. Dentro de um slide com composição, textos semânticos continuam em `composition.content`; os campos headline/body são projeções de compatibilidade. Não converter conteúdo variável de volta para título/corpo para tornar o painel antigo reutilizável.

Criar uma camada de comandos e leitura de contexto, compartilhada pelas seções do painel:

- O contexto resolve slide, seleção, modo de edição, unidades de geometria e capacidades a partir do documento.
- O adaptador convencional usa os comandos existentes de texto, aparência e elementos extras.
- O adaptador de composição usa `editArsenalContent`, `editArsenalElementText`, `overrideArsenalElement`, mídia e as extensões autorais.
- Todo comando retorna uma atualização do documento que passa por `CanvasLabPage.handleUpdatePost` e pelo histórico existente. Ajustar também ações guiadas que hoje aplicam `setPost` diretamente, para usar esse funil comum.
- Formulários podem manter rascunhos temporários, mas aplicar/cancelar opera sobre o documento corrente. Não criar outro store autoritativo de conteúdo ou aparência.
- Liberação de propriedade controlada por relação conserva o valor resolvido, como já faz `overrideArsenalElement`; não desliga todas as relações indiscriminadamente.

### 4.2 Camadas, efeitos e assets do usuário

Escolha proposta: adicionar camadas autorais à **composição do slide**, e não manter extras em uma segunda representação paralela. Peças e variante de origem continuam imutáveis. Camadas adicionadas pelo usuário têm IDs próprios, tipo, geometria, ordem e estilo explícitos; logo é um papel dessas camadas. Remoção de conteúdo semântico e ocultação de uma peça visual são operações diferentes.

Efeitos, fundo e fontes importadas precisam de contratos tipados e de suporte no leitor, compilador/resolvedor, Stage e persistência. Não colocar campos arbitrários em `overrides`: o leitor atual valida uma lista de propriedades permitidas. Coordenadas autorais usam as unidades da prancheta da composição; o adaptador convencional faz a conversão explícita das unidades do Stage.

Introduzir um envelope de composição **versão 3** para esses recursos, conservando leitura da versão 2 sem reinterpretar hashes. Conteúdo continua podendo ser V2 ou V3; a versão do conteúdo não é a versão do envelope. A receita portátil que transporta a nova composição passa a **V5**, mantendo leitores V1–V4. Não alterar o hash da definição ou da variante publicada para incorporar edições locais.

Documentos antigos só passam ao novo envelope quando uma edição exige os campos novos. Abrir, inspecionar e fechar não migra o documento. Salvar/reabrir e a receita portátil incluem assets autorais e camadas; restaurar variante oferece prévia e uma escolha explícita sobre conservar/remover personalizações.

### 4.3 Renderização e persistência

Conservar `CanvasPostStage` como renderizador oficial de editor, galeria, prévia e exportação. Completar o ramo das composições com camadas e efeitos autorais; não introduzir outro motor de preview. Auditar contraste com `lib/contrast.ts` e usar as mesmas métricas/fontes em todos os caminhos.

Revisar `saveAdapter.ts`, schemas compartilhados, leitores do backend e receita portátil antes de expor os novos controles. `canvas_model` permanece o armazenamento autoritativo; uma nova coluna/tabela não é exigida pela proposta. Confirmar os limites e validadores do payload no código antes da implementação, sem presumir que JSON aceita qualquer extensão.

A unificação não exige mudanças de autenticação, reserva de Sparks, billing ou publicação do catálogo. Geração de mídia continua usando suas rotas e regras existentes; editar um post não dispara geração paga automaticamente.

## 5. Sequência de implementação

1. **Proteção dos recursos:** criar fixtures representativas de post convencional, composição nativa e fallback V3; testar a matriz de recursos, seleção, histórico e persistência. Conservar os componentes antigos durante a transição.
2. **Contexto e comandos:** introduzir os dois adaptadores e o funil comum. Migrar comandos já suportados, inclusive edição guiada, conteúdo variável, tipografia, relações e formatos. Verificar cada comando no Stage antes de montar o painel definitivo.
3. **Extensões do documento:** implementar envelope de composição V3 e receita V5, camadas, fontes do usuário, efeitos, fundo e logo; completar leitores e salvar/reabrir. Testar compatibilidade e hashes antigos.
4. **Interface comum:** extrair seções reutilizáveis dos painéis existentes, integrar ações básicas, inspetor contextual e opções novas. Substituir os condicionais de painel de `CanvasLabPage` por um shell comum; somente os adaptadores dependem do tipo do slide.
5. **Carrosséis e acabamento:** integrar replicação com escopo por slide, restaurar variante e ferramentas portáteis; validar paridade desktop/mobile e navegação por teclado. Remover implementação duplicada somente depois da equivalência comprovada.
6. **Verificação do fluxo completo:** geração → galeria → personalização → salvar → reabrir → exportar. Atualizar o documento-mestre com o comportamento efetivamente implementado e suas limitações reais.

Em paralelo, verificar o trace da geração anexada. A melhoria do fallback precisa conservar todos os blocos, dar hierarquia aos seus papéis e oferecer direções visuais distintas quando a galeria promete três direções de arte. Não fabricar seleção de catálogo, inserir título obrigatório ou reduzir conteúdo para obter uma aparência mais elaborada.

## 6. Critérios de aceite

- Edição básica e avançada acessíveis no mesmo CanvasLab para documentos convencionais, Arsenal e fallback; abas Texto, Estilo, Mídia e Logo presentes nos dois tamanhos de tela.
- Todos os recursos da matriz têm efeito visual verificável, são desfeitos/refeitos e sobrevivem a salvar/reabrir/exportar; edição e exportação usam o mesmo Stage.
- Conteúdo de uma frase, 15 blocos, listas longas e combinações de métrica/citação/comparação permanece completo, com IDs estáveis. Alterar aparência não inventa nem remove conteúdo.
- Logo, texto extra e imagem extra funcionam mesmo quando a variante original não tem slot de mídia. Adicionar camada visual não altera automaticamente a cardinalidade semântica do pedido.
- Fontes importadas, rich text, efeitos, recorte, overlay, ordem, grupos e posições mantêm fidelidade após reabertura. Fontes indisponíveis são reportadas antes de medições/exportação que dependam delas.
- Mudanças entre básica/avançada ou desktop/mobile não modificam o documento; seleção de um bloco abre seu contexto sem impedir acesso aos demais recursos.
- Formatos atuais 1:1, 4:5 e 9:16 funcionam; documentos antigos 5:6 reabrem sem conversão silenciosa. Projeções conservam escala uniforme.
- Carrossel convencional continua funcional; replicação preserva conteúdo, mídia e IDs conforme o escopo escolhido, inclusive destinos de tipos diferentes quando a operação for suportada.
- Definições e hashes publicados, composições V2 e receitas V1–V4 permanecem legíveis e inalterados. Novos campos não se perdem em leitores antigos usados pelo fluxo ativo.
- Tipagem e testes de comandos/contratos passam. Verificação visual no navegador cobre desktop e mobile e os três tipos de documento. Persistência HTTP autenticada e cobrança só são declaradas verificadas quando executadas no ambiente correspondente.

## 7. Evidências e limites desta rodada

Fontes principais: `CanvasLabPage.tsx`, `GuidedEditor.tsx`, `CanvasSidebar.tsx`, `CanvasMobileDrawer.tsx`, `PropertyInspector.tsx`, `TypographyColorControls.tsx`, `ArsenalCompositionInspector.tsx`, `CanvasPostStage.tsx`, `ArsenalCompositionContents.tsx`, `arsenalGenerationCompiler.ts`, `arsenalFallback.ts`, `documentCommands.ts`, `saveAdapter.ts`, `shared/designArsenal.ts` e `shared/arsenalRecipe.ts`.

Foi realizada inspeção dirigida do código e do anexo. O Compass não estava disponível na sessão; foi usada busca local. Não houve alteração funcional, nova consulta remota, geração paga, publicação de design ou validação de runtime nesta rodada. A preservação funcional completa é objetivo e critério deste plano, não uma garantia já demonstrada pela existência dos arquivos antigos.
