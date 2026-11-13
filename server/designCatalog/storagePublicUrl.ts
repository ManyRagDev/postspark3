/** The storage client uses the private service network. Browser links use the
 * configured public origin, preserving the signed path and token verbatim. */
export function publicStorageSignedUrl(
  signedUrl: string,
  internalUrl: string,
  publicUrl?: string,
): string {
  if (!publicUrl) return signedUrl;
  const internal = new URL(internalUrl);
  const target = new URL(publicUrl);
  const signed = new URL(signedUrl);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username || target.password || target.search || target.hash ||
    target.pathname !== "/"
  ) throw new Error("Invalid public Storage origin configuration");
  const prefix = `${internal.pathname.replace(/\/$/, "")}/storage/v1/object/sign/`;
  if (signed.origin !== internal.origin || !signed.pathname.startsWith(prefix))
    throw new Error("Unexpected signed Storage URL");
  return `${target.origin}${signed.pathname}${signed.search}${signed.hash}`;
}
