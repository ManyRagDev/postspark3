import { build } from "esbuild";
await build({
  entryPoints: ["client/src/review-renderer/main.tsx"],
  outfile: process.env.REVIEW_RENDERER_BUNDLE || "dist/review-renderer/renderer.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" },
  logLevel: "info",
});
