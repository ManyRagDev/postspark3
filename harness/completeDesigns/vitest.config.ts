import path from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@shared": path.resolve(import.meta.dirname, "../../shared"), "@": path.resolve(import.meta.dirname, "../../client/src") } },
  test: { include: ["harness/componentArsenal/**/*.test.ts", "harness/completeDesigns/**/*.test.ts", "shared/arsenalReadiness.test.ts"] },
});
