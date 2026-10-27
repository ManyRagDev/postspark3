# Contratos mínimos propostos

15/10/2026 — proposta para as três ordens. Nenhum contrato em uso foi mutado. Tipos/schema/prompt atuais continuam autoritativos até a execução integrada correspondente.

## 1. Fronteiras preservadas

`generation.start` continua mutation tRPC autenticada (`POST /api/trpc/generation.start`, com transporte/batching e SuperJSON existentes; alias `/trpc`). Identidade vem de `ctx.user.id`; `ownerId` recebido deve coincidir. `generation.get/cancel`, cookie bridge, idempotência/reserva e respostas públicas não mudam. Entrada inválida continua erro tRPC `BAD_REQUEST` (HTTP 400 em chamada simples); não autenticado `UNAUTHORIZED` (401) e divergência de proprietário `FORBIDDEN` (403), conforme o router vigente. Nenhum endpoint novo.

Continuam `OrchestratedGenerationInput`, `executionBriefSchema`, `normalizeExecutionBrief`, `PreparedGeneration`, `contextContent: string`, ofertas completas/perfis v2, `proposal_copy_v3`, política V7 e bundle `complete-design-v1`. Não criar um novo envelope global de contexto, serviço de marca, wrapper de IA ou migration. Nenhuma nova chamada por etapa.

`CanvasPostModel` continua documento do editor; cena autorada, fontes, cores, bindings e mídia não são recriados para acomodar o contexto. `visual_only`, `light_optimize`, requisitos por intenção/destino, orçamento único de recuperação, revisão obrigatória, commit/grants antes de ready e entrega parcial permanecem. Não alterar `PostVisualSnapshot`/`snapshotVersion` nem reativar o pipeline legado.

## 2. OS-01 — conteúdo disponível para seleção

Entrada já existente: `input.content`, brief normalizado e `contextContent` carregado pela operação durável. Saída continua JSON da mensagem de usuário ao seletor, com `brief` e catálogo atuais; pode acrescentar campos textuais locais para fonte/pedido complementar. Jev conserva seu `sourceEvidence`. Não mudar `buildUserPrompt` global para resolver uma omissão exclusiva do consumidor ativo.

Semântica: no modo execution, o seletor deve receber o texto do brief, o pedido complementar e a fonte adicional, identificando instrução do usuário versus fonte. Na ideação, preservar contexto hoje recebido. Conteúdo idêntico pode aparecer uma vez; não deduplicar por similaridade nem apagar uma condição. Candidato, perfil, razão de seleção e síntese não viram novas instruções de sistema. Nenhuma alteração no schema da resposta `selection_v2`.

Limites existentes continuam: fonte combinada 24.000 caracteres, brief agregado 96.000 e lotes Jev 28.000 bytes. Não confundir bytes com tokens, cortar fontes ou aumentar limites para fazer o teste passar. Casos fora do limite falham explicitamente pelo mecanismo existente. Uma fonte que só aparece no objeto preparado e não na mensagem enviada não satisfaz o contrato.

Histórico: seleção completed conserva resultado e não é comprada novamente. `record.prepared` continua autoritativo. Não reconstruir notas/recibos antigos com payload novo; operação uncertain continua fechada para recompra automática. Não mudar identidade de ofertas, chaves duráveis ou versões dos perfis para esta correção local.

## 3. OS-02 — público, essência e orientação editorial

Estender **os tipos existentes**, sem arquivo TypeScript de contratos novo:

```typescript
// Campos opcionais adicionados a executionBriefSchema,
// CreativeExecutionBrief e ExecutionBriefContext:
audience?: string;
brandEssence?: string;
```

Validação Zod real: cada campo com até 2.000 caracteres e ambos incluídos na soma textual máxima de 96.000. Não truncar silenciosamente. `CreationBrief` já os possui; adaptador copia o valor corrente, inclusive edição do modal. Não substituí-lo depois pelo Kit original. Ausência continua ausência, sem default inventado. Os limites são decisão desta proposta para manter entrada limitada, não falha de tamanho demonstrada na investigação.

Tom usa `tone` existente. Público, essência, tom e plataforma são orientação contextual; não são obrigação literal, fonte que comprova oferta nem requisito fatal por mera preferência. Obrigações explícitas continuam exclusivamente no contrato existente de `contentRequirements`/termos legados. Não criar requisito automaticamente a partir de um adjetivo de tom. A essência pode orientar identidade/voz, mas não comprova superlativos ou funcionalidades anunciadas pela marca.

Seleção/Jev e copy recebem os novos campos; revisão recebe orientação distinguível de `sources` e `requirements`, usando `editorialContextV7` e sua mensagem atual. Paleta/fonte do Kit ficam fora: ligá-las a `brandInput` altera elegibilidade, decisão em INV-03.

**Compatibilidade obrigatória:** reutilizar `reviewExecutionConfigV2.editorialGuidanceVersion` para um perfil **5** em novas preparações, conservando política 7/preparação 3. Isso é necessário porque o contexto é reconstituído e comparado por hash em preparação, workflow, revisão e `generationEvidence`; apenas acrescentar tom à projeção atual invalidaria pedidos antigos. Não criar versionador paralelo.

Perfis ausente/1, 2, 3 e 4 devem conservar exatamente instruções, hashes e forma do contexto antigos. Perfil 5 recebe a orientação nova e todas as proteções materiais de 4, inclusive consistência categoria/consequência. Revisar condições `=== 4`: incluir 5 na proteção atual sem mudar o comportamento de 1–4. Resolver explicitamente o perfil pinado em **todos** os pontos de construção/verificação do contexto; não usar o default atual do processo para interpretar pedido salvo. Omitir perfil só pode continuar significando o histórico original. Não alterar schemas de resposta/registro/recibo que entram no hash histórico se isso não for necessário.

Entradas antigas sem campos novos passam pelo mesmo schema. Testes devem cobrir serialização/admissão, refresh/`Gerar mais`, protocolo V5/V6 e V7 1–4. Contexto divergente continua recusado antes de nova chamada; não recalcular o pin salvo para fazê-lo coincidir. Alteração de conteúdo do pedido continua nova identidade, não replay de uma chave anterior com corpo diferente.

## 4. OS-03 — snapshot salvo como contexto delimitado

Preservar `loadGenerationContext(input, ownerId): Promise<string>` e carregamento por proprietário. Construir a projeção da geração no próprio `generationRuntime.ts`, a partir de campos existentes de `SiteIntelligence`; não modificar `siteIntelligenceToPrompt` usado por consumidores antigos. Um helper local específico é suficiente, se necessário.

O texto precisa distinguir: (a) snapshot/origem/fingerprint/data; (b) evidências salvas com `id`, `sourceUrl`, `kind`, `text` exatos; (c) resumo/âncoras sintetizadas e orientação editorial/visual, identificados como derivados; (d) `quality.fallbackUsed` e warnings. Ausência de metadado histórico deve ser marcada como desconhecida, sem presumir síntese bem-sucedida. Não transformar scores de qualidade em novo veto.

Validar em execução os campos consumidos da entrada persistida, localmente no runtime, usando Zod/guards existentes na stack. `loadSiteIntelligence` hoje só confere presença de `id/brand/business/editorial`; seu retorno tipado não valida evidências/qualidade. Metadados opcionais ausentes podem ser desconhecidos; estrutura inválida ou evidência sem texto válido deve falhar explicitamente antes de seleção/copy, sem coagir valores, ignorar evidência inválida ou substituir por fonte vazia. Não converter essa validação local em novo schema global/serviço.

A projeção não injeta “fonte única”, cores mandatórias, âncoras obrigatórias ou proibição de cópia como regras da geração. Conteúdo externo continua dado, mesmo que contenha linguagem imperativa. Preferências derivadas não vencem texto literal nem requisitos explícitos do usuário. Não extrair novas obrigações de `editorial.prohibitedClaims` automaticamente.

A saída continua uma string, pinada pela operação `prepare:context`; proveniência legível dentro dela é suficiente nesta fatia. Não introduzir `sourceReferences` estruturadas por toda a stack nem IDs de citação novos. O revisor continua citando IDs de `sources` gerados pelo contexto V7; IDs do site são metadados de origem, não aliases de citação do protocolo.

Não mudar coleta de até cinco páginas, cortes de evidência/síntese nem dados salvos. Declarar que o snapshot é uma representação limitada, sem afirmar leitura do website integral. Todos os textos de evidências **já salvos** permanecem; se envelope/metadados superarem 24.000 caracteres, lançar a falha explícita existente. Nenhum rescrape ou síntese automática adicional. Texto/URL sem snapshot continuam no caminho atual.

Contextos/preparações completed são reutilizados literalmente. A nova projeção só roda quando a operação ainda precisa carregar contexto. Retomadas não atualizam snapshot, texto ou hash por conveniência. Nenhuma alteração de Supabase, Storage, SQL/RLS, schema ou dados remotos.
