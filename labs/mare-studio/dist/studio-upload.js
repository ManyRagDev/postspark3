// Upload parts fit the Studio API gateway. Re-selecting the same bytes resumes
// the server-side ticket and also works after opening the project on a new tab.
export async function uploadStudioAsset(file, {kind = "video", anchorId, workspaceId, editorOwner, signal, onProgress} = {}) {
  if (!file.size || file.size > 128 * 1024 * 1024) throw Error("Envie um arquivo de até 128 MiB.");
  signal?.throwIfAborted();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  const sha256 = Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
  async function request(path, method, body, binary = false) {
    const response = await fetch("/api/mare/uploads" + path, {
      method, credentials: "same-origin", signal,
      headers: {...(editorOwner ? {"X-PostSpark-Editor-Owner":editorOwner} : {}), "Content-Type": binary ? "application/octet-stream" : "application/json"},
      body: binary ? body : JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.error || "Envio interrompido. Selecione o mesmo arquivo para retomar.");
    return result;
  }
  const info = await request("", "POST", {kind, anchorId: anchorId || undefined, workspaceId: workspaceId || undefined, size: file.size, sha256});
  if (info.assetId) return info;
  if (!info.uploadId || !(info.partBytes > 0)) throw Error("Sessão de envio inválida.");
  const base = "/" + encodeURIComponent(info.uploadId), received = new Set(info.received);
  for (let offset = 0, i = 0; offset < file.size; offset += info.partBytes, i++) {
    const end = Math.min(offset + info.partBytes, file.size);
    if (!received.has(i)) await request(base + "/parts/" + i, "PUT", file.slice(offset, end), true);
    onProgress?.(end / file.size);
  }
  let result = await request(base + "/complete", "POST", {});
  const deadline=Date.now()+10*60_000;
  while (!result.assetId && result.uploadId) {
    if(Date.now()>deadline)throw Error("O arquivo permanece na fila. Selecione-o novamente para consultar a conclusão.");
    signal?.throwIfAborted();
    await new Promise(resolve => setTimeout(resolve, 1500));
    result = await request(base, "GET");
  }
  if(!result.assetId) throw Error("Resultado de mídia indisponível.");
  return result;
}
