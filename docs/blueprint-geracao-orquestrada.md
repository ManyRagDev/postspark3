> **Referência histórica:** o estado vigente foi consolidado em 2026-10-09. Leia [DOCUMENTO_MESTRE §13.86](../DOCUMENTO_MESTRE.md#1386-consolidação-do-pipeline-e-revisor-obrigatório-2026-10-09); as descrições abaixo de V4 padrão/V5 piloto foram superadas.

# Blueprint da geração orquestrada do PostSpark

Revisão de 2026-10-07, incluindo auditoria de encaixe e preservação do código ativo. Destinatários: proprietário do produto e responsáveis pela implementação.

O PostSpark precisa entregar sugestões completas, com texto e imagens concebidos para composições autoradas e aceitação independente de cada proposta. A reforma concentra-se na geração, execução, persistência operacional, cobrança e apresentação do progresso. CanvasLab e CanvasPostModel continuam sendo a base de edição e fidelidade visual.

Este blueprint especifica o destino e a ordem de implementação. Decisões explicitadas pelo proprietário têm precedência; escolhas técnicas e comerciais abertas estão identificadas. A arquitetura descrita aqui ainda não está implantada.

## 1. Resultado esperado para o usuário

Texto, URL ou imagem entram no Studio. O sistema interpreta a intenção, seleciona composições completas do catálogo, escreve nos campos nativos e produz a mídia necessária. Cada proposta aparece quando estiver utilizável, com seus assets persistidos, autorizados e conferidos. O usuário pode editar ou baixar uma proposta enquanto as outras continuam.

Uma composição que depende de fotografia não aparece como pronta com o slot vazio. Uma proposta sem necessidade de imagem não recebe mídia artificialmente. Preferências orientam a criação; decisões sobre beleza permanecem com o usuário.

Três sugestões continuam sendo a configuração inicial, sem obrigação de inventar três afirmações ou teses. Um briefing simples pode sustentar uma mesma mensagem em diferentes tratamentos. Diversidade orienta a seleção inicial; não invalida automaticamente uma proposta tecnicamente correta.

Exemplo: A disponível; B produzindo imagem; C encerrada por indisponibilidade de um modelo compatível. A não espera B ou C. Num carrossel, slides são verificados individualmente e a sequência completa precisa estar íntegra para ficar pronta.

## 2. Decisões consolidadas e propostas

| Tema | Diretriz | Situação |
| --- | --- | --- |
| Autoria visual | Selecionar composições completas, sem recombinar fragmentos independentes | Decisão do proprietário |
| Imagens nas sugestões | Preencher mídia essencial antes de disponibilizar a proposta | Direção acordada |
| Independência | Estado, resultados, aceitação técnica e recuperação por proposta | Decisão do proprietário |
| Criatividade | Obrigações verificáveis com espaço expressivo livre | Decisão do proprietário |
| Revisão | Excepcional, localizada e fundamentada em evidência técnica forte | Decisão do proprietário |
| Beleza | Usuário decide; justificativa fraca não aciona revisão ou veto | Decisão do proprietário |
| Orquestração | LangGraph em TypeScript integrado aos serviços existentes | Proposta de referência; validar no experimento de execução |
| Execução | API curta, despacho persistente e executor recuperável | Proposta; hospedagem/despacho em aberto |
| Modelos de imagem | Registro de capacidades e comparação de Nano Banana/Pro/Seedream | Proposta; ranking ainda não estabelecido |
| Cobrança parcial | Unidades por proposta, preço conhecido e liquidação idempotente | Proposta; tarifa/política comercial em aberto |

O framework organiza execução e estado. Qualidade criativa também depende da curadoria, briefing, prompts, referências e capacidades comprovadas dos modelos.

## 3. Base existente e lacunas

| Área | Base atual verificada | Evolução necessária |
| --- | --- | --- |
| Studio | StudioAppV2BPage aguarda lote de post.generate V4; materialização usa Promise.all | Estados/resultados individuais sem falha conjunta |
| Seleção/copy | completeDesignGeneration.ts separa seleção e preenchimento, conferindo cenas nativas | Operações reutilizáveis, execução por proposta |
| Transporte textual | llm.ts/modelRouter.ts têm schemas, rotas, timeout, fallback e tracing | Política única de tentativas/custo e rotas por responsabilidade |
| Imagem | Serviço separado, OpenRouter com fallback Pollinations | Adaptadores por capacidade, referências efetivas e fallback explícito |
| Modelo local | Configuração aponta para google/gemini-3.1-flash-image | Registrar modelo efetivo por operação e comparar candidatos |
| Referências | originalImages só acrescenta frase; arquivo não chega ao gerador | Resolver, autorizar e transmitir referências pelo adaptador |
| Qualidade | Modo HD muda descrição textual no caminho OpenRouter | Configurar opções reais suportadas e verificadas |
| Mídia na sugestão | Slots entregues como deferred | Obrigatoriedade explícita e preenchimento antes de prontidão |
| Cena/edição | completeDesignV1 → compilador dedicado → CanvasPostModel → canvas_model | Preservar autoridade, acrescentar vínculos de mídia/proveniência |
| Autorização | persistArsenalOutput/RPC entregam manifesto/grants de lote | Entrega por proposta sem declarar lote concluído artificialmente |
| Billing | Reserva/commit/refund; texto e imagem separados | Política integrada, sem débito oculto da imagem |
| Execução | Handler síncrono e trace de geração | Checkpoints, despacho recuperável e reconciliação |
| Infraestrutura | Express/tRPC, Supabase, entrypoint serverless em vercel.json | Validar executor durável; worker/fila não existem por pressuposição |

O teste real de §13.67 do documento-mestre gerou três propostas em cerca de 15s, preservou modelos e confirmou salvar/reabrir/exportar. Duas estavam sem foto. Ele confirma a base funcional e a lacuna de prontidão; não certifica estética nem cobrança real, pois usou perfil DEV.

§13.63 registra 112 variantes completas, 59 baselines técnicos válidos e drafts na conferência daquele momento. São números históricos, não garantia de publicação, disponibilidade atual ou aprovação estética.

## 4. Escopo e compatibilidade

Permanecem: /thevoid e /studio, autenticação Supabase/cookie bridge, editor Konva, funil handleUpdatePost, catálogo autorado, assets privados, publicação administrativa e documentos antigos reabríveis.

Mudam: coordenação de chamadas, contratos entre etapas, imagem, progresso individual, estado durável e integração econômica. “V5” é nome de trabalho do protocolo novo; não altera automaticamente modelVersion do CanvasPostModel nem snapshotVersion do legado.

Ficam fora: reconstrução geral do frontend, reativação de Home/HoloDeck/WorkbenchV2, layouts livres, rasterização por padrão do post inteiro, publicação automática de modelos e crítico de beleza. Pequenos elementos continuam acabamento manual ou capacidade explicitamente autorada por modelo.

A reforma deve extrair responsabilidades úteis, preservando o que funciona. Não envolver o handler monolítico inteiro num nó e chamar isso de migração. As exclusões acima dizem respeito à geração automática; edição livre, elementos autorais e recuperação manual existentes continuam disponíveis.

### 4.1 Contrato obrigatório de preservação

A auditoria de encaixe está em [revisao-blueprint-preservacao.md](./revisao-blueprint-preservacao.md), com evidências, prioridades e verificações. Ela integra os critérios de saída deste plano.

| Superfície existente | Obrigação da reforma |
| --- | --- |
| Criação | Preservar texto/URL/imagem, revisão do briefing de carrossel, brand kit, intenção de formato e níveis de intervenção textual |
| Galeria desktop/mobile | Preservar personalização, download, gerar mais, feedback de direção e preferências; resultados individuais usam identidade estável |
| Painéis/guias/editor livre | Preservar ações, seleção e mutações existentes; entregar composição editável, sem reduzir a peça a um bitmap |
| Textos | Preservar bindings, conteúdo por slide, rich text, quebras, destaque, legenda, CTA e hashtags |
| Cena | Preservar geometria, cores, fontes, overrides, grupos, camadas autorais, fundo, logos e mídia por slot |
| Edição e persistência | Preservar undo/redo, preferência de autosave, salvar novo/atualizar, replicação seletiva e reabertura de canvas_model |
| Formatos e exportação | Preservar prévia/confirmação de formato, enquadramento, PNG 4K, ZIP e gates de carregamento de fontes/imagens |
| Histórico e operação | Preservar V4/legados, recuperação sem nova IA, permissões, grants, limites de plano, billing e diagnóstico |

O estado de execução do grafo é separado do documento editável. Uma entrega aceita é materializada uma vez por identidade/revisão; eventos posteriores atualizam progresso, não reinicializam CanvasLab. Documentos abertos não são substituídos por polling/replay. Uma nova geração deliberada tem identidade própria.

Não aplicar a política de correção automática às escolhas manuais do usuário. Reorganizar, restaurar visual, trocar cor/fonte, editar copy ou confirmar projeção continuam ações explícitas disponíveis. Uma melhoria da geração não autoriza remover controles existentes.

## 5. Coordenador e grafos independentes

### 5.1 Coordenador da solicitação

Autentica, normaliza fontes, estabelece limites/preço, interpreta o pedido e recupera composições elegíveis. Distribui propostas com identidade estável, contrato e orçamento. Preparação compartilhada pode falhar antes da distribuição; independência não elimina dependências comuns necessárias.

Extrair a preparação real de post.generate: executionBrief, níveis visual_only/light_optimize/optimize_structure, fatos/origens, site intelligence autorizado, identidade de marca, restrições literais, modo/formato/slideCount e preferências. O novo start não pode aceitar só prompt e descartar esses dados. Preservar revisão do briefing, guards anteriores à cobrança, autorização administrativa para drafts e contexto de proprietário/plano no despacho. O executor recebe um envelope autorizado e versionado; não depende de cookie/request HTTP ainda vivo.

Após distribuir, acompanha resultados sem esperar todos para disponibilizar um. A preparação não precisa inventar três teses para produzir três opções.

### 5.2 Grafo por proposta

Cada proposta é um trabalho durável com grafo próprio. Estado/eventos são persistidos por proposta; a agregação do coordenador não bloqueia a entrega individual.

~~~mermaid
flowchart TD
    A[Contrato e composição pinada] --> B[Conferir viabilidade]
    B -->|Viável| C[Despachar tarefas independentes]
    B -->|Entrada essencial ausente| N[Aguardar entrada ou encerrar com motivo]
    B -->|Incompatibilidade comprovada| R[Recuperação técnica delimitada]
    C --> D[Copy nos campos nativos]
    C --> E[Imagens obrigatórias ou reutilização autorizada]
    D --> F[Registrar resultados e verificações]
    E --> F
    F --> G{Resultados obrigatórios da revisão aceitos?}
    G -->|Ainda executando| W[Aguardar evento de tarefa]
    W --> G
    G -->|Falha forte recuperável| R
    G -->|Sem recuperação viável| X[Encerrar proposta com motivo]
    G -->|Sim| H[Resolver cena e renderizar prova]
    H --> I[Conferência técnica da peça]
    I -->|Evidência forte e limites disponíveis| R
    I -->|Sem defeito técnico comprovado| J[Persistir artefato e autorizar assets]
    I -->|Defeito forte sem recuperação| X
    R -->|Ação elegível e orçamento disponível| T[Executar somente alvos afetados]
    R -->|Limites esgotados ou impossível| X
    T --> F
    J --> K[Confirmar liquidação e prontidão]
    K --> L[Publicar resultado na galeria]
~~~

“Aguardar” é estado/evento persistente, sem polling ativo dentro do grafo. O desenho é lógico: barreiras, roteamento e retomada exigem implementação explícita. Trocar composição por incompatibilidade técnica cria revisão de contrato, invalida descendentes afetados e retorna à viabilidade. Essa ação não é a mesma que refazer um único elemento.

Não usar uma barreira externa de conclusão das três propostas. A prova operacional é A ficar disponível antes de B terminar, inclusive quando o framework agrupa tarefas paralelas.

### 5.3 Paralelismo e carrosséis

Copy e mídia avançam juntas quando intenção/composição/obrigações já estão fixadas. Dependência do texto final torna a tarefa sequencial e deve constar do contrato. Modelos sem mídia obrigatória dispensam essa tarefa.

Carrosséis podem exigir uma referência visual inicial; outras imagens só ficam independentes depois dela. Limitar concorrência por usuário, solicitação e provedor. Paralelizar tarefas distintas não significa chamar todos os modelos para escolher o mais bonito.

## 6. Contratos e identidade

Contratos são dados versionados e validados; prompts são sua representação para cada modelo. Bytes grandes, credenciais e URLs temporárias não são estado autoritativo.

| Contrato lógico | Responsabilidade |
| --- | --- |
| GenerationRequest | Proprietário, nonce da ação, fontes, formato, quantidade, modo, preferências, preço/política e limites |
| CreativeBrief | Intenção, público quando conhecido, fatos com origem, obrigações e superfície; suposições identificadas |
| ProposalContract | ID/revisão, direção, modelos/versões/hashes, papéis, campos nativos, mídia e dependências |
| EditorialContract | Significado, fatos/literais travados, tom orientativo, fieldIds, geometria/fontes, legenda/hashtags |
| ImageTaskContract | Propósito, cena, referências/preservação, slot/recorte, orientação expressiva, capacidades, saída/limites |
| OperationRecord | Identidade, revisão/tentativa, fingerprint, rota/modelo efetivo, artefato, uso/custo/confirmação |
| TechnicalFinding | Regra, alvo/região, esperado/observado, evidência, força e ação delimitada |
| ProposalDelivery | Cena, assets persistidos/autorizados, proveniência, integridade e liquidação |

Identidade mínima: requestId, proposalId, revision, taskId, attemptId, contractHash e promptVersion. Nonce diferencia nova ação do usuário de retry da mesma ação; hash do texto sozinho não identifica todas as gerações legítimas.

### Compatibilidade com a cena e consumidores atuais

Vincular proposalId/revisão ao CanvasPostModel.id e, separadamente, ao ID numérico do post salvo. Hoje o compilador cria UUID por compilação e o Studio possui savedPostId global; ambos precisam de tratamento antes da integração incremental. Um save assíncrono de A não pode associar seu retorno a B. Remontar o editor só por troca explícita de documento, com tratamento das edições pendentes.

ProposalDelivery conserva a cena completa e sua proveniência, com um adaptador versionado para CanvasPostModel. Preservar os campos conhecidos por saveAdapter/CanvasPostStage e as versões de composição suportadas. A versão do protocolo de execução não altera automaticamente as versões dos documentos de edição. A fronteira de serialização compartilhada deve ser definida sem importar componentes React no servidor.

Mídia gerada para um slot pertence a composition.media[slotId], com prompt/enquadramento e identidade de slide/slot. Não inserir essas fotos como assets de catálogo nem alterar hashes de modelos pinados. Reutilizar a semântica de MediaTarget e aplicação localizada do editor. Resultado atrasado para slot removido ou revisão superada não altera outro destino.

Histórico, preferências de direção, relatórios de compilação e Admin também consomem runId/slot/snapshot. V5 usa proposta/revisão entregue como autoridade; leitores V4 conservam seus contratos. Não renumerar slots pela ordem de chegada nem exigir que o pedido agregado tenha terminado para dar feedback sobre uma proposta entregue.

### 6.1 Obrigações e espaço criativo

Obrigações são explícitas e verificáveis: preservar preço fornecido, embalagem referenciada, composição pinada e mídia essencial. Limites descrevem formato, recursos e orçamento. Orientações descrevem clima/tom/intenção sem virar regras universais de luz, centralização ou densidade.

Não exigir “premium”, “bonito” ou “impactante” como campos validáveis. Um input curto não precisa ganhar oferta, público e diferenciais inventados para satisfazer schema. Preferência criativa não vira veto técnico.

### 6.2 Copy e prompts

Copy nasce do significado do briefing e das caixas reais. Limites e medição de fontes ajudam a acertar na primeira tentativa; não prescrevem contagem universal de palavras. Um dado só é obrigatório na arte quando essa superfície foi exigida. Ambiguidade expressiva e metáfora não são erros por definição.

Prompts ficam versionados por responsabilidade, com exemplos variados e testes de contrato. Distinguir significado literal de expressão editorial é uma operação lógica, sem impor duas chamadas para todo texto. A diversidade semântica acompanha a riqueza do insumo.

O adaptador de imagem recebe direção, slot e referências reais. Instruções de espaço/recorte não podem ser contraditórias. O CanvasLab renderiza a copy; o prompt da fotografia não solicita um post inteiro com letras rasterizadas. Rótulos intrínsecos ao produto são tratados conforme referência e propósito.

### 6.3 Exemplo conceitual de tarefa de imagem

~~~json
{
  "purpose": "editorial-photo",
  "intent": "Convidar para uma pausa com café e conversa",
  "scene": "Xícara em primeiro plano e ambiente sugerindo conversa",
  "requiredReferences": [],
  "guidance": {
    "light": "Luz lateral de fim de tarde",
    "mood": "Acolhedor",
    "materials": "Cerâmica e madeira"
  },
  "target": {
    "slotId": "photo",
    "aspectRatio": "Derivado do retângulo real do slot",
    "fit": "cover",
    "subjectMustRemainVisible": true
  },
  "mustNotInvent": ["Preço", "Promoção", "Identidade de loja real"],
  "requiredCapabilities": ["image-output"],
  "policyRef": "Política versionada do experimento"
}
~~~

O exemplo não é schema de produção. Propósitos precisam ser extensíveis. Luz/materiais são orientações desse caso, não restrições globais. Retrato de produto/espaço real pode exigir referência; na ausência, não prometer fidelidade nem inventar o estabelecimento.

## 7. Modelos, capacidades e fallback

Criar registro de capacidades verificadas por adaptador/modelo: imagem de saída, referências, preservação de identidade, formatos, edição/máscara quando suportadas, resolução, limites, latência, custo e restrições operacionais. Nome comercial/HD não comprova capacidade.

| Propósito | Prioridade | Comparação |
| --- | --- | --- |
| Produto real | Preservação de referência/detalhes | Fidelidade no recorte e na peça |
| Fotografia editorial | Luz, materiais, cena/anatomia | Avaliação humana e direção escolhida |
| Ilustração | Controle expressivo e referências | Aderência, expressão e composição |
| Série/carrossel | Consistência recorrente | Continuidade entre imagens |
| Visual conceitual | Relações e intenção visual | Compreensão e liberdade de soluções |

Baseline: Nano Banana 2 configurado localmente. Candidatos: Nano Banana Pro e Seedream. Fixar versão, IDs de API, disponibilidade e preço no experimento. As apresentações oficiais não demonstram superioridade no nosso uso: [Google](https://ai.google.dev/gemini-api/docs/image-generation), [ByteDance](https://seed.bytedance.com/en/seedream5_0_pro).

Separar rotas textuais de interpretação, seleção e copy. Avaliação multimodal é capacidade calibrada; não um crítico obrigatório de gosto.

Fallback operacional só escolhe alternativas compatíveis com todas as capacidades obrigatórias. Timeout/429/5xx podem permitir nova rota dentro dos limites. Resultado válido com estética diferente não aciona fallback. Falta de capacidade conhecida deve ser identificada antes da chamada.

O novo caminho elimina fallback irrestrito para Pollinations e retries/reparos ocultos acumulados. Uma política conta toda invocação. Roteamento interno de intermediários deve ser restringido quando possível e registrar modelo efetivo. Sem garantia de capacidade, a rota não atende uma obrigação.

## 8. Revisão somente com evidência forte

Conferir pertence ao caminho normal; corrigir é exceção despachada por finding elegível.

| Ocorrência | Tratamento |
| --- | --- |
| Texto obrigatório comprovadamente cortado/oculto | Recuperação localizada, preservando fatos/literais |
| Asset inválido/ausente/sem autorização | Recuperação operacional, sem substituir design |
| Mídia obrigatória vazia | Incompleta; concluir tarefa ou encerrar com motivo |
| Contraste medido contra superfície real com regra aplicável | Ação técnica delimitada, sem repintar tudo |
| Quebra demonstrável de requisito explícito | Revisão com evidência/alvo |
| Assimetria, rotação, sobreposição/recorte autorados | Preservar; não são defeitos isolados |
| “Feio”, “genérico”, “sem impacto”, “pouco premium” | Decisão do usuário; sem revisão automática |
| Evidência fraca, alvo incerto ou confiança autodeclarada | Sem revisão ou veto estético |

Força exige regra e evidência reproduzível/corroborada, não uma nota arbitrária dada pelo avaliador. Detectores multimodais começam como diagnóstico; autoridade de bloqueio depende de avaliação de falsos positivos. Obrigações que o sistema não consegue verificar precisam ser tratadas na viabilidade, sem prometer certificação inexistente.

Inventariar guards atuais antes de acrescentar outros: baseline do catálogo, colisão/overflow, contraste, cardinalidade/diversidade, bindings, reflow, normalização, fit de formato e compilação. Classificar fundamento/alcance como obrigação técnica, orientação ou preferência. Regra binária YIQ de contrast.ts não deve ser apresentada como prova WCAG suficiente para novos bloqueios. Preservar overrides manuais e cenas pinadas.

Ação de revisão declara o que muda e o que fica preservado. Não reescreve fato travado nem recombina designs. Reseleção de composição só por incompatibilidade técnica forte, em nova revisão; nunca por gosto do avaliador. Defeito herdado do modelo é registrado para curadoria/correção da variante autorada; não se mascara com normalização global. Ajustes automáticos de geometria/cores exigem capacidade autorada e delimitada, sem violar a preservação nativa.

## 9. Estados e limites

Estados sugeridos de proposta: planned, running, waiting_input, checking, recovering, delivery_pending, ready, failed, cancelled, expired e reconciliation_required. Tarefas têm estados separados. Resposta do provedor não significa prontidão.

waiting_input suspende sem ocupar executor, só para entrada essencial. Retomada explícita revalida prazo/política econômica e não renova o orçamento original. Se a solicitação expirou, uma nova ação precisa de nova admissão/preço, preservando os resultados anteriores. Gosto incerto não produz esse estado. reconciliation_required impede repetição cega de operação externa com resultado desconhecido.

Solicitação agregada pode estar em andamento com propostas disponíveis, concluída integralmente, concluída parcialmente ou encerrada sem entrega. “Aprovado” não é certificação de beleza na UI.

Limites globais: gasto, Sparks, prazo absoluto, concorrência e invocações. Reservar parcelas por proposta para impedir que uma falha consuma recursos das outras. Reservar capacidade/custo antes de cada chamada paralela, não apenas conferir saldo ao final.

Política inicial proposta do piloto: uma chamada normal por tarefa; no máximo uma recuperação adicional por tarefa e um ciclo de revisão técnica por proposta. Esses limites incluem reparo contratual, retry e fallback, sem renovação por nova revisão. Voltar do gate final não repõe tentativas. Gasto, concorrência e prazo serão calibrados pelo benchmark; 150s atuais não são automaticamente suficientes para texto mais imagens.

Sem prazo/orçamento suficiente, não despachar nova chamada. Ao esgotar, encerrar explicitamente e liquidar reservas. Cancelamento impede trabalho futuro, preserva entregas e pode não evitar custo de chamada externa já enviada.

## 10. Runtime, persistência e retomada

LangGraph fornece estado, ramificações e checkpoints; despacho/hospedagem, propriedade dos dados e efeitos externos continuam responsabilidades da aplicação. Fontes: [Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api), [checkpointers](https://docs.langchain.com/oss/javascript/langgraph/checkpointers), [tolerância a falhas](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance).

Proposta: API Express/tRPC grava admissão e despacho durável; executor Node consome trabalhos por proposta. Executor/despacho são novos. Escolher hospedagem segundo retomada após queda, backlog, concorrência, custo e compatibilidade do deploy. Promise desacoplada depois da resposta HTTP não atende esse requisito.

Experimento inicial usa executor local separado e mocks. Não acrescentar Python para adotar LangGraph. Prova de execução em produção antecede migração do tráfego.

### 10.1 Registros lógicos

| Responsabilidade | Dados |
| --- | --- |
| Solicitação | Proprietário, versões, fontes, limites, agregação, preço |
| Proposta | Contrato/revisão, estado, artefato |
| Operação | Identidade, tentativas, fingerprints, resposta/custo |
| Finding/revisão | Evidência, decisão, alvos e alterações |
| Evento | Sequência monotônica para progresso/reconexão |
| Checkpoint | Estado da execução e versão do grafo |
| Despacho | Trabalho, lease, retomada/conclusão |
| Liquidação | Reservas, débito/refund e unidade comercial |

São responsabilidades lógicas; não migration pronta nem exigência de oito tabelas novas. Reutilizar generation_runs para compatibilidade/observabilidade quando adequado. Logs atuais não são checkpoints. Esquema, índices, RPCs e retenção serão definidos na fase correspondente.

Guardar IDs/hashes estáveis; bytes de imagens/fontes no storage. Resolver URLs assinadas na leitura. Checkpoint não vira documento editável: CanvasPostModel permanece autoritativo e a cena entregue fica pinada para reabertura sem remontar pelo catálogo.

A mídia privada atual retorna /api/post-media/:owner/:hash e depende da sessão do proprietário. Provedor externo e renderer do executor precisam de um resolvedor autorizado de bytes/referências; não conseguem consumir essa URL relativa como se fosse pública. Preservar isolamento e URLs estáveis no documento. Persistir imagens antes da entrega, sem base64 repetido em snapshots/eventos/checkpoints; evitar acionar a redução de imagens de fitSavePayload na entrega normal. Manter esse protetor para os fluxos existentes que ainda precisem dele.

### 10.2 Propriedade e concorrência

Status, resultado, cancelamento e retomada verificam proprietário pela sessão. requestId/thread_id enviados pelo cliente não autorizam acesso. Registros expostos exigem políticas por proprietário; checkpoints/despacho podem ficar privados do executor. Credenciais não chegam ao frontend.

Checkpointer PostgreSQL exige conexão/driver compatível; supabase-js via REST não o substitui automaticamente. Validar pool, modo de conexão e permissões. Fontes: [conexão PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Lease e controle de versão impedem confirmação duplicada por workers concorrentes. Respostas antigas ficam na tentativa/revisão correta, sem sobrescrever estado vigente. Edição manual cria revisão própria: geração atrasada não substitui trabalho do usuário.

O tracing atual usa AsyncLocalStorage associado à execução local. Despacho/checkpoint deve carregar IDs explícitos; cada tarefa inicia seu contexto isolado de trace. Conferir duas solicitações concorrentes e tarefas paralelas sem misturar calls/custos, preservando diagnósticos administrativos. Trace não substitui registro durável de operação.

Registrar operação antes do envio, ID externo quando disponível e resultado antes de avançar. Queda entre envio e confirmação exige consulta ao provedor ou reconciliação. Não prometer execução exatamente uma vez quando o serviço externo não oferece idempotência/consulta. Retomada não deve repetir operações pagas confirmadas.

## 11. Entrega e cobrança

A RPC de lote atual depende de run concluído e posição dos slots. Evoluir entrega por proposta por contrato/RPC versionados, preservando hashes, elegibilidade, grants e proprietário. Não marcar o lote inteiro concluído para contornar esse requisito.

O contrato local de design_component_deliver_v1 exige exatamente três propostas e compara slot com índice do array. Uma proposta isolada, ou recebida fora de ordem, não pode ser entregue pelo mesmo RPC sem mudança contratual. Acrescentar protocolo de entrega por proposta/revisão e sua projeção de compatibilidade; preservar o caminho V4. Confirmar definições remotas de RPCs antes da migration, inclusive as famílias de billing next_* e legadas.

Prontidão exige mídia essencial persistida/acessível, fontes conferidas e cena validada. delivery_pending significa artefato concluído com autorização/liquidação pendentes. Só publicar ready após concluir a fronteira econômica definida. Falha de billing não regenera texto/imagem.

Proposta comercial inicial: preço por proposta completa com mídia prevista incluída, dentro de teto explícito. Preparação compartilhada integra esse preço; zero entregas libera a reserva ao usuário. Custo real das APIs é separado de Sparks. Tarifa/carrossel/falha parcial/cancelamento/reexecução manual ainda precisam de decisão de produto.

Reservar teto antes de chamadas pagas; liquidar unidades entregues sem cobrar as falhas. Reservas individuais precisam de criação atômica ou compensação durável. RPCs atuais não devem ser presumidas capazes de commit parcial de uma reserva única.

O grafo usa adaptador interno de imagem sob política integrada. Não chama post.generateImage para cobrar imagens novamente. Geração manual posterior no editor permanece nova ação explícita, com preço próprio.

Grants, entrega e cobrança exigem protocolo transacional/reconciliável. Queda após commit e antes do evento publica o mesmo resultado na retomada, sem débito adicional. Queda depois da persistência preserva o artefato e reconcilia liquidação. Transação de banco não reverte custo externo já cobrado.

DEV/FOUNDER têm bypass. Testes de plano pago são necessários além dos mocks. Decisão comercial bloqueia implementação da liquidação correspondente; não autoriza mudar preços nesta rodada.

## 12. API e experiência

Procedimentos novos propostos, com nomes a fixar na implementação:

| Procedimento | Responsabilidade |
| --- | --- |
| generation.start | Autenticar, validar, admitir/reservar idempotentemente; retornar requestId/propostas |
| generation.status | Snapshot autorizado com resultados e cursor |
| generation.events | Progresso desde cursor, se o transporte suportar streaming confiável |
| generation.cancel | Parar trabalhos futuros, preservar entregas, liquidar reservas |
| generation.provideInput | Resolver dependência explícita e revalidar política/revisão |
| generation.result | Recuperar entrega pinada sem gerar de novo |

Começar com consultas leves por cursor e reconexão. Streaming é melhoria, não requisito para independência. Realtime não é infraestrutura presumida do fluxo atual.

Cards desktop/mobile estáveis por proposalId: preparando, gerando imagem, disponível ou falha com motivo/ação. Resultados bons permanecem durante recuperação de outro. Contador distingue prontas e solicitadas. Diagnóstico interno de nós/modelos não ocupa o fluxo comum.

Reload recupera solicitação ativa; reabrir não gera assets. Editar/baixar dependem de prontidão real. Falha local de fonte/conexão permite recarregar o mesmo resultado sem IA/débito adicional. ready no servidor não comprova que o navegador já decodificou suas imagens/carregou fontes; manter o bloqueio local de exportação e a recuperação sem regeneração.

Na geração automática nova, o formato contratado usa variante autorada elegível. Isso não remove a troca manual atual: preservar projeção, prévia/confirmação e ajustes do usuário no editor/galeria. O caminho componentAssembly hoje dispensa a consulta a resolveArsenalVariant; uma promessa de variante nativa exige integração específica, não apenas ligar o grafo. Download e personalização devem receber a mesma cena no formato escolhido.

Gerar mais anexa propostas com novos IDs sem substituir a galeria nem reusar a identidade da ação anterior. Cancelar/recomeçar invalida os eventos da solicitação anterior. Histórico recupera entregas completas ou parciais sem nova geração; documentos salvos abrem pelo canvas_model. Preferências e diagnósticos devem aceitar uma proposta entregue enquanto suas irmãs ainda executam. A opção local explicitamente acionada no fluxo atual mantém sua proveniência; não se torna fallback automático nem entrega V5 apresentada como IA.

## 13. Mapa de responsabilidades

| Local proposto | Papel |
| --- | --- |
| shared/generation/ | Contratos, estados públicos, findings/eventos |
| server/ai/workflows/ | Coordenador/grafo por proposta e etapas reutilizáveis |
| server/ai/prompts/ | Prompts versionados construídos dos contratos |
| server/ai/routing/ | Capacidades, rotas, limites/fallback |
| server/ai/images/ | Adaptadores, referências, resultados |
| server/ai/review/ | Evidência técnica e ações localizadas |
| server/generationRuntime/ | Despacho, checkpoints, leases, operações, eventos, reconciliação |
| server/routers/generation.ts | API autenticada curta |
| server/designCatalog/ | Recuperação/hidratação e entrega/grants por proposta |
| server/billing.ts e liquidação | Reservas/política econômica |
| client/src/pages/StudioApp/ | Progresso e galeria independente |
| client/src/pages/CanvasLab/ | Consumo fiel/edição autoritativa |
| harness/generationWorkflow/ | Falhas, replay e contratos |
| harness/imageModels/ | Comparação isolada e montada |

Diretórios são mapa de responsabilidade; não exigem duplicar funções existentes. Reutilizar transporte, catálogo, compilador e saveAdapter quando corretos.

## 14. Fases e critérios de saída

### Fase 0 — Baseline e experimento de execução

Inventariar guards/prompts/adaptações; comparar pequeno conjunto de referências/conversões; preparar briefings representativos. Criar matriz de obrigações versus preferências e baseline de preservação (§4.1/auditoria). Preparar fixtures V4 e históricas com rich text, overrides, mídia, camadas autorais e carrossel. Experimento local de LangGraph TypeScript com checkpoint, executor separado e mocks. Definir recomendações de hospedagem/despacho, retenção e economia.

Saída: A disponível enquanto B trava; restart sem repetir A; conexão/checkpointer compatíveis; riscos de cobrança parcial explícitos; testes existentes de edição/persistência/exportação passam e lacunas de cobertura ficam registradas. Não exige migrations de produção ou chamadas pagas.

### Fase 1 — Contratos, prompts e capacidades

Implementar contratos/testes e adaptador de entrega para a cena atual; definir vínculo estável proposta/documento/post salvo e resolver o risco de savedPostId global antes de integrar eventos. Extrair preparação/seleção/copy sem perder controles e fontes atuais; construir registro de modelos e adaptadores com referências efetivas. Preparar benchmark com mesmos briefs/referências, múltiplas amostras e avaliação cega da imagem isolada e do post montado.

Saída: contratos sem contradição; mesma cena nos painéis/render/save/reopen; replay não muda identidade nem sobrescreve edições; salvar A/trocar para B/receber retorno de A não cruza documentos; fontes preservadas, arquivos/parâmetros realmente enviados e rota incapaz excluída antes do custo. Coletas pagas têm rodada/orçamento explícitos. Não trocar modelo por uma única amostra ou showcase.

### Fase 2 — Runtime durável e liquidação

Implementar persistência física/migrations/políticas, despacho, leases, eventos, operações e API curta. Entrega/grants por proposta exigem protocolo novo, sem relaxar o RPC V4. Adaptar histórico, feedback/preferências, compilação e traces para leitura versionada/entrega parcial. Implementar unidades econômicas após decisão comercial. Preservar autenticação, limites de plano, storage privado e publicação administrativa.

Saída: restart, disputa de workers, respostas atrasadas, cancelamento, idempotência, propriedade e falha de commit testados. Proposta slot 2 pode chegar primeiro sem renumeração; preferência funciona durante execução das irmãs; histórico lê V4/V5; trace/custos não se cruzam. Entrega parcial liquida unidades contratadas. Resultado incerto segue reconciliação.

### Fase 3 — Post único completo

Integrar uma proposta: catálogo real, copy, geração/reutilização de imagem, render de prova e gates técnicos. Render confiável usa definições/fontes/tratamento de mídia equivalentes à cena final. Validar headless ou equivalente antes de usá-lo como autoridade.

Saída: 4:5 com mídia preenchida nos slots nativos, cena pinada, fontes/imagens privadas equivalentes no renderer e navegador, findings fracos sem ação e fortes limitados aos alvos; sem fallback genérico automático. Copy obrigatória não é amputada para caber. Esta fase não migra carrosséis ou outros formatos.

### Fase 4 — Galeria independente e piloto

Integrar progresso/status, assets, reconexão, editor e download desktop/mobile. Começar administrativo com catálogo conferido, sem publicar drafts automaticamente. Feature flag combina coorte, modo, formato e versão; V4 continua atendendo modos/formatos ainda não validados, escolhendo o caminho antes da admissão/cobrança. Não trocar de pipeline após uma falha V5.

Saída: A disponível antes de B; reload conserva estado; gerar mais, preferências, painéis desktop/mobile, rich text, undo/redo, autosave, salvar/reabrir/exportar e confirmação de formato preservados; falha local não refatura IA. Testar o percurso completo no navegador. Carrossel V4 continua funcional durante o piloto. Primeiras execuções reais com custo/prazo delimitados.

### Fase 5 — Carrosséis e formatos

Adicionar sequência, mídia compartilhada/referência inicial quando exigida, dependências entre slides e variantes 1:1/9:16. Preservar resultados aceitos e corrigir somente alvos/descendentes afetados.

Saída: sequência íntegra, fatos/fontes preservados, nenhuma nota estética como veto e nenhuma adaptação silenciosa de família/formato. Percurso real de carrossel e reabertura.

### Fase 6 — Expansão e retirada controlada

Comparar baseline, conferir billing pago e ampliar por coortes. Remover dependências duplicadas do novo caminho após equivalência funcional. V4/histórico continuam reabríveis.

Saída: operação monitorável, recuperação demonstrada, cobrança conferida, documentação atualizada e rollback exercitado. Mocks aprovados sozinhos não encerram uma fase.

Dependências: 0 → 1 → 2 → 3 → 4 → 5 → 6. Curadoria e harness de imagem podem avançar durante o runtime. Datas dependem da estimativa por pacote e decisões operacionais.

## 15. Cenários obrigatórios de verificação

| Cenário | Resultado esperado |
| --- | --- |
| Imagem termina antes da copy | Barreira da proposta aguarda só suas tarefas/revisão |
| A pronta, B lenta, C falha | A disponível e preservada |
| Uma de várias imagens falha | Recuperar só a falha |
| Fallback incapaz de preservar referência | Não invocar; falha explícita sem rota compatível |
| Timeout com resultado externo incerto | Reconciliação, sem repetição cega |
| Queda antes/depois de checkpoint | Retomar operações confirmadas sem gerar/cobrar novamente |
| Resposta antiga chega | Não sobrescrever revisão vigente |
| Copy muda dependência da imagem | Invalidar só descendentes dependentes |
| Avaliador diz “feio” com nota baixa | Nenhuma revisão automática por gosto |
| Overflow comprovado de texto obrigatório | Recuperação delimitada ou falha explícita |
| Sobreposição intencional | Preservar composição |
| Modelo sem mídia obrigatória | Não inventar tarefa de imagem |
| Prazo/custo esgotam | Parar despachos, preservar entregas, liquidar |
| Upload/grants/commit falham | Recuperar entrega/liquidação sem regenerar conteúdo aceito |
| Cancelar/mudar solicitação | Isolar eventos e preservar entregas |
| Edição manual antes de resposta antiga | Não sobrescrever edição |
| Outro usuário fornece requestId/thread_id | Negar acesso |
| Fonte falha no navegador | Recarregar sem IA/cobrança nova |
| Um slide falha | Preservar bons; carrossel completo aguarda integridade |
| Zero propostas entregues | Falha explícita/liberação conforme política, sem arte substituta |

Mocks verificam controle; fixtures reais conferem fontes/hashes/cenas; navegador verifica percurso autenticado. IA real mede capacidade operacional e avaliação humana, sem transformar gosto em guard.

## 16. Métricas e critérios de lançamento

Medir tempo até primeira/última proposta utilizável; entrega completa/parcial; custo real/estimado; retries/reparos/fallbacks separados; motivo de revisão; falhas locais; divergências de cena; custo de cancelamento; reconciliação; débito duplicado e acesso cruzado.

Avaliação humana acompanha escolha, edição solicitada, aprovação visual e falsos positivos dos guards. Não usar cada edição manual como falha da automação nem converter esses sinais em veto individual.

Critérios duros: zero mídia obrigatória vazia rotulada pronta; zero débito duplicado nos cenários exercitados; zero mistura de proprietários/revisões; nenhuma revisão por gosto; nenhum fallback genérico; preservar resultados aceitos nas falhas; salvar/reabrir/exportar fiel.

Limiares de latência/custo/taxa de revisão e expansão vêm do corpus/benchmark. Não impor metas arbitrárias que incentivem empobrecer criação ou baixar exigências.

## 17. Migração e rollback

Ativação por coorte/modo/formato/versão; começar com administradores e catálogo conferido. Uma fase de post único não desativa carrosséis nem formatos existentes. Não duplicar chamadas pagas V4/V5 para cada usuário como comparação automática; usar replay/experimentos delimitados.

Requests ficam pinados à versão de grafo/prompts/contratos/modelos/economia. Desativar novos requests não reinicia os existentes em V4. Concluir na versão compatível ou cancelar/liquidar explicitamente.

Preservar entregas V5 e reabertura no rollback. V4 pode atender novas solicitações segundo ativação, com informação honesta de mídia pendente. Não reativar o montador de fragmentos. Migrations aditivas até encerrar leitura antiga.

§13.69 governa revisão. Planos anteriores com notas editoriais/críticos estéticos não autorizam veto por gosto. Observações de clareza podem alimentar preparação e avaliação humana.

## 18. Decisões abertas e momento de resolução

| Decisão | Recomendação inicial | Momento |
| --- | --- | --- |
| Runtime do grafo | LangGraph TypeScript após prova de retomada | Fase 0 |
| Hospedagem/despacho | Executor Node recuperável fora do request HTTP | Antes da Fase 2 em produção |
| Tarifa/entrega parcial | Preço por proposta entregue, mídia incluída | Antes da liquidação da Fase 2 |
| Prazo/custo/concorrência | Limites globais + parcelas por proposta | Antes do piloto pago |
| Ordem dos modelos | Capacidades verificadas/comparação cega | Fase 1 |
| Catálogo/corpus inicial | Pequeno conjunto conferido com originais | Fases 0–1 |
| Render de prova | Fidelidade ao CanvasLab demonstrada | Fase 3 |
| Retenção | Fontes, checkpoints, artefatos e diagnóstico | Fase 2 |

Essas decisões não impedem contratos, testes offline e experimento local. Impedem tratar preços/disponibilidade/infraestrutura presumidos como escolhas já feitas.

## 19. Contexto e referências

Contexto canônico: [DOCUMENTO_MESTRE.md](../DOCUMENTO_MESTRE.md), §§13.63, 13.66–13.69. Base atual: [arquitetura-geracao-por-composicoes.md](./arquitetura-geracao-por-composicoes.md). Autoria: [pipeline-designs-completos.md](./pipeline-designs-completos.md). Plano editorial anterior: [plano-qualidade-editorial-ia.md](./plano-qualidade-editorial-ia.md), subordinado à política atual de revisão. Evidência real: artifacts/verification/thevoid-v4-2026-10-07/RELATORIO.md.

Auditoria de integração e preservação: [revisao-blueprint-preservacao.md](./revisao-blueprint-preservacao.md). A revisão acrescenta critérios obrigatórios sem implantar o novo caminho. Baseline local: 104 testes de preservação e 39 estruturais, em 30 arquivos no total, além de pnpm check, passaram; apenas isolamento do componente de feedback no teste da galeria foi ajustado. Isso não substitui validação de navegador, billing pago ou RPCs remotas.

Fontes oficiais consultadas na elaboração de 2026-10-07 sustentam capacidades documentadas; versões/preços/runtime precisam ser conferidos no pacote correspondente. Compass indisponível; código localizado por leitura dirigida. Nesta revisão houve documentação, execução de testes e ajuste do ambiente de um teste; sem mudança funcional, migration, implantação, benchmark visual ou geração paga.


## 20. Estado após correções da conferência (2026-10-08)

A implementação foi corrigida conforme `docs/correcoes-geracao-orquestrada-2026-10-08.md` e DOCUMENTO_MESTRE §13.74. Existe agora um piloto DEV integrado à galeria, com LangGraph TypeScript e executor Node separado; a durabilidade pertence ao journal/checkpoints de domínio em Postgres. Não se utiliza MemorySaver como persistência produtiva, nem se atribui execução exatamente uma vez ao provedor externo. Ready requer commit/grants autorizados por proposta; retomadas reutilizam resultados confirmados, isolam falhas e não repetem efeitos pagos incertos.

O piloto é desligado por padrão (`GENERATION_V5_MODE=off`); `dev` exige perfil DEV, migrations 0034/0035 e heartbeat do executor. A API bloqueia planos pagos nesse caminho. Essa implantação limitada permite conferir o fluxo sem inventar tarifas ou alterar o billing existente. **Fase 2 comercial e lançamento público seguem abertos**: reserva/liquidação parcial, preços, hospedagem produtiva, validação remota do fluxo completo e operação/retenção de reconciliações precisam ser concluídas antes do piloto pago.

No ambiente local do proprietário, `GENERATION_V5_MODE=dev` foi habilitado em 2026-10-08. `pnpm dev` inicia o executor como processo filho separado depois do bind, exclusivamente fora de produção/serverless; IPC encerra novas claims ao perder o pai. A flag “Usar geração progressiva V5” escolhe o caminho no Studio. `capabilities.selectable` representa autorização de ambiente/conta e `enabled` representa disponibilidade do executor; o cliente acompanha essa disponibilidade a cada cinco segundos enquanto V5 está selecionado. Flag, heartbeat e reload sem duplicação foram conferidos no ambiente real, sem gerar posts. O início de jobs dentro do request HTTP continua proibido.

Foram corrigidos contratos, preparação/contexto, tipografia, conferência sem veto estético, mídia/referências privadas, entrega independente, recuperação local, histórico/preferências/diagnósticos e corridas de cancelamento/admissão/edição. Repetição de família visual não é defeito técnico; orienta-se variedade no prompt de seleção. Não há geração corretiva rotineira nem critério subjetivo de beleza.

Validação local final: 139 arquivos/1.384 testes, typecheck, builds de cliente/servidor/executor; SQL real em PostgreSQL local via PGlite e testes montados da UI. Em rodada posterior de 2026-10-08, 0034/0035 foram aplicadas ao Supabase configurado: RLS, ACLs, histórico e oito RPCs conferidos, com nove testes PostgreSQL novamente aprovados. A 0035 usa `PT409` para perda de lease, evitando retries do PostgREST provocados por `40001`. Não houve ativação, deploy do app ou chamada paga. A matriz de navegador autenticado desktop/mobile, modelos reais, qualidade humana e exportação produtiva segue como gate, não como alegação de preservação integral. O checklist atualizado em `docs/tasks.md` distingue as entregas desses gates.

## 21. Lacunas confirmadas do contrato de imagem no piloto (2026-10-08)

O estado acima não significa conclusão de §§5.2–5.3, 6.3, 7 e 9. A auditoria inicial do pedido real `0c852ee2-aa1a-4b54-8195-f91f8295d3ad` encontrou nove designs selecionados sem slots, zero prompts/ operações de imagem e duas propostas encerradas por overflow no apoio do último slide. Uma proposta foi recuperada no CanvasLab após corrigir o crash da galeria vazia. Evidências: DOCUMENTO_MESTRE §13.77–13.78 e `artifacts/verification/v5-image-contract-audit-2026-10-08/`. A tabela abaixo incorpora as implementações e conferências independentes até §13.82; os gates permanecem parciais.

| Responsabilidade prevista | Implementação observada | Lacuna |
| --- | --- | --- |
| Imagens presentes nas sugestões quando contratadas | Obrigação pré-seleção; proibição bloqueia adapter | Ausência de obrigação também bloqueia mídia nativa; distinguir proibida/opcional/obrigatória e impedir slot vazio entregue como pronto |
| ImageTaskContract aplicado | Instanciado e usado para prompt/propósito/checkpoints | Proporção fixa difere da geometria efetiva e capacidades ainda não governam despacho; alinhar contrato e execução |
| Roteamento/fallback por propósito | Gemini/Seedream; ID Seedream normalizado e alias compatível | Homologar capabilities/execução real, validar propósito e erros recuperáveis |
| Copy/mídia paralelas com dependências explícitas | Slots concorrentes com abort cooperativo e allSettled | Persistência/upload não recebem sinal/prazo; limitar concorrência e reconciliar operações/asset sem bundle |
| Recuperação técnica excepcional | Merge preserva campos saudáveis, uma recuperação e recheck Fontkit | Prompt corretivo omite original/contexto/fontes e pode trocar fatos no campo afetado; propagar estado recovering |
| Liquidação proporcional V5 | Admissão/runtime/cancel conectados; ajuste parcial funciona no caminho feliz | Update e commit separados, erro de update ignorado, liquidação de request ainda running e falta de reconciliação após término/expiração |

A obrigação de imagem é decidida antes da seleção. Quando existir, recuperar composições/variantes com suporte nativo ao propósito, sem usar ausência de slot para dispensá-la e sem adicionar fotografias arbitrárias a um layout pinado. Ausência de pedido explícito de foto deve permitir mídia compatível com a composição escolhida; não equivale a proibi-la. Seedream teve o ID corrigido, mas continua sem homologação real. O Nano Banana/Gemini possui caminho de execução; a revalidação usou dependências simuladas. Os 116 testes existentes e o typecheck passaram, sem provar geração visual real ou liquidação segura; casos adversos documentados em DOCUMENTO_MESTRE §13.82 mantêm gates abertos.
