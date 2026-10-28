# Captura de sites na mesma máquina AWS

O serviço em `server/capture/` substitui o microserviço antigo da Railway. Mantém
captura desktop/mobile, lote de até cinco páginas, recortes por seletor e
descoberta de links. A API e o executor usam `server/screenshotService.ts`.
O endpoint de produção é `https://capture.postspark.com.br`; o DNS aponta para o
IP estático `18.189.144.221` da instância existente. Caddy mantém HTTPS com os
certificados persistidos nos volumes próprios. O segredo não aparece na URL.

Este procedimento não cria outra máquina. Confira primeiro o uso da instância
`postspark-worker-prod` em `us-east-2` e o plano/créditos AWS. O limite do capturador
é 512 MiB, com um contexto Chromium ativo e espera limitada pelo prazo de cada
requisição. Lotes cedem a vez entre páginas. Valide a convivência com o renderer
antes de aumentar carga; os testes locais não comprovam a capacidade do servidor.

## Rede e credenciais

- O capturador não recebe configuração do banco, chaves de IA ou credenciais AWS.
- `SCREENSHOT_SERVICE_TOKEN` é obrigatório (pelo menos 32 bytes). A primeira
  ativação gera o segredo em `/opt/postspark-capture/shared/capture.env`, com
  permissão 0600, fora do Git/imagem. Compartilhe somente esse segredo com a
  API da Vercel e o executor que chamarão o capturador.
- As capturas exigem `Authorization: Bearer ...`. `/health` é somente diagnóstico.
- Antes de qualquer socket HTTP, cada endereço é validado pelo módulo existente
  `publicUrl` e fixado no lookup da conexão, evitando troca de DNS após validação.
  Redirecionamentos e recursos de imagens, frames, scripts, fontes e CSS passam
  pela mesma verificação. Service workers e WebSockets são bloqueados. O navegador
  não encaminha o token de serviço para os sites visitados.
- A navegação é de leitura: GET, portas web 80/443, sem downloads nem streams de
  mídia. Sites que dependam de POST, WebSockets, autenticação ou desafios contra
  robôs podem não ser capturados. A extração HTML/CSS do PostSpark continua sendo
  a alternativa existente quando a captura falha.

## Construção e teste

O procedimento automatizado empacota somente a fonte necessária, verifica SHA256,
constrói a imagem e testa a API real antes de permitir ativação:

```sh
python3 ops/aws/deploy-capture.py --base-image postspark-worker:REVISAO_VERIFICADA
python3 ops/aws/deploy-capture.py --base-image postspark-worker:REVISAO_VERIFICADA --activate
```

O cliente de teste roda em outro container, para não compartilhar o limite de
memória do serviço. Os arquivos públicos de prova usam uma pasta própria;
credenciais e configurações do banco não participam do teste. A ativação preserva
o token, a configuração HTTPS e os volumes de certificados existentes.

Use uma revisão de imagem do executor já verificada como base. Os arquivos
copiados ao contexto devem conter somente `server/capture/` e
`ops/aws/capture-probe.ts`, sem arquivos de ambiente.

```sh
docker build -f ops/aws/Dockerfile.capture \
  --build-arg POSTSPARK_WORKER_BASE=postspark-worker:REVISAO_VERIFICADA \
  -t postspark-capture:REVISAO .
```

Copie `compose.capture.yml` para a pasta da revisão. Defina
`POSTSPARK_CAPTURE_IMAGE=postspark-capture:REVISAO` em um arquivo operacional
separado e execute Compose com esse `--env-file`. O compose base publica somente
`127.0.0.1:3001`; ainda não expõe o serviço na Internet.

```sh
docker compose --env-file current.env -f compose.capture.yml up -d --wait
docker compose --env-file current.env -f compose.capture.yml exec -T capture \
  node -e "fetch('http://127.0.0.1:3000/health').then(async r=>console.log(await r.json()))"
```

O probe do procedimento automatizado usa a página pública do PostSpark e a API real: verifica PNG desktop/mobile, lote,
recorte, descoberta, rejeição de chamada sem token e bloqueio do metadata AWS.
Não chama IA, banco, cobrança nem gera posts. Confira também o PNG produzido em
`/opt/postspark-capture/proofs/desktop.png`, o consumo conjunto de memória, os logs e a
continuidade do heartbeat do executor.

## Conectar produção

1. Reserve e associe um endereço estável ao servidor; confira a cobertura/custo
   antes de reservar. Crie somente um novo subdomínio no DNS, sem alterar as
   entradas do aplicativo. Aponte-o para o endereço confirmado da instância.
2. Use `compose.capture.public.yml` junto do compose base e `Caddyfile.capture`.
   Defina `POSTSPARK_CADDY_IMAGE` com uma imagem oficial verificada e
   `POSTSPARK_CAPTURE_HOST` com o subdomínio. Libere somente HTTP/HTTPS adicionais
   no firewall Lightsail, preservando a restrição de origem do SSH.
3. Confira HTTPS válido e captura autenticada pelo endereço público antes de
   configurar consumidores. Não envie o segredo por HTTP público.
4. Na Vercel e no arquivo privado do executor, configure:
   `SCREENSHOT_SERVICE_URL=https://SUBDOMINIO`, `SCREENSHOT_SERVICE_TOKEN` e
   `SCREENSHOT_PUBLIC_NETWORK_ONLY=true`. A API e a imagem do executor precisam
   incluir a atualização de `screenshotService.ts` que envia o token.
5. Publique os consumidores e teste a captura de um site no PostSpark autenticado.
   Uma captura sintética ou `/health` não comprova o fluxo completo de marca.

Uma troca de host exige conferir DNS, firewall, certificados e cada consumidor.
O procedimento não cria outra máquina nem faz upgrade do plano AWS. A presença
da imagem ou um health check sozinho não comprovam o fluxo completo no aplicativo.
