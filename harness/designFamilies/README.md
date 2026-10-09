# Conversão das famílias originais

Executar a partir da raiz:

```sh
node --import tsx harness/designFamilies/run.ts
```

O comando faz uma cópia datada dos arquivos que definem as famílias, incluindo fontes,
regras originais e o Stage atual, com SHA-256 por arquivo e ZIP. Não altera os presets,
não acessa a rede, não escreve no banco e não publica receitas.

Depois chama os 12 compositores originais com seed explícita em 1:1, 5:6 e 9:16.
Materializa 36 receitas Admin2 V3 com fontes incorporadas, grupos, campos e mídia
substituível. `baselines/` preserva o input/output completo da composição original;
`provenance/` registra versões, hashes, adaptações e duração. Nenhum dado fictício
do exemplo deve ser tratado como estatística real.

`index.html` reúne essas famílias, as 24 referências curadas e nove combinações do
ensaio. As receitas anteriores são copiadas byte a byte, com prévias existentes.
`recipes/` e `receitas.zip` são importáveis no Admin2. `pieces/` é um inventário
offline dos grupos; não é um novo contrato do editor nem um solver de compatibilidade.

A referência da conversão é `shared/creative/families.ts`, que difere do Stage atual.
As paletas de demonstração são as do editor; fontes e composição vêm do compositor.
V3 não representa blur, filtros fotográficos ou vínculos automáticos entre cópias de
texto: as aproximações estão declaradas na galeria. Os originais continuam intactos.
Não há mudança no encaixe atual do Admin2, `post.generate`, autenticação ou billing.

O gerador materializa previews com Konva nativo e o medidor `layoutRichText` usado
no CanvasLab. Isso não comprova o fluxo React/IndexedDB no navegador. Este comando
produz os artefatos; não executa uma suíte de testes.

Cada execução cria um novo diretório. Uma falha deixa backup e staging para diagnóstico,
sem substituir a coleção anterior. Os artefatos locais estão em diretório ignorado pelo Git;
o ZIP de backup deve ser copiado para armazenamento próprio se for necessário preservar
contra perda do disco. Restauração é seletiva, após comparação, nunca um reset automático.
