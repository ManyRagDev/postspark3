# Reforma do PostSpark — índice e regra de leitura

**Status:** 🟡 reforma implementada parcialmente; cutover bloqueado pela conferência global de 2026-08-12
**Data de corte:** 2026-08-10
**Código observado:** `f402518`, com alterações locais ainda não consolidadas

## Para que esta pasta existe

Esta pasta inicia uma documentação nova para a reforma do PostSpark. A base do produto continua sendo o **PostSpark 3**. O diretório `postspark-next/` é uma fonte de componentes e ideias que podem ser absorvidos seletivamente; ele não é a nova fundação do produto nem um segundo runtime a ser mantido.

O objetivo é reduzir a distância entre decisão e implementação. A documentação operacional é finita:

1. [`BASELINE.md`](./BASELINE.md): o que está confirmado no código atual, o que é inferência e o que ainda depende de ambiente.
2. [`PLANO.md`](./PLANO.md): pontas soltas, ordem de ataque e protocolo mínimo de execução.
3. [`EXECUCAO-AUTONOMA.md`](./EXECUCAO-AUTONOMA.md): fila, estados, autonomia e limites do agente executor.
4. Seis specs implementadas e reabertas pela conferência global, da autoridade tipográfica ao aceite final:
   - [`SPEC-001 — autoridade tipográfica`](./SPEC-001-AUTORIDADE-TIPOGRAFICA.md)
   - [`SPEC-002 — resolvedor visual e cor`](./SPEC-002-RESOLVEDOR-VISUAL-E-COR.md)
   - [`SPEC-003 — geração única e latência`](./SPEC-003-GERACAO-UNICA-E-LATENCIA.md)
   - [`SPEC-004 — persistência, billing e infraestrutura`](./SPEC-004-PERSISTENCIA-BILLING-E-INFRAESTRUTURA.md)
   - [`SPEC-005 — consolidação e remoção de paralelos`](./SPEC-005-CONSOLIDACAO-E-REMOCAO-DE-PARALELOS.md)
   - [`SPEC-006 — aceite e corte documental`](./SPEC-006-ACEITE-E-CUTOVER-DOCUMENTAL.md)
5. [`CONFERÊNCIA GLOBAL E CORREÇÕES OBRIGATÓRIAS`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md): veredito independente, bloqueios P0/P1 e prova exigida para reabrir cada spec.

## Ordem de autoridade

Quando houver divergência, usar esta ordem:

1. comportamento verificado no runtime ou em serviço externo;
2. código ativo e seus contratos;
3. testes e harnesses executados no mesmo estado do código;
4. a baseline desta pasta;
5. documentos anteriores, como registro histórico e fonte de riscos conhecidos.

Documentação não transforma hipótese em fato. Nome de arquivo, comentário, migration local ou plano antigo não prova que algo está ativo em produção.

## Relação com o documento-mestre anterior

[`DOCUMENTO_MESTRE.md`](../../DOCUMENTO_MESTRE.md) não foi descartado: contém contexto, decisões e cicatrizes úteis. Entretanto, ele cresceu por acúmulo cronológico e está atualmente modificado no worktree. Por isso, esta primeira entrega não o reescreve nem tenta reconciliar milhares de linhas de uma vez.

Durante a transição:

- o documento-mestre anterior serve como histórico e alerta de riscos;
- esta pasta governa a reforma apenas nos pontos que ela verificou no código;
- uma afirmação ausente daqui não deve ser interpretada como revogada;
- o corte definitivo do documento-mestre só ocorre na SPEC-006, depois das entregas técnicas e conferências previstas.

## Regra de manutenção

Cada entrega mantém somente:

- uma spec ativa;
- evidências proporcionais ao risco;
- uma decisão de encerramento: **integrada**, **parcial** ou **rejeitada**;
- atualização da baseline apenas quando o código ou a infraestrutura confirmarem um novo fato permanente.

Não serão criadas novas taxonomias de fases para substituir as antigas. A unidade de trabalho é uma entrega objetiva, vertical e verificável. As seis specs fecham o programa conhecido; descoberta nova não cria automaticamente outra fase.
