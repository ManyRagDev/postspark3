import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const source = process.argv[2] ?? "drizzle/0019_design_arsenal_v2.sql";
const sql = await fs.readFile(source,"utf8");
const hash = createHash("sha256").update(sql).digest("hex");
const html =
  '<!doctype html><meta charset="utf-8"><title>Migration Arsenal V2 · revisão</title><h1>Migration aditiva Arsenal V2</h1><p>Projeto confirmado: spbuwcwmxlycchuwhfir · postspark</p><p>Arquivo: ' + source + '</p><p>SHA-256: ' +
  hash +
  '</p><pre id="migration">' +
  sql.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") +
  "</pre>";
await fs.writeFile("harness/arsenalV2/migration.html", html);
console.log(hash);
