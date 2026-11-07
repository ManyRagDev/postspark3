# Rodada limitada a US$ 1 — 2026-11-06

## Resultado e critério de parada

Uma rodada real do mesmo pedido da cafeteria Lume produziu um post conferido sem defeitos observados: slot 1, família `acervo82-concept-21`, arte roxa. O Studio salvou uma edição de pontuação como post 152, reabriu o documento e exportou PNG 4K. A composição permaneceu idêntica; as únicas diferenças no documento bruto foram normalização de `step` e remoção de `logoUrl` vazio. Não houve erro de JavaScript na jornada.

Pedido: `fef29fb7-fd9f-4a90-98b6-5fd9990f8699`. Estado final: `partial`; slot 0 failed, slots 1 e 2 ready. Duração de geração: aproximadamente 27,24 s. O critério solicitado de obter um post sem erros observados foi atingido com slot 1; não foi iniciada outra rodada paga.

## Custo real

Limite independente desta tarefa: US$ 1. Foram oito chamadas, todas HTTP 200 com custo informado: intenção DeepSeek, JEV, três redações Haiku, um reparo DeepSeek e duas revisões Haiku. Total confirmado: US$ 0,0030116232. Não houve custo desconhecido ou reserva em aberto. Esta rodada não precisou gerar uma fotografia: a proposta que a usaria falhou antes dessa etapa. Portanto o novo limite de 4.096 tokens de imagem tem testes locais de transporte, mas não foi exercitado em geração paga neste ensaio.

O ledger mantém reservas conservadoras antes de cada chamada. Testes anteriores do usuário não pertencem a este novo teto. Consultas de tarifas e verificações de banco/navegador não fizeram chamadas de geração de IA.

## Causas e alterações

A tentativa original `278a1539-446a-42b1-abb8-927b1c9852fe` chegou a renderizar duas propostas, mas a Anthropic rejeitou o schema de revisão antes de julgá-las. A terceira excedeu a caixa `reveal-text` mesmo após reparo: os textos retornados ficaram maiores. Foi encontrado também desacordo entre a altura usada para reduzir a fonte e a altura auditada posteriormente.

Implementado protocolo automático 4 por exceções: schema de 5.981 para 1.256 bytes; 9 para 1 união; briefing positivo compartilhado entre A/B/reparo; cenas propostas pela IA identificadas como sugestões; guia operacional genérico removido do novo review. O recibo é próprio, sem fabricar auditorias positivas antigas. Falhas técnicas não se tornam aprovação. O journal reconhece uma rejeição conhecida do provider antes de exigir metadados de uma resposta bem-sucedida.

Geometria adaptativa agora respeita a caixa efetivamente auditada durante o ajuste de fonte. Expansões seguras continuam separadas; não foram removidos os vetos técnicos para texto que realmente excede o espaço.

A migração 0061 foi aplicada somente ao Supabase local; hashes preservaram 52 pedidos, 52 runs e 151 posts existentes. Readiness é restrita a service_role e checada antes da admissão. Main e porta 3000 permaneceram intactas.

## Limitações observadas nesta própria rodada

- Slot 0: overflow em `text-11-0` persistiu após o reparo. Nenhuma arte dessa proposta foi declarada pronta.
- Slot 1: arte roxa (`acervo82-concept-21`), salva como post 152, sem identificador inventado, sem corte visível e sem achados técnicos bloqueantes; usada para comprovar o critério de sucesso.
- Slot 2: arte clara (`acervo82-concept-02`), retornou ready e foi salva no ensaio de UI como post 153, mas a conferência visual encontrou `@lumecafeteria` sem suporte no pedido/fontes. O modelo revisor não o identificou. Não usamos essa peça como evidência de post sem erro.

O verificador de recibos aprovou 49 verificações de integridade, não uma certificação de verdade editorial. O falso aceite do arroba exemplifica essa distinção. Três propostas corretas por pedido continuam não demonstradas.

## Verificação

TypeScript completo sem cache passou. Testes focados: 65 de base editorial/criação/imagem; 28 de geometria/recuperação; 30 PostgreSQL; 49 store/router; 14 planejamento. O lote de revisão/evidência teve 149 passados e 1 opt-in pulado; há sobreposição entre lotes, portanto não se somam estes números. A prova decisiva foi a chamada real, sua entrega persistida e a jornada no navegador.

Evidências estão em `artifacts/acervo82/full/sessions/review-exceptions-dollar-goal-20261106/`: ledger, recibos, payloads reais sem headers de autenticação, snapshot, resultado de integridade, imagens renderizadas, provas do navegador e exportações. `round-1/browser.json` identifica post 152 e reabertura; `round-1/browser-export.png` é a arte roxa exportada. A subpasta `round-1/slot-2/` corresponde à arte clara/post 153, que não atende ao critério factual. As imagens `generated-1.png` e `generated-2.png` são capturas exatas enviadas ao revisor, antes da edição de pontuação da jornada.

Correção da associação das evidências: os nomes `generated-1.png` e `generated-2.png` seguem a ordem de extração dos recibos, não o índice de slot. A primeira imagem é a clara (slot 2); a segunda é a roxa (slot 1). A identidade foi conferida com o conteúdo da composição, a família e o post persistido. `final-check.json` confirma por leitura após a restauração do servidor o post 152, o hash do PNG e a preservação do ledger sem chamadas adicionais.
