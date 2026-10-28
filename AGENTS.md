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

## Contexto e documentação permanente

`DOCUMENTO_MESTRE.md` é uma referência de arquitetura e comportamento. Consulte as seções pertinentes quando ajudarem a tarefa e confronte afirmações com o código atual; não releia o documento inteiro por rotina.

Atualize-o apenas quando houver uma mudança duradoura relevante de arquitetura, regra de negócio, integração ou operação que precisará ser consultada. Correções pequenas, testes, hipóteses e andamento de tarefas não exigem atualização nem relato de que o documento foi revisado.

## Continuidade do trabalho

Interprete o pedido pelo resultado desejado e planeje consequências relevantes, sem exigir três documentos, contrato ou lista fechada de arquivos. Na execução autorizada, ajuste o plano ao código e prossiga até integrar e verificar o fluxo. Peça uma decisão somente quando ela mudar o resultado ou faltar autorização; continue nas partes independentes.

Workflows em `.agent/` são apoios opcionais. A ausência de `docs/tasks.md` não bloqueia uma tarefa clara, e uma etapa ou arquivo concluído não exige pedir confirmação para continuar. Preserve requisitos técnicos e de produto, dados e alterações locais.

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
7. se existe conhecimento duradouro relevante que precisa ser atualizado na documentação.

Checklist prático para este repositório:

- autenticação: `client/src/lib/supabaseClient.ts`, `client/src/_core/hooks/useAuth.ts`, `server/_core/sdk.ts`, `server/_core/supabaseAuth.ts`;
- API: `server/_core/index.ts`, `server/routers.ts`, `server/_core/trpc.ts`;
- persistência: `server/db.ts`, `drizzle/schema.ts`, `drizzle/*.sql`;
- fluxo principal do produto (ativo): rota `/thevoid` (e `/studio`) montando `client/src/pages/StudioApp/StudioAppV2BPage.tsx` (etapas Criação ➔ Galeria StudioGalleryView/StudioMobileFlashcards ➔ Editor CanvasLab em `client/src/pages/CanvasLab/`); componentes `Home.tsx` e `WorkbenchV2` são legado órfão sem rota montada (ver §3.2 do `DOCUMENTO_MESTRE.md`);
- contratos compartilhados: `shared/postspark.ts`, `shared/const.ts`, `shared/types.ts`.

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


## Entrega compreensível

Explique primeiro o que o usuário agora consegue fazer, o comportamento corrigido e as condições ou limitações relevantes. Depois resuma a verificação realizada e o que ficou pendente. Arquivos e comandos são apoio à evidência.

Verifique o fluxo afetado, incluindo persistência e reabertura quando pertinentes. Suíte aprovada, montagem de componente ou retorno zero de um harness não demonstram sozinhos o resultado de uma jornada. Não declare capacidade real a partir de uma simulação sem explicitar essa limitação.

<!-- BEGIN AWS Agent Toolkit rules -->
## Integração AWS Agent Toolkit

Fonte: https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/rules/aws-starter-rules.md

Contexto deste projeto: nova experiência da AWS; região selecionada `us-east-2`.
O catálogo e a configuração do Agent Toolkit usam `us-east-1`; isso não altera a região dos recursos do PostSpark.
As instruções existentes do projeto e as decisões expressas do usuário têm precedência sobre o bloco abaixo.

# AWS Guidance for the new AWS experience

This user has signed up for the new AWS experience. This experience lets you sign into AWS using a social provider and requires the following additional context.

Where this guidance conflicts with the project's own instructions, the project's instructions take precedence.

## Context

### Terminology:

- Say "project" instead of "account" — a project contains an AWS account and settings for sharing with other collaborators
- Say "team member" instead of "IAM user" — users are invited by email, not created or federated in IAM
- Say "AWS Settings" when referring to management tasks at [settings.aws.com](https://settings.aws.com/) (project management, billing, team members, spend limits). Users view their actual AWS resources in the AWS Management Console.
- Say "selected Region" when referring to the user's Region — not "home Region"
- The user has a managed IAM experience. This includes a managed service control policies (SCP) and resource control policies (RCP) that govern the use of AWS. They will still need to use IAM to create policies to let services work with each other. If there are questions about the SCPs or RCPs, go to the documentation at https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html

### Constraints:

- All projects share a single AWS Region determined by the user's contact address. Resources cannot be created in other Regions
- When developing:
  - MUST create all Regional resources in the project's assigned Region
  - You CAN create AWS WAF and Cloudwatch Logs resources in us-east-1 when there are global resources (like a global WAF instance) that require a connection to dependencies in us-east-1. You should not use these for any other reason, because resources in the selected Region will provide lower cost (due to no cross-Region traffic), increased availability (due to no cross-Region traffic), and easier manageability (due to not needing to look in another Region). When you need to do an inventory of resources, you need to look in both the selected Region and us-east-1 for Cloudwatch Logs or WAF resources.
  - MUST NOT attempt to create Lambda, API Gateway, or other Regional resources in any other Region
  - MUST direct users to confirm their Region in AWS Settings > View all projects > Overview > Additional Info > Region. If the user cannot confirm their Region, check in ~/.aws/config
  - MUST NOT use Lambda@Edge — excluded from both Lambda and CloudFront
  - MUST NOT use CloudFormation StackSets — no multi-account or multi-Region deployments
  - MUST NOT attempt cross-Region actions — no cross-Region replication for DynamoDB/S3/RDS, no multi-Region KMS keys
  - MUST NOT use Route 53 cross-Region routing — geolocation, latency-based, and failover routing policies are not available
  - CloudFront is a global service and its actions ARE allowed in `us-east-1`. A user can create a CloudFront distribution pointing to their project-region Lambda function URL or API Gateway. However, Lambda and API Gateway themselves MUST NOT be created in `us-east-1` — they must be in the project Region.
  - Reduced availability in `eu-north-1` specifically: Amazon Rekognition, Amazon Textract, Amazon Personalize, AWS App Runner are not available in that Region.
- IAM permissions for human access are managed by AWS. Don't assign roles to team members unless absolutely necessary
- The user may have a spend limit if they are on the paid plan. The limit that pauses their project if it's exceeded. If resources suddenly become inaccessible, ask if they have a spend limit configured. Only project owners can modify a spend limit.
- When developing:
  - MUST ask about spend limit status if the user reports sudden "Access Denied" errors on operations that previously worked
  - MUST direct users to check spend status in AWS Settings > Billing
  - MUST check if a user has upgraded their account to the paid plan
  - MUST ask the user if they want to clean up the successfully created resources or keep them to reduce cost
- The user sets up billing, creates spend limits, and retrieves and pays invoices in AWS Settings. The user creates budgets and optimizes their costs in the AWS Billing and Cost Management console
- Not all AWS services are available. If a service isn't working, do the following:
  1. Run the command `aws freetier get-account-plan-state`
  2. If accountPlanType": "FREE", check the [Free Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-free-tier) next,
  3. If accountPlanType": "PAID", check the [Paid Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-paid-plan).
  4. If neither list shows the service, check the [Not supported for this experience list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#unsupported-services). The user will need to activate advanced features to access this service.
- Users can activate advanced AWS services and capabilities for their account.
- For any AWS task or question — building, configuring, migrating, debugging, or operating a service, writing SDK code, authoring CDK/CloudFormation, or answering how a service works — first call `aws___search_documentation` with topic `agent_skills` and load the matching skill with `aws___retrieve_skill`. Do this even when you believe you know the answer: skills carry current service behavior that your training may not. Prefer the skill's guidance over general knowledge. Skip it only for work that does not involve AWS.

### Help level

- help_level (required): LOW, MEDIUM, or HIGH. While a user is building, you MUST ask the user: "How much guidance would you like from me? Low (I only flag security risks), medium (I ask a couple of clarifying questions if something seems off), or high (I explain what I'm doing, suggest alternatives, and flag best practices)."

You CAN update this rule file to save a user's help_level.

Constraints for each level:

**LOW:**

- MUST follow all constraints in this context file
- MUST execute the user’s request without modification
- MUST NOT ask clarifying questions unless the action would create a security vulnerability
- MUST NOT suggest alternatives or improvements

**MEDIUM:**

- MUST execute the user's request
- MAY ask up to two clarifying questions per task if the request has an ambiguity or a potential issue
- MUST NOT repeat a question or suggestion the user has already dismissed
- MUST NOT explain trade-offs or alternatives unless the user asks

**HIGH:**

- MUST explain what each step does and why before executing it
- MUST suggest alternatives when a better approach exists
- MUST flag best practices and explain trade-offs
- MUST still execute the user's choice if they disagree with a suggestion
<!-- END AWS Agent Toolkit rules -->
