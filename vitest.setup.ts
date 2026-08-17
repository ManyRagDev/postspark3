/**
 * Setup global do Vitest (SPEC-005).
 *
 * Registra o medidor tipográfico de fontkit (node:fs) para TODOS os testes:
 * o resolvedor canônico (`shared/typography/resolve.ts`) usa a indireção de
 * `shared/typography/measurer.ts` para não arrastar `node:fs` para o bundle
 * do cliente; em vitest (node) o medidor real é sempre configurado.
 */
import { fontkitMeasurer } from "./shared/typography/fontkitMeasurer";
import { setTypographyMeasurer } from "./shared/typography/measurer";

setTypographyMeasurer(fontkitMeasurer);
