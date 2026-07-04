import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Otimiza URL do Unsplash para o device especificado.
 * Reduz tamanho do arquivo e melhora performance (mobile-first).
 *
 * @param url - URL original da imagem
 * @param isMobile - Se true, usa params otimizados para mobile (w=400, webp)
 * @returns URL otimizada ou original se não for Unsplash
 */
export function getOptimizedUnsplashUrl(url: string, isMobile: boolean): string {
  if (!url.includes("images.unsplash.com")) return url;

  try {
    const parsed = new URL(url);
    parsed.searchParams.set("auto", "format");
    parsed.searchParams.set("fit", "crop");
    parsed.searchParams.set("w", isMobile ? "400" : "900");
    parsed.searchParams.set("q", isMobile ? "70" : "80");
    if (isMobile) parsed.searchParams.set("fm", "webp");
    return parsed.toString();
  } catch {
    return url;
  }
}
