# Revisão de encaixe e preservação do blueprint

Data: 2026-10-07. Referência: [blueprint-geracao-orquestrada.md](./blueprint-geracao-orquestrada.md). Revisão do código local ativo, sem implantação do grafo, migration, escrita no banco ou geração paga.

O destino proposto é compatível com o PostSpark se a reforma acontecer atrás dos contratos de edição existentes. A troca direta de post.generate por um grafo não basta: lote, identidade, salvamento, assets, histórico e feedback ainda pressupõem o fluxo síncrono. Os principais bloqueios são entrega por proposta e vínculo entre proposta, documento e registro salvo. O plano revisado antecipa essas fronteiras e mantém os modos não migrados no V4.

## 1. Método e alcance

Foram consultados DOCUMENTO_MESTRE.md, a skill compass-context e os produtores/consumidores do fluxo Studio → geração → compilação → CanvasLab → save/reopen/export. Compass não estava disponível nas ferramentas; a localização usou rg e leitura dirigida. As evidências abaixo referem-se ao checkout local, que já possui mudanças de rodadas anteriores.

“Confirmado” significa condição visível no código ou exercitada pelo teste indicado. Risco de integração descreve o que pode acontecer ao implementar o plano sem adaptação; não afirma que houve incidente em produção. Definições de RPCs remotas, custos de plano pago, renderer do executor e percurso completo desktop/mobile não foram validados nesta rodada.

## 2. Gaps e mudanças necessárias no plano

### G01 — Entrega parcial não cabe no RPC de lote (bloqueio de integração)

Evidência: [arsenalRun.ts](../server/designCatalog/arsenalRun.ts), linhas 34, 70 e 82, compara slot com a posição no array; [0026_component_arsenal_validation.sql](../drizzle/0026_component_arsenal_validation.sql), linhas 40 e 60–62, exige três propostas e run concluído. Não há versão posterior desse RPC nas migrações locais consultadas.

Risco: A termina antes de B, mas não pode receber entrega/grants pelo contrato atual. Colocar a proposta de slot 2 num array de um elemento também falha. Marcar o run inteiro completed para liberar A falsifica seu estado e afeta histórico/billing.

Plano: protocolo/RPC aditivo por proposta/revisão, com grants, proprietário e liquidação; V4 conserva o RPC antigo. Gate da fase 2: entregar slot 2 primeiro, sem renumerar e sem concluir suas irmãs. Conferir o banco remoto antes de escrever a migration.

### G02 — Recompilar muda identidade; materialização ainda é conjunta (bloqueio)

Evidência: [completeDesignCompiler.ts](../client/src/pages/CanvasLab/lib/completeDesignCompiler.ts), linhas 68 e 123, cria UUIDs por compilação; [studioGeneration.ts](../client/src/pages/StudioApp/lib/studioGeneration.ts), linhas 446–451, materializa com Promise.all. O mesmo adaptador atende geração, gerar mais e histórico.

Risco: polling/reconexão recompila a entrega, troca IDs e duplica cards ou perde associação com edição. Uma rejeição de materialização ainda derruba o retorno conjunto.

Plano: identidade persistente proposalId/revisão → documento, materialização individual idempotente e cache da entrega aceita. Manter leitores V4/históricos. Gate das fases 1–2: replay/reconexão não duplica cards; falha de B não elimina A; gerar mais cria IDs novos sem substituir documentos existentes.

### G03 — savedPostId global pode atualizar o registro de outra proposta (risco existente)

Evidência: [StudioAppV2BPage.tsx](../client/src/pages/StudioApp/StudioAppV2BPage.tsx), linha 136, guarda um savedPostId único; selecionar variação, linhas 421–424, não o troca; atualizar, linhas 443–458, utiliza esse ID global. Voltar à galeria conserva o estado de salvamento.

Cenário de risco: salvar A → voltar à galeria → abrir B → atualizar/autosalvar B. O caminho estático permite usar o ID salvo de A. Um retorno assíncrono de A depois de abrir B também exige associação explícita. Não foi provocada sobrescrita real nesta revisão.

Plano: vínculo por documento entre identidade local/proposta/revisão e ID do banco; callbacks e fila de save associados ao documento de origem. Antecipar essa correção à integração incremental na fase 1. Gate: editar/salvar A e B, trocar durante save e confirmar que nenhum registro ou status de autosave cruza documentos. Este risco não está resolvido apenas porque os testes atuais passaram.

### G04 — Progresso do grafo não pode reinicializar o editor (bloqueio)

Evidência: [CanvasLabPage.tsx](../client/src/pages/CanvasLab/CanvasLabPage.tsx), linha 97, utiliza initialPost só na inicialização do histórico. setPost, linha 148, controla histórico/autosave; handleUpdatePost, linha 277, incorpora alterações de composição.

Risco: mudar initialPost por evento não atualiza o documento. Acrescentar sincronização indiscriminada ou uma key variável por status pode apagar edição, seleção e undo/redo. Inserir imagens diretamente no estado da galeria não atualiza automaticamente a sessão já aberta.

Plano: store de execução separado do documento editável; abrir a entrega completa aceita uma vez. Eventos tardios não substituem uma sessão editada. Atualizações manuais seguem o funil existente e a identidade capturada. Gate: editar A enquanto B executa, reconectar e receber evento antigo sem perder edição/histórico.

### G05 — Contrato simplificado desmontaria painéis e textos (bloqueio)

Evidência: [completeDesignGeneration.ts](../shared/completeDesignGeneration.ts), linhas 188–217, instancia origem, conteúdo, overrides, richText e media; [CanvasLabPage.tsx](../client/src/pages/CanvasLab/CanvasLabPage.tsx), linhas 1016, 1053 e 1182, conecta editor guiado, sidebar e drawer à composição. [saveAdapter.ts](../client/src/pages/CanvasLab/lib/saveAdapter.ts) persiste o documento completo.

Risco: entregar apenas headline/subtext/imageUrl ou uma imagem final pode exibir uma prévia, mas eliminar bindings, campos variáveis, destaque, estilos por slide, grupos, edição livre e mídia localizada. Reabrir remontando do catálogo pode perder overrides e depender de uma versão alterada.

Plano: contrato de entrega com cena pinada e adaptador para CanvasPostModel; conservar V2/V3 suportados, conteúdo, rich text, geometria, paleta/fontes, camadas autorais, mídia e proveniência. Separar versão do protocolo de versão do editor. Gate: fixture rica round-trip e mesmas ações disponíveis nos painéis desktop/mobile, sem importar componentes React no servidor.

### G06 — Foto gerada e asset de catálogo têm permissões diferentes (bloqueio)

Evidência: [mediaSlots.ts](../client/src/pages/CanvasLab/lib/mediaSlots.ts), linhas 9, 32–39 e 62, aplica mídia por post/slide/slot em composition.media. [arsenalSave.ts](../server/designCatalog/arsenalSave.ts), linhas 49–70, confere grants e hashes de assets de catálogo. [mediaAssets.ts](../server/mediaAssets.ts), linhas 14–35 e 64–74, persiste mídia por proprietário e exige sessão na leitura de /api/post-media.

Risco: anexar a foto ao manifesto do catálogo quebra autorização/save e imutabilidade. Enviar URL privada relativa ao modelo de imagem ou ao renderer sem sessão não fornece a referência. Base64 repetido pode inchar checkpoints e acionar redução de qualidade em [fitSavePayload.ts](../client/src/pages/CanvasLab/lib/fitSavePayload.ts).

Plano: mídia gerada em composition.media[slotId], storage privado e referência estável; resolvedor autorizado de bytes para modelos/render. Preservar hashes/grants do catálogo. Reutilizar semântica de alvo e recorte: imageRequestForTarget escolhe proporção suportada próxima ao slot e o editor faz o enquadramento. Gate: múltiplos slots, slide reordenado/removido, acesso cruzado negado, referência efetivamente transmitida e save sem base64 da entrega.

### G07 — “Pronta” no servidor não significa carregada no navegador (integração)

Evidência: [mediaSlots.ts](../client/src/pages/CanvasLab/lib/mediaSlots.ts), linha 71, conta ausência de URL; [CanvasPostStage.tsx](../client/src/pages/CanvasLab/components/CanvasPostStage.tsx), linhas 700–720, confere fontes, edição ativa e imagens decodificadas; [exportMedia.ts](../client/src/pages/CanvasLab/lib/exportMedia.ts) distingue imagens renderizadas/carregadas.

Risco: liberar download só pelo status remoto exporta antes do carregamento. Usar o renderer como autoridade sem as mesmas fontes/recortes pode produzir finding falso. Um problema de rede local não justifica refazer imagem ou cobrar IA.

Plano: prontidão remota e carregamento local separados; preservar gates de PNG/ZIP e retries locais de assets. Demonstrar equivalência do render de prova ao CanvasLab antes de lhe dar poder de correção. Gate: fonte ou foto atrasada impede exportação até carregar; recuperar a mesma entrega sem nova chamada paga.

### G08 — Histórico, preferências e diagnósticos também dependem do lote (bloqueio)

Evidência: [studioPreferences.ts](../server/designCatalog/studioPreferences.ts), linhas 20–27, exige run completed e busca snapshot[slot]; [designCatalog.ts](../server/routers/designCatalog.ts), linhas 64–76, valida slot 0–2 e report de compilação pelo snapshot. [History.tsx](../client/src/pages/History.tsx), linhas 164, 301 e 377, restaura array ou wrapper, conta somente wrapper.variations e oferece recuperação apenas de runs concluídos.

Risco: gostar de A enquanto B executa falha; report perde associação por ordem de chegada; entregas parciais somem do histórico. A contagem de variações já é inconsistente para snapshots em array, embora o botão de recuperação de completed não dependa dessa contagem.

Plano: leitores versionados, quantidade por entregas reais, feedback/report por proposta/revisão entregue e recuperação parcial. Conservar runId/slot de V4 e os caminhos SavedPosts/canvas_model. Gate: A entregue com pedido running aceita feedback autorizado, aparece no histórico e reabre sem IA; fixtures históricas continuam válidas.

### G09 — Preparação do pedido contém comportamento de produto (bloqueio)

Evidência: [routers.ts](../server/routers.ts), linhas 166–198 e ramo post.generate, recebe executionBrief, intervenção, fontes, termos obrigatórios/proibidos, brandInput, site intelligence e elegibilidade; [StudioAppV2BPage.tsx](../client/src/pages/StudioApp/StudioAppV2BPage.tsx) faz revisão do briefing/guards e consulta brand kit.

Risco: um novo start({prompt}) elimina níveis de intervenção, literais, contexto de URL, marca, slideCount ou confirmação de formato. Copiar só geração textual deixa preparação/autorização dependentes do antigo handler HTTP.

Plano: extrair preparação como serviço com inputs/versionamento explícitos; proprietário e elegibilidade via envelope de admissão, mantendo gates anteriores à cobrança. Preservar autorização administrativa de drafts, limites de plano e fontes autorizadas. Gate: texto literal, URL com marca, input de imagem, briefing de carrossel revisado e preferências chegam às tarefas sem perda ou invenção de fatos.

### G10 — Política automática pode remover edição manual por engano (preservação)

Evidência: [guidedComposition.ts](../client/src/pages/CanvasLab/lib/guidedComposition.ts), linhas 122 e 332, captura/restaura visual; [GuidedEditor.tsx](../client/src/pages/CanvasLab/components/GuidedEditor.tsx) expõe reorganização, destaque e modo livre. [CanvasLabPage.tsx](../client/src/pages/CanvasLab/CanvasLabPage.tsx), linha 328, oferece projeção/prévia de formato; no ramo componentAssembly não consulta resolveArsenalVariant.

Risco: interpretar “sem correção por gosto” ou “só variante autorada” como proibição de o usuário reorganizar, mudar estilo ou confirmar uma projeção. Prometer variante nativa sem adaptar esse ramo também não funciona.

Plano: restringir revisão automática conforme §13.69; preservar controles manuais e confirmação de formato. A geração V5 escolhe variante autorada para o formato contratado. Gate: ação manual conserva sua liberdade, cancelamento não muda a cena e download/personalização usam a mesma projeção confirmada.

### G11 — Billing atual não equivale a liquidação parcial (bloqueio)

Evidência: [routers.ts](../server/routers.ts), linhas 456, 758, 824 e 906–924, separa reserva de post e geração manual de imagem; [billing.ts](../server/billing.ts), linhas 216–334, suporta famílias next_* e legadas, com bypass DEV/FOUNDER.

Risco: o grafo chamar o procedimento manual de imagem cobra duas vezes; refund do lote após entregar A conflita com entrega parcial; smoke DEV não comprova saldo real. Implementar apenas checkpoint não evita duplicação de efeitos externos.

Plano: adaptador interno de imagem, economia integrada, operações persistidas/idempotentes e reconciliação de entrega/grants/cobrança. Decisão comercial antecede liquidação paga. Gate: plano pago, falha parcial, commit/refund com erro e queda após commit sem débito duplicado. Regeração manual posterior continua ação com preço próprio.

### G12 — Trace local não acompanha automaticamente o executor (integração)

Evidência: [generationTrace.ts](../server/ai/generationTrace.ts), linhas 69–87, usa AsyncLocalStorage/enterWith e grava calls no contexto atual. O novo worker/checkpointer ainda não existe.

Risco: contexto não atravessa processos; paralelismo sem isolamento pode associar custos/calls à solicitação errada. Perder diagnóstico também dificulta distinguir indisponibilidade real de erro contratual, como ocorreu na investigação do carrossel.

Plano: IDs explícitos no despacho, contexto isolado por tarefa e agregação por request/proposta/operação; preservar Admin e taxonomia de falhas. Gate: duas solicitações concorrentes, retries e retomada sem mistura de trace/custo. Runtime/checkpointer precisam de prova operacional separada.

### G13 — Piloto de post único não pode desativar carrosséis (preservação)

Evidência: o Studio atual admite static/carousel e formatos, enquanto as fases 3–4 do blueprint começam com post único 4:5; carrosséis entram na fase 5.

Risco: uma flag global troca o pipeline de todos os usuários/modos e deixa funções existentes sem implementação equivalente. Fazer fallback V5 → V4 após custo acrescenta chamadas e esconde falhas.

Plano: escolher versão antes da admissão por coorte + modo + formato. Manter V4 nos modos ainda não validados; migração aditiva e rollback preservando entregas/documentos V5. A opção local já existente continua explícita e com proveniência, nunca disfarçada de IA ou acionada automaticamente.

Gate: piloto 4:5 funciona ao lado do carrossel V4; desativar novas admissões V5 não reinicia jobs já admitidos nem impede reabrir/exportar suas entregas.

## 3. Matriz de preservação

| Função | Dono atual | Evidência local exercitada | Verificação adicional antes da migração |
| --- | --- | --- | --- |
| Painéis/guias, fundo, destaque e conteúdo variável | CanvasLabPage, GuidedEditor, ArsenalCompositionInspector, VariableContentEditor | Testes de interação dos componentes | Desktop e drawer mobile no navegador com entrega V5 |
| Rich text, quebras, seleção e geometria | richText, richTextLayout, documentCommands | Testes de formatação, layout e comandos | Edição direta → undo/redo → reabrir, incluindo composição nativa |
| Copy/legenda/CTA/hashtags e carrossel | saveAdapter, slideReplication | Round-trip e replicação seletiva | Inputs text/URL/image e todos os níveis de intervenção |
| Undo/redo e autosave | canvasHistory, historyStack, autoSaveManager | Histórico, fila, debounce e desligamento | Alternância A/B e retorno assíncrono de save, hoje sem cobertura integrada |
| Upload/gerar imagem/enquadrar por slot | mediaSlots, MediaSlotPanel, mediaAssets | Identidade do destino, mídia privada e painel | Modelo recebe referência real; entrega multi-slot com runtime novo |
| Salvar/reabrir | saveAdapter, save/update e SavedPosts | Fixture de adaptador e proveniência | Fixtures completas V2/V3, IDs por documento, grants/billing reais |
| Galeria, formato e download | StudioGalleryView, CanvasPostStage, exportMedia | Mesma cena para editar/baixar; export e imagens visíveis | Cards parciais, mobile, fontes atrasadas, PNG 4K e ZIP real |
| Feedback/histórico/Admin | studioPreferences, History, designCatalog, generationTrace | Teste de preferência/proprietário no contrato atual | Proposta pronta com irmãs running, histórico parcial e traces concorrentes |
| Autenticação/billing/planos | context, routers, billing, mídia privada | Parte de mídia/proprietário nos testes focados | Sessão/owner no executor, RPCs remotas e plano pago |

Os testes existentes cobrem partes dessas superfícies. Não demonstram equivalência V5, pois esse protocolo não foi implementado. As verificações adicionais são critérios de implementação, não resultados desta rodada.

## 4. Ordem revisada

1. Fase 0: baseline de preservação, fixtures e experimento durável com mocks. Catalogar guards automáticos separadamente de ações manuais.
2. Fase 1: contratos/adaptador de cena e identidade de documento/salvamento; preparação completa, prompts e referências reais. Antecipar G03, sem esperar integração da galeria.
3. Fase 2: protocolo de entrega/grants por proposta, persistência/runtime, economia, leitores de histórico/feedback/diagnóstico e isolamento de proprietário.
4. Fase 3: uma proposta 4:5, mídia no slot e render de prova fiel. Validar entrega completa sem migrar outros modos.
5. Fase 4: galeria independente e percurso do usuário, incluindo todos os controles da matriz. Ativar só a combinação validada; V4 continua nos demais modos.
6. Fases 5–6: carrosséis/formatos, testes de sequência, plano pago, expansão e rollback exercitado. Retirar caminho antigo de geração só após equivalência; preservar leitores/documentos históricos.

## 5. Validação executada nesta revisão

104 testes de preservação passaram em 24 arquivos: componentes guiados/inspector/conteúdo/mídia; exportação do stage e da página; saveAdapter; mediaSlots; comandos e camadas extras; rich text/layout; replicação; artControls; compilador de design completo; fitSavePayload; autosave; canvasHistory/historyStack; exportMedia; galeria; mídia privada; preferências. Outros 39 testes estruturais passaram em seis arquivos: arsenalRun, completeDesignStructural, completeDesignGeneration, billing.transactions, imageGeneration e completeDesigns. Total: 143 testes em 30 arquivos; pnpm check também passou. As suítes estruturais verificam contratos/serviços atuais com fixtures/mocks, sem certificar RPCs remotas ou cobrança real.

A primeira rodada teve 77 passes e uma falha: StudioGalleryView.test.tsx não isolava StudioDirectionFeedback, que chama hooks de tRPC. Foi adicionado um mock desse componente no teste que verifica exclusivamente fidelidade de formato/download. A correção afeta só o ambiente desse teste; não comprova funcionamento integrado do feedback V5. A rodada final inclui testes adicionais de autosave/histórico/exportMedia, totalizando os 104 acima.

Logs locais: /tmp/postspark-blueprint-preservation-tests-r2.log, /tmp/postspark-blueprint-structural-tests.log e /tmp/postspark-blueprint-typecheck.log. Nenhum código funcional foi alterado nesta revisão. Riscos como G03 continuam registrados para implementação; não foram mascarados como corrigidos. Não houve benchmark visual, nova avaliação estética ou geração paga. O teste real anterior de §13.67 permanece evidência histórica do V4 e não certifica o futuro fluxo.
