/** Cores por raridade (texto, moldura e brilho), centralizadas no design system. */
export const RARITY_TEXT: Record<string, string> = {
  common: 'text-rarity-common',
  uncommon: 'text-rarity-uncommon',
  rare: 'text-rarity-rare',
  epic: 'text-rarity-epic',
  legendary: 'text-rarity-legendary',
  astral: 'text-rarity-astral',
};

export const RARITY_RING: Record<string, string> = {
  common: 'ring-rarity-common/35',
  uncommon: 'ring-rarity-uncommon/50',
  rare: 'ring-rarity-rare/60',
  epic: 'ring-rarity-epic/65',
  legendary: 'ring-rarity-legendary/70',
  astral: 'ring-rarity-astral/75',
};

/** Fundo da moldura do slot: um degradê muito leve na cor da raridade. */
export const RARITY_BG: Record<string, string> = {
  common: 'from-slate-400/10',
  uncommon: 'from-emerald-400/15',
  rare: 'from-sky-400/20',
  epic: 'from-fuchsia-400/20',
  legendary: 'from-orange-400/25',
  astral: 'from-amber-300/25',
};

export const RARITY_NAME: Record<string, string> = {
  common: 'Comum',
  uncommon: 'Incomum',
  rare: 'Raro',
  epic: 'Épico',
  legendary: 'Lendário',
  astral: 'Astral',
};

export function RarityBadge({ rarity, label }: { rarity: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-chip)] bg-night-950/70 px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase ring-1 ${RARITY_TEXT[rarity] ?? ''} ${RARITY_RING[rarity] ?? ''}`}
    >
      <span aria-hidden>◆</span>
      {label ?? RARITY_NAME[rarity] ?? rarity}
    </span>
  );
}
