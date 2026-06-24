import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  test: {
    include: [
      "server/**/*.test.ts",
      "client/src/**/*.test.ts",
      "client/src/**/*.test.tsx",
      "shared/**/*.test.ts",
    ],
  },
});
