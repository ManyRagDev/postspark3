# Correções da geração orquestrada — 2026-10-08

Plano executado a partir dos achados R01–R08 de `conferencia-implementacao-geracao-orquestrada-2026-10-08.md` e do blueprint. O registro da conferência anterior descreve o estado anterior às correções, não deve ser usado como fotografia do código atual.

## Escopo e implantação

O código agora contém um piloto V5 integrado ao Studio e um executor Node recuperável com LangGraph TypeScript. A ativação padrão permanece `off`. `GENERATION_V5_MODE=dev` habilita somente contas cujo perfil de billing é DEV, com opt-in no Studio, migration instalada e heartbeat recente do executor. Desabilitar o piloto impede novas admissões; leitura e cancelamento dos pedidos existentes continuam autenticados.

Não foi escolhido preço novo, nem implementada liquidação comercial parcial. O banco fixa `billing_mode=dev_pilot`, e a API recusa planos pagos nesse caminho. Billing V4 e geração manual de imagens conservam seus contratos. Essa restrição é deliberada: não se pode declarar encerrado o gate comercial da fase 2 do blueprint enquanto tarifa, reserva/liquidação por proposta e hospedagem produtiva não forem definidos e validados. DEV não consome Sparks, mas chamadas reais de modelo continuam tendo custo externo.

A migration `drizzle/0034_orchestrated_generation.sql` e a corretiva `drizzle/0035_generation_lease_conflict.sql` foram aplicadas ao Supabase `spbuwcwmxlycchuwhfir` em 2026-10-08, após testes PostgreSQL locais. O histórico, RLS, permissões e oito RPCs foram conferidos remotamente; evidências em `artifacts/verification/v5-migrations-2026-10-08/`. O processo recuperável é `pnpm generation:worker`; não é iniciado por handlers HTTP nem por promessa após a resposta serverless. No desenvolvimento local, `pnpm dev` inicia esse executor como filho separado após o bind quando o modo V5 está dev; produção continua exigindo hospedagem própria do processo.

## Correções por achado

| Achado | Implementação e evidência local |
| --- | --- |
| R01 — integração ausente | `generation.capabilities/start/get/cancel`, piloto escolhido antes da admissão, polling autenticado e materialização individual na galeria. Entregas tardias não substituem o documento aberto. |
| R02 — runtime/entrega | Requests, leases, prepared state e journal em Postgres; idempotência por proprietário/payload; fencing; ready imutável; grants e projeção do histórico na mesma transação. Limites de 2 pedidos ativos por proprietário, 3 leases globais, 3 propostas por pedido e prazo total de 10 minutos. Start duplicado na instância compartilha a mesma execução. Operações pagas ambíguas não são repetidas. A liquidação paga segue bloqueada. |
| R03 — sucesso vazio | Materialização retorna posts e falhas por slot. Zero não anuncia sucesso; parcial informa quantidade real. Recuperação utiliza a resposta já entregue, em criação, gerar mais e histórico. URLs permanecem URLs ao gerar mais. |
| R04 — ready inválido | União discriminada, bundle canônico obrigatório em ready, identidade vinculada a run/trace/slot e preferências normalizadas pelo schema compartilhado. |
| R05 — medição fictícia | Fontkit com bytes/hashes de fontes conferidos; carga e prova tipográfica antes da copy, preflight de geometria após copy e antes de imagens. Sem medidor aproximado como default produtivo. |
| R06 — veto por incerteza | Contraste raster desconhecido e sobreposição autorada de texto/foto são diagnósticos sem veto. Defeitos técnicos comprovados permanecem bloqueantes. Não há crítico estético nem regeneração corretiva rotineira. |
| R07 — mídia | Owner obrigatório, asset privado persistido, proporção derivada do slot, contexto estruturado e referências reais. Imagem, referência de marca e logo passam por preflight de acesso, bytes, MIME e tamanho antes da admissão. URLs externas não são buscadas. Strict usa somente capability verificada e não cai silenciosamente em Pollinations. A rota manual permanece separada. |
| R08 — contexto/controles | Preparação de URL/site autorizado, preferências, seleção de composições inteiras pinadas, briefing de execução, literalidade, fontes/fatos, capacidade/cardinalidade e carrossel por família. Schema compartilhado permite até 10 slides, eliminando a truncagem anterior em 5 do briefing. |

## Retomada e prontidão

A execução LangGraph distribui as três propostas em paralelo. Cada proposta percorre preparação/copy/mídia/conferência separadamente; uma falha em B não veta A. As transições, resultados externos e prepared state ficam no store de domínio Postgres. Não se utiliza MemorySaver como persistência de produção, nem se atribui exatamente-uma-vez ao provedor externo. Um novo processo recompõe a execução usando os checkpoints de negócio e resultados gravados. O prazo e o token de lease limitam o executor antigo.

O journal grava a intenção antes do efeito. Copy, seleção e imagem já concluídas são reutilizadas; uma operação interrompida ou incerta exige reconciliação e não dispara gasto novo. Somente leituras não pagas de contexto, preferências, cartões e definições têm replay seguro permitido pelo banco. Cancelamento e deadline abortam os transportes quando suportado; uma resposta perdida não permite garantir cancelamento do processamento no provedor. Assets privados content-addressed podem permanecer sem uso após cancelamento.

O grafo produz um bundle validado internamente. A API só expõe ready após o RPC conferir elegibilidade atual, identidade/hash e manifests e conceder os assets ao proprietário. Falha transitória de entrega permanece pendente e retoma sem nova copy/imagem, dentro do prazo. Falha estrutural de elegibilidade encerra a proposta. Ready já entregue é preservado na expiração, no cancelamento e na falha de outras propostas.

Uma resposta perdida após commit é reconciliada por leitura do bundle exato já confirmado; não transforma uma entrega pronta em falha nem encerra propostas irmãs. Falhas de checkpoint são isoladas por proposta. Deadline durante uma chamada é classificado como `expired`, cancelamento do usuário como `cancelled`; a expiração de um pedido com entrega confirmada mantém o resultado agregado parcial. Sem entregas, cancelamento permanece cancelamento também na UI.

O cliente conserva payload e chave de uma admissão sem confirmação para tentar o mesmo pedido. O ownerId acompanha esse payload e é conferido também na API e na admissão SQL; troca de conta não reenvia o briefing pendente do usuário anterior. Respostas antigas de admissão ou materialização não substituem o pedido atual. O polling devolve apenas o contexto textual necessário para restauração, sem reenviar referências em base64 ou chaves de transporte. Diversidade de famílias orienta a seleção; não constitui veto técnico entre propostas válidas.

## Preservação

CanvasPostModel, CanvasLab, comandos, rich text, camadas, fontes/cores nativas, histórico de edição, persistência em canvas_model e exportação continuam sendo os documentos e mecanismos existentes. O Studio conserva o mapa de IDs salvos por documento. Nenhuma entrega de fundo altera o editor aberto. Histórico, preferência explícita e relatório de compilação aceitam bundles completos entregues por slot, inclusive parcialmente, sem presumir lote completed.

## Verificação e pendências

Testes sem chamadas pagas cobrem contratos canônicos, fontes/overflow, literalidade, carrossel, slot/referências/owner, API, independente entrega A/B, retomada sem duplicar copy, operação ambígua, grants/eligibilidade, RLS, leases, limites, cancelamento e expiração. As evidências de execução estão em `artifacts/verification/v5-corrections-2026-10-08/`.

As migrations remotas foram aplicadas em rodada posterior à conferência local. Depois, o piloto foi habilitado no `.env` local e pela flag do Studio, com heartbeat e reload do executor conferidos. Não houve deploy, benchmark visual pago ou certificação estética de novas imagens. A produção pública depende das decisões comerciais e operacionais acima. A qualidade estética continua sendo decisão do usuário; os testes verificam integridade técnica e preservação funcional.

A validação pela API encontrou retries indefinidos nos guards de lease que lançavam SQLSTATE `40001`. A 0035 troca somente esses três guards por `PT409`/HTTP 409, preservando regras de negócio, assinaturas, owner, ACLs e `SECURITY DEFINER` com search_path vazio. As oito RPCs responderam como esperado após a correção; o papel anônimo continuou bloqueado. Nove testes PGlite passaram com ambas as migrations. Ver §13.75 do documento-mestre.

A ativação local distingue `selectable` de `enabled` na API de capabilities: a conta DEV pode selecionar o V5 enquanto o executor inicia, mas a admissão continua exigindo heartbeat. O Studio atualiza disponibilidade automaticamente. Trinta testes focados, typecheck e verificação no navegador confirmaram flag selecionável, executor disponível e substituição sem duplicação após reload. Ver §13.76 e `artifacts/verification/v5-activation-2026-10-08/`.


### Resultado final local

- `pnpm test`: **139 arquivos / 1.384 testes passaram** (inclui 9 testes transacionais em PostgreSQL via PGlite).
- `pnpm check`: passou.
- Vite (cliente) e esbuild (servidor + executor): passaram; saídas em `/tmp/postspark-v5-corrections/`, sem modificar artefatos gerados versionados. Vite mantém aviso de tamanho de chunk, sem falha de build.
- Testes montados do Studio e histórico verificam entrega independente, resposta antiga, cancelamento, retomada/recuperação e preservação de edição. Provedores e filhos visuais estão isolados; não são uma validação visual completa de navegador.
- Documento-mestre (§13.74), blueprint (§20) e checklist foram atualizados. As ressalvas comerciais/operacionais não foram marcadas como concluídas.
