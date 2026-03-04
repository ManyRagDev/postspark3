import { useEffect } from 'react';
import { getActiveFontInfo, loadFont } from '@/lib/fonts';

/**
 * React hook that dynamically loads the active Google Font
 * whenever fontFamily or customFontUrl changes.
 *
 * @returns The resolved font family name for use in style attributes.
 */
export function useDynamicFont(fontFamily: string, customFontUrl: string = ''): string {
  const { name, url } = getActiveFontInfo({ fontFamily, customFontUrl });

  useEffect(() => {
    if (url) loadFont(url);
  }, [url]);

  return name;
}
