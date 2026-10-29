import http from "node:http";
import https from "node:https";
import { publicUrl } from "../publicUrl";

export type PublicResource = {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
};

/** One HTTP hop. Chromium follows redirects through this same check again.
 * DNS is validated AND pinned to the socket; route.continue/fetch are never used.
 */
export async function fetchPublicResource(
  raw: string,
  options: {
    signal: AbortSignal;
    headers?: Record<string, string>;
    maxBytes?: number;
  },
  resolve = publicUrl
): Promise<PublicResource> {
  const { signal, maxBytes = 8_000_000 } = options;
  const { url, address } = await resolve(raw, signal);
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Only public web ports are supported");
  }
  signal.throwIfAborted();
  const headers: Record<string, string> = { "accept-encoding": "identity" };
  for (const name of [
    "accept",
    "accept-language",
    "user-agent",
    "cookie",
    "referer",
  ]) {
    if (options.headers?.[name]) headers[name] = options.headers[name];
  }
  const response = await new Promise<PublicResource>(
    (resolveResponse, reject) => {
      const request = (url.protocol === "https:" ? https : http).request(
        url,
        {
          method: "GET",
          signal,
          headers,
          agent: false,
          family: address.family,
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
        },
        incoming => {
          const fail = (message: string) => {
            const error = new Error(message);
            reject(error);
            incoming.destroy(error);
          };
          incoming.on("error", reject);
          if (Number(incoming.headers["content-length"] ?? 0) > maxBytes) {
            fail("Resource exceeds capture limit");
            return;
          }
          let size = 0;
          const parts: Buffer[] = [];
          incoming.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) fail("Resource exceeds capture limit");
            else parts.push(chunk);
          });
          incoming.on("end", () => {
            const resultHeaders: Record<string, string> = {};
            for (const [name, value] of Object.entries(incoming.headers)) {
              if (
                value === undefined ||
                [
                  "connection",
                  "transfer-encoding",
                  "content-length",
                  "keep-alive",
                  "upgrade",
                  "proxy-authenticate",
                  "proxy-authorization",
                ].includes(name)
              )
                continue;
              resultHeaders[name] = Array.isArray(value)
                ? value.join("\n")
                : value;
            }
            resolveResponse({
              status: incoming.statusCode ?? 502,
              headers: resultHeaders,
              body: Buffer.concat(parts),
            });
          });
        }
      );
      request.on("error", reject);
      request.end();
    }
  );
  if (
    [301, 302, 303, 307, 308].includes(response.status) &&
    response.headers.location
  ) {
    // Fail closed before handing the redirect back to Chromium.
    await resolve(new URL(response.headers.location, url).href, signal);
  }
  return response;
}
