# Plano de Execução: Brand Soul (Clone Mimetizado) e Fricções

## Domínio 1: Backend / IA (Mimetismo e QA)
**Escopo Restrito:** `server/_core/llm.ts` e Prompt Logic
- **Tática de Extração de Alma:** Modificar o prompt primário no endpoint de geração (quando a source é URL). O Gemini Vision não deve apenas ler o texto, ele deve mapear a "Vibe" (é dark mode? É minimalista da Apple? É colorido e vibrante?).
- **Tática de QA LLM (O Guardião da Marca):** Injetar um hook de Quality Assurance (um segundo passe no LLM). Ele receberá a variação bruta e o screenshot. Seu único objetivo será responder a pergunta: *"Se eu colocar esse card dentro do site original, ele parece um componente nativo de lá?"*. Se não, ele ajustará as cores base (`backgroundColor`, `textColor`, etc) e o tipo de layout no JSON para mimetizar o site antes de enviar ao frontend.

## Domínio 2: UI Front-End e Bugs de Renderização
**Escopo Restrito:** `client/src/components/`, `client/src/pages/Home.tsx`
- **Tática de Correção "Circle":** Refatorar `client/src/components/BrandOverlay.tsx` limitando shapes circulares imensos.
- **Tática de Ajuste Viewport 9:16:** Escalonar visualização flexível em `client/src/components/views/HoloDeck.tsx` para evitar cortes (overflow-hidden) na previsualização esticada (Story).
- **Tática State Sync:** Consertar em `client/src/pages/Home.tsx` a reconstrução de `selectedVariation` para fazer clone profundo de nodes customizados (`textElements`, etc).
