# Tarefas de Integração: Railway Screenshot Service

- [ ] `atualizar_env`: Alterar os arquivos `.env` e `.env.example` para incluir a constante `SCREENSHOT_SERVICE_URL`, chave necessária para o roteamento do fetch da captura.
- [ ] `remover_arquivo_antigo`: Deletar `lib/screenshot.ts` da raiz do projeto para remover a sujeira ligada à arquitetura Next.js desnecessária.
- [ ] `modificar_screenshot_service`: Editar `server/screenshotService.ts` refatorando a função exportada `captureScreenshot` utilizando `fetch` para disparar um request POST à variável do `.env`, injetando payload JSON dinâmico contendo resolução desktop/mobile e retornando um Buffer para a variável local.
- [ ] `adicionar_rota_express`: Modificar o entrypoint backend `server/_core/index.ts`, anexando a rota REST POST paralela em `/api/extract` extraindo requisição body, orquestrando Promisses para desktop/mobile e finalizando com devolução do payload formatado com tamanho da imagem em strings base.
