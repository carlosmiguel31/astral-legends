import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons';
import { PixelIcon, type PixelIconName } from '../pixelIcons';

export type RewardKind =
  'xp' | 'gold' | 'essence' | 'items' | 'time' | 'level' | 'waves' | 'fights';

const KIND: Record<
  RewardKind,
  { pixel?: PixelIconName; icon?: IconName; badge?: string; ring: string; text: string }
> = {
  xp: { badge: 'EXP', ring: 'ring-emerald-400/40', text: 'text-emerald-300' },
  gold: { pixel: 'coin', ring: 'ring-amber-300/40', text: 'text-gold-coin' },
  essence: { pixel: 'essence', ring: 'ring-violet-400/45', text: 'text-essence' },
  items: { pixel: 'chest', ring: 'ring-orange-300/40', text: 'text-orange-200' },
  time: { icon: 'clock', ring: 'ring-sky-300/40', text: 'text-astral-cyan' },
  level: { pixel: 'star', ring: 'ring-astral-gold/50', text: 'text-astral-gold' },
  waves: { icon: 'swords', ring: 'ring-astral-gold/40', text: 'text-astral-gold-soft' },
  fights: { icon: 'target', ring: 'ring-rose-300/40', text: 'text-rose-200' },
};

/** Ícone de recompensa (pixel art para moedas/essência/baú, selo EXP, ou vetor). */
export function RewardIcon({
  kind,
  className = 'size-9',
}: {
  kind: RewardKind;
  className?: string;
}) {
  const k = KIND[kind];
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[var(--radius-control)] bg-night-950/80 ring-1 ${k.ring} ${k.text} ${className}`}
      aria-hidden
    >
      {k.badge ? (
        <span className="font-display text-[11px] font-bold tracking-tight">{k.badge}</span>
      ) : k.pixel ? (
        <PixelIcon name={k.pixel} className="size-[70%]" />
      ) : (
        <Icon name={k.icon ?? 'sparkles'} className="size-[60%]" />
      )}
    </span>
  );
}

/**
 * Bloco de recompensa: ícone, valor e legenda. Os valores sempre chegam prontos do
 * servidor (o componente só formata).
 */
export function RewardTile({
  kind,
  value,
  label,
  layout = 'stack',
  testId,
}: {
  kind: RewardKind;
  value: ReactNode;
  label: string;
  layout?: 'stack' | 'row';
  testId?: string;
}) {
  if (layout === 'row') {
    return (
      <div className="flex min-w-0 items-center gap-2" data-testid={testId}>
        <RewardIcon kind={kind} className="size-9" />
        <div className="min-w-0 leading-tight">
          <p className={`truncate text-sm font-semibold tabular-nums ${KIND[kind].text}`}>
            {value}
          </p>
          <p className="truncate text-micro text-slate-400">{label}</p>
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex min-w-0 animate-rise-in flex-col items-center gap-1.5 rounded-[var(--radius-control)] bg-night-950/55 px-2 py-3 text-center ring-1 ring-white/8"
      data-testid={testId}
    >
      <RewardIcon kind={kind} className="size-11" />
      <p className={`text-base font-semibold tabular-nums ${KIND[kind].text}`}>{value}</p>
      <p className="text-micro text-slate-400">{label}</p>
    </div>
  );
}
