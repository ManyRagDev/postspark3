# Execução autônoma da reforma

**Finalidade:** permitir que um agente implemente a reforma inteira sem depender do contexto desta conversa.
**Regra central:** executar uma spec por vez, na ordem abaixo; não criar fases, rotas ou engines paralelos.

> **STATUS 2026-08-13:** implementação corretiva CR-001..CR-009 concluída (🟡 aguardando conferência independente). Veredito global permanece 🟡 PARCIAL — NÃO APROVADO PARA CUTOVER. Registro: [`CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md) (seção "Status de execução das correções") e [`conferencias/CR-001-009-PEDIDO-DE-CONFERENCIA-TOTAL.md`](./conferencias/CR-001-009-PEDIDO-DE-CONFERENCIA-TOTAL.md). Bloqueios que exigem o dono: aplicar `drizzle/0015_harden_manifest_corrective.sql`, julgamento visual das 12 famílias × 3 proporções, swap do `DOCUMENTO_MESTRE.md` (cópia byte a byte pronta em `legado/DOCUMENTO_MESTRE-LEGADO-2026-08-13-CR009.md`, SHA-256 `4c65074f7522af9843bb20ac903d83b94d22a8de4f6de5484a39f99295cb5c72`), limpeza dos posts de teste verify-e2e (~48–73), decisão sobre o design "next" de billing.

## Leitura obrigatória antes de começar

1. [`AGENTS.md`](../../AGENTS.md)
2. [`DOCUMENTO_MESTRE.md`](../../DOCUMENTO_MESTRE.md), como histórico e mapa de riscos
3. [`README.md`](./README.md)
4. [`BASELINE.md`](./BASELINE.md)
5. [`PLANO.md`](./PLANO.md)
6. a spec corrente

Se o código divergir da spec, o agente não deve forçar o código a caber no texto. Deve registrar o achado, corrigir a spec com a evidência encontrada e preservar a intenção da entrega.

## Fila fechada

| Ordem | Spec | Depende de | Estado inicial |
|---|---|---|---|
| 1 | [`SPEC-001 — autoridade tipográfica`](./SPEC-001-AUTORIDADE-TIPOGRAFICA.md) | nenhuma | 🟡 parcial — reaberta por CR-001/002/003 |
| 2 | [`SPEC-002 — resolvedor visual e cor`](./SPEC-002-RESOLVEDOR-VISUAL-E-COR.md) | SPEC-001 tecnicamente estável | 🟡 parcial — reaberta por CR-001/003 |
| 3 | [`SPEC-003 — geração única e latência`](./SPEC-003-GERACAO-UNICA-E-LATENCIA.md) | SPEC-001 e SPEC-002 estáveis | 🟡 parcial — reaberta por CR-004/005 |
| 4 | [`SPEC-004 — persistência, billing e infraestrutura`](./SPEC-004-PERSISTENCIA-BILLING-E-INFRAESTRUTURA.md) | contrato final da SPEC-003 | 🟡 parcial — reaberta por CR-005/006; ambiente remoto incompatível |
| 5 | [`SPEC-005 — consolidação e remoção de paralelos`](./SPEC-005-CONSOLIDACAO-E-REMOCAO-DE-PARALELOS.md) | SPEC-003 | 🟡 parcial — reaberta por CR-007 |
| 6 | [`SPEC-006 — aceite e corte documental`](./SPEC-006-ACEITE-E-CUTOVER-DOCUMENTAL.md) | todas as anteriores encerradas | 🟡 parcial — CR-008/009; cutover bloqueado |

O registro normativo da reabertura é [`CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md). O executor deve seguir a ordem CR-001 → CR-009 e emitir novo pedido de conferência para cada spec afetada; não criar SPEC-007.

Não existe uma sétima spec implícita. Novo escopo descoberto deve ser classificado como:

- necessário para cumprir uma aceitação existente: entra na spec corrente;
- regressão provocada pela implementação: corrige-se na spec corrente;
- problema preexistente independente: registra-se no inventário, sem desviar a entrega;
- decisão de produto, custo, produção ou ação destrutiva: depende do dono.

## Máquina de estado de cada spec

| Estado | Uso |
|---|---|
| ⬜ pronta | documentação existe, implementação não começou |
| 🟡 em implementação | há alterações locais ainda não encerradas |
| 🟡 parcial | existe resultado útil, mas um critério nomeado está bloqueado |
| 🔎 aguardando conferência | implementação e verificações do executor terminaram |
| ✅ integrada | conferência independente aprovou e o plano foi atualizado |
| ⛔ rejeitada | solução não deve entrar; motivo e reversão registrados |

O executor nunca muda o próprio trabalho diretamente para ✅.

## Ciclo obrigatório do agente executor

Para cada spec:

1. Registrar no cabeçalho `🟡 em implementação`, data e commit-base.
2. Inspecionar `git status` e preservar mudanças do usuário. Nunca restaurar, mover ou sobrescrever arquivos alheios para obter um diff limpo.
3. Revalidar os “fatos herdados” contra o código atual e o grafo/importações.
4. Listar os impactos além do arquivo óbvio: frontend, backend, snapshot, persistência, autenticação, billing, exportação e integrações.
5. Implementar na ordem contrato/tipos → núcleo → bordas → UI → testes.
6. Remover a autoridade substituída na mesma entrega. Compatibilidade legada pode ler versões antigas, mas não decidir novos documentos.
7. Executar todos os degraus de verificação exigidos pela spec e registrar saídas reais, inclusive falhas.
8. Atualizar [`BASELINE.md`](./BASELINE.md), [`PLANO.md`](./PLANO.md) e o documento-mestre quando houver mudança permanente.
9. Emitir um `PEDIDO DE CONFERÊNCIA` com afirmações falsificáveis, comandos de rederivação, contagem de testes antes/depois e desconfianças do executor.
10. Marcar `🔎 aguardando conferência`. Só após veredito externo, registrar ✅ e iniciar a próxima spec.

## Quando continuar e quando parar

O agente pode tomar decisões técnicas reversíveis já limitadas pelas specs. Não precisa pedir autorização para refatorar o código local, criar testes ou atualizar documentos dentro desse escopo.

Deve parar antes de:

- deploy, push, publicação ou alteração de produção;
- aplicar migrations em banco hospedado;
- realizar cobrança real ou usar Stripe fora de test mode;
- apagar o repositório aninhado `postspark-next/`;
- excluir dados, buckets, tabelas ou secrets;
- escolher gosto visual/brand quando duas opções tecnicamente válidas permanecem;
- ampliar o produto além das specs.

Se faltar credencial para uma verificação externa, o agente implementa o verificador, executa os degraus locais, marca a spec como `🟡 parcial — verificação remota pendente` e pode seguir apenas para uma spec que não dependa daquele fato. Não narra ambiente remoto como verificado.

## Verificação comum a todas as specs

No mínimo:

```powershell
npm run check
npm test
```

Mudança visual também exige harness completo e verificação renderizada. Mudança de geração exige testes com provider falso, contagem de chamadas e ao menos uma execução real verificável quando houver credenciais/autorização. Mudança de persistência exige relatório derivado do banco real; arquivos SQL locais não bastam.

## Formato mínimo do pedido de conferência

Criar `docs/reforma/conferencias/SPEC-NNN-PEDIDO.md` com:

- objetivo em até cinco linhas;
- commit/diff e arquivos tocados;
- contagem de testes antes e depois;
- tabela “afirmo que / como rederivar / evidência anexada”;
- exclusões declaradas;
- onde o executor desconfia do próprio trabalho;
- degraus de verificação cumpridos e pendentes.

Não copiar o relatório de implementação como se fosse prova.
