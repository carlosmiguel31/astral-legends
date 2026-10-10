import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons';

/**
 * Janela modal acessível baseada em `<dialog>` nativo: foco preso, Esc fecha, o resto
 * da página fica inerte. `sheet` vira uma folha inferior em telas pequenas.
 */
export function Modal({
  open,
  onClose,
  title,
  icon,
  size = 'md',
  sheet = false,
  testId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: IconName;
  size?: 'md' | 'lg' | 'xl';
  sheet?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const width = { md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  const placement = sheet
    ? 'mt-auto mb-0 w-full max-w-none rounded-t-[var(--radius-panel)] sm:m-auto sm:rounded-[var(--radius-panel)]'
    : 'm-auto w-[calc(100%-2rem)] rounded-[var(--radius-panel)]';

  return (
    <dialog
      ref={ref}
      data-testid={testId}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Clique no fundo (fora do conteúdo) fecha.
        if (e.target === e.currentTarget) onClose();
      }}
      className={`astral-frame astral-frame-strong max-h-[90dvh] overflow-visible p-0 text-slate-200 backdrop:bg-night-950/75 backdrop:backdrop-blur-[2px] open:animate-rise-in ${placement} ${width}`}
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <header className="flex items-center gap-2 border-b border-astral-gold/20 px-4 py-3">
            {icon && <Icon name={icon} className="size-5 text-astral-gold" />}
            <h2 id={titleId} className="astral-title flex-1 text-lg">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid size-11 place-items-center rounded-[var(--radius-control)] text-slate-300 hover:bg-white/8 hover:text-white"
            >
              <Icon name="close" className="size-5" />
            </button>
          </header>
          <div className="astral-scroll overflow-y-auto px-4 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
