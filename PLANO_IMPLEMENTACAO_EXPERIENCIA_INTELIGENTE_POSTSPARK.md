# Plano de Implementação — Experiência Inteligente e Confiável do PostSpark

> **Status:** em execução — Etapa 0 e Etapa 1 concluídas localmente (código, contratos, migração idempotente `0017` e testes); aplicação de migrations no banco remoto aguarda autorização do dono  
> **Criado em:** 2026-09-22  
> **Escopo:** geração de conteúdo, fallbacks, briefing, histórico, persistência, CanvasLab, carrosséis, mídia, exportação e assistência editorial  
> **Fluxo oficial:** `/thevoid` / `/studio` → `StudioAppV2BPage` → galeria → CanvasLab  
> **Documento autoritativo do produto:** [`DOCUMENTO_MESTRE.md`](./DOCUMENTO_MESTRE.md)  
> **Instruções obrigatórias para agentes:** [`AGENTS.md`](./AGENTS.md)

---

## 1. Objetivo

Este plano transforma os achados das investigações de geração e usabilidade em uma sequência executável de mudanças. O resultado esperado é que o PostSpark deixe de funcionar como um editor que entrega uma geração e transfere todo o acabamento ao usuário, passando a atuar como um ambiente assistido que:

1. entende e confirma o briefing antes de gerar;
2. não copia o prompt sem intenção explícita;
3. não apresenta fallback local como geração de IA;
4. preserva prompt, contexto, proveniência e histórico;
5. mantém isolamento real entre slides;
6. salva, reabre e exporta exatamente o que foi editado;
7. oferece edição equivalente para todos os elementos;
8. ajuda o usuário a corrigir conteúdo e composição sem refazer o trabalho;
9. deixa evidência suficiente para diagnosticar qualquer falha futura.

Este documento deve ser usado como backlog técnico, roteiro de PRs e checklist de aceite. Não implementar todas as etapas em uma única alteração.

---

## 2. Evidências que originaram o plano

### 2.1 Geração investigada

Foi identificada uma execução real em 2026-09-21:

- `generationRunId`: `3323bf59-ae50-4704-9504-afc2ea97fe5d`;
- o briefing começava pedindo um **carrossel de cinco slides**;
- a requisição foi enviada como `postMode: "static"`;
- a chamada principal ao modelo respondeu com sucesso;
- a chamada de reparo respondeu com sucesso;
- o conjunto foi rejeitado pela validação final;
- o frontend capturou o HTTP 502 e exibiu fallback local genérico;
- a mensagem ao usuário atribuiu o problema incorretamente a instabilidade da IA.

Evidência local: [`OPERATIONAL_ERRORS.txt`](./OPERATIONAL_ERRORS.txt), a partir do evento `POST_GENERATION_STARTED` correspondente.

### 2.2 Observabilidade incompleta

O banco conectado não possui a coluna `postspark.generation_runs.events`, embora o runtime tente gravá-la. A persistência do trace falhou por inteiro e o registro da execução não foi encontrado posteriormente. A migração existe em:

- [`drizzle/0012_add_generation_events.sql`](./drizzle/0012_add_generation_events.sql).

Isso impede recuperar retroativamente as regras específicas que reprovaram cada candidato.

### 2.3 Problemas funcionais confirmados

- qualquer erro da geração ativa o mesmo fallback local;
- “Gerar mais” pode usar fallback e ainda exibir mensagem de sucesso da IA;
- o seletor começa em `static` e não reconcilia o formato com o texto do briefing;
- o Studio descarta `generationRunId`;
- o prompt fica apenas em estado React durante a criação;
- o post salvo contém `inputContent`, mas a experiência não oferece recuperação clara;
- o histórico grava chaves consumidas apenas pelo fluxo legado;
- a adaptação IA → CanvasLab perde ou achata campos;
- o salvamento projeta campos legados a partir do slide ativo, não da capa;
- fundo, transformação, textos extras e imagens extras podem vazar entre slides;
- o fundo sempre começa com crop `cover`, sem modo de imagem inteira;
- mobile não possui paridade de enquadramento;
- texto extra não possui paridade de controles nem persistência completa de transformação;
- a exportação ZIP pode repetir o slide ativo;
- não há autosave, undo/redo ou reordenação no CanvasLab oficial;
- não existem testes suficientes para as jornadas acima;
- há divergências entre o runtime e o `DOCUMENTO_MESTRE.md`.

---

## 3. Regras de execução para qualquer agente

Antes de iniciar uma etapa:

1. ler integralmente [`AGENTS.md`](./AGENTS.md);
2. ler as seções relevantes de [`DOCUMENTO_MESTRE.md`](./DOCUMENTO_MESTRE.md);
3. verificar `git status --short` e preservar todas as alterações preexistentes;
4. confirmar os produtores e consumidores de cada contrato alterado;
5. tratar `CanvasPostModel` como fonte autoritativa do editor oficial;
6. não reativar ou usar `Home.tsx`, HoloDeck ou WorkbenchV2 como implementação do fluxo oficial;
7. não editar manualmente `api/index.js`, `dist/` ou `dist-server/`;
8. atualizar `DOCUMENTO_MESTRE.md` quando houver mudança funcional, estrutural, contratual, de persistência ou de integração;
9. executar os testes proporcionais à etapa antes de marcá-la como concluída;
10. registrar no checkpoint qualquer hipótese que não tenha sido confirmada no runtime.

### 3.1 Comandos mínimos de verificação

```bash
npm run check
npm run test
npm run verify:runtime
```

Quando a etapa afetar geração real, billing, persistência ou integração:

```bash
npm run verify:e2e
```

O `verify:e2e` pode consumir recursos externos e Sparks. Confirmar ambiente e credenciais antes de executá-lo.

### 3.2 Política de commits e PRs

- uma etapa não deve misturar refatoração ampla sem relação com seu objetivo;
- mudanças de schema devem ficar separadas da mudança visual que depende delas;
- cada PR deve possuir rollback claro;
- feature flags devem ser usadas nos fluxos de maior risco;
- só avançar para a etapa seguinte após cumprir o checkpoint da etapa atual.

---

## 4. Ordem obrigatória e dependências

```text
Etapa 0 — Baseline e proteção do worktree
    ↓
Etapa 1 — Schema, traces e taxonomia de falhas
    ↓
Etapa 2 — Integridade de CanvasPostModel, slides, save e exportação
    ↓
Etapa 3 — Formato, fallback e gates de geração
    ↓
Etapa 4 — Briefing persistente e inteligência de marca
    ↓
Etapa 5 — Contrato fiel entre geração e CanvasLab
    ↓
Etapa 6 — Fundo, crop e mídia
    ↓
Etapa 7 — Paridade de elementos livres
    ↓
Etapa 8 — Autosave, histórico de edição e assistência contextual
    ↓
Etapa 9 — Hardening, rollout e consolidação documental
```

As etapas 1 a 3 constituem o primeiro release urgente. As etapas 4 a 7 formam o segundo release. A etapa 8 deve começar somente quando a integridade do documento estiver coberta por testes.

---

## 5. Etapa 0 — Baseline e proteção do worktree

### Objetivo

Criar um ponto de partida verificável sem destruir ou incorporar acidentalmente alterações já existentes.

### Entregáveis

- [ ] inventário das alterações preexistentes;
- [ ] checkpoint recuperável definido pelo responsável do repositório;
- [ ] resultado inicial de TypeScript, testes e verificação de runtime;
- [ ] lista de falhas já existentes, separada das regressões introduzidas pelo plano;
- [ ] confirmação de qual ambiente Supabase é seguro para migrações e E2E.

### Ações

1. Executar `git status --short`.
2. Agrupar mentalmente ou documentar mudanças por domínio: IA, CanvasLab, legado, migrações e artefatos gerados.
3. Não apagar, resetar ou sobrescrever arquivos do usuário.
4. Executar a bateria mínima de verificação.
5. Registrar resultados em descrição de PR, issue ou relatório de implementação.

### Checkpoint 0

- Nenhum teste falhava antes da implementação (708/708 passam no baseline).
- 107 arquivos já possuem mudanças não commitadas (IA, CanvasLab legado, editor geometry, shared, migrations).
- Banco remoto conectado (`spbu…hfir`) não recebeu migrations sem autorização; ambiente local é o único seguro.
- Recuperação: `git stash`/reversão manual por arquivo; sem reset destrutivo.

---

## 6. Etapa 1 — Schema, traces e taxonomia de falhas

### Objetivo

Garantir que toda tentativa de geração seja rastreável e que frontend, backend e histórico distingam as causas reais das falhas.

### Arquivos e módulos principais

- `drizzle/0006_add_generation_runs.sql`
- `drizzle/0008_add_generation_quality_metrics.sql`
- `drizzle/0009_normalize_generation_runs_created_at.sql`
- `drizzle/0010_high_ticket_pipeline_foundation.sql`
- `drizzle/0012_add_generation_events.sql`
- `drizzle/schema.ts`
- `server/runtimeManifest.ts`
- `server/verifyRuntime.ts`
- `server/ai/generationTrace.ts`
- `server/_core/operationalLog.ts`
- `server/db.ts`
- `server/routers.ts`
- `shared/postspark.ts`
- `shared/postsparkSchemas.ts`
- `client/src/pages/StudioApp/StudioAppV2BPage.tsx`
- `client/src/pages/History.tsx`

### 6.1 Reconciliar o schema real

- [ ] inspecionar o schema do ambiente alvo sem depender apenas de `drizzle/schema.ts`;
- [ ] aplicar ou consolidar migrações de `created_at`, `events`, `events_version` e métricas;
- [ ] garantir idempotência das migrações;
- [ ] verificar índices e políticas RLS;
- [ ] adicionar todas as colunas críticas ao runtime manifest;
- [ ] fazer `verify:runtime` falhar de forma explícita quando o schema estiver incompleto.

### 6.2 Persistência degradável do trace

Hoje `finishGenerationTrace` tenta um único upsert completo. Alterar para:

1. persistir o registro completo;
2. se ocorrer incompatibilidade de schema, registrar o erro operacional;
3. tentar persistir um registro mínimo compatível, quando seguro;
4. nunca ocultar a falha com apenas `console.warn`;
5. preservar `generationRunId` mesmo quando a geração falhar.

O registro mínimo deve conter, quando disponível:

- ID;
- usuário;
- status;
- tipo de entrada;
- formato;
- modo de criação;
- modelo solicitado;
- modelos efetivos;
- latência;
- erro normalizado;
- timestamp.

### 6.3 Taxonomia compartilhada

Criar em `shared/` um contrato semelhante a:

```ts
export type GenerationFailureReason =
  | "insufficient_sparks"
  | "authentication"
  | "provider_unavailable"
  | "provider_timeout"
  | "invalid_provider_response"
  | "format_mismatch"
  | "quality_rejected"
  | "variations_not_distinct"
  | "persistence_failed"
  | "billing_commit_failed"
  | "unknown";
```

Incluir na resposta ou erro estruturado:

```ts
interface GenerationFailureMetadata {
  generationRunId: string;
  reason: GenerationFailureReason;
  retryable: boolean;
  refunded?: boolean;
  userMessage: string;
  validationIssues?: Array<{ code: string; slot?: number; detail: string }>;
}
```

Não expor stack traces, chaves ou payloads sensíveis ao cliente.

### 6.4 Proveniência da variação

Introduzir metadados que sobrevivam até o save:

```ts
interface GenerationProvenance {
  source: "ai" | "local_fallback";
  generationRunId?: string;
  fallbackReason?: GenerationFailureReason;
  generatedAt: string;
}
```

- [ ] guardar o `generationRunId` retornado pelo backend;
- [ ] associá-lo ao post salvo;
- [ ] exibir origem no histórico e, quando relevante, na galeria;
- [ ] impedir que conteúdo local seja descrito como criado por IA.

### Testes obrigatórios

- [ ] unitário: mapeamento de exceções para `GenerationFailureReason`;
- [ ] unitário: trace completo e trace mínimo;
- [ ] integração: schema sem `events` produz diagnóstico explícito;
- [ ] integração: falha de qualidade preserva `generationRunId`;
- [ ] integração: refund é registrado;
- [ ] contrato: frontend recebe metadados sem depender da mensagem textual.

### Critérios de aceite

- toda tentativa iniciada possui um ID correlacionável;
- uma reprovação de qualidade não aparece como falha de rede;
- o histórico mostra a causa real;
- schema incompleto é detectado antes de uma geração real;
- falha de persistência do trace produz alerta operacional;
- não há conteúdo sensível novo em logs por padrão.

### Checkpoint 1

Executar uma geração aprovada e uma rejeitada. Ambas devem aparecer em `generation_runs`, com eventos, status, modelos e motivo coerentes. Não avançar se uma delas desaparecer.

---

## 7. Etapa 2 — Integridade de slides, save, restore e exportação

### Objetivo

Fazer o `CanvasPostModel` representar sem ambiguidade o que pertence ao documento, ao slide e ao elemento.

### Arquivos e módulos principais

- `client/src/pages/CanvasLab/components/types.ts`
- `client/src/pages/CanvasLab/CanvasLabPage.tsx`
- `client/src/pages/CanvasLab/components/CanvasPostStage.tsx`
- `client/src/pages/CanvasLab/components/CanvasSidebar.tsx`
- `client/src/pages/CanvasLab/components/CanvasMobileDrawer.tsx`
- `client/src/pages/CanvasLab/components/CarouselFilmstrip.tsx`
- `client/src/pages/CanvasLab/lib/saveAdapter.ts`
- `client/src/pages/StudioApp/lib/studioGeneration.ts`
- `client/src/pages/StudioApp/StudioAppV2BPage.tsx`
- `client/src/pages/SavedPosts.tsx`
- `client/src/pages/History.tsx`

### 7.1 Formalizar escopo global e local

Documentar no tipo e no `DOCUMENTO_MESTRE.md`:

- quais propriedades são defaults globais;
- quais propriedades pertencem exclusivamente ao slide;
- como um slide herda um default;
- como representar “sem override” versus “valor vazio/removido”;
- como aplicar uma alteração a todos os slides.

Regra obrigatória: uma ação “slide atual” nunca escreve simultaneamente no root global.

### 7.2 Centralizar comandos do documento

Criar uma camada pura e testável, por exemplo:

```ts
updateSlideById(post, slideId, patch)
applyPatchToCurrentSlide(post, patch)
applyPatchToAllSlides(post, patch)
duplicateSlide(post, slideId)
removeSlide(post, slideId)
reorderSlides(post, sourceIndex, targetIndex)
```

`CanvasSidebar`, `CanvasMobileDrawer` e nós Konva devem emitir comandos; não devem reimplementar regras de escopo.

### 7.3 Corrigir vazamento entre slides — CONCLUÍDO

- [x] `bgImage` (isolado por slide via `setCurrentSlideBackground`/`applyPatchToCurrentSlide`);
- [x] `bgTransform` (`handleUpdateBgTransform` grava apenas no slide atual);
- [x] remoção de fundo (comando `applyPatchToCurrentSlide` com `bgImage: undefined`);
- [x] `extraTexts` (isolados por slide);
- [x] `extraImages` (isolados por slide);
- [x] IDs de elementos ao duplicar (`duplicateSlide` regenera IDs aninhados);
- [x] seleção ativa após duplicação e exclusão (`setSelectedElementId(null)`).

### 7.4 Corrigir projeções no save

`canvasModelToSavePayload` deve usar regra determinística:

- capa explicitamente definida, ou primeiro slide;
- nunca o slide aberto no instante do save;
- `canvas_model` continua autoritativo;
- campos legados são apenas projeções para listagem e compatibilidade.

### 7.5 Corrigir restore do histórico

Eliminar a dependência do Studio oficial nas chaves legadas consumidas por `Home.tsx`. Criar um contrato único, preferencialmente:

```text
History/SavedPosts → savedPostToCanvasModel → postspark.open_canvas_post → /thevoid
```

Se a origem for uma geração ainda não salva, criar um payload versionado específico, lido por `StudioAppV2BPage`.

### 7.6 Corrigir ZIP 4K

Não iterar sobre slides capturando repetidamente o stage visível. Implementar renderização offscreen determinística que receba o slide explicitamente e aguarde:

- carregamento de fontes;
- carregamento de imagens;
- composição final;
- geração do PNG;
- liberação de recursos.

### Testes obrigatórios

- [ ] slide atual versus todos para cada tipo de conteúdo;
- [ ] remover fundo somente do slide atual;
- [ ] arrays vazios não reativam valores globais indevidamente;
- [ ] duplicar slide gera IDs internos novos;
- [ ] salvar com slide 4 ativo projeta a capa;
- [ ] save → reopen preserva todos os slides;
- [ ] histórico abre no Studio ativo;
- [ ] ZIP de cinco slides contém cinco hashes visuais diferentes.

### Critérios de aceite

- não existe cross-talk entre slides;
- reabrir reproduz o documento salvo;
- biblioteca representa a capa correta;
- ZIP respeita quantidade, ordem e conteúdo dos slides;
- fluxo oficial não depende de componentes legados.

### Checkpoint 2

Criar manualmente um carrossel de cinco slides com fundos, textos e imagens diferentes. Salvar, reabrir e exportar. Comparar visualmente e por testes. Não avançar enquanto houver divergência.

---

## 8. Etapa 3 — Formato, fallback e gates de geração

### Objetivo

Impedir contradições entre briefing e formato, tornar fallback explícito e bloquear reprodução indevida do input.

### Arquivos e módulos principais

- `client/src/pages/StudioApp/components/v2/StudioCreateViewV2B.tsx`
- `client/src/pages/StudioApp/components/v2/shared.tsx`
- `client/src/pages/StudioApp/StudioAppV2BPage.tsx`
- `client/src/pages/StudioApp/lib/studioGeneration.ts`
- `server/routers.ts`
- `server/ai/generationOrchestrator.ts`
- `server/ai/generationValidation.ts`
- `server/ai/postEvaluation.ts`
- `server/ai/semanticOriginality.ts`
- `shared/postspark.ts`

### 8.1 Detector de intenção de formato

Implementar detector determinístico para termos como:

- carrossel;
- slides;
- slide 1/5;
- sequência;
- post único;
- imagem única;
- peça estática.

O detector deve produzir `detectedFormat`, `confidence` e `evidence`.

### 8.2 Confirmação de incompatibilidade

Quando seletor e briefing divergirem:

- não gerar imediatamente;
- mostrar a evidência encontrada;
- oferecer “Alterar para Carrossel” ou “Manter Post Único”;
- persistir a decisão confirmada.

O backend deve repetir uma validação básica antes de reservar Sparks. Contradições claras devem retornar `format_mismatch` sem chamada generativa.

### 8.3 Fallback explícito

Alterar o comportamento padrão:

1. mostrar o motivo real da falha;
2. oferecer “Tentar novamente”;
3. oferecer “Revisar briefing”;
4. opcionalmente oferecer “Usar sugestões locais”;
5. gerar fallback apenas após escolha explícita;
6. marcar todas as sugestões locais com proveniência permanente.

Remover qualquer toast de sucesso da IA após fallback.

### 8.4 Gate de similaridade com o input

Comparar prompt original com:

- headline;
- body;
- caption;
- títulos e corpos dos slides;
- CTA.

Combinar:

- igualdade normalizada;
- sobreposição de n-gramas;
- similaridade semântica quando disponível;
- regras para trechos obrigatórios.

Permitir reprodução literal apenas quando o briefing marcar explicitamente:

- slogan;
- citação;
- nome de produto;
- texto legal;
- expressão obrigatória.

O gate deve rodar após geração, após reparo e antes da aprovação final.

### 8.5 Feedback de validação útil

Transformar erros internos em códigos, por exemplo:

- `missing_required_copy`;
- `missing_copy_angle`;
- `invalid_static_sections`;
- `incoherent_item_count`;
- `invalid_carousel_slide_count`;
- `insufficient_textual_diversity`;
- `insufficient_visual_diversity`;
- `source_copy_too_similar`;
- `required_fact_missing`.

### Testes obrigatórios

- [ ] prompt “carrossel de cinco slides” com seletor estático;
- [ ] confirmação para manter formato divergente;
- [ ] incompatibilidade bloqueada antes da reserva;
- [ ] fallback nunca aparece automaticamente como IA;
- [ ] headline igual ao input é rejeitado;
- [ ] slogan obrigatório é preservado;
- [ ] falha de qualidade apresenta regra e slot;
- [ ] retry mantém briefing e formato.

### Critérios de aceite

- a execução investigada não pode voltar a ocorrer silenciosamente;
- o usuário sabe se recebeu IA ou sugestão local;
- nenhuma mensagem de rede é usada para reprovação editorial;
- cópia literal não autorizada é bloqueada;
- Sparks não são reservados para incompatibilidade detectável localmente.

### Checkpoint 3

Reproduzir o briefing de carrossel com o seletor estático. A aplicação deve interromper, explicar a divergência e permitir corrigir antes de gerar.

---

## 9. Etapa 4 — Briefing persistente e inteligência de marca

### Objetivo

Trocar a experiência de campo único por um fluxo que interprete, confirme, preserve e reutilize o contexto do usuário.

### Módulos principais

- `shared/postspark.ts`
- `shared/postsparkSchemas.ts`
- `client/src/pages/StudioApp/`
- `server/routers.ts`
- `server/ai/contentStrategy.ts`
- `server/ai/generationOrchestrator.ts`
- `server/db.ts`
- `drizzle/`
- telas de histórico e posts salvos.

### 9.1 Contrato de briefing

Criar contrato compartilhado versionado:

```ts
interface CreationBrief {
  version: number;
  rawInput: string;
  format: "static" | "carousel";
  slideCount?: number;
  objective?: string;
  audience?: string;
  brandEssence?: string;
  positioning?: string;
  tone?: string;
  keyMessage?: string;
  proofPoints?: string[];
  requiredTerms?: string[];
  forbiddenTerms?: string[];
  callToAction?: string;
  sourceUrls?: string[];
}
```

### 9.2 Separar entrada e interpretação

Novo fluxo:

```text
Prompt bruto
  → interpretação estruturada
  → tela curta de confirmação
  → edição opcional
  → geração
```

Não exigir formulário extenso para todo usuário. Usar progressive disclosure: mostrar primeiro os campos que a interpretação extraiu ou deixou incertos.

### 9.3 Persistência de rascunho

Persistir antes da geração:

- input original;
- interpretação;
- formato confirmado;
- gosto/família visual;
- estado da etapa;
- timestamps e versão.

Definir explicitamente se o rascunho ficará em tabela própria ou como entidade versionada. Não usar apenas `sessionStorage` como fonte durável.

### 9.4 Recuperação do briefing

Adicionar ações:

- Ver briefing;
- Copiar briefing;
- Editar e gerar novamente;
- Criar nova versão;
- Recuperar rascunho após refresh.

`AI_TRACE_STORE_CONTENT=false` pode continuar como padrão de privacidade. O briefing pertencente ao usuário deve ser persistido como dado de produto, com regras próprias, e não depender do trace técnico.

### 9.5 Contexto de marca no fluxo oficial

- [ ] expor `creationMode` no Studio ativo;
- [ ] enviar `executionBrief` quando aplicável;
- [ ] carregar Brand Kit e persona;
- [ ] detectar URLs presentes no briefing, não apenas quando o texto inteiro começa com URL;
- [ ] permitir confirmar ou remover fontes encontradas;
- [ ] mostrar a síntese da marca antes de usá-la.

### Testes obrigatórios

- [ ] refresh durante criação recupera o rascunho;
- [ ] prompt original continua disponível após salvar;
- [ ] interpretação pode ser corrigida;
- [ ] regeneração usa briefing confirmado;
- [ ] URL embutida é identificada;
- [ ] usuário não acessa briefing de outro usuário;
- [ ] política de exclusão/GDPR inclui rascunhos.

### Critérios de aceite

- o usuário não perde mais o prompt;
- a marca não é sintetizada silenciosamente sem possibilidade de correção;
- o contexto confirmado chega ao backend;
- post, briefing e geração são correlacionáveis;
- refresh e navegação não destroem o trabalho.

### Checkpoint 4

Criar um briefing de marca, corrigir a interpretação, gerar, salvar, fechar a aplicação e reabrir. O briefing bruto e estruturado devem permanecer acessíveis e reutilizáveis.

---

## 10. Etapa 5 — Fidelidade entre geração e CanvasLab

### Objetivo

Garantir que tudo que o backend aprovou chegue ao editor sem descarte ou precedência acidental.

### Arquivos principais

- `shared/postspark.ts`
- `shared/postsparkSchemas.ts`
- `client/src/pages/StudioApp/lib/studioGeneration.ts`
- `client/src/pages/CanvasLab/components/types.ts`
- `client/src/pages/CanvasLab/lib/saveAdapter.ts`
- fixtures e testes de contrato.

### Ações

- [x] eliminar `any` de `variationToCanvasModel` (`GeneratedVariationInput`);
- [x] criar entrada e saída tipadas;
- [x] preservar headline, body, caption, CTA, hashtags, seções, slides e copy angle;
- [ ] preservar estratégia, prompt de imagem, identidade visual e metadados;
- [x] carregar `generationRunId` e proveniência no modelo salvo;
- [x] não descartar `sections` apenas porque `body` existe;
- [ ] definir representação visual específica para seções estruturadas;
- [x] versionar `CanvasPostModel` se o contrato mudar (`modelVersion = 2`);
- [x] criar migração de modelos salvos antigos (defaults seguros em `normalizeCanvasModel`);
- [x] manter compatibilidade de leitura.

### Testes obrigatórios

- [x] fixture rica atravessa `PostVariation → CanvasPostModel` sem perda (`studioGeneration.test.ts`);
- [x] CTA e hashtags sobrevivem ao save/reopen (`saveAdapter.test.ts`);
- [x] seções sobrevivem quando `body` também existe (`studioGeneration.test.ts`);
- [x] proveniência sobrevive ao save (`saveAdapter.test.ts`);
- [x] modelos antigos recebem defaults seguros (`saveAdapter.test.ts` — legado sem `modelVersion`);
- [ ] serialização é determinística (cobrir com fixture congelada em iteração futura).

### Critérios de aceite

- nenhum campo aprovado é descartado silenciosamente;
- o CanvasLab representa ou preserva conteúdo ainda não exibido;
- save/reopen mantém o mesmo contrato;
- erros de adaptação são detectados por teste de fixture.

### Checkpoint 5

Comparar programaticamente uma fixture de geração completa antes e depois de passar pelo CanvasLab e pela persistência. Toda perda precisa ser intencional e documentada.

---

## 11. Etapa 6 — Fundo, crop e mídia

### Objetivo

Dar ao usuário controle real sobre a imagem original e manter o mesmo comportamento em desktop, mobile, save e exportação.

### Arquivos principais

- `client/src/pages/CanvasLab/components/types.ts`
- `client/src/pages/CanvasLab/components/CanvasPostStage.tsx`
- `client/src/pages/CanvasLab/components/CanvasSidebar.tsx`
- `client/src/pages/CanvasLab/components/CanvasMobileDrawer.tsx`
- `client/src/pages/CanvasLab/CanvasLabPage.tsx`
- `client/src/pages/CanvasLab/lib/saveAdapter.ts`
- utilitários de imagem/crop do CanvasLab.

### 11.1 Modelo de enquadramento

Adicionar contrato equivalente a:

```ts
interface BackgroundPlacement {
  fitMode: "cover" | "contain" | "original" | "custom";
  focalPoint?: { x: number; y: number };
  crop?: { x: number; y: number; width: number; height: number };
  transform?: BgImageTransform;
}
```

### 11.2 Preservar o asset original

- [ ] manter referência à imagem-fonte;
- [ ] nunca tornar o crop inicial irreversível;
- [ ] permitir restaurar enquadramento;
- [ ] diferenciar crop da imagem de transformação do elemento;
- [ ] não incorporar base64 pesado ao `canvas_model` quando houver asset persistido.

### 11.3 Controles

Oferecer:

- Preencher (`cover`);
- Mostrar inteira (`contain`);
- Tamanho original;
- Ajuste personalizado;
- Zoom;
- Arrasto;
- Ponto focal;
- Restaurar.

### 11.4 Mobile

- [ ] adicionar `onDblTap` ou, preferencialmente, botão explícito;
- [ ] expor os mesmos modos do desktop;
- [ ] implementar gestos somente se houver testes de estabilidade;
- [ ] garantir que o drawer móvel use os mesmos comandos do documento.

### Testes obrigatórios

- [ ] cover, contain, original e custom;
- [ ] restaurar imagem original;
- [ ] persistência do crop;
- [ ] isolamento por slide;
- [ ] paridade desktop/mobile;
- [ ] exportação idêntica ao preview;
- [ ] imagem com CORS e imagem local.

### Critérios de aceite

- nenhuma parte da imagem se torna irrecuperável por causa do primeiro render;
- o usuário consegue mostrar a imagem inteira;
- enquadramento sobrevive ao save/reopen;
- mobile possui caminho descobrível para ajuste;
- aplicar ao slide atual não altera os demais.

### Checkpoint 6

Usar uma imagem panorâmica com elementos importantes nas bordas. Demonstrar cover, contain, crop manual, restauração, save/reopen e exportação em desktop e mobile.

---

## 12. Etapa 7 — Paridade de textos e imagens livres

### Objetivo

Fazer com que elementos adicionais tenham capacidades de edição e persistência compatíveis com os elementos principais.

### Arquivos principais

- `client/src/pages/CanvasLab/components/types.ts`
- `client/src/pages/CanvasLab/components/CanvasPostStage.tsx`
- `client/src/pages/CanvasLab/components/CanvasSidebar.tsx`
- `client/src/pages/CanvasLab/components/CanvasMobileDrawer.tsx`
- `client/src/pages/CanvasLab/CanvasLabPage.tsx`
- `client/src/pages/CanvasLab/lib/saveAdapter.ts`

### 12.1 Texto adicional

Expor e persistir:

- [ ] conteúdo;
- [ ] família;
- [ ] peso;
- [ ] itálico;
- [ ] tamanho;
- [ ] cor;
- [ ] alinhamento;
- [ ] efeito;
- [ ] cor do efeito;
- [ ] posição;
- [ ] escala/dimensões;
- [ ] rotação;
- [ ] opacidade;
- [ ] ordem de camada.

Implementar `onTransformEnd` e normalizar a escala no modelo para evitar acumulação visual não persistida.

### 12.2 Imagem adicional

Expor e persistir:

- [ ] posição;
- [ ] tamanho;
- [ ] rotação;
- [ ] crop;
- [ ] opacidade;
- [ ] ordem de camada;
- [ ] duplicação;
- [ ] exclusão;
- [ ] isolamento por slide.

### 12.3 Duplicação segura

Ao duplicar um slide ou elemento:

- gerar novos IDs;
- clonar estruturas aninhadas;
- não compartilhar referências mutáveis;
- limpar seleção transitória;
- preservar o resultado visual.

### Testes obrigatórios

- [ ] `onTransformEnd` persiste tamanho e rotação;
- [ ] deselecionar não reverte a transformação;
- [ ] save/reopen mantém propriedades;
- [ ] duplicação gera IDs únicos;
- [ ] elemento local não aparece em outro slide;
- [ ] controles desktop/mobile produzem o mesmo modelo.

### Critérios de aceite

- tudo que pode ser feito visualmente é persistido;
- não há recurso suportado apenas pelo tipo e inacessível pela interface sem justificativa;
- textos adicionais deixam de ser elementos de segunda classe;
- duplicação não produz colisões de seleção.

### Checkpoint 7

Criar um texto e uma imagem livres, transformar ambos, duplicar o slide, modificar somente a cópia, salvar e reabrir. O original e a cópia devem permanecer independentes.

---

## 13. Etapa 8 — Editor assistido e produtividade

### Objetivo

Reduzir o trabalho manual e a sensação de “se vira” depois da geração.

### Dependência

Não iniciar antes de os checkpoints 2 e 5 estarem concluídos. Autosave e undo sobre um modelo ambíguo apenas tornam bugs mais difíceis de recuperar.

### 13.1 Autosave

- [ ] debounce de alterações;
- [ ] estado `dirty/saving/saved/error`;
- [ ] controle de concorrência por versão ou `updatedAt`;
- [ ] retry seguro;
- [ ] recuperação após refresh;
- [ ] aviso ao fechar com mudanças ainda não persistidas;
- [ ] não criar múltiplos posts por acidente.

### 13.2 Undo/redo

Construir sobre comandos do `CanvasPostModel`, cobrindo:

- texto;
- estilo;
- mídia;
- transformações;
- slides;
- operações “todos os slides”.

Não reutilizar implicitamente o histórico do WorkbenchV2 legado.

### 13.3 Reordenação e capa

- [ ] drag-and-drop de slides;
- [ ] IDs estáveis;
- [ ] capa explícita ou regra de primeira posição;
- [ ] atualização de marcadores;
- [ ] save e ZIP respeitam a ordem.

### 13.4 Assistência contextual

Oferecer ações conforme seleção:

- melhorar headline;
- encurtar;
- tornar mais específico;
- adaptar tom;
- gerar CTA;
- regenerar somente este slide;
- expandir ou condensar carrossel;
- sugerir hierarquia visual;
- corrigir excesso de texto;
- verificar contraste.

Toda ação generativa deve:

- mostrar preview;
- permitir aceitar ou descartar;
- criar entrada no undo;
- registrar `generationRunId` próprio;
- indicar custo antes de consumir Sparks;
- preservar o restante do documento.

### 13.5 Auditoria pré-exportação

Verificar:

- contraste;
- overflow;
- elemento fora do canvas;
- texto cortado;
- slide vazio;
- numeração inconsistente;
- CTA solicitado e ausente;
- imagem de baixa resolução;
- conteúdo ainda marcado como fallback;
- fontes ou assets não carregados.

### Testes obrigatórios

- [ ] autosave não duplica post;
- [ ] conflito de versão é detectado;
- [ ] undo/redo cobre todas as mutações principais;
- [ ] reordenação altera save e ZIP;
- [ ] refinamento de um slide não muda os demais;
- [ ] ação recusada não modifica o modelo;
- [ ] auditoria encontra overflow e slide vazio.

### Critérios de aceite

- refresh não elimina trabalho recente;
- toda ação relevante pode ser desfeita;
- usuário pode melhorar uma parte sem regenerar tudo;
- problemas previsíveis são apontados antes da exportação;
- custos e origem de IA permanecem transparentes.

### Checkpoint 8

Executar uma sessão completa de edição com autosave, dez alterações, undo/redo, reordenação, refinamento de um slide e exportação. Fechar e reabrir a aplicação durante o processo para validar recuperação.

---

## 14. Etapa 9 — Hardening, rollout e documentação

### Objetivo

Consolidar as mudanças, observar impacto real e remover caminhos temporários somente após segurança operacional.

### 14.1 Feature flags sugeridas

- `generation_error_taxonomy`;
- `explicit_local_fallback`;
- `format_intent_confirmation`;
- `structured_creation_brief`;
- `canvas_slide_scope_v2`;
- `background_crop_v2`;
- `canvas_autosave`;
- `contextual_ai_editing`.

### 14.2 Métricas de produto e operação

Monitorar:

- taxa de geração concluída;
- taxa de rejeição por regra;
- taxa de fallback local;
- incompatibilidades de formato;
- retries por geração;
- latência por etapa e modelo;
- refund e falhas de billing;
- tempo até primeiro post salvo;
- abandono em criação, galeria e editor;
- recuperação de rascunhos;
- save/reopen bem-sucedido;
- exportação PNG/ZIP bem-sucedida;
- uso de undo/redo;
- refinamentos por slide.

### 14.3 Matriz E2E final

```text
Criar briefing
→ confirmar interpretação
→ resolver formato
→ gerar
→ selecionar variação
→ editar slides isoladamente
→ salvar
→ fechar/recuperar
→ abrir pelo histórico
→ reordenar
→ exportar ZIP
```

Executar pelo menos para:

- post estático textual;
- carrossel textual;
- briefing com URL;
- briefing de marca estruturado;
- imagem local como fundo;
- desktop;
- viewport mobile;
- provider indisponível;
- geração rejeitada;
- saldo insuficiente.

### 14.4 Atualização documental

Revisar `DOCUMENTO_MESTRE.md` para eliminar divergências sobre:

- cópia literal do prompt;
- comportamento de fallback;
- recursos de texto adicional;
- isolamento por slide;
- histórico e restauração;
- exportação ZIP;
- schema de `generation_runs`;
- briefing e rascunhos;
- autosave e undo/redo;
- fluxo oficial versus legado.

### Critérios de aceite

- `npm run check`, `npm run test` e `npm run verify:runtime` passam;
- E2E crítico passa no ambiente alvo;
- métricas distinguem IA, fallback e falhas;
- documentação descreve o runtime real;
- flags possuem plano de remoção ou permanência;
- não há dependência nova do fluxo legado.

### Checkpoint 9

Realizar revisão final de produto, engenharia e dados. Só remover flags ou caminhos antigos depois de uma janela observada sem regressões críticas.

---

## 15. Mapa de entregas recomendado

### PR 1 — `schema-generation-observability`

- Etapa 1.1 e 1.2;
- migrações;
- runtime manifest;
- traces completos e degradáveis;
- verificação de schema.

### PR 2 — `generation-error-contract`

- Etapa 1.3 e 1.4;
- taxonomia compartilhada;
- `generationRunId` no frontend;
- proveniência e mensagens corretas.

### PR 3 — `canvas-slide-isolation`

- comandos canônicos;
- fundos e extras isolados;
- duplicação segura;
- testes de cross-talk.

### PR 4 — `save-restore-export-integrity`

- projeção pela capa;
- restore no Studio ativo;
- ZIP offscreen por slide;
- testes de round-trip.

### PR 5 — `format-intent-and-explicit-fallback`

- detector de formato;
- confirmação de divergência;
- fallback opt-in;
- mensagens e billing coerentes.

### PR 6 — `source-copy-quality-gate`

- comparação com input;
- exceções explícitas;
- códigos de validação;
- testes de copy literal.

### PR 7 — `persistent-creation-brief`

- contrato;
- persistência;
- confirmação;
- recuperação;
- contexto de marca.

### PR 8 — `typed-generation-canvas-adapter`

- adaptador sem `any`;
- preservação de campos;
- versionamento e migração;
- fixtures de round-trip.

### PR 9 — `background-crop-v2`

- fit modes;
- crop e focal point;
- asset original;
- paridade mobile.

### PR 10 — `canvas-free-elements-parity`

- transformações persistentes;
- controles completos;
- IDs e duplicação;
- paridade desktop/mobile.

### PR 11 — `canvas-productivity`

- autosave;
- undo/redo;
- reordenação;
- auditoria pré-exportação.

### PR 12 — `contextual-ai-editing-and-rollout`

- refinamento por seleção;
- custos/proveniência;
- métricas;
- rollout e documentação final.

---

## 16. Matriz de rastreabilidade dos problemas

| Problema | Etapa responsável | Teste/aceite principal |
|---|---:|---|
| Prompt copiado literalmente | 3 | gate de similaridade com exceção explícita |
| Fallback genérico oculto | 1 e 3 | proveniência + fallback opt-in |
| Mensagem falsa de instabilidade | 1 | taxonomia de erros |
| Prompt perdido | 4 | rascunho + recuperação do briefing |
| Síntese incorreta da marca | 4 | confirmação da interpretação |
| Prompt de carrossel enviado como estático | 3 | detector + confirmação |
| `generationRunId` descartado | 1 | vínculo frontend/save/history |
| Trace não persistido | 1 | migração + fallback de persistência |
| CTA/hashtags/seções perdidos | 5 | fixture de round-trip |
| “Slide atual” altera todos | 2 | testes de isolamento |
| Fundo sempre cortado | 6 | contain/original/custom |
| Mobile sem ajuste equivalente | 6 | teste de paridade |
| Texto adicional limitado | 7 | controles e persistência completos |
| Transformação visual não persiste | 7 | teste `onTransformEnd` + reopen |
| Extras vazam entre slides | 2 e 7 | isolamento por slide |
| ZIP repete o slide ativo | 2 | hashes distintos por arquivo |
| Save representa slide selecionado | 2 | projeção pela capa |
| Histórico abre fluxo errado | 2 | restore em `/thevoid` |
| Falta autosave | 8 | recuperação após refresh |
| Falta undo/redo | 8 | histórico de comandos |
| Falta reordenação | 8 | ordem preservada no ZIP/save |
| Editor pouco assistido | 4 e 8 | briefing + ações contextuais |
| Documento-mestre divergente | 9 e transversal | revisão após cada mudança |

---

## 17. Decisões recomendadas

Estas decisões devem ser adotadas salvo orientação contrária explícita do dono do produto:

1. **Fallback não é sucesso.** Conteúdo local só aparece após escolha do usuário e sempre rotulado.
2. **Formato explícito prevalece após confirmação.** Inferência serve para detectar conflito, não para alterar silenciosamente.
3. **Capa é projeção estável.** Campos legados do post representam a capa, não o slide ativo.
4. **CanvasPostModel é autoritativo.** Campos legados não comandam o editor oficial.
5. **Propriedade local não atualiza root.** Ação no slide atual permanece local.
6. **Asset original é preservado.** Crop e transformação são não destrutivos.
7. **Briefing é dado de produto do usuário.** Não depende de traces técnicos para ser recuperado.
8. **Toda IA possui proveniência e custo.** Inclusive refinamentos posteriores.
9. **Mudança visual deve ser reversível.** Undo/redo e autosave entram somente depois de o modelo estar consistente.
10. **Legado não recebe novas capacidades.** Só compatibilidade de leitura quando indispensável.

---

## 18. Riscos e cuidados

### Billing

- validar reserva, commit e refund em todas as novas saídas antecipadas;
- detecção local de formato deve acontecer antes da reserva;
- refinamento por slide precisa declarar custo próprio;
- idempotência deve impedir cobrança em duplo clique e retries.

### Privacidade

- não habilitar armazenamento irrestrito de prompts técnicos sem decisão explícita;
- separar briefing recuperável de trace interno;
- incluir novas tabelas na exportação e exclusão GDPR;
- redigir logs e evitar conteúdo integral em `OPERATIONAL_ERRORS.txt`.

### Compatibilidade

- posts antigos devem continuar abrindo;
- mudanças no `CanvasPostModel` exigem migração/defaults;
- não transformar `PostVisualSnapshot` legado na fonte do CanvasLab;
- campos projetados precisam continuar atendendo biblioteca e pesquisa.

### Performance

- autosave não pode serializar ou reenviar imagens base64 grandes;
- ZIP offscreen deve liberar canvases e imagens;
- análise de similaridade não deve multiplicar chamadas externas desnecessariamente;
- briefing assistido deve manter caminho rápido para usuários com pedido simples.

### Worktree

- existem muitas mudanças não commitadas;
- conferir o conteúdo atual imediatamente antes de cada patch;
- nunca usar reset destrutivo;
- preservar arquivos e experimentos fora do escopo.

---

## 19. Definição global de pronto

O plano só estará concluído quando:

- [ ] toda geração, aprovada ou falha, for correlacionável;
- [ ] fallback local nunca for confundido com IA;
- [ ] briefing e prompt forem recuperáveis;
- [ ] formato divergente exigir confirmação;
- [ ] cópia literal não autorizada for bloqueada;
- [ ] nenhuma informação relevante se perder entre backend e CanvasLab;
- [ ] alterações locais permanecerem no slide correto;
- [ ] save/reopen reproduzir o documento;
- [ ] ZIP exportar slides corretos e na ordem correta;
- [ ] imagem original puder ser reenquadrada;
- [ ] textos e imagens livres persistirem todas as transformações;
- [ ] desktop e mobile compartilharem o mesmo contrato de comandos;
- [ ] autosave, undo/redo e reordenação estiverem cobertos;
- [ ] ações de IA contextual forem reversíveis e rastreáveis;
- [ ] a jornada E2E completa passar;
- [ ] `DOCUMENTO_MESTRE.md` refletir o runtime final.

---

## 20. Modelo de handoff entre agentes

Ao encerrar uma etapa ou PR, o agente deve registrar:

```text
Etapa:
Status: concluída | parcial | bloqueada

Arquivos alterados:
- ...

Contratos alterados:
- ...

Migrações aplicadas:
- ambiente:
- migration:
- resultado:

Testes executados:
- comando:
- resultado:

Critérios de aceite verificados:
- ...

Pendências e riscos:
- ...

DOCUMENTO_MESTRE.md:
- atualizado em quais seções, ou justificativa para não atualizar

Próximo checkpoint:
- ...
```

Não marcar uma etapa como concluída apenas porque o código compila. O checkpoint funcional e os testes de round-trip são parte da entrega.

