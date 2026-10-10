import type { SVGProps } from 'react';

/**
 * Ícones vetoriais originais da interface (24×24, traço `currentColor`).
 * Formas geométricas simples desenhadas para o Astral Legends — nenhum é copiado de
 * pacotes de ícones ou de outras franquias.
 */
const PATHS = {
  swords: [
    'M5 4l11 11',
    'M13.5 17.5l5-5',
    'M17 17l3 3',
    'M19 4L8 15',
    'M5.5 12.5l5 5',
    'M7 17l-3 3',
  ],
  user: ['M12 4.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7', 'M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5'],
  bag: ['M6 8h12l-1 12H7z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  map: ['M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z', 'M9 4v14', 'M15 6v14'],
  trophy: [
    'M8 4h8v5a4 4 0 0 1-8 0z',
    'M8 6H5a3 3 0 0 0 3 4',
    'M16 6h3a3 3 0 0 1-3 4',
    'M12 13v4',
    'M8 20h8',
    'M10 17h4',
  ],
  ranking: ['M5 20v-8', 'M12 20V5', 'M19 20v-6', 'M3 20h18'],
  crown: ['M4 17L3 7l5 4 4-7 4 7 5-4-1 10z', 'M4 20.5h16'],
  pvp: ['M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z', 'M9 9l6 6', 'M15 9l-6 6'],
  store: ['M3 9l2-5h14l2 5', 'M3 9h18', 'M5 9v11h14V9', 'M10 20v-5h4v5'],
  ticket: [
    'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2z',
    'M12 9.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z',
  ],
  gear: [
    'M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6',
    'M12 2.5v3',
    'M12 18.5v3',
    'M2.5 12h3',
    'M18.5 12h3',
    'M5.3 5.3l2.1 2.1',
    'M16.6 16.6l2.1 2.1',
    'M5.3 18.7l2.1-2.1',
    'M16.6 7.4l2.1-2.1',
    'M12 6a6 6 0 1 1 0 12a6 6 0 1 1 0-12',
  ],
  mail: ['M3 6h18v12H3z', 'M3 7l9 6 9-6'],
  users: [
    'M9 5a3 3 0 1 1 0 6a3 3 0 1 1 0-6',
    'M3 19c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5',
    'M17 6.5a2.5 2.5 0 1 1 0 5',
    'M16 14.6c2.4.2 4.2 1.6 5 4.4',
  ],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  scroll: [
    'M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8',
    'M7 4a2 2 0 0 0-2 2v2h4V6a2 2 0 0 0-2-2',
    'M8 20a2 2 0 0 1-2-2v-1',
    'M11 9h5',
    'M11 13h5',
  ],
  heart: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  shield: ['M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z'],
  bolt: ['M13 2L5 14h6l-1 8 8-12h-6z'],
  infinity: ['M7 9a3 3 0 1 0 0 6c2.5 0 7.5-6 10-6a3 3 0 1 1 0 6c-2.5 0-7.5-6-10-6z'],
  advance: ['M5 6l6 6-6 6', 'M12 6l6 6-6 6'],
  play: ['M7 4l13 8-13 8z'],
  stop: ['M7 7h10v10H7z'],
  chevronRight: ['M9 5l7 7-7 7'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  clock: ['M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18', 'M12 7v5l3 2'],
  chat: ['M4 5h16v11H9l-5 4z', 'M8 9.5h8', 'M8 12.5h5'],
  logout: ['M14 4h5v16h-5', 'M10 8l-4 4 4 4', 'M6 12h10'],
  skull: [
    'M12 3a7 7 0 0 0-7 7c0 2.5 1.3 4.2 3 5v3h8v-3c1.7-.8 3-2.5 3-5a7 7 0 0 0-7-7z',
    'M9.5 9.2a1.3 1.3 0 1 1 0 2.6a1.3 1.3 0 1 1 0-2.6',
    'M14.5 9.2a1.3 1.3 0 1 1 0 2.6a1.3 1.3 0 1 1 0-2.6',
    'M10 18v3',
    'M14 18v3',
  ],
  target: [
    'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16',
    'M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8',
    'M12 11.5v1',
  ],
  check: ['M5 12.5l4.5 4.5L19 7'],
  sparkles: [
    'M10 3l1.6 5.4L17 10l-5.4 1.6L10 17l-1.6-5.4L3 10l5.4-1.6z',
    'M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z',
  ],
  // Slots de equipamento
  weapon: ['M19 3l2 2-11 11-3 1 1-3z', 'M6 12.5l5.5 5.5', 'M5.5 18.5L3 21'],
  head: ['M5 15a7 7 0 0 1 14 0v4h-5v-4h-4v4H5z', 'M12 8v3'],
  chest: ['M8 3l4 2 4-2 4 3-2 5v9H6v-9L4 6z', 'M12 5v15'],
  hands: [
    'M7 21v-8l-2-4a1.5 1.5 0 0 1 2.6-1.4L9 10V5a1.5 1.5 0 0 1 3 0v4h1V5a1.5 1.5 0 0 1 3 0v6l1 2v8z',
  ],
  legs: ['M7 3h10v6l-1.5 12h-3L12 11l-.5 10h-3L7 9z', 'M7 6h10'],
  feet: ['M7 3h6v10l5 2.5a2 2 0 0 1 1 1.7V20H6z', 'M6 16.5h13'],
} as const;

export type IconName = keyof typeof PATHS;

/** Ícones desenhados com preenchimento (os demais usam só traço). */
const FILLED: ReadonlySet<IconName> = new Set(['play', 'stop', 'sparkles', 'bolt']);

export function Icon({
  name,
  className = 'size-5',
  title,
  ...props
}: { name: IconName; title?: string } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const filled = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...props}
    >
      {title && <title>{title}</title>}
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[];
