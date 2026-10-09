import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-astral-gold text-night-950 hover:bg-astral-gold-soft focus-visible:outline-astral-gold disabled:bg-astral-gold/40',
  secondary:
    'bg-white/8 text-slate-100 ring-1 ring-white/15 hover:bg-white/14 focus-visible:outline-astral-cyan disabled:opacity-50',
  danger:
    'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/40 hover:bg-rose-500/25 focus-visible:outline-rose-300 disabled:opacity-50',
  ghost:
    'text-slate-300 hover:text-white hover:bg-white/8 focus-visible:outline-astral-cyan disabled:opacity-50',
};

export function Button({
  variant = 'primary',
  className = '',
  busy = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {busy && (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

export function Field({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | undefined;
  hint?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {label}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`block w-full rounded-lg border bg-night-950/70 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
          error
            ? 'border-rose-400/70 focus:ring-rose-400/40'
            : 'border-white/12 focus:border-astral-cyan/60 focus:ring-astral-cyan/30'
        }`}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-rose-300">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  color,
  label,
  testId,
  showText = true,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
  testId?: string;
  showText?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 100;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px] leading-none text-slate-400">
        <span>{label}</span>
        {showText && (
          <span className="tabular-nums text-slate-300" data-testid={testId}>
            {value}/{max}
          </span>
        )}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-night-950 ring-1 ring-white/10"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Alert({
  tone = 'error',
  children,
  testId,
}: {
  tone?: 'error' | 'warn' | 'info' | 'success';
  children: ReactNode;
  testId?: string;
}) {
  const styles = {
    error: 'border-rose-400/40 bg-rose-500/10 text-rose-100',
    warn: 'border-amber-300/40 bg-amber-400/10 text-amber-100',
    info: 'border-astral-cyan/30 bg-astral-cyan/10 text-sky-100',
    success: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
  }[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid={testId}
      className={`rounded-lg border px-3 py-2 text-sm ${styles}`}
    >
      {children}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-xl bg-night-950/70 p-1 ring-1 ring-white/10">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition sm:text-sm ${
            active === t.id ? 'bg-astral-gold/90 text-night-950' : 'text-slate-300 hover:bg-white/8'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const RARITY_TEXT: Record<string, string> = {
  common: 'text-slate-200',
  uncommon: 'text-emerald-300',
  rare: 'text-sky-300',
  epic: 'text-fuchsia-300',
  legendary: 'text-orange-300',
  astral: 'text-amber-200',
};

export const RARITY_RING: Record<string, string> = {
  common: 'ring-slate-500/30',
  uncommon: 'ring-emerald-400/40',
  rare: 'ring-sky-400/50',
  epic: 'ring-fuchsia-400/60',
  legendary: 'ring-orange-400/60',
  astral: 'ring-amber-300/70',
};
