import { useSyncExternalStore } from 'react';

/** Acompanha uma media query CSS (ex.: layout de desktop a partir de 1024 px). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Layout de duas colunas (tablet paisagem, notebook e desktop). Igual ao breakpoint `lg`. */
export const useIsDesktop = () => useMediaQuery('(min-width: 64rem)');
