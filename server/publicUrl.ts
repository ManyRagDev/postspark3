import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
export function isPublicAddress(address: string): boolean {
  const a = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(a) === 4) {
    const [x, y] = a.split(".").map(Number);
    return !(
      x === 0 ||
      x === 10 ||
      x === 127 ||
      x >= 224 ||
      (x === 169 && y === 254) ||
      (x === 172 && y >= 16 && y <= 31) ||
      (x === 192 && (y === 168 || y === 0)) ||
      (x === 100 && y >= 64 && y <= 127) ||
      (x === 198 && (y === 18 || y === 19 || y === 51)) ||
      (x === 203 && y === 0)
    );
  }
  if (isIP(a) === 6)
    return (
      /^2[0-9a-f]{3}:/.test(a) &&
      !a.startsWith("2001:db8:") &&
      !a.startsWith("2001:0:") &&
      !a.startsWith("2002:")
    );
  return false;
}
export async function publicUrl(
  raw: string,
  signal = AbortSignal.timeout(5000)
) {
  signal.throwIfAborted();
  if (raw.length > 2048)
    throw new Error("A URL excede o limite de 2048 caracteres.");
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use um destino público HTTP/HTTPS sem credenciais.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await new Promise<Array<{ address: string; family: number }>>(
        (resolve, reject) => {
          const abort = () =>
            reject(signal.reason ?? new Error("DNS lookup timed out"));
          signal.addEventListener("abort", abort, { once: true });
          lookup(host, { all: true, verbatim: true })
            .then(resolve, reject)
            .finally(() => signal.removeEventListener("abort", abort));
        }
      );
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address)))
    throw new Error("O endereço da página deve ser público.");
  return { url, address: addresses.find(a => a.family === 4) ?? addresses[0] };
}
/** DNS is pinned per connection. Every redirect is resolved and validated again. */
export async function publicHtml(
  raw: string,
  options: { maxBytes?: number; timeoutMs?: number; css?: boolean } = {}
) {
  const stop = AbortSignal.timeout(options.timeoutMs ?? 12000),
    limit = options.maxBytes ?? 2_000_000;
  let current = raw;
  for (let i = 0; i <= 5; i++) {
    const { url, address } = await publicUrl(current, stop);
    stop.throwIfAborted();
    const response = await new Promise<{
      status: number;
      location?: string;
      text: string;
    }>((resolve, reject) => {
      const req = (url.protocol === "https:" ? https : http).request(
        url,
        {
          signal: stop,
          headers: { "User-Agent": "PostSpark/3.0", Accept: "text/html" },
          lookup: (_hostname, _opts, cb) =>
            cb(null, address.address, address.family),
        },
        res => {
          const type = String(res.headers["content-type"] ?? "");
          if (
            ![301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
            !(
              options.css
                ? /^text\/(css|plain)/i
                : /^text\/(html|plain)|application\/xhtml\+xml/i
            ).test(type)
          ) {
            res.destroy();
            reject(new Error("A página não retornou conteúdo textual."));
            return;
          }
          if (Number(res.headers["content-length"] ?? 0) > limit) {
            res.destroy();
            reject(new Error("Página excede o limite de leitura."));
            return;
          }
          let size = 0;
          const parts: Buffer[] = [];
          res.on("data", (part: Buffer) => {
            size += part.length;
            if (size > limit) {
              res.destroy(new Error("Página excede o limite de leitura."));
              return;
            }
            parts.push(part);
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              location: res.headers.location,
              text: Buffer.concat(parts).toString("utf8"),
            })
          );
        }
      );
      req.on("error", reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location) throw new Error("Redirecionamento inválido.");
      current = new URL(response.location, url).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300)
      throw new Error(`HTTP ${response.status}`);
    return { url: url.toString(), html: response.text };
  }
  throw new Error("Limite de redirecionamentos excedido.");
}
