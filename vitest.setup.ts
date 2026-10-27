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
import { resolve } from "node:path";

// Server modules load their own configuration. Tests must not inherit a
// developer's credentials, executor activation, or diagnostics from .env.
process.env.DOTENV_CONFIG_PATH ??= resolve(process.cwd(), "scripts/testing/isolated-env.fixture");

setTypographyMeasurer(fontkitMeasurer);
