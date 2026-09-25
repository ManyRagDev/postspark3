# Backlog — imagens de fundo nas três variações

**Status:** adiado em 2026-09-25. Prioridade atual: qualidade visual e aderência semântica das imagens geradas manualmente no CanvasLab.

## Objetivo

Entregar as três variações do Studio já com uma imagem de fundo própria, visível na galeria e preservada ao abrir o editor. Para carrosséis, a definição inicial é uma imagem por variação, compartilhada pelos slides até que haja direção visual específica por slide.

## Trabalho previsto

1. Depois da aprovação das três variações, gerar uma imagem a partir do `imagePrompt` de cada uma, com limite de concorrência, timeout e tratamento explícito de falha.
2. Armazenar os arquivos e usar URLs duráveis no `CanvasPostModel`; não inserir DataURI bruto nos snapshots ou no JSONB.
3. Mapear a URL de cada imagem para o `bgImage` da variação e rever o comportamento de `StudioGalleryView` e `StudioMobileFlashcards`, que hoje removem fundos tanto na prévia quanto na seleção.
4. Preservar o fundo no salvamento e na reabertura do CanvasLab, mantendo o controle de overlay, enquadramento e substituição manual.
5. Definir custo em Sparks e política de cobrança/estorno para falhas parciais antes de ativar a geração automática. O preço atual de geração de imagem é 25 Sparks por imagem; nenhum novo preço foi aprovado.
6. Verificar legibilidade, alinhamento semântico com o post e aparência nas proporções 1:1, 5:6 e 9:16. A geração atual de imagem pede sempre um arquivo quadrado de 1080×1080.

## Pré-requisito

Melhorar e avaliar os prompts de imagem e o resultado do provedor. Automatizar três imagens com a qualidade atual ampliaria o problema relatado pelo usuário.

## Aceite futuro

- As três variações aparecem na galeria com fundos distintos e relacionados ao conteúdo de cada post.
- A variação escolhida abre no CanvasLab com o mesmo fundo, sem perda na edição, exportação ou reabertura.
- Falhas do provedor e custo em Sparks são informados sem cobrança por entrega incompleta, conforme política de produto definida antes da implementação.
