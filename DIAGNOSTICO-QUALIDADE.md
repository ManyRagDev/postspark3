# Diagnóstico da qualidade textual e dos handoffs

15/10/2026 — investigação sem correções. Estado geral: **CAUSA_CONFIRMADA para perdas específicas de dados; HIPOTESE para sua contribuição quantitativa à qualidade final**. Não foi fornecido um texto problemático novo nem uma expectativa editorial única pelo usuário; o pedido é auditar o pipeline. Não se presume que toda saída atual esteja ruim.

O [mapa](</home/many/Documentos/Projetos linux/PostSpark 3/MAPA-PIPELINE-IA.md>) identifica o caminho ativo; o [plano de avaliação](</home/many/Documentos/Projetos linux/PostSpark 3/PLANO-AVALIACAO.md>) define como medir as consequências ainda não demonstradas.

## 1. Conclusão sustentada

O pipeline atual tem redação e revisão separadas, fontes e configuração de revisão pinadas, medição tipográfica real e recuperação delimitada. Não é o orquestrador único antigo. A principal fragilidade observável está **na construção das entradas**: cada etapa recebe uma projeção diferente do briefing/marca. Há perdas antes da primeira chamada de copy e uma assimetria concreta entre o contexto visto pelo Jev, pelo seletor final, pelo redator e pelo revisor.

Uma proposta `ready/passed` passou pelo contrato material e técnico configurado. Esse estado não atribui nota de voz, criatividade, naturalidade ou qualidade comercial. A própria revisão manda tratar gosto e vários aspectos de acabamento como advisory. Portanto, aprovação operacional pode coexistir com copy genérica ou repetitiva sem constituir falha do gate material.

Não há evidência suficiente para atribuir a qualidade geral ao modelo escolhido, a temperatura, a falta de um novo agente ou a uma suposta remoção global de fatos. Foram localizados mecanismos específicos e amostras limitadas, não uma taxa de defeitos em produção.

## 2. Estado e método

Raiz `/home/many/Documentos/Projetos linux/PostSpark 3`, branch `main`, HEAD `40c08323d9f4f3d0fd097a04844f81f9dc9d4b61`. Status inicial: 94 entradas versionadas alteradas/removidas, 114 não rastreadas, nenhum staged. A arquitetura V7 e várias evidências já eram alterações locais. Não foram atribuídas a esta investigação nem revertidas.

Foram lidos o documento-mestre e os produtores/consumidores conectados: Studio, adaptador de briefing, schemas, admissão, contexto, preparação/Jev/seleção, coordenador, copy/recovery, revisão V7, adapter de modelo e compilação para CanvasLab. O recorte foi ampliado para Site Intelligence porque o runtime o consome; para arquivos históricos somente quando havia import ou necessidade de distinguir versões.

As reproduções usam a marca fictícia Aurora, dependências injetadas, cenas/pareceres controlados e `fetch` que sempre lança erro. Elas demonstram **transporte e construção de prompts**, não competência semântica da LLM. Foi usada a alternativa de catálogo em array aceita pelo preparador para isolar o handoff compartilhado; não é prova dinâmica da cobertura do catálogo compacto. O payload comum do seletor foi conferido no código atual.

Não houve consulta/escrita remota, geração paga nova, alteração de produção, testes versionados, contratos, configuração, dependências, migration, deploy ou commit. O arquivo operacional preexistente não foi tomado como prova de causalidade de execuções desta auditoria. Compass indisponível; busca convencional dirigida necessária. As orientações Supabase foram consultadas para delimitar persistência, sem acesso administrativo. **RLS não verificada.**

## 3. Achados confirmados e hipóteses associadas

### C1 — Público e essência desaparecem antes do backend

**Estado: CAUSA_CONFIRMADA da perda; HIPOTESE sobre impacto na redação final. Prioridade de investigação: alta.**

- Ação: criar um briefing com Brand Kit contendo tom, público, essência, fonte, paleta, termos obrigatórios e proibidos; converter pelo mesmo adaptador usado no Studio.
- Esperado na fronteira: informação disponível ao usuário e incorporada ao briefing local continuar disponível para orientar a geração. Isso é critério de integridade do handoff, não exigência de repetir esses campos na arte.
- Observado: `interpretRawBriefing` retém `audience` e `brandEssence`. `creationBriefToExecutionBrief` não os copia. O schema do backend também não oferece campos próprios equivalentes. Paleta e fonte do Kit nem chegam ao `CreationBrief`; o tipo de entrada as aceita, mas o parser não as usa.
- Primeira divergência: [shared/creationBrief.ts:135](</home/many/Documentos/Projetos linux/PostSpark 3/shared/creationBrief.ts:135>) para público/essência; [shared/creationBrief.ts:104](</home/many/Documentos/Projetos linux/PostSpark 3/shared/creationBrief.ts:104>) para paleta/fonte.
- Cadeia: Brand Kit → brief local enriquecido → adaptador parcial → servidor/redator sem público/essência. O modal permite editar público, reforçando a divergência observável entre edição e envio.
- Contraprova: tom e termos obrigatórios/proibidos **são** transmitidos. Texto bruto/notas que contenham público/essência manualmente podem suprir parte da ausência; não tornam o transporte estruturado íntegro.
- Experimento diferenciador: mesmo pedido, com e sem público/essência explicitamente inseridos no texto, avaliação cega de adequação. Ainda não realizado com LLM.
- Correção mínima sugerida, sem implementar: preservar esses dados no contrato/projeção canônica e em seus consumidores. Regressão: valores sentinela do Kit e da edição do modal devem aparecer no payload efetivo do redator sem depender de colagem manual no rawInput.

### C2 — Jev recebe a fonte adicional; seletor final não a recebe em execution

**Estado: CAUSA_CONFIRMADA do handoff incompleto; HIPOTESE sobre escolhas inadequadas. Prioridade: alta.**

- `generationPreparation` carrega e guarda `contextContent`; o Jev recebe `sourceEvidence` quando essa fonte não está no briefing.
- O seletor final recebe `brief=buildUserPrompt(...)`. Quando há `executionBrief`, o helper constrói o texto apenas do brief e ignora `contextContent` e o `request.content` complementar. O JSON do seletor não acrescenta a fonte em outro campo.
- Resultado sintético: `shortlistContainsSource=true`, `selectionContainsSource=false`, `preparedPreservesSource=true`. A fonte não foi destruída no runtime; foi omitida **nesta chamada**. No caso <=12 ofertas, nem há pré-seleção Jev para fornecer uma nota baseada nela.
- Primeira divergência: [buildUserPrompt:439](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/generationOrchestrator.ts:439>); consumidor [generationPreparation:776](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/generationPreparation.ts:776>).
- Cadeia possível: URL/snapshot traz mecanismo/limite adicional → seletor não o vê → escolhe design com pouca capacidade explicativa → redator recebe a fonte completa somente depois da escolha. Esse último efeito é **hipótese**, não foi reproduzido com escolha semântica real nesta investigação.
- Contraprova: redator inclui `contextContent` explicitamente; não se sustenta afirmar que a copy nunca recebe a fonte. Jev e perfis também podem indiretamente favorecer designs adequados; isso não restitui a fonte ao seletor.
- Correção mínima sugerida: usar a mesma representação de contexto na seleção e na redação, respeitando orçamento. Regressão: capturar payload real dos dois caminhos, com/sem Jev e com perfis v2, e verificar a condição sentinela e a instrução complementar.

### C3 — Revisor não recebe o tom estruturado do Brand Kit

**Estado: CAUSA_CONFIRMADA da assimetria; HIPOTESE para deriva de voz não detectada. Prioridade: média/alta.**

- O redator recebe `executionBrief.tone`. `editorialContextV7` projeta fontes, requisitos e apenas objetivo/CTA/intervenção/slides em `instructions`; não projeta tom, público, essência ou plataforma. `reviewData` não adiciona o brief completo.
- Reprodução do workflow: `copyHasTone=true`, `reviewHasTone=false`; uma copy e uma revisão controladas terminaram `ready`. Esse `ready` foi produzido por fixture saudável, **não demonstra** que um modelo real aprovaria violação de tom.
- Primeira divergência: [editorialContextV7:47](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/editorialContextV7.ts:47>); [payload de revisão:148](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/proposalReviewV7.ts:148>).
- Limite importante: a revisão atual se destina à materialidade/fidelidade, não a maximizar voz e acabamento. Falta de um placar editorial é uma lacuna de avaliação; não justifica promover toda preferência de tom a veto fatal.
- Contraprova: tom escrito no rawInput/notas chega como fonte; um requisito explícito em `contentRequirements` pode criar obrigação verificável. O achado se refere ao campo estruturado isolado.
- Correção mínima sugerida: tornar o contexto relevante observável ao avaliador apropriado, com separação entre requisitos e preferências. Regressão: tom sentinela somente no campo do Kit; conferir presença e classificação adequada, sem bloquear gosto arbitrário.

### C4 — URL comum não aciona o motor completo de DNA

**Estado: CAUSA_CONFIRMADA do desvio de caminho; HIPOTESE sobre voz genérica. Prioridade: alta para produto baseado em marca.**

- Primeira criação do Studio usa `inputType=url` quando o texto começa em HTTP(S), ou `brandInput.websiteUrl` extraído do texto. O runtime faz scrape legível. Não chama análise semântica ou visual de marca.
- `siteIntelligenceId` é aceito pela API e carrega snapshot com DNA, mas a primeira criação não o obtém; o campo no Studio vem de `previousInput` quando disponível. A existência de `site.analyze`/`extractBrandDNA` separados não comprova conexão automática a essa geração.
- Fontes: [Studio:320](</home/many/Documentos/Projetos linux/PostSpark 3/client/src/pages/StudioApp/StudioAppV2BPage.tsx:320>), [runtime:178](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/generationRuntime.ts:178>), [análise separada:326](</home/many/Documentos/Projetos linux/PostSpark 3/server/siteIntelligence.ts:326>).
- Contraprova: texto do site pode permitir ao redator inferir voz/contexto; o Brand Kit fornece tom. Isso não equivale à transmissão do DNA sintetizado.
- Correção mínima sugerida: alinhar o fluxo/contrato de marca ao comportamento desejado e expor qual evidência foi usada. Experimento: comparar scrape versus snapshot do mesmo site congelado, sem misturar alteração de modelo/prompt/catálogo.

### C5 — Referência de imagem não se torna evidência visual para o redator

**Estado: CAUSA_CONFIRMADA na construção do transporte; efeito semântico não medido. Prioridade: alta no ramo image, secundária no uso textual habitual.**

- `buildUserPrompt` pode criar partes multimodais para `inputType=image`; a preparação as insere dentro de `JSON.stringify({brief,...})` enviado como uma string. `hasMultimodalContent` confirma que a mensagem resultante não é multimodal. Jev extrai somente texto.
- O runtime passa `referenceImages` ao workflow; elas são usadas como referências de mídia, não anexadas às mensagens de copy. O revisor vê pixels dos posts gerados, não a imagem-fonte original por esse campo. A sonda confirmou ausência da URL sentinela em ambas as mensagens.
- Fontes: [helper:448](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/generationOrchestrator.ts:448>), [seleção:776](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/generationPreparation.ts:776>), [referências no runtime:469](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/generationRuntime.ts:469>), [copy:847](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/proposalGraph.ts:847>).
- Limites: ramo aceito pela API; a primeira criação do Studio examinada só constrói text/url. Não se demonstrou falha de OCR de um upload real. Referência visual para composição não precisa ser fonte factual em todos os pedidos.
- Correção mínima sugerida: explicitar a função da imagem e preservar pixels ou extração verificável quando a tarefa depender de seu conteúdo. Regressão: texto exclusivo em imagem sintética, sem transcrição no briefing; verificar o transporte ao consumidor autorizado antes de medir a resposta.

### C6 — Snapshot salvo já é uma redução da fonte e mistura orientação com evidência

**Estado: CAUSA_CONFIRMADA das transformações; ocorrência de perda material em um site real não demonstrada nesta sessão. Prioridade: média/alta.**

- `collectSiteContent/buildEvidence`: até cinco páginas, corpo até 2.500 caracteres por evidência, título 300, descrição 500; scrape normal até 12.000/página. Síntese formata evidências e aplica corte de 28.000. O limite estrito de 24.000 da geração acontece depois dessas reduções.
- `siteIntelligenceToPrompt` não transmite warnings/qualidade de fallback; o runtime remove IDs/sourceUrl individuais ao concatenar `[kind] text`. `sourceReferences` não é preenchido. O revisor pode citar o contexto composto, mas não recebe sua proveniência fina estruturada.
- O mesmo bloco contém instruções como “fonte unica”, âncoras obrigatórias, “sem copiar frases literalmente” e cores mandatórias; é inserido como contexto factual. A política V7 determina que fontes são dados e que instrução do usuário prevalece. Há uma colisão **condicional de linguagem de autoridade**; não se observou obediência incorreta a ela por uma LLM nesta investigação.
- Fontes: [siteContent:99](</home/many/Documentos/Projetos linux/PostSpark 3/server/siteContent.ts:99>), [synthesis:120](</home/many/Documentos/Projetos linux/PostSpark 3/server/siteIntelligence.ts:120>), [projeção:429](</home/many/Documentos/Projetos linux/PostSpark 3/server/siteIntelligence.ts:429>), [runtime:183](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/generationRuntime.ts:183>).
- Correção mínima sugerida: manter origem/estado da síntese e separar fatos de regras; não retirar cortes sem orçamento. Regressão: condição essencial no fim da página e conflito explícito usuário/site, conferindo qual texto efetivamente chegou, não só se o parecer declarou “fonte completa”.

### C7 — Limites de diversidade e de recuperação são reais, mas não provam copy ruim

**Estado: comportamento confirmado; HIPOTESE para repetição e rejeições evitáveis.**

- Três workflows recebem o mesmo briefing, cada um com design/razão selecionados. Não recebem textos dos irmãos para comparar; `Gerar mais` envia pedido textual de novos ganchos e histórico visual, sem as copies anteriores. Não há verificação semântica conjunta de diversidade no fluxo conectado.
- A diversidade determinística trabalha famílias/semelhança/recência visual. Não demonstra ângulos textuais distintos. Poucos fatos podem legitimamente sustentar a mesma mensagem em designs diferentes; não se recomenda exigir três teses novas à força.
- Uma recuperação de copy é compartilhada entre encaixe técnico e correção editorial. Um overflow que a consuma pode deixar a proposta sem recuperação posterior. Tests cobrem esse limite; não foi medida sua frequência atual.
- A instrução de gosto do cliente pede “EXATAMENTE UMA” variação da família declarada, enquanto o seletor usa catálogo finito e diversidade preferencial. Em execution, o texto complementar nem entra no `brief` do seletor (C2), mas volta a aparecer na copy, quando o design já é imutável. Não foi reproduzida escolha de família errada por modelo real.
- Fontes: [fanout:144](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/generationCoordinator.ts:144>), [gerar mais:324](</home/many/Documentos/Projetos linux/PostSpark 3/client/src/pages/StudioApp/StudioAppV2BPage.tsx:324>), [gosto:226](</home/many/Documentos/Projetos linux/PostSpark 3/client/src/pages/StudioApp/lib/studioGeneration.ts:226>), [recuperação:1499](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/proposalGraph.ts:1499>).
- Próximo experimento: repetição intra/interpedido com dados congelados, separando semelhança legítima de conteúdo de repetição vazia; registrar motivo que consumiu a recuperação. Nenhum novo agente é necessário para demonstrar o problema.

## 4. Conflitos e aparentes conflitos

| Situação | Constatação | Classificação |
| --- | --- | --- |
| Fonte integral versus espaço autorado | Fonte chega ao redator, mas design escolhido/campos são fixos; políticas autorizam omissão periférica e proíbem perder condições materiais. | Tradeoff explícito; perda material precisa ser demonstrada por trecho, não inferida de concisão. |
| `visual_only` versus reescrever para ocupar fragmentos | Prompt ressalva preservação literal; recovery técnico de texto é impedido nesse nível, com checagem literal. | Hipótese de conflito generalizado contrariada pelo código/testes. |
| `contentFragment.count` versus limite de palavras | Prompt atual distingue contagem de caixas, mínimos de ocupação e capacidade; targets obrigatórios são explícitos. | Problemas antigos não devem ser atribuídos ao prompt atual sem replay por versão/hash. |
| `mustInclude` versus liberdade de paráfrase | Adaptador do Kit cria obrigação literal sensível a caixa, destino `either`; `meaning` só existe quando enviado explicitamente. | Não é pedido semântico equivalente. Pode gerar rigidez ou permitir termo só na legenda; decisão de contrato a validar com intenção do usuário. |
| “Três abordagens distintas” versus fonte curta | Seletor pede distinção “quando permitido”; redação não pode inventar fatos. | A restrição factual prevalece no contrato; exigir diversidade lexical fatal seria regressão. |
| Fonte de site com âncoras/regras mandatórias versus V7 | Bloco antigo ainda está dentro do contexto quando usado snapshot; V7 trata fonte como dado. | Conflito condicional de instruções, sem ocorrência causal nova demonstrada. |
| Julgar toda copy versus não certificar beleza | Revisor exige cobertura de todos os textos/pixels, mas só veta dano material ou inutilização. | São escopos diferentes, não uma contradição. Falta placar editorial independente. |
| Modelo de reparo GPT no documento antigo | Recuperação ativa usa rota static/carousel. `quality_revision` continua configurável para outros usos/histórico. | Divergência documental/versão, não evidência de fallback GPT em V7. |

## 5. Qualidade observada com critérios explícitos

### Rubrica desta auditoria

Pontuação ordinal de 0–4: **0** inviável/contraditório; **1** falha importante; **2** utilizável com revisão substancial; **3** adequado com ressalva identificada; **4** bom no critério observado. `N/A` significa falta de base para julgar ou dimensão inaplicável. Não se calcula média que compense falsidade com estilo.

| Critério | Como foi julgado |
| --- | --- |
| F — Fidelidade material | Afirmações, identidade, mecanismo e condições usados sustentados pela fonte fornecida. Não valida verdade externa. Contradição/garantia inventada é falha independente dos demais scores. |
| N — Núcleo específico | Arte identifica produto/situação e mecanismo central, sem depender só de slogans. |
| C — Clareza | Referentes identificáveis, ação/complemento compreensíveis, relação entre título e apoio. |
| E — Especificidade | Teste de troca de marca: quanto continuaria idêntico se o nome fosse substituído por outra marca? Mecanismo concreto aumenta a nota. |
| P — Progressão | Em carrossel, páginas acrescentam informação e distinguem alternativas de passos sequenciais. Sem obrigação de fórmula única. |
| A — Próximo passo | CTA coerente com pedido/fonte; sem oferta inventada. Não exige venda onde o pedido não a pede. |
| L — Acabamento verbal | Naturalidade, redundância, concisão e ausência de jargão/rótulos desnecessários. |
| V — Voz/público | Comparação com exemplos e regras reais da marca. Sem padrão de referência não se atribui nota. |

Avaliação exploratória do agente, não cega, sem painel humano. Foram lidos textos nativos das cenas e fontes locais; não houve nova inspeção visual dos pixels. `ready/passed` abaixo é o estado registrado no artefato histórico, não resultado de uma nova execução paga.

### Amostra V7 disponível: Já Comprei

Fonte: aplicativo mobile que transforma nota fiscal **ou** lista digitada/ditada em receitas por IA, combinando itens comprados; funcionamento em passos simples. Amostra do harness anterior, em [live-results.json](</home/many/Documentos/Projetos linux/PostSpark 3/artifacts/verification/editorial-finish-2026-10-14/live-results.json>), com entrada verificável em [evidence.json](</home/many/Documentos/Projetos linux/PostSpark 3/artifacts/verification/carousel-latest-audit-2026-10-14/evidence.json>). Não é uma amostra aleatória de clientes nem validação do novo seletor compacto.

| Peça final registrada | F | N | C | E | P | A | L | V |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Carrossel paper-ribbons, slot 0 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | N/A |
| Carrossel versus, slot 1 | 3 | 4 | 3 | 4 | 3 | 4 | 3 | N/A |
| Carrossel daily-paper, slot 2 | 4 | 4 | 3 | 4 | 3 | 3 | 3 | N/A |
| Estático `finish-static` | 4 | 3 | 3 | 4 | N/A | 3 | 3 | N/A |

Evidências que sustentam as notas:

- **Paper-ribbons:** “Sua nota fiscal vira receitas” especifica a transformação; desenvolvimento explica escanear/digitar/ditar e combinação por IA. O fechamento oferece experimentar com a nota. Há algum apoio intercambiável (“feito para o seu dia a dia”), sem apagar o mecanismo. A primeira revisão registrada detectou “em instantes” e “sem desperdício de itens”; houve correção dos campos e recheck passed. A nota F=4 é da **versão final corrigida**; a inicial continha promessas materiais sem suporte.
- **Versus:** comparação antes/com produto comunica mecanismo, mas “Antes: você guardava ... e ficava pensando ...” atribui uma experiência ao leitor que a fonte não relata. É um enquadramento plausível; a restrição categórica merece revisão editorial, sem declarar falsidade universal comprovada. O fechamento usa “mobile-first”, jargão dispensável para público culinário. A nota 3 explicita essa ressalva, não anula o parecer passed registrado.
- **Daily-paper:** título “Nota vira prato” ganha especificidade pelo apoio/legenda. “PASSO 1” e “PASSO 2” rotulam escanear e ditar, embora sejam alternativas. “Ou dite...” e “Se preferir” mitigam a ambiguidade; por isso não foi classificada como inversão factual confirmada. A resposta por IA concentra-se no encerramento; progressão é adequada, com menos desenvolvimento de como o resultado ajuda.
- **Estático:** “Já Comprei / Nota do mercado / Receitas por IA” permite recuperar a relação entre entrada e resultado; falta uma oração explícita no texto nativo. A legenda a explica. A autossuficiência da **arte renderizada** depende também de disposição/sinais visuais, não verificados novamente aqui; não se atribuiu nota máxima de clareza/núcleo nem se concluiu inutilidade.
- **Diversidade entre propostas:** os três carrosséis exploram principalmente o mesmo mecanismo, com formas diferentes. A fonte curta não sustenta afirmar que deveriam inventar três benefícios novos. Falta avaliação humana de preferência/novidade; esta tabela não a substitui.

### Contrapontos históricos e cobertura real

O corpus [editorial-corpus.json](</home/many/Documentos/Projetos linux/PostSpark 3/server/ai/workflows/fixtures/editorial-corpus.json:1>) tem 33 casos, 29 sem parecer real registrado. O replay offline desta investigação encontrou:

| Grupo registrado | Medidos | Acertos contra rótulo manual | Falsas aprovações |
| --- | --- | --- | --- |
| Gemini, política 1 histórica | 3 | 3 | 0 |
| Gemini, política 2 histórica | 1 | 0 | 1 |
| V7 no replay desse corpus | 0 | Não medido | Não medido |

No BizuMiner histórico, “verificamos promoções” desapareceu, embora acompanhamento diário permanecesse; o parecer política 2 aprovou. É uma falsa aprovação **histórica em relação ao rótulo do corpus**, não prova de falha V7 atual. A fonte também contém qualificadores promocionais; não se deve usar a ausência de cada palavra como erro semântico.

No Café da Tarde histórico, textos como “Café da Tarde / Café da Tarde cafeteria” e “Uma pausa / Uma pausa para conversar” preservam fatos e repetem informação. Pela rubrica: F=4, L=2 para essa versão; V=N/A. Isso demonstra na amostra que preservação factual e acabamento são dimensões distintas. Não atribui o vício aos prompts V7 novos.

Separadamente do corpus, `live-results.json` registra seis contraprovas V7: quatro promessas falsas com `correction_required` e dois casos permitidos com `passed`. Isso é evidência positiva limitada de calibração, não taxa geral de precisão e não está integrado às métricas do replay. As quatro peças finais acima e essas contraprovas foram reapreciadas como **artefatos locais anteriores**, sem novas respostas de modelo nesta sessão.

## 6. Hipóteses em aberto e alternativas

| Hipótese | A favor | Contra / explicação alternativa | Experimento que distingue |
| --- | --- | --- | --- |
| H1 — Perda do público/essência gera copy genérica | C1 demonstra ausência no payload. | Fonte bruta pode fornecer contexto suficiente; não há par A/B. | Brief congelado, variar só esses dados; avaliação cega V/E/C. |
| H2 — Seletor sem fonte escolhe design pouco explicativo | C2 + cena imutável/capacidade fixa. | Jev ainda vê fonte; perfil e brief podem bastar. | Mesmo conjunto, seletor com/sem fonte, medir recall/adequação e perda material na copy. |
| H3 — Espaço e recovery empobrecem a redação | Contrato tipográfico e limite de recuperação confirmados. | Prompt atual protege mecanismo/condições; redução pode melhorar clareza. | Comparar copy inicial/final por campo, com extensão, fatos, overflow e motivo da recuperação. |
| H4 — Modelo/temperatura são causa dominante | Repetição e promessas apareceram em amostra anterior. | Contexto assimétrico e desenho fixo são confundidores; nenhuma comparação controlada atual. | Trocar somente modelo ou temperatura, nunca ambos junto com contrato/contexto. |
| H5 — Redator/revisor do mesmo modelo compartilham pontos cegos | Configuração local resolve o mesmo modelo. | São chamadas/políticas diferentes; contraprovas V7 detectam erros reais. | Pareceres cegos de outro avaliador contra rótulos humanos, medindo falsos positivos/negativos. |
| H6 — Prompt extenso dilui instruções de marca | Prompts repetem controles e schema/capacidade. | Nenhuma atenção ou latência contextual foi medida; tamanho em bytes não é tokens. | Medir payload efetivo e ablação controlada, sem remover fatos/requisitos. |

Não há base para descartar essas hipóteses apenas porque os testes passam; tampouco para promovê-las a causa confirmada sem os experimentos.

## 7. Verificações executadas e limites

Todos os comandos partiram da raiz do projeto.

| Comando / prova | Resultado observado |
| --- | --- |
| `pwd`, `git branch --show-current`, `git status --short`, `git diff --stat`, `git diff --cached --stat`, `git rev-parse HEAD` | Exit 0; estado descrito em §2; sem staged. |
| `pnpm test -- server/ai/workflows/generationContext.test.ts server/ai/workflows/generationPreparation.test.ts server/ai/workflows/proposalGraph.test.ts server/ai/workflows/proposalGraphReview.test.ts server/ai/workflows/proposalReviewV7.test.ts server/ai/workflows/editorialEvaluation.test.ts server/ai/workflows/editorialGuidance.test.ts server/ai/workflows/sourceRepresentation.test.ts server/ai/modelRouter.test.ts server/_core/llm.test.ts shared/creationBrief.test.ts shared/contentRequirements.test.ts` | Exit 0. O script repassou `--`; na prática executou a suíte completa: **180 arquivos, 1.874 testes aprovados, 38,51s**. Não se relata isso como execução apenas focada. |
| `node --import tsx scripts/evaluateEditorialReplay.ts` | Exit 0; 33 casos, 29 não medidos, quatro pareceres históricos; zero chamadas novas. |
| `node --import tsx /tmp/postspark-pipeline-investigation-20261015/probe.mts` | Exit 0 após adequar a sonda à normalização real; resultados abaixo. Nenhuma rede, dados sintéticos, fixtures explícitas. |

A primeira versão da sonda chamou o helper sem normalizar arrays e recebeu `TypeError` em `brief.slides.length`. O preparador de produção normaliza esses arrays antes de chamar o helper. A sonda foi corrigida, sem alterar código do projeto; esse erro de harness **não é um bug de produção demonstrado**.

Trecho de resultado transferível:

```json
{
  "localBrief": {"audience":"contadores autônomos","brandEssence":"precisão humana","tone":"sóbrio, sem exclamações"},
  "transmittedBrief": {"tone":"sóbrio, sem exclamações","objective":"engage","interventionLevel":"optimize_structure"},
  "builtPromptContainsSource": false,
  "shortlistContainsSource": true,
  "selectionContainsSource": false,
  "selectionContainsComplementaryInstruction": false,
  "preparedPreservesSource": true,
  "oversizedSource": "SourceContextLimitError",
  "image": {"builderHasMultimodalContent":true,"selectorSerializedPayloadHasMultimodalContent":false},
  "workflow": {"deliveryStatus":"ready","copyCalls":1,"reviewCalls":1,"copyHasTone":true,"reviewHasTone":false,"copyHasReferenceImage":false,"reviewHasReferenceImage":false}
}
```

O objeto `transmittedBrief` acima é um recorte: ele também preserva rawInput, termos obrigatórios/proibidos, formato e plataforma. Ausências de público/essência não foram confundidas com perda de todos os controles. O código integral sanitizado da sonda é reproduzido no apêndice para não depender da duração do diretório temporário.

Os testes existentes validam contratos, transporte simulado, geometria, recusas, recuperação, journaling e transações locais. Exemplos: `healthyReviewV7Fixture` constrói parecer saudável dos IDs recebidos, e `proposalGraph.test.ts` injeta revisão aprovada. Eles não representam julgamento real do modelo. As provas PGlite são descartáveis e não atestam configuração/RLS de produção.

Não foram executados benchmark pago, navegação autenticada, nova rasterização, deploy, typecheck/build adicionais ou avaliação humana. Para o escopo sem mudança funcional, a suíte existente e as sondas de fronteira bastam para os mecanismos confirmados; não bastam para homologação semântica.

Conferência final: hashes dos 1.342 arquivos preexistentes capturados no baseline permaneceram iguais, excluído o log operacional desse conjunto; os únicos novos itens no status são os três Markdown pedidos. O hash do documento-mestre permaneceu `afd6e8acd1d24d9faf24c9c02105e312487cf643f009571d4573c937e3c432aa`. Links locais foram conferidos quanto à existência do arquivo e validade dos números de linha.

**Efeito colateral observado:** a suíte acionou caminhos reais de logging de falhas de persistência simuladas. O diff preexistente de `OPERATIONAL_ERRORS.txt` cresceu de 52.953 para 54.845 linhas adicionadas, delta de 1.892 linhas durante a execução; os timestamps do trecho coincidem com a janela dos testes. O arquivo foi preservado sem truncar/limpar, conforme a proibição de limpeza automática da skill. Não se afirma ausência absoluta de escrita no workspace: houve as três entregas e esse append de log, sem alteração de código/configuração ou dados remotos. Para próximas execuções diagnósticas, isolar também o destino de logs em cópia descartável do ambiente.

## 8. Próximo papel e registro permanente

Próximo papel: **avaliador/editorial**, com o plano anexo, para rotular amostras e medir os efeitos; **arquiteto** somente para consolidar o contrato de contexto caso se decida corrigir os handoffs. Esta investigação não autoriza implementação e não aciona outro escritor automaticamente.

Documento-mestre revisado. Não foi editado porque a [skill investigador](</home/many/.codex/skills/investigador/SKILL.md>) determina: “Pode salvar somente o diagnóstico e evidências sanitizadas no caminho pedido.” O diagnóstico registra os comportamentos permanentes encontrados; uma etapa posterior autorizada pode reconciliá-los com o documento já alterado no checkout.

## Apêndice — Reprodução sintética completa

Salvar o bloco seguinte como `/tmp/postspark-pipeline-investigation-20261015/probe.mts` após criar o diretório e executar o comando registrado em §7. Ele apenas lê módulos, injeta dependências e grava JSON temporário. O catálogo/parecer/pixels são fixtures declaradas; não executar esse código como benchmark semântico.

```typescript
import { writeFile } from 'node:fs/promises';
globalThis.fetch = async () => { throw new Error('NETWORK_DISABLED_FOR_INVESTIGATION'); };
const root = '/home/many/Documentos/Projetos linux/PostSpark 3';
const { interpretRawBriefing, creationBriefToExecutionBrief } = await import(root + '/shared/creationBrief.ts');
const { buildUserPrompt } = await import(root + '/server/ai/generationOrchestrator.ts');
const { editorialContextV7 } = await import(root + '/server/ai/workflows/editorialContextV7.ts');
const { prepareOrchestratedGeneration } = await import(root + '/server/ai/workflows/generationPreparation.ts');
const { completeDesignTestDefinitions } = await import(root + '/shared/completeDesignGeneration.fixture.ts');
const { compactComponentCard } = await import(root + '/shared/componentAssembly.ts');
const { defaultStudioPreferences } = await import(root + '/shared/studioPreferences.ts');
const { completeSourceContext } = await import(root + '/shared/sourceContext.ts');
const { normalizeExecutionBrief } = await import(root + '/shared/generationRequest.ts');
const { executeProposalWorkflow } = await import(root + '/server/ai/workflows/proposalGraph.ts');
const { healthyReviewV7Fixture } = await import(root + '/server/ai/workflows/proposalReviewV7.fixture.ts');
const { renderReviewFixtureScenes } = await import(root + '/server/ai/workflows/proposalReview.fixture.ts');
const { hasMultimodalContent } = await import(root + '/server/ai/providers/modelAdapters.ts');
const raw = 'Apresente a Marca Aurora, que organiza documentos.';
const brandKit = {brand_name:'Aurora',tone:'sóbrio, sem exclamações',target_audience:'contadores autônomos',brand_essence:'precisão humana',font_family:'Inter',visual_palette:['#123456'],must_include:['Aurora'],forbidden_terms:['milagre']};
const brief = interpretRawBriefing(raw, {selectedFormat:'static',brandKit});
const executionBrief = normalizeExecutionBrief(creationBriefToExecutionBrief(brief));
const fact = 'CONTEXTO_SENTINELA: suporta documentos fiscais, sem suporte a imagens.';
const request:any = {ownerId:'00000000-0000-4000-8000-000000000001',inputType:'text',content:raw+'\nUse a família glass-veil em exatamente uma proposta.',platform:'instagram',postMode:'static',aspectRatio:'4:5',includeDraftDesigns:true,creationMode:'execution',executionBrief,idempotencyKey:'synthetic-probe'};
const built = buildUserPrompt({request,executionBrief,contextContent:fact});
let shortlistInput:any, selectionInput:any;
const defs = completeDesignTestDefinitions();
const prepared = await prepareOrchestratedGeneration(request,request.ownerId,true,Date.now()+60000,{
  operation: async (_key:any, work:any) => work(),
  loadContext: async () => fact,
  preferences: async () => defaultStudioPreferences,
  recentSelections: async () => [],
  retrieve: async () => defs.map(compactComponentCard),
  hydrate: async () => defs,
  shortlist: async (input:any) => {shortlistInput=input;return {cards:input.cards,evaluated:[],batches:0,inputTokens:0,outputTokens:0,costUsd:0};},
  generate: async (params:any) => {selectionInput=JSON.parse(params.messages.find((m:any)=>m.role==='user').content);return {choices:[{message:{content:JSON.stringify({version:2,options:[0,1,2].map(i=>({offerId:selectionInput.catalog[i%selectionInput.catalog.length].offerId,reason:'Abordagem sintética compatível.'}))})}}]} as any;},
});
const context=editorialContextV7({prompt:request.content,contextContent:fact,executionBrief});
const tooLarge = (()=>{try{completeSourceContext('x'.repeat(24001));return false;}catch(e:any){return e.name;}})();
const observations={builtPromptContainsSource:JSON.stringify(built).includes('CONTEXTO_SENTINELA'),shortlistContainsSource:JSON.stringify(shortlistInput.brief).includes('CONTEXTO_SENTINELA'),selectionContainsSource:JSON.stringify(selectionInput).includes('CONTEXTO_SENTINELA'),selectionContainsComplementaryInstruction:JSON.stringify(selectionInput).includes('glass-veil em exatamente'),preparedPreservesSource:prepared.contextContent===fact};
const imageRequest={...request,inputType:'image',imageUrl:'https://example.test/reference.png',creationMode:'ideation',executionBrief:undefined};
const imageBuilt=buildUserPrompt({request:imageRequest,executionBrief:null,contextContent:fact});
const imageTransport={messages:[{role:'user',content:JSON.stringify({brief:imageBuilt.content})}]};
const copyInput:any={requestId:request.ownerId,runId:request.ownerId,proposalId:'synthetic-proposal',slot:0,prompt:request.content,contextContent:fact,executionBrief,creationMode:'execution',platform:'instagram',postMode:'static',selectedDefinitions:[defs[0]],experimental:true,reviewPolicyVersion:7,reviewExecutionConfig:prepared.reviewExecutionConfig,referenceImages:[imageRequest.imageUrl]};
copyInput.editorialContextHash=editorialContextV7(copyInput).hash;
const captured:any[]=[];
const delivery=await executeProposalWorkflow(copyInput,{actor:request.ownerId,measureText:()=>({height:20,lines:[{width:100}],runs:[]}),renderReviewScenes:renderReviewFixtureScenes,reviewOperationCache:new Map(),generateText:async(params:any)=>{captured.push(params);return {choices:[{message:{content:JSON.stringify(params.taskRoute==='post_evaluation'?healthyReviewV7Fixture(params):{caption:'Aurora organiza documentos.',hashtags:[],slides:[{values:[{fieldId:'field-0',value:'Aurora organiza'},{fieldId:'field-1',value:'Documentos em ordem'}],mediaPrompts:[]}]})}}]} as any;}});
const copyCall=captured.find(c=>c.taskRoute!=='post_evaluation');
const reviewCall=captured.find(c=>c.taskRoute==='post_evaluation');
const out={network:'disabled; no .env loaded',fixtureScope:'dependency-injected synthetic preparation; historical array catalog isolates shared selection payload, not compact-profile coverage; copy/review output and pixels controlled',brandKit,localBrief:brief,transmittedBrief:executionBrief,...observations,reviewContext:context,oversizedSource:tooLarge,image:{builderHasMultimodalContent:hasMultimodalContent([{role:'user',content:imageBuilt.content}]),selectorSerializedPayloadHasMultimodalContent:hasMultimodalContent(imageTransport.messages as any)},workflow:{deliveryStatus:delivery.status,copyCalls:captured.filter(c=>c.taskRoute!=='post_evaluation').length,reviewCalls:captured.filter(c=>c.taskRoute==='post_evaluation').length,copyHasTone:JSON.stringify(copyCall?.messages).includes(brandKit.tone),reviewHasTone:JSON.stringify(reviewCall?.messages).includes(brandKit.tone),copyHasReferenceImage:JSON.stringify(copyCall?.messages).includes(imageRequest.imageUrl),reviewHasReferenceImage:JSON.stringify(reviewCall?.messages).includes(imageRequest.imageUrl)}};
await writeFile('/tmp/postspark-pipeline-investigation-20261015/probe-results.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
```
