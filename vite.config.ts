import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), jsxLocPlugin(), {
    name: "mare-studio-assets",
    async writeBundle(options) {
      const output = options.dir ?? path.resolve(import.meta.dirname, "dist/public");
      const source = path.resolve(import.meta.dirname, "labs/mare-studio/dist");
      const entry = path.join(source, "index.html");
      const privateDir = path.resolve(output, "../private/mare");
      await mkdir(privateDir, {recursive:true});
      await cp(entry, path.join(privateDir, "index.html"));
      await cp(source, path.join(output, "mare"), {recursive:true, filter: file => file !== entry});
      await cp(path.resolve(import.meta.dirname,"shared/typography/fonts/files"),path.join(output,"mare","fonts"),{recursive:true});
      await cp(path.resolve(import.meta.dirname,"labs/mare-studio/processor/transition-media"), path.join(output,"mare","transition-media"), {recursive:true});
    },
  }],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: process.env.POSTSPARK_ACERVO82_LOCAL === "true"
    ? path.resolve(process.env.POSTSPARK_ENV_DIR || path.join(import.meta.dirname, ".acervo82-local"))
    : path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*", "**/mare-studio/dist/index.html", "**/private/mare/index.html"],
    },
  },
});
