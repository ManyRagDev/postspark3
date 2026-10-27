# Plano de avaliação do pipeline textual

15/10/2026. Plano proposto, **não executado contra provedores**. Nenhuma correção autorizada por este documento. Fundamentação: [mapa do pipeline](</home/many/Documentos/Projetos linux/PostSpark 3/MAPA-PIPELINE-IA.md>) e [diagnóstico com evidências](</home/many/Documentos/Projetos linux/PostSpark 3/DIAGNOSTICO-QUALIDADE.md>).

## 1. Perguntas que a avaliação precisa responder

1. Público, essência, tom, requisitos e fatos relevantes chegam aos consumidores corretos?
2. Fonte adicional muda a adequação dos designs selecionados e a capacidade de explicar o mecanismo?
3. A copy final é fiel, clara, específica, natural e adequada à marca, além de passar pelo schema?
4. Recuperação melhora o campo defeituoso sem perder condições ou degradar campos saudáveis?
5. O revisor detecta dano material sem reprovar paráfrase, foco legítimo e preferência estética?
6. As propostas e `Gerar mais` oferecem diversidade útil dentro do que a fonte sustenta?

Não tratar `ready`, nota Jev, cobertura de IDs ou número de testes como resposta substituta a essas perguntas.

## 2. Baseline a congelar antes de qualquer comparação

Registrar HEAD **e hash do working tree relevante**: o estado auditado contém alterações não commitadas. Fixar também:

- preparação 3, política 7, versão de orientação editorial, modelo resolvido por chamada e configuração/hash;
- entrada original, brief realmente enviado, fonte exata recebida por cada etapa e origens/hashes;
- catálogo elegível, perfis v2, shortlist, notas/penalidades, três escolhas, substituições e definições/hashes;
- prompts/schemas **efetivos após o adaptador**, opções de geração, deadline e limites de recuperação;
- copy inicial, campos alterados na recuperação, copy final, legenda/hashtags, cenas e versão do renderer/fontes;
- pareceres reais, fixtures e rótulos humanos em conjuntos separados.

A captura deve ser sanitizada e usar biblioteca/fixtures autorizadas. Uma URL viva altera o experimento com o tempo: usar snapshot congelado. Não ativar trace integral global em produção para montar o corpus; preferir ambiente de avaliação isolado com dados próprios.

## 3. Primeiro estágio: avaliação sem chamadas de IA

### Integridade dos handoffs

Executar sondas com sentinelas distintas para público, essência, tom, nome, condições, CTA e instrução complementar. Capturar mensagens reais no limite de transporte, sem inferir presença só porque o objeto anterior contém o campo.

| Cenário | Verificação | Controle negativo |
| --- | --- | --- |
| Brand Kit + edição do modal | Comparar Kit → CreationBrief → pedido → redator → revisor/avaliador | Inserir dado só no Kit, ausente do rawInput; evita falso sucesso por duplicação. |
| Execution com URL/snapshot | Mesma condição factual no payload do Jev, seletor e copy | <=12 ofertas, quando não há Jev; e >12 com perfis compactos v2. |
| Imagem como insumo factual | Confirmar pixels/extração verificável no consumidor certo | URL da imagem dentro de uma string JSON não conta como imagem transmitida. |
| Múltiplas URLs | Enumerar o que foi efetivamente lido | Informação exclusiva da segunda URL não pode ser declarada verificada sem coleta. |
| Contexto longo | Checar informação no final e limite combinado | Texto acima do limite deve falhar explicitamente, sem aparentar leitura integral. |
| Snapshot sintetizado | Distinguir evidência original, síntese e fallback | Condição após 2.500 caracteres do corpo; warning/fallback não pode ser confundido com confirmação factual. |
| Requisitos | Literal/meaning/forbidden, art/caption/either e caixa | Termo só na legenda não satisfaz `art`; “dor” não bloqueia “liquidificador”; preservação Unicode sem apagar negação/unidade. |
| Retomada | Reutilizar resultado e configuração pinados | Completed não recompra; uncertain não executa automaticamente de novo; terminal não é reinterpretado pela política atual. |

Essas são propostas para ambiente descartável; não criar testes versionados ou alterar contrato neste papel. As sondas já realizadas e seus limites estão no diagnóstico. Não precisam de modelo real para demonstrar ausência de um campo.

### Reaproveitar as provas existentes corretamente

Comandos disponíveis, não pagos, a partir da raiz:

```bash
node --import tsx scripts/evaluateEditorialReplay.ts
pnpm exec vitest run shared/creationBrief.test.ts shared/contentRequirements.test.ts server/ai/workflows/generationContext.test.ts server/ai/workflows/generationPreparation.test.ts server/ai/workflows/proposalReviewV7.test.ts server/ai/workflows/editorialEvaluation.test.ts
```

O replay atual tem 33 casos e só quatro pareceres reais históricos, de políticas 1/2. Para comparar novas respostas, o script aceita `--responses=arquivo.json`, com `status`, `policyVersion`, `model`, `evidenceKind` e `inputHash`. Resultados ausentes devem continuar não medidos; fixtures devem continuar excluídas das métricas de modelo. A entrada alternativa substitui a base, sem preencher lacunas com políticas antigas.

O replay avalia pareceres já registrados; não chama LLM e não mede por si a qualidade da copy. O arquivo do harness V7 anterior contém evidência adicional separada. A bateria antiga `benchmark:editorial` não deve ser executada como se homologasse o fluxo V7 atual: seus prompts/contratos e datas precisam ser reconciliados primeiro.

## 4. Corpus editorial mínimo

Proposta inicial: **12 briefs de seis marcas fictícias ou autorizadas**, dois briefs por marca; quatro de texto factual, quatro baseados em snapshots de URL, dois com informação exclusiva em imagem e dois dependentes do Brand Kit. Cada um terá versão estática e carrossel, gerando **24 pedidos e 72 propostas por condição**, se a avaliação online integral for posteriormente aprovada. Começar com um piloto menor; este volume é desenho experimental, não ordem para comprar chamadas.

As marcas devem incluir vozes contrastantes: técnica, coloquial, sóbria, acolhedora, institucional e irreverente controlada. Cada marca precisa de exemplos positivos curtos e de limites negativos, não só um adjetivo de tom. Representar fonte curta e densa, CTA comercial e neutro, alternativas e sequência de passos, nomes compostos, números/unidades, condições comerciais, lista/comparação, intervenção literal e otimização leve. Carrosséis curtos e longos devem ser identificados separadamente.

Antes de gerar, anotar por brief:

| Campo de referência | Conteúdo |
| --- | --- |
| Ação desejada e público | Quem lê e o que deve entender/fazer. |
| Núcleo | Marca/produto, capacidade central e mensagem solicitada. |
| Fatos materiais e condições | Negações, limites, preços/prazos apenas quando fornecidos; condição obrigatória quando a promessa correspondente é usada. |
| Detalhes periféricos | Omissões permitidas e recortes legítimos, para não exigir repetição integral da fonte. |
| Requisitos explícitos | Literalidade, sentido, destino, caixa e proibições. |
| Voz | Exemplos/réguas verificáveis e preferências que são advisory. |
| Afirmações não sustentadas | Garantias, rapidez, universalidade, desconto, depoimento ou funcionalidade que não podem ser acrescentados. |
| Estrutura | Lista, comparação, texto pronto ou sequência requerida; o que pode ser reorganizado. |

Congelar os rótulos antes de olhar a saída. Uma divergência descoberta no padrão de referência deve ser corrigida com justificativa registrada e reavaliação de todos os grupos afetados, sem ajustar o rótulo apenas para concordar com o modelo.

## 5. Avaliação humana e semântica

Usar a rubrica de 0–4 do diagnóstico: fidelidade material, núcleo, clareza, especificidade, progressão, próximo passo, acabamento e voz/público. `N/A` quando não há fundamento ou aplicação. Não converter N/A em 4 nem esconder falsidade em uma média.

- Dois avaliadores independentes, cegos para modelo/condição, recebem fonte, objetivo, referência de marca e saída. Um pode focar edição/copy e outro fidelidade/produto; ambos registram motivo e trecho.
- Avaliar primeiro os textos da arte e depois a publicação com legenda; registrar se a ideia principal depende da legenda. Em seguida inspecionar os pixels, porque partição, hierarquia e clipping podem mudar leitura.
- Para carrossel, avaliar sequência completa e contribuição de cada página; alternativas não precisam virar passos. Não impor gancho/desenvolvimento/CTA como fórmula obrigatória quando o pedido exige outro formato.
- Distinguir benefício plausível/limitado de promessa absoluta. “Ajuda a aproveitar” e “elimina todo desperdício” não devem receber o mesmo rótulo.
- Registrar divergências e adjudicar com evidência. Publicar concordância bruta e número de casos discordantes; a nota do próprio revisor de produção não é o padrão independente.
- Comparar preferência pareada e motivo, além dos scores. Um texto pode ser correto e pouco desejável; outro pode ser atraente e factualmente impróprio.

Critérios de aceite iniciais, **propostos, não calibrados**: zero afirmação material inventada no conjunto de segurança; integridade de requisitos explícitos em todos os casos; notas pelo menos 3 nos critérios aplicáveis para uma peça considerada editorialmente adequada. Uma publicação materialmente falsa reprova mesmo com notas altas de estilo. O limiar de qualidade deve ser revisto no piloto com o proprietário; zero defeitos na amostra não prova taxa zero em produção.

## 6. Experimentos para separar causas

| Ordem | Hipótese e comparação | Manter constante | Medida principal |
| --- | --- | --- | --- |
| 1 | C1/H1: Brand Kit parcial versus representação que conserva público/essência, em harness autorizado | Modelo, prompt editorial, fonte, design e limites | Fidelidade do transporte; nota V/E/C e preferência cega. |
| 2 | C2/H2: seletor com versus sem fonte adicional | Catálogo/perfis, brief, notas e parâmetros | Adequação editorial das escolhas, capacidade de explicar o núcleo, motivos; controlar caminho com/sem Jev. |
| 3 | C3: avaliador com versus sem tom estruturado | Mesma copy e referência de marca | Detecção de deriva de voz e falso veto estético; não exige nova geração de texto. |
| 4 | H3: copy antes/depois de recuperação | Fonte, intervenção e cena autorada | Condições preservadas, ganho de encaixe, clareza e mudanças fora do alvo; motivo que gastou a recuperação. |
| 5 | C4/C6: scrape simples versus snapshot de site com origens/estado conhecidos | Mesmo site congelado e restante do pipeline | Fatos efetivamente disponíveis, voz, omissões no corte e alegações sem suporte. |
| 6 | H4/H5: alternativa de modelo **ou** temperatura, após controlar contexto | Prompts/schemas/payload/catalogo idênticos | Qualidade cega, falhas materiais, latência/custo; alterar uma variável de cada vez. |

As condições alternativas são entradas de avaliação isolada, sem patch no produto nesta tarefa. Não gastar a primeira rodada trocando simultaneamente modelo, contexto, design e regras: isso impede atribuição causal.

Diversidade merece uma medição própria, por conjunto de três e entre pedido inicial/`Gerar mais`: repetição de mecanismo legítimo, repetição de formulação e repetição vazia são classes diferentes. Normalizar nomes não deve esconder perda de identidade. Medir novidade útil por avaliadores, usando similaridade textual apenas como sinal auxiliar.

Para causalidade, preferir comparações pareadas no mesmo brief; agrupar resultados por brief/marca. Três propostas do mesmo pedido não são três usuários independentes. Uma rodada pequena identifica mecanismos e exemplos, sem produzir uma taxa universal de qualidade.

## 7. Calibração do revisor

Montar pares mínimos com rótulos independentes:

| Permitido | Materialmente incorreto |
| --- | --- |
| Paráfrase que conserva mecanismo | Troca de agente, negação ou funcionalidade. |
| Convite neutro sem anunciar gratuidade | “Grátis para sempre” quando só há teste de sete dias. |
| Benefício limitado e plausível | Resultado garantido, universal ou instantâneo sem suporte. |
| Foco que omite detalhe periférico | Retirar condição necessária de uma promessa usada. |
| Capa simples ou CTA alternativo coerente | Nome/entidade alterados ou requisito explícito descumprido. |
| Palavra legítima contendo trecho proibido | Palavra/frase proibida no sentido/destino contratados. |
| Markdown/Unicode equivalentes na citação | Citação com número, unidade ou negação alterados. |
| Diferença de gosto, espaçamento autorado | Informação essencial efetivamente cortada/ilegível nos pixels. |

Registrar matriz: dano real aprovado, dano real corrigido, peça válida rejeitada, peça válida aprovada; `inconclusive` e falhas de protocolo/renderer em categorias próprias. Mostrar denominadores: falsas aprovações entre peças materialmente erradas, falsas rejeições entre peças válidas, inconclusões entre todas. Nunca contar inconclusão ou ausência de parecer como sucesso.

Também separar texto de imagem embutida, arte de legenda/hashtags e primeira revisão de recheck. Um campo corrigido não autoriza ignorar dano novo em campo saudável; uma nova preferência estética no recheck não autoriza veto material.

## 8. Custos, execução futura e relatório de encerramento

O estágio offline é suficiente para reproduzir os handoffs confirmados. O estágio com modelo real depende de uma etapa futura explicitamente autorizada, com corpus/destino/modelos, número máximo de tentativas e orçamento definidos. Não foi iniciado nesta investigação.

Registrar `providerId`, tokens, custo retornado versus estimado, latência por etapa, timeouts/truncamentos, quantidade de recuperações e artefatos por fingerprint. Contar tentativas rejeitadas e incertas; não repetir efeito uncertain. Planejar a partir da estrutura real — seleção + três copies + três revisões, mais Jev/mídia/recuperações — e do piloto, sem usar preços históricos hardcoded como fatura ou teto da conta.

Relatório final por condição deve conter:

1. Versão/hashes e dados efetivamente enviados a cada etapa.
2. Todos os pedidos e propostas, incluindo failed/partial/inconclusive, sem selecionar só os melhores ready.
3. Notas independentes, preferência pareada e trechos justificadores; N/A visíveis.
4. Erros materiais e matriz do revisor, separados de gosto, falhas técnicas e protocolo.
5. Custo/latência e resultado antes/depois da recuperação.
6. Causas demonstradas, hipóteses remanescentes e alcance da amostra.

Encerrar somente quando houver evidência suficiente para a decisão específica; não prometer que uma troca de modelo ou um novo agente resolverá tudo. Próximo papel necessário: avaliador/editorial; arquitetura/implementação ficam em etapa posterior, se solicitada. Documento-mestre foi revisado nesta investigação e permanece inalterado pelo limite de escrita da skill `investigador`.
