import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

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
        className={`block min-h-11 w-full rounded-[var(--radius-control)] border bg-night-950/70 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:outline-none ${
          error
            ? 'border-rose-400/70 focus:ring-rose-400/40'
            : 'border-astral-gold/20 focus:border-astral-gold/60 focus:ring-astral-gold/25'
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
      className={`rounded-[var(--radius-control)] border px-3 py-2 text-sm ${styles}`}
    >
      {children}
    </div>
  );
}
