/** Editor labels are presentation only; catalogue identities and metadata remain pinned. */
export function displayMediaSlotLabel(label: string | undefined, fallback = "Imagem"): string {
  const clean = (label ?? "")
    .replace(/\s*[([][^()[\]]*\b(?:Admin2|RAG|media\.primary|user-replaceable-image)\b[^()[\]]*[)\]]/gi, "")
    .replace(/\s*(?:[—–|:]\s*)?(?:inserir|carregar|preencher|configurar|editar|upload|enviar|substituir)\b.*\bAdmin2\b.*$/i, "")
    .trim();
  return clean && !/\b(?:Admin2|RAG|media\.primary|user-replaceable-image)\b/i.test(clean) ? clean : fallback;
}
