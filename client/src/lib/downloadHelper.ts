/**
 * Utilitário seguro para download de imagens no navegador.
 * Suporta DataURIs base64, URLs locais e URLs remotas via conversão em Blob.
 */
export async function downloadImageFile(
  urlOrDataUri: string,
  defaultFilename = "postspark-imagem.png"
): Promise<void> {
  if (!urlOrDataUri) return;

  try {
    let downloadUrl = urlOrDataUri;
    let shouldRevoke = false;

    // Se for URL remota (HTTP/HTTPS) que não seja data URI, busca via blob para forçar download
    if (urlOrDataUri.startsWith("http://") || urlOrDataUri.startsWith("https://")) {
      try {
        const response = await fetch(urlOrDataUri, { mode: "cors" });
        const blob = await response.blob();
        downloadUrl = URL.createObjectURL(blob);
        shouldRevoke = true;
      } catch (err) {
        console.warn("[downloadImageFile] Falha no fetch CORS, tentando link direto:", err);
        // Prossegue com a URL direta como fallback
      }
    }

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = defaultFilename;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (shouldRevoke) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
    }
  } catch (error) {
    console.error("[downloadImageFile] Erro ao baixar imagem:", error);
    // Fallback básico abrindo a imagem em nova aba
    window.open(urlOrDataUri, "_blank");
  }
}
