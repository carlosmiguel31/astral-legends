import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons';

/** Estado vazio ou indisponível, com ícone, título e explicação curta. */
export function EmptyState({
  icon = 'sparkles',
  title,
  children,
  action,
  compact = false,
  testId,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  testId?: string;
}) {
  return (
    <div
      className={`grid place-items-center text-center ${compact ? 'gap-1.5 py-4' : 'gap-2 py-8'}`}
      data-testid={testId}
    >
      <span className="grid size-11 place-items-center rounded-full bg-astral-violet-deep/20 text-astral-violet ring-1 ring-astral-violet/30">
        <Icon name={icon} className="size-5" />
      </span>
      <p className="font-display text-sm font-semibold text-slate-100">{title}</p>
      {children && (
        <div className="max-w-xs text-xs leading-relaxed text-slate-400">{children}</div>
      )}
      {action}
    </div>
  );
}

/** Indicador de carregamento discreto com texto (sempre anunciado a leitores de tela). */
export function Loading({ children = 'Carregando…' }: { children?: ReactNode }) {
  return (
    <p className="flex items-center gap-2 py-4 text-sm text-slate-400" role="status">
      <span
        className="size-4 animate-spin rounded-full border-2 border-astral-gold/70 border-t-transparent"
        aria-hidden
      />
      {children}
    </p>
  );
}
