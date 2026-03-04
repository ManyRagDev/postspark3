# Especificação Técnica: Mimetismo de Marca (Brand Soul) e Resolução de Fricções

## 1. Triagem e Delta Lógico

**Problema 1: Baixa Fidelidade ao Site de Origem (A "Alma" Ausente)**
- **Comportamento Atual:** A geração via URL cria layouts bacanas e com bom design genérico, mas que frequentemente parecem "templates prontos" genéricos, e não uma extensão orgânica e indissociável do site (uma "miniatura" do site).
- **Delta:** Precisamos transformar o LLM e o Pipeline de renderização em um "clonador de componentes". Quando a entrada é URL, a IA não deve criar um "post sobre o site", ela deve criar um "pedaço do site em formato de post". Isso exige injetar as cores extraídas, a vibe da tipografia e o estilo de layout *diretamente* nas restrições de geração, e usar o QA Step para reprovar ou refinar designs que não pareçam originários da marca extraída.

**Problema 2: Injeção de Formas Indesejadas (O Círculo Gigante)**
- **Comportamento Atual:** O `HoloDeck` renderiza posts que muitas vezes vêm dominados por um `borderRadius: "50%"` ou um shape circular indesejado.
- **Delta:** Restringir o componente `BrandOverlay.tsx` para não aplicar máscaras invasivas não solicitadas.

**Problema 3: Overflow e Invisibilidade no Aspect Ratio 9:16**
- **Comportamento Atual:** No `HoloDeck`, transbordamento e itens omitidos ao trocar para 9:16.
- **Delta:** Calibrar o scale do container de preview no `HoloDeck.tsx` para garantir visão plena em 1920px lógicos.

**Problema 4: Corrupção do State Sync (Holodeck → Workbench)**
- **Comportamento Atual:** Selecionar a variação no Holodeck perde dados ricos (textElements, slides) ao abrir o Workbench.
- **Delta:** Refatorar a passagem de estado em `Home.tsx` para usar Deep Clone estrito de todas as props da Variação.
