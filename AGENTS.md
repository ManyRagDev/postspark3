# AGENTS

## Propósito do repositório

Este repositório contém o código principal do PostSpark, uma aplicação full stack para geração e edição de posts para redes sociais com apoio de IA. O fluxo observado no código combina:

- captura de insumo do usuário (`texto`, `URL` ou `imagem`);
- autenticação com Supabase;
- geração de variações de posts e carrosséis via LLM;
- extração de identidade visual de sites;
- edição visual direta na prancheta interativa do CanvasLab (motor Konva 2D);
- persistência de posts e assets;
- billing por plano e saldo de `Sparks`.

O projeto **não deve ser assumido** como:

- um backend isolado sem frontend;
- um frontend puro sem persistência;
- um monorepo multiapp formal;
- uma arquitetura baseada em filas, jobs agendados ou workers dedicados;
- uma aplicação orientada a Drizzle em runtime só porque existe `drizzle/schema.ts` e migrações.

O estado real atual mistura:

- frontend React/Vite em [`client/`](./client);
- backend Express + tRPC em [`server/`](./server);
- contratos compartilhados em [`shared/`](./shared);
- deploy/serverless build em [`api/index.js`](./api/index.js);
- migrações e schema declarativo em [`drizzle/`](./drizzle).

## Documento-mestre obrigatório

`DOCUMENTO_MESTRE.md` é a principal fonte de contexto funcional e técnico deste repositório.

Todo agente deve:

1. ler `DOCUMENTO_MESTRE.md` antes de mudanças relevantes;
2. usá-lo como referência primária para arquitetura, fluxos, integrações e riscos;
3. atualizá-lo sempre que houver mudança funcional, estrutural, arquitetural, contratual ou de integração;
4. registrar nele também comportamentos implícitos descobertos durante manutenção.

## Forma de trabalhar neste projeto

Antes de alterar código:

1. entenda a responsabilidade real do trecho alterado;
2. localize quem consome e quem produz os dados daquele trecho;
3. mapeie impacto em frontend, backend, persistência, autenticação, billing e integrações externas;
4. preserve o comportamento existente quando não houver pedido explícito para alterá-lo;
5. destaque inconsistências, riscos, efeitos colaterais e pontos obscuros encontrados.

Neste projeto, isso é especialmente importante porque:

- há documentação antiga parcialmente divergente do código atual;
- existe acoplamento entre autenticação Supabase, cookie bridge, tRPC e páginas protegidas;
- o router principal do backend está concentrado em [`server/routers.ts`](./server/routers.ts);
- persistência em runtime usa Supabase client direto em [`server/db.ts`](./server/db.ts), enquanto `drizzle/` documenta parte do modelo.

## Prioridades ao analisar ou alterar código

Ao analisar qualquer mudança, procure responder:

1. qual módulo é dono da responsabilidade;
2. quais outros módulos são afetados;
3. quais entradas e saídas existem;
4. quais dados são lidos, transformados e escritos;
5. quais integrações externas entram no fluxo;
6. quais fluxos de usuário ou backend podem ser impactados;
7. se a mudança exige atualização do `DOCUMENTO_MESTRE.md`.

Checklist prático para este repositório:

- autenticação: `client/src/lib/supabaseClient.ts`, `client/src/_core/hooks/useAuth.ts`, `server/_core/sdk.ts`, `server/_core/supabaseAuth.ts`;
- API: `server/_core/index.ts`, `server/routers.ts`, `server/_core/trpc.ts`;
- persistência: `server/db.ts`, `drizzle/schema.ts`, `drizzle/*.sql`;
- fluxo principal do produto (ativo): rota `/thevoid` (e `/studio`) montando `client/src/pages/StudioApp/StudioAppV2BPage.tsx` (etapas Criação ➔ Galeria StudioGalleryView/StudioMobileFlashcards ➔ Editor CanvasLab em `client/src/pages/CanvasLab/`); componentes `Home.tsx` e `WorkbenchV2` são legado órfão sem rota montada (ver §3.2 do `DOCUMENTO_MESTRE.md`);
- contratos compartilhados: `shared/postspark.ts`, `shared/const.ts`, `shared/types.ts`.

## Quando atualizar o documento-mestre

Atualize `DOCUMENTO_MESTRE.md` quando houver:

1. criação, remoção ou reestruturação de módulo relevante;
2. mudança de comportamento funcional do produto;
3. alteração de rotas HTTP, procedimentos tRPC, webhooks, autenticação ou contratos;
4. alteração de jobs, eventos, automações ou qualquer mecanismo assíncrono;
5. mudança de integração externa ou de variáveis de ambiente relevantes;
6. mudança de persistência, schema, tabelas, RPCs, storage ou modelo de dados;
7. alteração de fluxo do usuário;
8. descoberta de comportamento implícito ainda não documentado;
9. confirmação ou invalidação de hipótese registrada como lacuna.

## Restrições e cuidados

- Não assuma comportamento com base em nomes de arquivos ou em documentação antiga sem cruzar o código atual.
- Não trate `docs/` como fonte primária quando houver divergência com `server/`, `client/`, `shared/` e `drizzle/`.
- Não assuma que Drizzle é a única camada de acesso a dados: o runtime usa Supabase diretamente.
- Não assuma que existem filas, cron jobs ou workers sem evidência no código.
- Não simplifique a arquitetura para “frontend React + API Node” sem considerar autenticação bridge, billing e serviços externos.
- Preserve compatibilidade com fluxos existentes quando aplicável.
- Sinalize explicitamente pontos não confirmados, dependentes de ambiente ou de infraestrutura externa.
- Evite editar artefatos gerados (`api/index.js`, `dist/`, `dist-server/`) sem necessidade explícita.

## Invariante obrigatória: fonte única da verdade dos posts

O repositório possui dois modelos com escopos e ciclos de vida bem definidos (ver §3 do `DOCUMENTO_MESTRE.md`):

### 1. Editor Oficial CanvasLab (`CanvasPostModel` — Ativo)
O editor oficial ativo no PostSpark Studio (`client/src/pages/CanvasLab/`) adota o **`CanvasPostModel`** (`client/src/pages/CanvasLab/components/types.ts`) como documento autoritativo:
1. Toda mutação passa pelo funil `CanvasLabPage.handleUpdatePost` e é renderizada deterministicamente pelo motor Konva `CanvasPostStage.tsx`.
2. As regras de contraste (WCAG) e legibilidade são auditadas por `lib/contrast.ts`.
3. Estilos pré-definidos nunca alteram cores (`lib/familyPreset.ts`).
4. Persistência e reabertura com fidelidade total são realizadas na coluna `canvas_model` via `client/src/pages/CanvasLab/lib/saveAdapter.ts`.

### 2. Fluxo Legado (`PostVisualSnapshot` — Histórico / Compatibilidade)
No fluxo legado (`Home.tsx` / `HoloDeck` / `WorkbenchV2`, hoje sem rota montada), cada variação gerada por `post.generate` atravessa o normalizador em `client/src/lib/variationSnapshot.ts` tornando-se um `PostVisualSnapshot`.
Regras para manutenção no legado:
1. HoloDeck, Workbench, exportação e histórico legado consomem o mesmo `PostVisualSnapshot`.
2. O Zustand mantém `visualSnapshot` como documento autoritativo para o legado; os demais campos são projeções compatíveis.
3. Overrides de carrossel residem em `slides[].editorState`.
4. Testes de contrato residem em `variationSnapshot.test.ts`. Alterações exigem incremento de `snapshotVersion`.


## Entregas esperadas em mudanças futuras

Sempre que possível, o agente deve:

1. implementar a alteração pedida;
2. revisar impactos diretos e colaterais;
3. atualizar `DOCUMENTO_MESTRE.md` se a mudança afetar contexto permanente;
4. informar na resposta final se o documento-mestre foi revisado ou atualizado;
5. registrar dúvidas, hipóteses ou validações pendentes quando o código não permitir confirmação completa.
