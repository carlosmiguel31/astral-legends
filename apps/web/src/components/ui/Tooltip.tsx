import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';

/**
 * Dica que aparece no hover e no foco do teclado. O texto fica ligado ao elemento
 * por `aria-describedby`, então leitores de tela também o anunciam.
 */
export function Tooltip({
  content,
  side = 'bottom',
  children,
  className = '',
}: {
  content: ReactNode;
  side?: 'top' | 'bottom';
  children: ReactElement<{ 'aria-describedby'?: string }>;
  className?: string;
}) {
  const id = useId();
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-56 -translate-x-1/2 rounded-[var(--radius-chip)] bg-night-950 px-2.5 py-1.5 text-xs text-slate-100 opacity-0 shadow-lg ring-1 ring-astral-gold/40 transition duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100 ${
          side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
        }`}
      >
        {content}
      </span>
    </span>
  );
}

/** Selo "Em breve" para módulos ainda não implementados. */
export function SoonBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`rounded-full bg-astral-violet-deep/40 px-1.5 py-px text-[9px] whitespace-nowrap leading-tight font-semibold tracking-wider text-astral-violet uppercase ring-1 ring-astral-violet/40 ${className}`}
    >
      Em breve
    </span>
  );
}
