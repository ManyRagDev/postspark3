# Jornada local do editor avançado

```bash
PHOTOCRAFT_BIN=/caminho/photocraft-cli node --import tsx harness/advancedImageEditor/serve.ts
```

Abrir `http://127.0.0.1:5189/harness/advancedImageEditor/index.html`.
Usa a página e o Stage reais do CanvasLab, o router real de edição (mesmos
schemas/auth boundary/publicação), o adaptador Node e o executável real.
A identidade do contexto é uma fixture, e o Storage é substituído por arquivos
privados em `/tmp/postspark-image-editor-browser/media`. Nenhuma sessão, bucket,
post, cobrança ou provedor hospedado é alterado. Não usar este servidor como
aplicação pública; bind apenas em loopback.

A peça possui dois slides com a mesma imagem. Alterar somente uma instância,
gerar prévia, aplicar, desfazer uma vez e refazer. Salvar e usar “Reabrir salvo”
confere o save adapter e o arquivo persistido. Reabrir o editor permite restaurar
o original. No celular, criar máscara e conferir controles/overflow. Cancelar
prévia não pode criar passo de histórico. Crop e pontos devem acompanhar os
pixels da imagem mesmo com letterboxing. Baixar o slide confere o exportador.

O harness captura apenas downloads PNG em `/capture.png`, sem depender do
evento de download do navegador. O arquivo real é guardado em
`/tmp/postspark-image-editor-browser/export.png`. O registro salvo fica em
`saved.json`. Essa captura é restrita ao teste, não altera o exportador do produto.

Conferência de 14/11/2026: comparação e aplicação, original após save/reopen,
um undo/redo, cancelamento, máscara com coordenadas editáveis no viewport
390×844 sem overflow horizontal e exportação 3840×3840 passaram. A inspeção
do arquivo confirmou alpha do asset, posição fracionária e segundo slide
inalterados. A prova de precisão por clique correspondeu a aproximadamente
25%/75% da imagem renderizada apesar da margem do SVG. Viewport temporário
restaurado ao concluir a conferência.

Esses resultados não certificam login real, Storage/Supabase hospedado,
isolamento de contas por HTTP na aplicação publicada, nem aparelho móvel físico.


## Editor unificado (17/11/2026)

O harness oferece os grupos núcleo/acabamentos via capabilities. Para rodar com
CLI real, definir `PHOTOCRAFT_BIN`, `ADVANCED_IMAGE_CORE_ENABLED=true` e
`ADVANCED_IMAGE_FINISHING_ENABLED=true`. Iris permanece desabilitado. O override
de download captura somente PNG/ZIP gerados para esta fixture em
`/tmp/postspark-image-editor-browser/export.png` e `export.zip`. Isso permite
conferir pixels e múltiplos slides sem depender do gerenciador de downloads do
navegador. A captura não faz parte do produto. Usar “Reabrir salvo” para a jornada
de persistência da fixture; identidade e Storage são substitutos locais,
enquanto CanvasLab, API de edição, CLI e exportadores são reais.
