// Public metadata and a hash-pinned font only; no credential or paid inference.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const root = "artifacts/acervo82/pilot";
await fs.mkdir(root, { recursive: true });
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const fonts = JSON.parse(
  await fs.readFile("designs/acervo82/pilot/fonts.json", "utf8")
).fonts;
for (const font of fonts) {
  let bytes;
  try {
    bytes = await fs.readFile(font.path);
  } catch (error) {
    if (error.code !== "ENOENT" || !font.download) throw error;
    const response = await fetch(font.download);
    if (!response.ok) throw new Error(`font_http_${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (sha(bytes) !== font.sha256)
      throw new Error(`font_source_changed:${font.family}`);
    await fs.mkdir(path.dirname(font.path), { recursive: true });
    await fs.writeFile(font.path, bytes);
  }
  if (sha(bytes) !== font.sha256)
    throw new Error(`font_hash_mismatch:${font.family}`);
}
for (const [endpoint, file, project] of [
  ["models", "model-quotes.json", result => result.data],
  [
    "models/typesafe/jev-1.13/endpoints",
    "jev-endpoints.json",
    result => result,
  ],
]) {
  const response = await fetch(`https://openrouter.ai/api/v1/${endpoint}`);
  if (!response.ok) throw new Error(`metadata_http_${response.status}`);
  await fs.writeFile(
    path.join(root, file),
    JSON.stringify(project(await response.json()), null, 2)
  );
}
console.log(
  JSON.stringify({
    fonts: fonts.length,
    publicMetadataFetched: true,
    paidCalls: 0,
  })
);
