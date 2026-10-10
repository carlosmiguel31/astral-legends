import type { KeyboardEvent } from 'react';
import { Icon, type IconName } from '../icons';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
  disabled?: boolean;
  /** Texto curto mostrado ao lado (ex.: "Em breve"). */
  badge?: string;
}

/**
 * Abas com o padrão WAI-ARIA (setas trocam de aba). `variant="plaque"` é a aba
 * dourada grande do painel lateral; `chips` é a versão compacta para filtros.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  variant = 'plaque',
  ariaLabel,
  className = '',
}: {
  tabs: ReadonlyArray<TabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  variant?: 'plaque' | 'chips';
  ariaLabel?: string;
  className?: string;
}) {
  const enabled = tabs.filter((t) => !t.disabled);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = enabled.findIndex((t) => t.id === active);
    const next = enabled[(i + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
    if (next) onChange(next.id);
  };

  const base =
    variant === 'plaque'
      ? 'flex gap-1.5 rounded-[var(--radius-panel)] bg-night-950/70 p-1.5 ring-1 ring-astral-gold/25'
      : 'flex flex-wrap gap-1';
  const item = (selected: boolean) =>
    variant === 'plaque'
      ? `flex-1 min-h-11 rounded-[var(--radius-control)] px-2 font-display text-[13px] font-semibold tracking-wide transition sm:text-sm ${
          selected
            ? 'bg-gradient-to-b from-astral-gold-soft via-astral-gold to-astral-gold-deep text-night-950 shadow-[var(--shadow-glow-gold)]'
            : 'text-slate-200 ring-1 ring-white/8 hover:bg-white/6 hover:text-astral-gold-soft'
        }`
      : `min-h-8 rounded-[var(--radius-chip)] px-2.5 text-xs font-semibold transition ${
          selected
            ? 'bg-astral-violet-deep/60 text-white ring-1 ring-astral-violet/70'
            : 'text-slate-300 ring-1 ring-white/10 hover:bg-white/6'
        }`;

  return (
    <div role="tablist" aria-label={ariaLabel} className={`${base} ${className}`} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={active === t.id}
          tabIndex={active === t.id ? 0 : -1}
          disabled={t.disabled}
          onClick={() => onChange(t.id)}
          className={`${item(active === t.id)} inline-flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-45`}
        >
          {t.icon && <Icon name={t.icon} className="size-4" />}
          {t.label}
          {t.badge && <span className="text-[10px] font-normal opacity-80">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
