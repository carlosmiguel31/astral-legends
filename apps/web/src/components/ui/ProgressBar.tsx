import type { ReactNode } from 'react';

export type BarTone = 'xp' | 'hp' | 'gold' | 'violet' | 'cyan';

const FILL: Record<BarTone, string> = {
  xp: 'bg-gradient-to-r from-[#5b49e8] via-xp to-xp-soft',
  hp: 'bg-gradient-to-r from-[#b4142c] via-hp to-hp-soft',
  gold: 'bg-gradient-to-r from-astral-gold-deep via-astral-gold to-astral-gold-soft',
  violet: 'bg-gradient-to-r from-astral-violet-deep to-astral-violet',
  cyan: 'bg-gradient-to-r from-sky-600 to-astral-cyan',
};

/**
 * Barra de progresso contínua (XP, vida…). O texto fica dentro da barra no tamanho
 * `lg`, como na HUD; a largura anima suavemente quando o servidor envia um valor novo.
 */
export function ProgressBar({
  value,
  max,
  tone,
  label,
  text,
  testId,
  size = 'md',
  showLabel = true,
}: {
  value: number;
  max: number;
  tone: BarTone;
  label: string;
  /** Texto exibido (padrão: "valor/máximo"). */
  text?: ReactNode;
  testId?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 100;
  const height = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-5' }[size];
  const shown = text ?? `${value}/${max}`;
  return (
    <div className="min-w-0">
      {showLabel && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-micro leading-none text-slate-300">
          <span>{label}</span>
          {size !== 'lg' && (
            <span className="tabular-nums text-slate-200" data-testid={testId}>
              {shown}
            </span>
          )}
        </div>
      )}
      <div
        className={`relative overflow-hidden rounded-full bg-night-950 ring-1 ring-white/12 ${height}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-[var(--ease-astral)] ${FILL[tone]}`}
          style={{ width: `${pct}%` }}
        />
        {size === 'lg' && (
          <span
            className="absolute inset-0 grid place-items-center text-[11px] font-semibold tabular-nums text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]"
            data-testid={testId}
          >
            {shown}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Barra segmentada (vitórias da wave). O último segmento pode marcar o encontro
 * especial (elite ou chefe) com cor e símbolo próprios.
 */
export function SegmentedBar({
  count,
  filled,
  special,
  label,
  testId,
}: {
  count: number;
  filled: number;
  special?: 'elite' | 'boss' | null;
  label: string;
  testId?: string;
}) {
  const specialColor = special === 'boss' ? 'bg-rose-400' : 'bg-astral-violet';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={count}
      aria-valuenow={filled}
      data-testid={testId}
      data-value={filled}
      className="flex gap-[3px]"
    >
      {Array.from({ length: count }, (_, i) => {
        const on = i < filled;
        const last = special && i === count - 1;
        return (
          <span
            key={i}
            className={`grid h-3.5 flex-1 place-items-center rounded-[3px] text-[9px] leading-none transition-colors duration-500 ${
              on
                ? last
                  ? specialColor
                  : 'bg-gradient-to-b from-astral-gold-soft to-astral-gold shadow-[0_0_6px_-1px_rgb(242_196_109/0.7)]'
                : last
                  ? `bg-night-950 ring-1 ring-inset ${special === 'boss' ? 'text-rose-300 ring-rose-400/70' : 'text-astral-violet ring-astral-violet/70'}`
                  : 'bg-night-950 ring-1 ring-inset ring-white/10'
            }`}
          >
            {last && !on ? (special === 'boss' ? '♛' : '◆') : ''}
          </span>
        );
      })}
    </div>
  );
}
