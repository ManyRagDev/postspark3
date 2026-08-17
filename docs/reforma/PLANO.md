# Plano operacional da reforma

**Estado:** 🟡 seis specs implementadas materialmente; conferência global concluída com correções obrigatórias e cutover bloqueado
**Fila executável:** [`EXECUCAO-AUTONOMA.md`](./EXECUCAO-AUTONOMA.md)
**Fila corretiva:** [`CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md)

## Objetivo

Reformar o PostSpark 3 por entregas verticais, preservando o produto que já funciona e substituindo responsabilidades mal definidas. O plano não cria uma sequência de fases universais: cada entrega precisa resolver uma dor observável, atravessar todas as camadas afetadas e encerrar o mecanismo anterior correspondente.

## Decisões já tomadas

| ID | Decisão | Consequência |
|---|---|---|
| D-001 | PostSpark 3 permanece como fundação | não iniciar outro aplicativo |
| D-002 | PostSpark Next é doador | extrair capacidades, não transplantar a arquitetura inteira |
| D-003 | `PostVisualSnapshot` é o documento visual autoritativo | renderers não recalculam decisões já resolvidas |
| D-004 | Resolver no servidor/shared e renderizar no cliente | DOM serve para verificação, não para criar outro resultado |
| D-005 | Substituir no caminho principal | não manter feature flag ou rota paralela sem prazo e critério de remoção |
| D-006 | Documentação nasce de evidência | documento antigo preserva história, mas não vence o código observado |

## Inventário vivo de pontas soltas

| ID | Ponta solta | Evidência atual | Tratamento |
|---|---|---|---|
| P-001 | Tipografia tem múltiplas autoridades | 🟡 O resolvedor foi integrado, mas o renderer ainda consome apenas parte de `ResolvedTextBlock`, aplica multiplicadores tardios e deixa edições do browser sem nova medição | SPEC-001 reaberta — CR-001/CR-002 |
| P-002 | Harness medido não está no runtime e tem cobertura parcial | 🟡 Núcleo e harness existem (2664 casos, 0 pulados), porém o aceite real `e2/e3/e5` reprova; o perfil `baseline` não é prova de correção | SPEC-001/SPEC-002 reabertas — CR-003 |
| P-003 | Next tem resolvedor mais amplo que o harness atual | `resolve.ts` do Next não absorvido (hard-break silencioso de palavra); safe area absorvida na SPEC-002 (`safeAreaMarginsPercent`); `measure.ts`/`palette.ts` comparados | SPEC-002 ✅ (parte); SPEC-005 para ledger restante |
| P-004 | Snapshot v3 não carrega a resolução tipográfica final | ✅ Contrato v4 implementado (`resolvedTypography`, `typographyResolutionError`), leitura v1-v3 preservada | SPEC-001 ✅ |
| P-005 | Contraste/paleta têm implementações concorrentes | 🟡 A definição foi consolidada em `shared/creative/color.ts`, mas o corpus real ainda reprova contraste/safe area/fit | SPEC-002 reaberta — CR-003 |
| P-006 | Pipeline síncrono faz várias chamadas de LLM | 🟡 O orquestrador único existe, mas modos/contexto opcionais ainda acrescentam chamadas LLM fora do orçamento declarado | SPEC-003 reaberta — CR-004 |
| P-007 | Shadow graph e pipeline experimental não governam o resultado | ✅ Removidos: flags `AI_GRAPH_SHADOW`/`AI_GRAPH_PIPELINE` retirados de `env.ts`; módulos `server/ai/generationGraph/`, `shared/generationGraph.ts`, `shared/graphEngine.ts` (+ testes) deletados — não existe segunda máquina de estado | SPEC-003 ✅ (nesta entrega) |
| P-008 | Comentário de flag diverge do código | ✅ Comentário e flags removidos junto com os grafos | SPEC-003 ✅ |
| P-009 | Migration 0012 tem SQL suspeito e estado remoto desconhecido | 🟡 A auditoria confirmou a divergência e criou `0015_harden_manifest_corrective.sql`, mas o verificador real ainda acusa 6 requisitos críticos ausentes; aplicação depende de autorização do dono | SPEC-004 reaberta — CR-006 |
| P-010 | Há módulos sem consumidor confirmado ou apenas de compatibilidade | 🟡 Paralelos foram removidos e `postJudge.ts` foi mantido como compatibilidade, mas seu teste de contrato valida o campo errado e não prova a equivalência prometida | SPEC-005 reaberta — CR-007 |
| P-011 | Documentação acumulou planos concorrentes | 🟡 A nova documentação existe, mas o corte definitivo está bloqueado pelas correções CR-001 a CR-009 | SPEC-006 reaberta — CR-008/CR-009 |
| P-012 | `postspark-next/` é repo aninhado | `.git` próprio | SPEC-005 cria ledger e recomendação; exclusão depende do dono |

O inventário anterior continua útil como trilha histórica, mas seus estados devem ser reconfirmados antes de virar tarefa.

## Ordem de ataque

### SPEC-001: uma autoridade tipográfica

Resultado esperado: nenhum renderer decide tamanho ou corte por conta própria; o snapshot carrega uma resolução reproduzível e persiste o mesmo resultado entre HoloDeck, Workbench, exportação e reabertura.

### SPEC-002: consolidar layout e cor

Resultado esperado: um único resolvedor de constraints e paleta; famílias expressam intenção, não regras paralelas; implementações de contraste redundantes são absorvidas ou removidas.

### SPEC-003: encurtar e unificar geração

Resultado esperado: menos chamadas sequenciais de LLM e menor latência, sem perder variedade, validação, billing ou rastreabilidade.

### SPEC-004: verdade de persistência, billing e infraestrutura

Resultado esperado: contratos locais e Supabase real comparáveis por verificador derivado; migrations e RPCs deixam de ser pressupostos.

### SPEC-005: remover paralelos e órfãos

Resultado esperado: um dono por responsabilidade, compatibilidade explicitamente limitada e ledger das peças do Next.

### SPEC-006: aceite e corte documental

Resultado esperado: fluxo completo comprovado e novo documento-mestre factual, com o anterior preservado integralmente.

As seis specs foram detalhadas porque a execução será delegada a um agente contínuo. Ainda assim, somente uma entra em implementação por vez, e seus fatos herdados devem ser revalidados no início.

## Protocolo mínimo por entrega

1. **Abrir:** formular uma dor observável, um resultado e o mecanismo antigo a encerrar.
2. **Confirmar:** mapear produtor, consumidor, contrato, persistência, billing/autenticação quando afetados e estado externo quando necessário.
3. **Contratar:** alterar tipos e invariantes antes de adaptar chamadas; não usar casts para simular integração.
4. **Implementar verticalmente:** shared/server → snapshot → cliente → persistência/exportação → compatibilidade legada.
5. **Verificar:** testes de contrato, integração, harness e revisão visual proporcional ao risco.
6. **Conferir:** uma revisão independente procura caminhos paralelos, regressões e alegações sem evidência.
7. **Encerrar:** classificar como integrada, parcial ou rejeitada; apagar o mecanismo substituído e atualizar baseline/mestre quando houver fato permanente.

## Regra de conclusão

Uma entrega não está concluída porque o código novo existe. Ela está concluída quando:

- o comportamento pedido é observável;
- todos os consumidores relevantes usam o novo contrato;
- o caminho antigo não decide mais o mesmo resultado;
- compatibilidade e persistência foram verificadas;
- testes necessários passaram;
- limitações remanescentes estão explicitamente registradas.

## Evidências mínimas

| Risco | Evidência mínima |
|---|---|
| Contrato/snapshot | testes de normalização, ida e volta e versões legadas |
| Visual | harness determinístico + amostra renderizada nas famílias e proporções |
| Persistência | salvar, reabrir e comparar o documento autoritativo |
| Billing | reserva, commit e refund nos caminhos de sucesso e erro |
| Infra externa | consulta ao ambiente real; arquivo local não basta |
| Remoção | grafo/importações, testes e busca por consumidores |

## O que não faremos antes da primeira implementação

- reescrever todos os documentos antigos;
- catalogar cada arquivo do repositório;
- criar specs para toda a fila;
- portar o engine inteiro do Next;
- adicionar novas camadas de orquestração;
- limpar código sem conexão com a dor ativa.
