import { useEffect, useState } from 'react';
import { getActiveFontInfo, loadFont } from '@/lib/fonts';

/**
 * React hook that dynamically loads the active Google Font
 * whenever fontFamily or customFontUrl changes, and triggers
 * a re-render once the font is confirmed ready by the browser.
 *
 * @returns The resolved font family name for use in style attributes.
 */
export function useDynamicFont(fontFamily: string, customFontUrl: string = ''): string {
  const { name, url } = getActiveFontInfo({ fontFamily, customFontUrl });
  const [, setReady] = useState(false);

  useEffect(() => {
    if (url) {
      loadFont(url);
    }

    if (typeof document !== 'undefined' && document.fonts) {
      let active = true;
      const timer = setTimeout(() => {
        if (active) {
          setReady(true);
        }
      }, 3000);

      document.fonts.ready
        .then(() => {
          if (active) {
            clearTimeout(timer);
            setReady((prev) => !prev);
          }
        })
        .catch(() => {
          if (active) {
            clearTimeout(timer);
            setReady(true);
          }
        });

      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
  }, [name, url]);

  return name;
}
