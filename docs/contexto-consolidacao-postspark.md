# Contexto e decisões da consolidação do PostSpark

Atualizado em 9 de outubro de 2026. Registro da intenção do proprietário e das decisões desta conversa, para orientar a continuidade do trabalho. O [DOCUMENTO_MESTRE](../DOCUMENTO_MESTRE.md) permanece a referência do funcionamento técnico; este arquivo preserva o objetivo da reforma, inclusive onde ele exige mudar o funcionamento atual.

## Leitura essencial para retomar o trabalho

**O objetivo é consolidar a arquitetura do PostSpark e concluir a experiência de criação. Integrar Jev é uma parte desse trabalho. O pipeline único ainda não foi entregue.**

1. O usuário fornece uma ideia e recebe três propostas de post ou carrossel prontas para uso. Editar é uma possibilidade rica, não uma obrigação para terminar o trabalho da IA.
2. A reforma precisa resolver o conjunto: produto, geração, acervo, contratos de IA, execução, persistência, editor e manutenção. Correções isoladas não substituem essa consolidação.
3. O destino acordado é um único caminho de geração. A bifurcação V4/V5 é uma transição incompleta, não uma característica permanente do produto.
4. A base recomendada e acolhida para a consolidação é a execução persistente hoje chamada V5, incorporando as capacidades necessárias do V4 e retirando o caminho substituído após validar a migração.
5. Cada uma das três propostas precisa ter estado, entrega e recuperação independentes. O sucesso de uma não deve depender do sucesso das outras.
6. Jev tem uma função restrita: avaliar a adequação dos designs ao pedido e oferecer uma lista curta à LLM. A LLM continua responsável pela escolha editorial e pelo restante do pipeline.
7. A implementação inicial usa **X = 12 famílias**, hipótese a calibrar com testes reais. Para carrosséis, cada opção precisa conter os modelos necessários à sequência. X não é o número de propostas finais, que continua sendo três.
8. Todas as possibilidades de design precisam de uma descrição comparável e útil. Descrever um modelo, torná-lo executável e aprovar sua qualidade são trabalhos diferentes.
9. Aumentar a variedade deve ampliar possibilidades criativas. Rótulos temáticos, funções comunicativas fixas e cortes ocultos não podem estreitar indevidamente a escolha.
10. A arquitetura deve permanecer proporcional ao problema. Evitar novas versões paralelas, cadastros redundantes e infraestrutura adicionada sem necessidade demonstrada.

**Ponto de retomada:** transformar o fluxo existente em um único motor e revisar a participação do acervo. A última implementação do Jev foi incremental e não encerrou esse objetivo.

## Como chegamos ao problema atual

No início, o PostSpark trabalhava com poucos designs, escolhidos editorialmente pela LLM conforme o pedido. O proprietário citou estilos como glitch, neobrutalism e brutal split. A seleção tinha menos alternativas, mas uma organização mais compreensível.

Depois, referências visuais foram convertidas em JSONs extensos, alguns com aproximadamente três mil linhas. A intenção original era modularizar os designs e ampliar o repertório. Segundo o proprietário, a modularização não produziu o resultado esperado, mas as estruturas permaneceram. O motor passou a conviver com abordagens diferentes para testes; correções e novas versões se acumularam.

O problema relatado é duplo: a manutenção ficou difícil e a variedade armazenada não se traduz em variedade percebida. Nos testes do proprietário, os mesmos designs reapareciam. Essa observação motivou investigar o que a IA realmente recebe, quais modelos são excluídos e quais características ficam invisíveis nas descrições.

A solicitação começou como diagnóstico, sem implementação. Evoluiu para uma revisão geral do aplicativo e para a decisão de consolidar a arquitetura. Em seguida, houve um recorte deliberado para estudar a seleção do acervo sem explodir a janela de contexto. Esse recorte não substituiu o objetivo maior.

O proprietário explicitou a premissa:

> “ser uma suite de criação de posts no qual o usuário não vai precisar editar. Mas se quiser, ele tem um arsenal imenso de ferramentas.”

Também explicitou a direção estrutural:

> “Preciso de uma unificação.”

## Decisões e limites do acordo

| Assunto | Direção registrada | Situação |
| --- | --- | --- |
| Produto | Entregar três propostas utilizáveis a partir da intenção do usuário, com edição ampla e opcional | Objetivo central |
| Arquitetura | Um único caminho de geração, com responsabilidade clara por etapa | Decidido; consolidação pendente |
| Base de execução | Aproveitar a execução persistente atual do V5 e absorver capacidades necessárias do V4 | Direção acolhida; migração pendente |
| Versões | Manter versões de contratos e leitores quando necessárias para compatibilidade, sem manter motores concorrentes indefinidamente | Direção da consolidação |
| Jev | Pré-seleção de designs para a LLM, sem assumir copy, renderização ou coordenação do aplicativo | Papel delimitado; integração local implementada |
| Quantidade de candidatos | Entregar mais de três opções; começar com 12 famílias | Estimativa implementada; qualidade a calibrar |
| Padronização | Uma ficha comparável para modelos completos e famílias básicas, derivada das fontes existentes | Contrato inicial implementado; enriquecimento e cobertura útil pendentes |
| Qualidade do acervo | Avaliar os designs derivados antes de decidir o que manter, corrigir ou retirar | Pendente; origem ou volume de JSON não comprovam qualidade |
| Formatos | Revisar a exclusão precoce por proporção, considerando a liberdade de edição | Preocupação registrada; adaptação automática ainda precisa de definição e prova |
| Complexidade | Escolher a menor solução que atenda à experiência e à confiabilidade necessárias | Restrição permanente de projeto |

“Teoria fechada”, nesta conversa, autorizou avançar para a prática dentro dessa direção. Não tornou toda hipótese de qualidade ou detalhe de implementação uma conclusão validada.

## Arquitetura de destino

```mermaid
flowchart TD
    A[Pedido do usuário] --> B[Preparação do briefing e contexto]
    B --> C[Acervo e fichas comparáveis]
    C --> D[Jev avalia e oferece X opções]
    D --> E[LLM escolhe três propostas]
    E --> P1[Execução da proposta 1]
    E --> P2[Execução da proposta 2]
    E --> P3[Execução da proposta 3]
    P1 --> G[Galeria recebe cada proposta pronta]
    P2 --> G
    P3 --> G
    G --> H[CanvasLab para editar salvar e exportar]
```

A preparação pode ser compartilhada. Depois da escolha, copy, mídia necessária, verificações e recuperação pertencem a cada proposta. Num carrossel, a unidade entregue é a sequência íntegra. Resultados concluídos devem sobreviver à falha de uma proposta irmã e à retomada da execução.

Na conclusão da migração, o Studio deve ter uma única forma de iniciar e acompanhar a geração. A escolha V4/V5 deixa de fazer parte do uso normal. Compatibilidade histórica pode conservar leitores, adaptadores e versões de schema; isso não exige conservar dois geradores ativos. Criar uma V6 ao lado das anteriores não satisfaz essa decisão.

### Fonte da verdade por responsabilidade

“Fonte única da verdade” significa eliminar autoridades concorrentes sobre a mesma informação. Não significa colocar catálogo, execução e documento editável em um único objeto gigante.

| Responsabilidade | Direção |
| --- | --- |
| Design disponível | Definição executável identificada e suas capacidades verificadas. A ficha de seleção é uma projeção dessa fonte |
| Execução | Estado persistido do pedido e de cada proposta, incluindo operações concluídas, falhas e retomadas |
| Post editável | `CanvasPostModel` no CanvasLab, com salvamento e reabertura fiéis em `canvas_model` |
| Histórico | Leitura compatível dos documentos existentes, sem reativar motores antigos para novas gerações |

## O que a revisão do acervo precisa resolver

**Qualidade dos modelos derivados.** O proprietário questionou se composições montadas a partir das referências têm qualidade suficiente e se devem permanecer. Essa questão continua aberta. Hierarquia, legibilidade, composição, encaixe real, utilidade e diversidade precisam orientar a avaliação. Não manter um modelo apenas porque ele já existe; não descartá-lo apenas por ter sido derivado artificialmente.

**Informação desigual.** Designs prontos têm muitos parâmetros; famílias básicas têm descrições mais pobres. Uma ficha com os mesmos campos é o começo da padronização, mas não garante evidência equivalente. Características ausentes precisam ser extraídas das definições, verificadas em renders ou registradas como desconhecidas. Não inventar capacidade para preencher campos.

**Função comunicativa sem aprisionamento.** A preocupação expressa foi que descrever um design como “reflexivo” pode favorecer alguns pedidos e excluir outros que também funcionariam nele. Priorizar características e possibilidades observáveis: hierarquia, densidade, ritmo, contraste, tipografia, espaço para imagem e estrutura do conteúdo. Afinidade comunicativa, se usada, deve ser um sinal flexível, não uma autorização exclusiva de uso.

**Cobertura real.** Um design armazenado pode estar ausente da seleção por publicação, baseline técnico, proporção, marca, papéis ou falta de informações. Registrar por que cada conjunto está fora e o que falta para se tornar utilizável. A expressão “todos os elegíveis foram avaliados” não prova que todas as possibilidades do PostSpark participaram.

**Mudança de formato.** O usuário não considera satisfatório organizar a escolha criativa apenas pelo formato inicial, pois a proporção pode mudar no editor. A reforma precisa revisar esse filtro. A existência de edição manual não prova que qualquer design possa ser adaptado automaticamente com qualidade; essa capacidade precisa ser definida e testada antes de ampliar a elegibilidade.

**Crescimento contínuo.** O proprietário continuará adicionando referências. A entrada de um design deve alimentar o mesmo catálogo e o mesmo método de descrição, sem exigir uma nova versão do motor ou um segundo cadastro manual de seleção.

## Seleção com Jev e alternativas discutidas

Jev foi considerado para reduzir o contexto entregue à LLM: ele recebe descrições padronizadas e identifica opções relacionadas ao pedido. O acordo restringe sua função a essa etapa. A escolha não constitui prova de superioridade estética; o ranking ainda precisa ser comparado com escolhas humanas e com uma alternativa simples de referência.

O valor inicial de 12 oferece espaço para a LLM escolher três propostas sem carregar o catálogo inteiro. No código atual, são até 12 famílias, com os modelos necessários por papel de carrossel. Catálogos com até 12 cards dispensam a chamada. A discussão de expansão para 18 não virou comportamento implementado. Tamanho da lista, diversidade e custo devem ser calibrados com briefs reais, sem multiplicar regras antes dessa medição.

| Possibilidade levantada | Contexto preservado |
| --- | --- |
| Bússola SGC ou Compass D0 | Foi proposta uma recuperação inspirada na indexação, sem exigir a suíte completa, difusão de calor ou Dirichlet. Não há experimento comparativo registrado nesta entrega que demonstre sua superioridade ou inferioridade |
| pgvector | Foi levantado como possível apoio à recuperação e à consciência do acervo. Não foi adotado como requisito da pré-seleção atual nem substitui a necessidade de boas descrições |
| Harness de IA | Interesse em organizar contratos, execução, persistência, tentativas e avaliação de resultados. Isso não implica construir uma plataforma adicional para a seleção |
| LangGraph | O proprietário reconheceu flexibilidade e preocupou-se com a complexidade lógica. Já existe no coordenador atual; sua presença não comprova a consolidação dos fluxos |
| Playwright | Foi perguntado qual seria seu papel e se serviria ao avaliador. O desenho de avaliação visual continua pendente; não registrar a adoção de um agente crítico como decisão já tomada |

Há liberdade para propor bibliotecas, contratos, fluxos e métodos diferentes. Documentação e regras herdadas descrevem o que existe e podem ser revistas à luz do objetivo do produto. Essa liberdade deve ser usada com evidência e responsabilidade pelos impactos, sem transformar toda possibilidade técnica em requisito.

## Estado concreto ao final desta retomada

| Item | Estado registrado em 9 de outubro de 2026 |
| --- | --- |
| Geração V4 | Ainda é o caminho padrão do Studio, via `post.generate`, executando durante a requisição |
| Geração V5 | Tem preparação, executor separado, estado persistido e propostas independentes; a entrada continua condicionada ao piloto DEV e à disponibilidade do executor |
| Bifurcação no produto | Continua presente no Studio. O pipeline único ainda não existe |
| Jev | Etapa compartilhada por V4 e V5, implementada localmente; integrar a ambos não eliminou a bifurcação |
| Fichas | Projeções de `ComponentCardV1` e das famílias básicas, sem outro catálogo persistido |
| Elegibilidade | Os filtros anteriores à pré-seleção continuam ativos. A ficha não publica modelos nem reativa famílias legadas |
| Padronização e qualidade | O contrato inicial existe; a revisão estética, o enriquecimento das lacunas e a disponibilização de todo o repertório desejado continuam pendentes |
| Validação do Jev | Testes automatizados e simulação local; sem validação do ranking por chamada real nesta entrega |

Na implementação anterior desta conversa, `pnpm check` passou e a suíte registrou 143 arquivos e 1.445 testes aprovados. No inventário local analisado, foram produzidas fichas para 112 modelos completos e 12 famílias básicas. Uma simulação com notas artificiais considerou os 29 modelos elegíveis em 4:5 e reduziu o catálogo para a LLM de aproximadamente 90 KB para 22 KB. Esses números demonstram cobertura do conjunto elegível e redução de payload, não qualidade visual nem disponibilidade atual em produção. Detalhes e limites estão em §13.85 do documento-mestre.

A implementação compartilhada foi uma melhoria parcial. O proprietário apontou que manter V4 e V5 contraria o destino de um pipeline único. A resposta aceita foi encerrar essa bifurcação, aproveitando a base persistente e preservando as capacidades necessárias durante a migração. Esse alinhamento deve orientar a próxima entrega.

## Próxima entrega estrutural e critérios de conclusão

A próxima entrega deve começar pelo mapa de capacidades e consumidores dos dois caminhos: entrada do pedido, briefing, marca, catálogo, copy, imagem, recuperação, galeria, histórico, editor, persistência e billing. Para cada responsabilidade, estabelecer o módulo que ficará responsável e o caminho que será absorvido ou retirado. Esse mapa deve levar à migração concreta; não abrir mais uma linha de implementação paralela.

Critérios para considerar a consolidação concluída:

1. Novos pedidos percorrem um único caminho de geração; o Studio não exige escolher uma versão do motor.
2. Seleção, geração, conferência e persistência têm responsabilidades identificáveis, sem duas implementações produtivas concorrentes para a mesma tarefa.
3. As três propostas têm execução, entrega e recuperação independentes, com retomada consistente e preservação do trabalho concluído.
4. O catálogo possui critérios explícitos de entrada e exclusão, fichas úteis e um procedimento sustentável para novos designs. A variedade e a adequação são verificadas com pedidos reais.
5. Prévia, edição, salvamento, reabertura e exportação preservam o post; mídia necessária chega preenchida; autenticação, autorização de assets e cobrança continuam coerentes com a entrega.
6. Caminhos substituídos, seletores de versão, flags e dependências sem uso são retirados ou isolados como compatibilidade documentada. Renomear arquivos ou compartilhar um helper não basta.
7. As evidências distinguem testes simulados, execução real, qualidade percebida e implantação. O documento-mestre descreve o fluxo efetivamente entregue.

## Referências para a continuidade

- [DOCUMENTO_MESTRE](../DOCUMENTO_MESTRE.md): estado técnico e histórico de verificações; §13.85 registra a etapa Jev. Seções antigas precisam ser lidas com suas revisões posteriores.
- [Arquitetura por composições](./arquitetura-geracao-por-composicoes.md): origem e responsabilidades do caminho V4; não é a definição final da arquitetura consolidada.
- [Blueprint da geração orquestrada](./blueprint-geracao-orquestrada.md): contratos, independência e preservação de capacidades; suas afirmações de implantação precisam ser cruzadas com o runtime atual.
- [Studio ativo](../client/src/pages/StudioApp/StudioAppV2BPage.tsx), [entrada persistente](../server/routers/generation.ts) e [runtime persistente](../server/ai/workflows/generationRuntime.ts): pontos centrais da migração.
- [Fichas comuns](../shared/designSelection.ts), [pré-seleção Jev](../server/designCatalog/designShortlist.ts) e [entrada de designs](../designs/README.md): etapa já implementada e procedimento de ampliação do acervo.

## Como manter este contexto útil

Ao retomar o trabalho, ler primeiro a seção essencial deste arquivo e o estado atual no documento-mestre. Uma tarefa sobre Jev, formato, copy ou um bug do editor deve ser situada no objetivo de consolidação; não presumir que o assunto mais recente substituiu a direção original.

Atualizar decisões, estado e pendências nas seções correspondentes quando houver mudança. Não marcar uma intenção como implementada nem uma implementação como validada sem a evidência adequada. Se houver uma nova decisão do proprietário, registrá-la explicitamente e substituir a orientação superada, evitando acumular conclusões incompatíveis.

Esta rodada registra o contexto. Não executa a migração nem altera o funcionamento do aplicativo.
