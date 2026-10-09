# Conferência independente da integração do PostSpark

Versão 1. Data: 2 de outubro de 2026. Destinatário: agente que confere a implementação de outro agente. Estado: protocolo de revisão e validação; nenhum resultado está aprovado pela existência deste documento.

## 1 Missão do conferente

Determinar, com evidências próprias, se o percurso **TheVoid → geração → galeria → CanvasLab → salvar → reabrir → exportar** cumpre o [documento de implementação](</home/many/Documentos/Projetos linux/PostSpark 3/docs/implementacao-geracao-arsenal-editor-unificado.md>), preserva recursos existentes e resolve os problemas da [auditoria original](</home/many/Documentos/Projetos linux/PostSpark 3/docs/relatorio-auditoria-geracao-editor-unificado-2026-10-02.md>).

Revisar código, dados e experiência visual. Usar o relatório do implementador como índice de alegações, não como comprovação independente. Não encerrar a conferência apenas porque testes passaram, um preview agradou ou há mais arquivos JSON.

O produto esperado oferece posts comunicativos e impactantes como ponto de partida, com liberdade de edição num painel compacto/completo comum. Curadoria permanece administrativa; a origem do design não pode retirar ferramentas do usuário.

## 2 Preparação e limites da revisão

Raiz do repositório: `/home/many/Documentos/Projetos linux/PostSpark 3`.

1. Ler `AGENTS.md` aplicável, [DOCUMENTO_MESTRE.md](</home/many/Documentos/Projetos linux/PostSpark 3/DOCUMENTO_MESTRE.md>), documento de implementação e auditoria. Consultar também a [matriz do plano de editor](</home/many/Documentos/Projetos linux/PostSpark 3/docs/plano-editor-unificado-canvaslab.md>).
2. Identificar a revisão entregue, alterações preexistentes, diff da tarefa, ambiente, flags, migrations e pacote de evidências do implementador.
3. Registrar sua própria revisão/ambiente e conferir hashes. Se a árvore mudar durante a análise, delimitar o que foi revisto e repetir verificações afetadas.
4. Reconsultar o estado relevante do banco; os números da auditoria de 02/10/2026 não são expectativas fixas.
5. Executar testes da revisão quando a conferência for acionada com o mandato de validar. Começar por leitura e verificações locais, usando dados de ensaio identificados.
6. Não alterar a implementação para esconder falhas. Se correções forem autorizadas posteriormente, manter achado original, patch e revalidação separados.

Não publicar drafts, fabricar aceite humano, aplicar migrations, mudar flags de produção ou editar posts reais apenas para fazer um caso passar. A conferência deve observar a autorização efetiva da tarefa. Use banco isolado para testes destrutivos, negações de acesso e falhas de publicação; use contas/dados de teste autorizados para o percurso real.

Ausência de ambiente, login, saldo, asset ou aprovação necessária é **não verificado/bloqueado**, nunca aprovado por hipótese. Registre a causa e continue as verificações independentes.

## 3 O que já era conhecido e precisa ser reavaliado

Na auditoria original, o catálogo remoto tinha 11 versões draft e 21 documentos de busca. Os runs BizuMiner receberam zero candidatos e usaram fallback. A importação de 69 receitas aceitou 18 e bloqueou 51. Havia 12 famílias compartilhadas e 14 no CanvasLab.

O post 95, do run `53704704-a586-46c8-853d-fde1326efa9e`, continha quatro blocos visíveis. O defeito confirmado era texto excessivo e tratamento tipográfico uniforme. A hipótese de cópia literal foi corrigida pelo usuário. Não criar um achado de perda de blocos sem comparar conteúdo, bindings e renderização.

A geometria desse post usa base 4:5 projetada em 1:1 com escala 0,8 e X=108. Comparar Y bruto com a altura final produziria falso overflow. Legenda/hashtags não devem ser desenhadas automaticamente.

O fallback não reconhecia `headline` dentro de seletores V3; os quatro textos estavam em Arial 64/400. O ramo com `composition` trocava painel e renderer, retirando recursos antigos. O contador `accepted_count` era zero por falta de avaliações. Billing tinha divergência entre contratos antigos e estrutura `next_*`.

Esses são pontos de partida, não resultados presumidos da revisão nova.

## 4 Estados de conferência e severidade

### 4.1 Resultado por requisito

| Estado | Significado |
| --- | --- |
| APROVADO | Evidência independente suficiente na revisão e ambiente declarados |
| REPROVADO | Violação reproduzida do requisito |
| PARCIAL | Parte do requisito funciona e há uma lacuna identificada |
| NÃO VERIFICADO | A verificação não ocorreu ou a evidência é insuficiente |
| BLOQUEADO POR AMBIENTE | A verificação não pôde prosseguir por dependência concreta |
| FORA DO ESCOPO AUTORIZADO | O proprietário excluiu explicitamente a obrigação; indicar a decisão |

O implementador não pode marcar um requisito obrigatório como fora do escopo para fechar a entrega. Uma ressalva documentada continua sendo pendência, salvo alteração explícita do escopo pelo proprietário.

### 4.2 Severidade dos achados

- **P0:** perda/corrupção de dados, acesso indevido, cobrança incorreta ou falha que impede o fluxo principal sem alternativa utilizável. Bloqueia liberação.
- **P1:** requisito central ausente, regressão relevante, conteúdo omitido, publicação inválida, edição sem persistência ou geração visual degradada de forma recorrente. Bloqueia conclusão integral.
- **P2:** limitação localizada de usabilidade/qualidade ou diagnóstico, com alternativa funcional; precisa de decisão e correção planejada.
- **P3:** acabamento ou melhoria de manutenção sem violar obrigação funcional.

Prioridade não altera o status do requisito. Uma obrigação P2 incompleta ainda impede declarar cumprimento total do escopo original.

## 5 Matriz de rastreabilidade

Preencher o resultado e a evidência de cada requisito. Os IDs correspondem ao documento de implementação.

| Requisito | Objeto | Casos principais |
| --- | --- | --- |
| R01 | Baseline e preservação | T00, T05 |
| R02 | Contrato editorial | T01, T02 |
| R03 | Conteúdo variável e edição livre | T02, T10, T11 |
| R04 | Fallback | T01, T03 |
| R05 | Prontidão e origem | T03, T04, T16 |
| R06 | Recuperação compacta e diversa | T04, T19 |
| R07 | Conversão do acervo | T05 |
| R08 | Publicação e assets | T06, T18 |
| R09 | Documento e versões | T07, T15, T20 |
| R10 | Comandos e histórico | T08, T11 |
| R11 | Painel e mobile | T09 |
| R12 | Texto, fontes e efeitos | T10, T15 |
| R13 | Grupos e relações | T11 |
| R14 | Mídia, logo e camadas | T12, T15 |
| R15 | Formatos e carrosséis | T13, T14 |
| R16 | Persistência e portabilidade | T15 |
| R17 | Telemetria | T16 |
| R18 | Billing | T17 |
| R19 | Auth e isolamento | T18 |
| R20 | Transição e rollout | T20 |
| R21 | Qualidade e desempenho | T01, T05, T19 |
| R22 | Documentação e passagem | T21 |

## 6 Fixtures e evidências a preparar

### 6.1 Briefing BizuMiner

Usar o texto fornecido pelo proprietário, sem presumir que ele já seja copy final:

> Você viu um desconto de 50% em um produto e ficou com vontade de comprar. Mas em algum momento percebe que o desconto tem que ser em relação a alguma coisa, e não saber o preço ao longo do tempo gera desconfiança. Por isso resolvemos essa questão com o BizuMiner. Acompanhamos diariamente os preços dos produtos, e você pode acompanhar os produtos que quiser, salvando como favoritos.

Não exigir a mesma frase proposta como exemplo na auditoria. Avaliar significado, síntese, hierarquia e fatos. O teste deve permitir boas soluções editoriais diferentes.

### 6.2 Outros pedidos e documentos

Preparar, no mínimo:

- Uma frase literal: “Use apenas esta frase na arte, exatamente como está: ‘Comprar bem começa por comparar.’”
- Uma lista com exatamente 15 itens solicitados; conferir a soma de itens, não apenas o número de blocos.
- Pedido livre e um documento sintético com 20 blocos para edição/persistência. Não presumir que todo conteúdo extenso caiba em um único quadrado sem ajuste.
- Métrica e citação com evidências sintéticas explícitas, mais casos sem evidência que devam ser recusados ou redigidos sem inventar fatos.
- Briefing com foto real autorizada e equivalente sem foto; variante com mídia opcional e outra obrigatória.
- Marca com paleta/fontes restritas e preferência de estilo; conferir políticas separadamente.
- Histórico convencional, composição V2, conteúdo V2/V3, receita portátil anterior e envelope novo.
- Documento com título e superfície centralizados, grupo rotacionado, duas imagens, logo, rich text, sombra/contorno e camada adicional.
- Carrossel com três slides e estruturas distintas.
- Arquivos inválidos, fonte indisponível, asset sem grant e resposta com candidato que não foi oferecido.

Escolher resultados preservados para reproduções determinísticas do renderer. Usar LLM real para provar o percurso integrado e qualidade atual; mocks não substituem essa prova. Repetições pagas devem ter finalidade e orçamento registrados, sem polling ou geração indefinida.

### 6.3 Pacote de evidências independente

Criar pasta própria sob `artifacts/editor-unificado-review/`, separada da pasta do implementador. Guardar revisão/ambiente, matriz R01–R22, logs, passos, screenshots/PNGs, JSONs pertinentes, hashes, consultas e achados. Evitar segredos e dados privados desnecessários.

Por caso, registrar: precondições, entrada, ação, esperado, observado, resultado, duração, revisão e caminhos de evidência. Cada constatação visual deve indicar qual documento e estado foi visto.

## 7 Casos de conferência

### T00 Baseline e escopo real

**Procedimento:** comparar revisão entregue, diff, manifesto e alterações preexistentes. Conferir que backups/fixtures não foram substituídos silenciosamente. Identificar cliente, servidor e projeto Supabase efetivamente usados. Não confiar somente na porta ou no nome da aba.

**Aprova:** revisão e ambiente reprodutíveis; mudanças da tarefa separadas; referências preservadas; efeitos colaterais documentados.

**Reprova:** limpar alterações de terceiros, atribuir resultados de outra revisão à atual, confundir localhost e deploy ou regravar referências para esconder regressão.

### T01 Qualidade editorial e visual do BizuMiner

**Procedimento:** executar pelo TheVoid nas condições declaradas. Registrar as três propostas, conteúdo visual e metadados, candidato/origem, fontes e medidas resolvidas. Abrir ao menos uma proposta e concluir salvar/reabrir/exportar.

**Aprova:** mensagem principal compreensível; relação desconto/histórico correta; benefícios sustentados pelo briefing; hierarquia perceptível; explicação longa adequadamente organizada; diversidade visual quando prometida; arte e legenda identificadas.

**Reprova:** todos os papéis tratados como parágrafos iguais; texto visual redundante sem direção editorial; fatos inventados; três resultados visualmente equivalentes anunciados como direções distintas; perda silenciosa de blocos.

Não reprovar apenas porque a copy difere de um exemplo da auditoria. Não declarar perda com base na existência de legenda/hashtags fora da arte. Comparar a cobertura dos blocos semânticos e a renderização efetiva.

### T02 Contratos e liberdade de conteúdo

**Procedimento:** executar os casos literal, lista de 15 itens, quantidade livre, tipos sem título obrigatório e evidências factuais. Inspecionar schema principal/reparo, validação do servidor e conteúdo congelado. Exercitar limites técnicos e contratos históricos com testes isolados.

**Aprova:** contagens e literalidade respeitadas; pedido sem título não recebe título compulsório; fatos preservados; limites técnicos claros; editor não herda caps editoriais da geração; reparo limitado e coerente.

**Reprova:** truncar para caber, reduzir lista, inventar métrica/citação, aceitar IDs duplicados, impor campos legados ou mover copy congelada para legenda sem ação explícita.

### T03 Fallback e prontidão

**Procedimento:** cobrir catálogo off, nenhum publicado, publicado incompatível, asset indisponível, timeout e seleção válida. Usar simulações controladas para falhas, sem desligar produção. Inspecionar UI, resposta, compilação e trace.

**Aprova:** mensagem/origem correspondem ao caminho; papéis V3 resolvidos; medição com fonte real; fallback utilizável, diverso quando aplicável; tentativas finitas; degradação identificada.

**Reprova:** esconder aviso sem resolver causa; chamar fallback de design publicado/família antiga; aceitar texto cortado por ter schema válido; retornar às comparações de seletor incompatíveis com V3.

### T04 Recuperação, shortlist e escolha

**Procedimento:** usar coleção elegível com estilos realmente distintos e casos sem cobertura. Inspecionar filtros, perfil/âncora, vetor/métrica, ordenação, deduplicação e cartões enviados à LLM. Injetar candidato não oferecido num teste de contrato.

**Aprova:** no máximo a shortlist contratada; JSON completo hidratado após escolha; mídia/marca/formato/cobertura filtrados; diversidade por design; ID não oferecido rejeitado; ausência de candidato explicada.

**Reprova:** publicar Minimal Air e declarar diversidade suficiente; contar formatos como estilos; foto obrigatória sem mídia; todos os JSONs no contexto; nearest neighbor ignorando restrições; consulta legada sem efeito não contabilizada.

### T05 Acervo e preservação das famílias

**Procedimento:** reconciliar todas as entradas do inventário de 69 receitas e as 14 famílias ativas. Conferir original/Stage de referência, receita convertida, fontes, efeitos, grupos, formatos e três comprimentos de conteúdo. Gerar prova de renderização para cada entrada declarada pronta e amostra aprofundada por classe de estrutura/efeito.

**Aprova:** cada entrada tem destino e evidência; diferenças intencionais identificadas; 4:5 atual correto; 5:6 preservado; fontes/pesos reais; vínculos reutilizáveis; backups intactos. Aprovar R07 integralmente exige que todas as pendências obrigatórias tenham resolução aceita.

**Reprova:** contar JSON como design pronto; omitir Stroke Impact/Cinematic Depth; transformar arco/extrusão em texto simples e chamar de equivalente; classificar campos desconhecidos como corpo; manter imagem sintética como mídia final; usar renderer histórico diferente sem explicar a mudança.

### T06 Publicação e curadoria

**Procedimento:** ler catálogo, evidências e hashes reais. Conferir publicação apenas pela operação guardada e consistência de cards/índices/assets. Em ambiente isolado, tentar publicar sem evidência, com hash antigo, asset faltante e versão de compiler incompatível.

**Aprova:** negações funcionam; evidência corresponde à variante final; aprovação humana tem procedência verdadeira; drafts não entram na geração comum; novos designs publicados aparecem sem patch manual de código por referência.

**Reprova:** autoaprovar por confiança/tempo para contornar o contrato vigente; reutilizar aceite de uma imagem anterior para geometria/fonte diferente sem conferência; gravar aprovação fictícia; bypass de publicação ou reindexação inconsistente.

### T07 Documento canônico e versões

**Procedimento:** seguir a fonte de cada texto/asset do editor ao JSON salvo. Ler envelopes e receitas antigos/novos; comparar antes de abrir, depois de abrir e após edição que exige upgrade. Conferir hashes da base e campos rejeitados por leitores estritos.

**Aprova:** fonte única de conteúdo; projeções derivadas; base imutável; versões independentes; abrir não migra visualmente; edição nova persiste sem alterar história.

**Reprova:** conteúdo duplicado e divergente em headline/composition/camada, campo extra descartado, alteração de hash publicado, serialização que funciona só enquanto a aba está aberta.

### T08 Comandos, histórico e concorrência de edição

**Procedimento:** para cada comando da matriz de implementação, executar efeito → undo → redo → salvar → reabrir → exportar. Inspecionar handlers diretos de `setPost` e comprovar quais são somente estado transitório. Disparar resposta lenta de fonte/imagem/reorganização e editar o documento antes de sua conclusão.

**Aprova:** comando altera fonte correta; transação de histórico coerente; seleção e revisão respeitadas; resposta obsoleta não sobrescreve trabalho novo.

**Reprova:** botão altera campo ignorado pelo Stage; UI aparenta funcionar mas reabertura perde efeito; undo parcial deixa relações quebradas; evento atrasado restaura texto antigo.

### T09 Painel comum e usabilidade

**Procedimento:** abrir histórico, família convertida, design artístico e fallback em desktop e mobile. Alternar compacto/completo; comparar documento/hash antes/depois; selecionar texto, imagem, logo, grupo e múltiplos elementos. Exercitar teclado, toque e foco.

**Aprova:** organização comum por tarefa/seleção; ferramentas essenciais presentes; troca de modo não altera conteúdo/geometria; modo compacto mantém a prancheta utilizável; legenda separada da arte; diagnóstico técnico discreto.

**Reprova:** origem escolhe painel inferior; compactação esconde permanentemente recursos; sidebar antiga foi apenas empilhada ao inspetor novo; controles sem efeito; teclado/drawer torna impossível editar no mobile.

### T10 Tipografia, fontes e efeitos

**Procedimento:** editar frase longa, acentos, quebra de linha, paste e IME; formatar trechos; trocar fonte/peso; inserir fonte do usuário; aplicar contorno/sombra/destaque. Simular carregamento lento/falha e comparar medições com o Stage. Exportar e reabrir.

**Aprova:** tamanho manual permanece estável durante digitação; expansão/quebra coerente; cursor preservado; arquivo/peso verdadeiro; efeitos persistentes; falha de fonte apresentada antes de resultado dependente dela.

**Reprova:** maxLength herdado da referência, fonte reduzida a cada tecla sem ação, falso peso, fallback silencioso de fonte na exportação, rich text com intervalos corrompidos ou efeito ignorado na composição.

### T11 Relações, grupos e coordenadas

**Procedimento:** substituir “Ver” por “Verificar todos os dias” em texto/superfície centralizados. Mover grupo rotacionado; editar uma propriedade ligada; liberar e reativar relação; duplicar e desagrupar; testar ciclos/conflitos em contrato isolado.

**Aprova:** âncora e expansão corretas; surfaceFit acompanha texto; geometria permanece ao liberar; somente vínculos necessários são afetados; transformações locais/mundiais coerentes; conflitos não produzem resultados aleatórios.

**Reprova:** elemento volta sozinho após arraste, relação libera todo o post, grupo salta ao desativar ajuste, geometria depende da ordem incidental de processamento ou vínculo fica pendurado após exclusão.

Para recombinação entre designs, conferir também entradas, dependências e incompatibilidades dos grupos, ordem de desenho e sobreposições intencionais. Rejeitar combinações incompatíveis antes de compor; não herdar aprovação visual apenas porque as peças originais eram aprovadas.

### T12 Mídia, fundo, logo e camadas

**Procedimento:** usar dois slots; substituir apenas um; adicionar imagem e logo a design sem slot; alterar fundo, crop/foco, posição, giro, overlay e ordem; duplicar/excluir camadas; salvar e reabrir com referências de assets resolvidas novamente.

**Aprova:** colocações independentes; mídia permanece no enquadramento; logo funciona no ramo comum; persistência durável; upload/geração usa fluxo e cobrança corretos.

**Reprova:** apenas primeiro `media` editável, imagem temporária desaparece, logo convencional salvo mas invisível, URL assinada expirada é a única identidade persistida, payload fitting remove uma camada silenciosamente.

### T13 Formatos e auditoria geométrica

**Procedimento:** exercer 1:1, 4:5 e 9:16; abrir 5:6 histórico. Aplicar projeção uniforme e, separadamente, variante nativa; comparar conteúdo, escala e positions. Reproduzir a transformação do post 95 em fixture própria. Testar oclusão por decoração e overlay.

**Aprova:** limites avaliados após grupos/projeção; sem distorção; 4:5 tem dimensões corretas; 5:6 não é convertido ao abrir; a variante nativa apresenta mudanças antes de aplicar; oclusão acidental detectada ou apontada na revisão visual.

**Reprova:** falso overflow por Y bruto, esticar texto/imagem para caber, relabel de 5:6 como 4:5, aceitar conteúdo escondido porque bounding box existe.

### T14 Carrosséis e replicação

**Procedimento:** gerar/abrir carrossel, duplicar, ordenar, remover e editar slides. Replicar apenas cores, depois tipografia e depois composição, incluindo destino com estrutura diferente. Salvar/reabrir/exportar todos os slides.

**Aprova:** conteúdo e mídia preservados conforme escopo; IDs únicos; sequência narrativa e edição atual mantidas; capacidade nova claramente delimitada.

**Reprova:** regressão do fluxo de carrossel existente, replicação permanentemente desabilitada por composição, copiar texto/mídia sem seleção de escopo, duplicar IDs ou transformar pedido estático em carrossel silenciosamente.

### T15 Persistência autenticada, portabilidade e exportação

**Procedimento:** criar post de teste pelo fluxo real; editar todos os tipos relevantes; salvar como novo, atualizar e clonar. Recarregar/abrir em nova sessão. Comparar documento autoritativo, assets, preview e PNG. Exportar/importar receitas anteriores e nova; simular dependência ausente.

**Aprova:** round-trip fiel pelo endpoint real; camada/fonte/efeito/recorte/texto mantidos; falhas de dependência claras; versão desconhecida não é gravada com perda de campos.

**Reprova:** demonstrar apenas localStorage ou harness; save HTTP rejeitado escondido por toast genérico; JSON salvo sem leitor; conteúdo foi removido para atender limite de payload; exportação usa aparência diferente da prancheta.

### T16 Traces e indicadores

**Procedimento:** seguir run → slot → candidato → compilação → post → revisão. Comparar contadores com eventos e telas; provocar fallback frontend depois de resposta válida do servidor; verificar avaliação visual ausente e exportação sem publicação.

**Aprova:** geradas, válidas, avaliadas, renderizadas, escolhidas e salvas têm semânticas distintas; modelo solicitado/efetivo, versões/hashes e motivos identificáveis; relatórios do cliente validados contra oferta/usuário.

**Reprova:** corrigir `accepted_count` preenchendo aprovação fictícia; chamar ausência de avaliação de nota zero; `completed` do servidor encobre falha de entrega; download marca `published`; cliente consegue reportar composição não oferecida.

### T17 Billing de conta comum

**Procedimento:** conferir tabelas/RPCs/assinaturas com o código ativo. Em ambiente autorizado, usar conta comum com saldo e registrar reserva, conclusão, falha, retry, timeout e concorrência. Inspecionar ledger antes/depois com dados de teste.

**Aprova:** integração coerente com ledger existente; commit/estorno corretos; idempotência; nenhuma cobrança duplicada ou reserva órfã; comportamento de falha de entrega definido.

**Reprova:** prova apenas com DEV/FOUNDER, ledger paralelo criado para contornar ausência, aliases de RPC sem semântica equivalente, ignorar erro de reserva ou tratar saldo negativo como fluxo normal.

Se não for possível executar com conta comum, R18 fica não verificado/bloqueado e liberação geral não está comprovada.

### T18 Autenticação, acesso e assets privados

**Procedimento:** conferir bridge Supabase/tRPC, sessão expirada, usuário comum versus administrador, acesso aos próprios posts e tentativa controlada de outro usuário acessar post/asset/relatório de compilação. Ler grants, políticas e funções privilegiadas.

**Aprova:** autorização no servidor; curadoria restrita; assets necessários resolvidos para quem tem direito; logout/expiração não permite gravar como outra identidade.

**Reprova:** interface oculta botão mas endpoint aceita; usuário acessa draft ou post alheio; asset privado tornado público por conveniência; segredo aparece no bundle/artefatos de teste.

### T19 Corpus, qualidade e desempenho

**Procedimento:** executar o corpus de 30 briefings ou equivalente documentado que preserve a cobertura, acrescentando BizuMiner. Registrar elegibilidade, shortlist, escolha, materialização, resultado visual e duração por caso. Separar execução fria/quente, dataset sintético/real, local/remoto e amostra de famílias.

**Aprova:** dados sustentam as metas declaradas; shortlist adequada ≥90%, materialização ≥95%, fallback inesperado ≤5% conforme denominadores definidos; rubrica visual aplicada; medição não confunde repetição de uma família com diversidade.

**Reprova:** usar benchmark com catálogo vazio como prova de relevância; reapresentar os 180 renders repetidos de Minimal Air como corpus; excluir silenciosamente falhas; usar número de testes como certificação estética.

A revisão deve conferir a métrica SQL/JS e o isolamento de versões dos vetores quando afetados. Limiares de performance dependem do ambiente e devem ser comparados ao baseline declarado, sem importar latência de WASM local como garantia do Supabase.

Definições para este aceite:

- **Shortlist adequada:** briefings elegíveis em que a shortlist contém ao menos um design capaz de representar a intenção/conteúdo com qualidade / total de briefings elegíveis. Determinar elegibilidade por inspeção independente do catálogo congelado, antes de observar a recuperação.
- **Materialização:** variações com candidato oferecido compatível e assets disponíveis que compilam preservando conteúdo e legibilidade / total de variações nessas condições. Uma falha inesperada nesse percurso permanece no denominador.
- **Fallback inesperado:** variações entregues em fallback apesar de haver candidato elegível capaz de representar o conteúdo final / total de variações com essa capacidade comprovada. Identificar separadamente escolhas justificadas de composição própria.
- Reportar também cobertura do catálogo e fallback total sobre toda a amostra. Casos negativos deliberados entram na verificação de diagnóstico, identificados separadamente. Não removê-los silenciosamente nem usar ausência de casos elegíveis como taxa de sucesso.

Guardar o julgamento de elegibilidade/adequação e os números absolutos junto às taxas. Se a amostra não permitir comprovar cobertura suficiente, registrar a limitação e não generalizar.

### T20 Compatibilidade de deploy e rollback

**Procedimento:** verificar leitura antiga/nova, cliente antigo com resposta/documento novo, aba aberta antes do deploy e rollback que desliga a escrita nova. Inspecionar migrations e runtime manifest, sem aplicar mudanças de produção por iniciativa da revisão.

**Aprova:** leitores prontos antes de escritores; cliente incompatível recebe condição clara; documento novo continua legível no rollback; flag e disponibilidade do catálogo têm responsabilidades explícitas.

**Reprova:** rollback apaga campos, parser rejeita documentos recém-salvos, desativar Arsenal é anunciado como retorno automático ao fluxo antigo apesar do despacho V3, migrations aplicadas sem correspondência de runtime.

### T21 Documentação e pacote de passagem

**Procedimento:** conferir mestre, contratos, inventário, decisões, logs e matriz de requisitos contra o código entregue. Verificar links, hashes e instruções reprodutíveis. Identificar pendências omitidas no resumo final.

**Aprova:** um novo agente localiza produtores/consumidores, versões, rollout e limites; evidências vinculadas à revisão; resultados históricos claramente identificados.

**Reprova:** documentação afirma implementação futura como concluída, ausência de dados chamada de aprovação, nomes de versões incoerentes ou pacote de evidências contém apenas screenshots sem origem/revisão.

## 8 Rubrica visual para a conferência

Avaliar cada proposta em dimensões separadas: clareza da mensagem, hierarquia, legibilidade, densidade, equilíbrio, coerência entre texto e imagem, marca e diversidade entre propostas.

Usar três classificações por dimensão: adequada, requer ajuste localizado, inadequada. Justificar com observação concreta: por exemplo, “o corpo disputa tamanho com o título” ou “a decoração encobre duas palavras”. Uma nota média não deve ocultar conteúdo ausente, fonte errada ou contraste insuficiente.

Distinguir preferência pessoal de violação. Uma solução estética diferente pode ser válida; perda de um efeito que fazia parte da preservação contratada precisa ser registrada. Revisão do conferente não substitui um requisito vigente de aprovação humana para publicar catálogo.

## 9 Execução e limites de comandos

Inspecionar `package.json` e scripts antes de rodar. Registrar stdout/stderr, exit code, revisão e duração. Usar timeouts e interromper o processo específico da revisão se travar, preservando o diagnóstico.

Exemplos de comandos existentes:

```bash
timeout 180 pnpm check
timeout 300 pnpm test
timeout 120 pnpm run verify:runtime
```

Executar separadamente. `verify:runtime` não é prova visual nem transacional. `verify:e2e` deve ser lido antes, pois sua nomenclatura não informa sozinha se há escrita, cobrança ou serviços externos.

Para build de conferência, usar saída isolada, conforme o documento de implementação, evitando sobrescrever `api/index.js`. Verificar frontend e backend. Build local não equivale a deploy.

Não aprovar somente pelos testes do implementador. Reproduzir casos críticos e inspecionar os testes: doubles permissivos, asserts só de existência, snapshots atualizados em massa e omissão de branches podem esconder o defeito.

## 10 Relatório final obrigatório

Entregar um relatório próprio com esta estrutura:

1. **Veredito e escopo:** revisão, ambiente, o que foi efetivamente conferido e o que faltou.
2. **Achados por severidade:** requisito/caso, passos, esperado, observado, causa comprovada ou hipótese, arquivos/linhas e evidências.
3. **Matriz R01–R22:** resultado e prova de cada requisito.
4. **Matriz T00–T21:** executado/aprovado/falhou/bloqueado, sem tratar caso não executado como sucesso.
5. **Qualidade visual:** rubrica, comparações e distinção entre preferência e violação.
6. **Persistência, catálogo e billing:** estado real e limites de ambiente.
7. **Regressões:** recursos do produto anterior preservados, alterados ou perdidos.
8. **Ações necessárias:** ordem de correção e o que deve ser revalidado.
9. **Evidências:** caminhos, hashes, comandos, run/post de teste e versões.

Modelo de achado:

```text
ID: REV-001
Severidade: P1
Requisito e caso: R12 / T10
Revisão e ambiente: ...
Passos para reproduzir: ...
Esperado: ...
Observado: ...
Impacto no usuário: ...
Causa: comprovada em arquivo/linha, ou hipótese explicitada
Evidência: caminho e hash quando aplicável
Correção necessária: resultado esperado, sem impor solução não investigada
Revalidação: casos que devem ser repetidos
```

## 11 Regra para o veredito

- **Integração conferida e aprovada:** requisitos obrigatórios comprovados no escopo autorizado, sem falhas abertas; estado de produção descrito separadamente.
- **Aprovada somente para piloto delimitado:** subconjunto comprovado e limites claros; não chamar de integração completa.
- **Reprovada:** falhas reproduzidas impedem o escopo declarado; listar os bloqueios.
- **Conclusão impedida por evidência ou ambiente:** não foi possível comprovar requisitos necessários; indicar exatamente o que falta.

Para declarar uso geral operacional, exigir geração pelo caminho real com catálogo elegível e fallback, edição unificada, salvar/reabrir/exportar e billing de conta comum. Não inferir isso de login administrativo, harness ou fixtures.

Texto sugerido para acionar o conferente:

> Confira de forma independente a implementação conforme `docs/conferencia-geracao-arsenal-editor-unificado.md`. Leia também o documento de implementação, a auditoria e o documento-mestre. Inspecione o código e execute as verificações autorizadas, reproduzindo os casos críticos com evidências próprias. Entregue veredito, achados por severidade e matrizes R01–R22 e T00–T21. Não modifique o produto para esconder falhas nem declare como aprovado algo não executado. Separe conclusão local, piloto e prontidão para uso geral.
