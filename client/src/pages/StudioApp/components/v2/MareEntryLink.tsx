import type { ReactNode } from "react";

export type MareEntry = boolean | "local-preview";
export function mareEntryHref(entry?: MareEntry) {
  if (entry === true) return "/mare/";
  if (entry === "local-preview") return "/previa-mare/";
  return undefined;
}

export function MareEntryLink({href, className, children}: {href: string; className?: string; children?: ReactNode}) {
  const label = href === "/mare/" ? "Vídeo" : "Vídeo · prévia local";
  return <a href={href} className={className} target="_blank" rel="noopener" aria-label={label + ", abre em nova aba"}>
    {children}{label} <span aria-hidden="true">↗</span>
  </a>;
}
