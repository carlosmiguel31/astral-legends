import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons';

/**
 * Painel com a moldura ornamentada do design system. `strong` destaca o painel
 * principal; `bare` remove o padding (para conteúdos que ocupam a borda, como o mapa).
 */
export function Panel({
  title,
  icon,
  actions,
  strong = false,
  bare = false,
  as: Tag = 'section',
  className = '',
  bodyClassName = '',
  testId,
  ariaLabel,
  children,
}: {
  title?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  strong?: boolean;
  bare?: boolean;
  as?: 'section' | 'div' | 'aside' | 'article';
  className?: string;
  bodyClassName?: string;
  testId?: string;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  return (
    <Tag
      className={`astral-frame ${strong ? 'astral-frame-strong' : ''} ${className}`}
      data-testid={testId}
      aria-label={ariaLabel}
    >
      {title !== undefined && (
        <header className="flex items-center gap-2 px-[var(--spacing-panel)] pt-3 pb-2">
          {icon && <Icon name={icon} className="size-4 shrink-0 text-astral-gold" />}
          <h2 className="astral-title min-w-0 flex-1 truncate text-[15px]">{title}</h2>
          {actions}
        </header>
      )}
      <div
        className={`${bare ? '' : 'px-[var(--spacing-panel)] pb-[var(--spacing-panel)]'} ${title === undefined && !bare ? 'pt-[var(--spacing-panel)]' : ''} ${bodyClassName}`}
      >
        {children}
      </div>
    </Tag>
  );
}

/** Subtítulo dentro de um painel. */
export function SectionTitle({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-micro font-semibold tracking-wider text-astral-gold-soft/90 uppercase">
      {icon ? (
        <Icon name={icon} className="size-3.5 text-astral-gold" />
      ) : (
        <span className="text-astral-gold" aria-hidden>
          ✦
        </span>
      )}
      {children}
    </h3>
  );
}
