# Regras de Ouro e Limites Técnicos (Rules)

Estas regras são imutáveis e devem reger todas as implementações, correções de bugs, refatorações e geração de código no PostSpark.

## 0. Idioma

- **Sempre responda em português brasileiro:**: Todas as resposta, seja no chat, seja em planejamento ou plano de implementação, devem ser em português brasileiro.

## 1. Integridade Absoluta: HoloDeck <-> Workbench
O post que chega e é renderizado no **Workbench** não pode, sob **nenhuma circunstância**, ser visualmente ou estruturalmente diferente do post gerado e aprovado no **HoloDeck**. 
- Exige-se a utilização de mecanismos rígidos (deep clone robusto, tipagem estrita no Zod e imutabilidade de referência) para garantir 100% de paridade na passagem desse estado. Qualquer discrepância nesse fluxo é tratada como um *bug crítico*.

## 2. UI com Propósito (Sem Elementos Zumbis)
A interface deve ser intencional. Não podemos ter botões, menus, painéis ou componentes de opção sem um propósito funcional claro e conectado à lógica.
- Se um elemento não tem função imediata, ele **não deve existir** visualmente.
- Se ele estiver desenhado na UI, a interatividade/função deve ser obrigatoriamente criada.
- Agentes de IA e desenvolvedores devem sempre questionar proativamente a existência de UIs mortas ou ociosas.

## 3. Editores Livres (O Direito à Manipulação)
As restrições de canvas não devem ditar as escolhas criativas do usuário. O ecossistema de edição do PostSpark favorece a liberdade.
- Bloqueios arbitrários de drag-and-drop ou amarras dimensionais que proíbem o usuário de tentar um layout inusitado (como sobrepor itens) são desencorajados.
- Todo recurso de edição "livre" deve ser suportado nos bastidores por sistemas seguros que permitam desfazer ou reverter para a sugestão inteligente da IA.

## 4. Qualidade e Robustez High-Ticket
Sendo um produto de alto valor agregado voltado para grandes agências, a complacência com "pequenos bugs visuais" é zero.
- Todo elemento injetado, da tipografia à grade do Architect, requer validações minuciosas.
- A estabilidade e a responsividade do código são a espinha dorsal: testes cuidadosos de regressão e garantia estrutural são preferíveis à entrega apressada que comprometa a confiança do usuário *enterprise*.

## 5. Mobile-First Inegociável (Regra do Toque)
Qualquer nova UI interativa deve prever uso por toque (touch). 
- Isso significa alvos de clique mínimos de 44x44px.
- Uso de Sheet Modals (gavetas inferiores) em vez de modais de centro de tela no mobile.
- Prevenção estrita de conflitos de scroll (ex: tentar arrastar o texto e a página dar scroll junto).

## 6. Estilo Imutável via Tailwind (Design System Strictness)
É terminantemente proibido o uso de propriedades CSS "mágicas" ou estilos inline fixos no código para o design dos cards.
- Todo componente visual deve consumir o design system gerado (cores da marca, fontes), mapeado via Tailwind ou variáveis CSS injetadas na raiz.
- Customizações inline são permitidas *apenas* para cálculos dinâmicos estritos (como posições X, Y do drag no Architect).

## 7. Nativo Sobre o Externo (Performance)
Antes de introduzir qualquer nova dependência de terceiros (npm) para interface, deve-se esgotar a possibilidade de criá-la via CSS puro, Tailwind v4 ou lógica React nativa.
- Funcionalidades pesadas devem permanecer delegadas ao Backend/Worker no Railway, mantendo o Frontend reativo e de baixo custo computacional.
