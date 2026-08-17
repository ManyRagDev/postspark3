# SPEC-004 — persistência, billing e verdade da infraestrutura

**Status:** 🟡 parcial — conferência global de 2026-08-12 reexecutou `verify:runtime`: 6 requisitos críticos continuam ausentes no Supabase alvo. O router também ignora retorno `false` de commit/refund. Correções CR-005 e CR-006 em [`CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md).
**Dependência:** contrato final de geração da SPEC-003
**Dor:** o runtime usa Supabase diretamente, o schema declarativo e os SQLs locais não provam o estado hospedado, e billing depende de RPCs cuja presença precisa ser verificável

## Resultado

Código, migrations e Supabase hospedado passam a ter uma cadeia de evidência reproduzível. Um verificador read-only informa tabelas, colunas, RPCs, constraints, índices, buckets e contratos necessários; billing e persistência falham cedo quando o ambiente não satisfaz a aplicação.

## Estado real herdado

1. `server/db.ts` e `server/billing.ts` usam `@supabase/supabase-js` diretamente.
2. `drizzle/schema.ts` documenta parte do modelo, mas não é a única autoridade do runtime.
3. Não existe script de migration no `package.json` que prove aplicação automática dos SQLs.
4. Há migrations locais até `0014`, além de `high_ticket_tables.sql`.
5. `0012_add_generation_events.sql` contém um parêntese final suspeito; `0013_harden_generation_events.sql` volta a criar/normalizar a mesma estrutura.
6. `0014_spark_reservations.sql` define tabela e RPCs usados por `server/billing.ts`.
7. Presença local de uma migration não confirma que tabela, RPC ou índice exista no projeto Supabase usado pela aplicação.

## Princípios de segurança

- A auditoria remota é read-only.
- Migration possivelmente já aplicada nunca é reescrita com base em suposição; correção nasce em migration nova depois de verificar o histórico remoto.
- Nenhuma migration é aplicada em produção por esta spec sem autorização explícita.
- Nenhum relatório inclui secrets, service-role key completa ou payload pessoal.
- Stripe real não é usado; testes externos, quando autorizados, usam test mode.

## Verificador obrigatório

Criar um comando versionado, por exemplo `npm run verify:runtime`, que:

1. valida configuração sem imprimir secrets;
2. conecta read-only ao projeto Supabase configurado;
3. consulta a fonte de verdade para schema `postspark`, tabelas, colunas, tipos, defaults, constraints, índices e funções/RPCs necessárias;
4. verifica buckets e políticas estritamente usados pelo código;
5. compara o resultado com um manifesto de requisitos derivado dos consumidores em `server/db.ts`, `server/billing.ts` e autenticação;
6. separa `presente`, `ausente`, `incompatível` e `não verificável`;
7. grava JSON com timestamp, identificador mascarado do projeto, hashes do manifesto e das migrations locais;
8. retorna exit code diferente de zero em requisito ausente/incompatível.

Arquivo narrativo não substitui a saída desse comando.

## Implementação

1. Inventariar todas as chamadas `.from()`, `.rpc()` e storage no código ativo, com campos lidos/escritos e tipos esperados.
2. Comparar `drizzle/schema.ts`, SQLs locais e esse inventário; classificar cada divergência antes de editar.
3. Validar sintaticamente as migrations em PostgreSQL descartável ou parser confiável. A fixture precisa incluir uma migration deliberadamente inválida para provar o gate.
4. Verificar no ambiente remoto quais migrations/estruturas existem. Se não houver acesso, entregar o verificador e marcar somente a parte remota como pendente.
5. Não alterar `0012` se houver possibilidade de já ter sido aplicada; criar uma migration corretiva idempotente quando a evidência exigir.
6. Consolidar a versão do contrato de `generation_runs.events` e garantir que o runtime persista o que o schema declara.
7. Confirmar tabelas/RPCs de `spark_reservations` e testar concorrência, double-submit, commit repetido, refund repetido e transições inválidas.
8. Gerar/adotar tipos Supabase ou wrappers tipados suficientes para retirar `as any` das chamadas críticas de DB/billing. Não é necessário migrar o runtime para Drizzle.
9. Fazer startup/health check falhar com mensagem acionável quando um requisito crítico estiver ausente, sem expor segredo.
10. Testar salvar, atualizar, listar e reabrir snapshots atuais e legados; verificar `generation_runs`, fingerprints, brand kits/personas e assets usados.
11. Confirmar que autenticação bridge entrega o mesmo `userUuid` usado por posts, reservas e políticas; não redesenhar auth sem evidência de defeito.

## Critérios de aceitação

- [ ] O manifesto de requisitos cobre 100% das tabelas, RPCs e buckets referenciados pelo runtime ativo.
- [ ] `verify:runtime` gera relatório derivado, anonimizado e retorna exit code honesto.
- [ ] Uma fixture sabotada prova que o verificador detecta ausência ou tipo incompatível.
- [ ] Todas as migrations locais passam por validação sintática reproduzível.
- [ ] O destino de `0012`/`0013` é decidido com base no estado remoto, sem reescrever migration aplicada.
- [ ] Persistência de snapshot atual e leitura de versões legadas têm teste de ida e volta.
- [ ] Billing prova idempotência e transições válidas em testes; reserva nunca fica sem estado terminal por falha conhecida do orquestrador.
- [ ] Falta de RPC/schema crítico falha cedo e de maneira diagnosticável.
- [ ] O relatório remoto, quando executado, contém timestamp, identificador do ambiente e hashes verificáveis.
- [ ] `npm run check`, `npm test`, validação SQL e verificador local passam.

Sem relatório do Supabase real, a spec permanece `🟡 parcial — infraestrutura remota não verificada`, ainda que todos os testes locais passem.

## Fora de escopo

- aplicar migration em produção;
- apagar ou transformar dados reais;
- trocar Supabase por outro banco;
- mover todo acesso para Drizzle;
- alterar planos, preços ou saldo de usuários;
- refazer autenticação sem falha comprovada.

## Conferência exigida

Conferência total. O conferente reexecuta o verificador contra a mesma fonte ou declara `NÃO VERIFICÁVEL`; narrativa e screenshot não fecham o item.
