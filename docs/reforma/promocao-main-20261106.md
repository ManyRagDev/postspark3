# PostSpark — versão aprovada para main em 2026-11-06

O proprietário encerrou os testes e aprovou o estado de `codex/acervo-82` como a versão principal do PostSpark. Esta entrega promove o código testado para `main`, preservando o histórico por fast-forward.

## Referência de aceite

A geração da Livraria Entrelinhas teve três propostas explicitamente aprovadas pelo usuário como publicáveis sem ajustes, com diversidade, copy, diagramação e espaçamento satisfatórios. Ver [registro e captura](./referencias-aprovadas/entrelinhas-20261106/README.md).

O aceite do produto não transforma toda verificação simulada em prova de execução externa. Em particular, o ensaio pago separado de correção visual da Miolo não foi executado nesta promoção.

## Verificação da integração

- TypeScript: `pnpm exec tsc --noEmit --incremental false`, aprovado.
- 232 testes em 14 arquivos, aprovados com bloqueio de rede: correção visual, recuperação de propostas, runtime, flexibilidade de texto, busca semântica, roteamento, geração no Studio, adaptação de persistência e histórico.
- Frontend: compilação Vite aprovada, com aviso de tamanho de bundle.
- Backend: compilação esbuild aprovada.
- Os builds foram gravados em `/tmp/postspark-main-promotion-build`, sem substituir artefatos gerados versionados.
- Nenhuma chamada paga foi necessária para estas verificações.

## Preservação e operação

O estado anterior da main foi preservado antes da integração: branch local `codex/backup-main-before-promotion-20261106`, stash protegido por `refs/backups/main-local-before-promotion-20261106` e cópia dos arquivos com hashes em `.postspark-local/promotion-20261106` no diretório principal. A recuperação é local e não foi enviada ao remoto.

A worktree, seu ambiente em 3182, seu banco local e seus assets permanecem preservados. Credenciais, configurações locais e logs novos de execução não fazem parte do commit de promoção. Alterações antigas da main ficaram no ponto de recuperação, sem serem reaplicadas sobre a versão aprovada.

Promover o código não migra o catálogo, as configurações de modelos, as migrações pendentes, os assets ou os dados do Supabase para outro ambiente. Esta entrega não executa migrações remotas nem certifica a implantação hospedada. Os registros anteriores de preparação local continuam sendo evidência histórica; a decisão atual estabelece esta implementação como a base principal para novos desenvolvimentos.
