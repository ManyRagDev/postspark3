# SPEC-005 — consolidação e remoção de caminhos paralelos

**Status:** 🟡 parcial — conferência global de 2026-08-12 confirmou remoções, imports e build, mas o teste de compatibilidade de `postJudge` valida a propriedade errada e permite `NaN`. Correção CR-007 em [`CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md).
**Dependência:** SPEC-003 integrada; pode avançar com verificação remota da SPEC-004 ainda pendente
**Dor:** código experimental, reexports de compatibilidade, módulos aparentemente órfãos, comentários obsoletos e o repositório Next tornam difícil saber qual caminho é real

## Resultado

Cada responsabilidade relevante possui um módulo dono e um caminho produtivo. Código substituído sai do runtime; compatibilidade legada fica nomeada e testada; o Next recebe um ledger final de peças absorvidas, rejeitadas ou ainda dependentes de decisão do dono.

## Estado real herdado

1. O worktree já contém remoções e movimentações do antigo High Ticket; não se deve tratá-lo como pipeline atual sem revalidar.
2. `server/ai/generationGraph/` contém pipeline, shadow, control e replay; seu destino funcional é resolvido pela SPEC-003.
3. `client/src/lib/designRules.ts` não apresentou consumidor ativo na busca inicial.
4. `client/src/lib/visualFitValidator.ts` é uma borda de reexportação para `shared/visualFit.ts`, não necessariamente uma duplicação lógica.
5. `server/_core/voiceTranscription.ts` contém exemplo de uso, mas nenhum consumidor encontrado na busca inicial.
6. `server/ai/slimBriefing.ts` existe após absorção de código antigo; só pode ser removido se o grafo de importação atual confirmar ausência.
7. `postspark-next/` é um repositório Git independente e não pode ser apagado automaticamente.
8. `api/index.js`, `dist/` e `dist-server/` são artefatos gerados, não fontes para edição manual.

## Classificação obrigatória

Antes de remover, produzir uma tabela para cada candidato:

| Classe | Significado | Ação |
|---|---|---|
| dono ativo | participa do runtime ou contrato | manter e documentar |
| compatibilidade | só lê/encaminha legado ainda suportado | manter com prazo/critério de remoção |
| donor absorvido | veio do Next/experimento e agora vive no caminho principal | registrar origem; não duplicar |
| órfão comprovado | sem import estático/dinâmico, rota, script, build ou uso externo conhecido | remover com teste/build |
| gerado | derivado do build | não editar; regenerar quando necessário |
| decisão do dono | remoção destrutiva ou valor histórico não técnico | não remover automaticamente |

## Implementação

1. Atualizar o grafo/importações no estado pós-SPEC-003 e listar consumidores de cada candidato.
2. Pesquisar imports estáticos, dinâmicos, caminhos de string, scripts, routes, testes, artefatos de deploy e documentação operacional.
3. Consolidar barrels/reexports somente quando isso não criar quebra pública; compatibilidade restante recebe comentário e teste explícitos.
4. Remover módulos comprovadamente órfãos e os testes que só testavam caminhos removidos; adicionar/ajustar testes do módulo dono.
5. Retirar flags, comentários, env vars e métricas associados a caminhos que deixaram de existir.
6. Remover dependências do `package.json` apenas depois de provar ausência em código, scripts e build.
7. Não editar bundles gerados. Executar o build para provar que a fonte gera artefatos válidos.
8. Criar em `docs/reforma/` um ledger curto do Next com cada capacidade relevante: `absorvida`, `rejeitada`, `não necessária` ou `decisão do dono`, citando o destino no PostSpark 3.
9. Manter `postspark-next/` intacto. Ao final, recomendar retenção, arquivo externo ou remoção; qualquer exclusão requer autorização explícita e verificação do `.git` aninhado.
10. Atualizar o mapa de módulos na baseline e retirar afirmações documentais que passaram a apontar para arquivos inexistentes.

## Critérios de aceitação

- [ ] Todo arquivo removido tem evidência de ausência de consumidor e build/testes posteriores.
- [ ] Não existem dois módulos produtivos decidindo a mesma geração, fit, layout, cor, persistência ou billing.
- [ ] Flags e comentários descrevem consumidores reais; placeholders históricos saem do runtime.
- [ ] Nenhum bundle gerado foi editado manualmente.
- [ ] O projeto constrói a partir das fontes após as remoções.
- [ ] O ledger do Next cobre ao menos medição, resolução, paleta, crítica/reparo e orquestração.
- [ ] `postspark-next/` não foi apagado sem autorização.
- [ ] Compatibilidade mantida possui versão suportada, teste e critério de retirada.
- [ ] `npm run check`, `npm test` e `npm run build` passam.

## Fora de escopo

- remoção automática do Next;
- limpeza estética de todos os arquivos;
- refatoração sem efeito sobre propriedade/autoridade;
- alteração de infraestrutura remota;
- edição de documentos históricos apenas para fazê-los parecer atuais.

## Conferência exigida

Conferência parcial focada em remoções, importações dinâmicas, build e invariantes. Se houver remoção material de contrato ou grande conjunto de arquivos, elevar para conferência total.
