import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold-outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-astral-gold-soft via-astral-gold to-astral-gold-deep text-night-950 shadow-[var(--shadow-glow-gold)] hover:brightness-110 disabled:from-astral-gold/40 disabled:via-astral-gold/40 disabled:to-astral-gold/40 disabled:shadow-none',
  secondary:
    'bg-indigo-deep/80 text-slate-100 ring-1 ring-astral-gold/30 hover:bg-night-700 hover:ring-astral-gold/60 disabled:opacity-50',
  'gold-outline':
    'bg-night-900/60 text-astral-gold-soft ring-1 ring-astral-gold/60 hover:bg-astral-gold/10 disabled:opacity-50',
  danger:
    'bg-rose-500/15 text-rose-100 ring-1 ring-rose-400/45 hover:bg-rose-500/25 disabled:opacity-50',
  ghost: 'text-slate-300 hover:bg-white/8 hover:text-white disabled:opacity-50',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-xs gap-1.5',
  md: 'min-h-11 px-4 text-sm gap-2',
  lg: 'min-h-14 px-5 text-base gap-2.5 font-display tracking-wide',
};

/** Botão do design system. `busy` mostra um indicador e desabilita o clique. */
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  busy = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center rounded-[var(--radius-control)] font-semibold transition duration-150 ease-[var(--ease-astral)] active:translate-y-px disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    >
      {busy ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        icon && <Icon name={icon} className={size === 'lg' ? 'size-6' : 'size-4'} />
      )}
      {children}
    </button>
  );
}

/** Botão quadrado só com ícone (sempre com rótulo acessível). */
export function IconButton({
  icon,
  label,
  className = '',
  badge,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; badge?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`relative grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-night-900/70 text-slate-200 ring-1 ring-astral-gold/25 transition hover:text-astral-gold-soft hover:ring-astral-gold/60 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      <Icon name={icon} className="size-5" />
      {badge && (
        <span className="absolute top-2 right-2 size-2 rounded-full bg-rose-500 ring-2 ring-night-900" />
      )}
    </button>
  );
}
