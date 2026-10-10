import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../../components/icons';
import { Logo } from '../../components/Logo';
import { IconButton, Modal, SoonBadge, Tooltip } from '../../components/ui';

export type NavAction = 'play' | 'character' | 'inventory' | 'map';

interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  /** Ação de um módulo implementado; ausente = "Em breve" (desabilitado). */
  action?: NavAction;
}

/**
 * Navegação principal. Só Jogar, Personagem, Inventário e Mapa estão implementados;
 * os demais aparecem desabilitados com "Em breve" — nenhuma página fictícia.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'play', label: 'Jogar', icon: 'swords', action: 'play' },
  { id: 'character', label: 'Personagem', icon: 'user', action: 'character' },
  { id: 'inventory', label: 'Inventário', icon: 'bag', action: 'inventory' },
  { id: 'map', label: 'Mapa', icon: 'map', action: 'map' },
  { id: 'achievements', label: 'Conquistas', icon: 'trophy' },
  { id: 'rankings', label: 'Rankings', icon: 'ranking' },
  { id: 'bosses', label: 'Chefes', icon: 'crown' },
  { id: 'pvp', label: 'PvP', icon: 'pvp' },
  { id: 'market', label: 'Mercado', icon: 'store' },
  { id: 'pass', label: 'Passe', icon: 'ticket' },
];

function AccountMenu({ onLogout, onLogoutAll }: { onLogout: () => void; onLogoutAll: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <IconButton
        icon="user"
        label="Conta"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          role="menu"
          className="astral-frame absolute right-0 z-50 mt-2 w-60 animate-rise-in space-y-1 p-2"
        >
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 text-left text-sm hover:bg-white/8"
          >
            <Icon name="logout" className="size-4" />
            Sair
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onLogoutAll}
            className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 text-left text-sm text-rose-200 hover:bg-rose-500/15"
          >
            <Icon name="logout" className="size-4" />
            Sair de todos os dispositivos
          </button>
        </div>
      )}
    </div>
  );
}

/** Ícones reservados para sistemas futuros (amigos, correio, configurações). */
function FutureButtons() {
  return (
    <>
      {(
        [
          ['users', 'Amigos e guilda'],
          ['mail', 'Correio'],
          ['gear', 'Configurações'],
        ] as const
      ).map(([icon, label]) => (
        <Tooltip key={icon} content={`${label} — em breve`}>
          <IconButton icon={icon} label={`${label} (em breve)`} disabled />
        </Tooltip>
      ))}
    </>
  );
}

export function TopNav({
  onAction,
  onLogout,
  onLogoutAll,
  compact,
}: {
  onAction: (action: NavAction) => void;
  onLogout: () => void;
  onLogoutAll: () => void;
  compact: boolean;
}) {
  const [drawer, setDrawer] = useState(false);

  if (compact) {
    return (
      <header className="sticky top-0 z-30 border-b border-astral-gold/25 bg-night-950/92 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2">
          <Logo compact />
          <div className="flex-1" />
          <AccountMenu onLogout={onLogout} onLogoutAll={onLogoutAll} />
          <IconButton icon="menu" label="Menu" onClick={() => setDrawer(true)} />
        </div>
        <Modal open={drawer} onClose={() => setDrawer(false)} title="Menu" icon="menu" sheet>
          <nav aria-label="Principal" className="grid grid-cols-2 gap-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.action}
                onClick={() => {
                  setDrawer(false);
                  if (item.action) onAction(item.action);
                }}
                className="flex min-h-14 items-center gap-2 rounded-[var(--radius-control)] bg-night-900/70 px-3 text-left text-sm ring-1 ring-astral-gold/20 enabled:hover:ring-astral-gold/60 disabled:opacity-55"
              >
                <Icon name={item.icon} className="size-5 text-astral-gold" />
                <span className="flex-1">{item.label}</span>
                {!item.action && <SoonBadge />}
              </button>
            ))}
          </nav>
          <p className="mt-4 text-xs text-slate-400">
            Chat, amigos, correio e configurações também chegam em próximas fases.
          </p>
        </Modal>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-astral-gold/25 bg-night-950/92 backdrop-blur">
      <div className="mx-auto flex max-w-[1920px] items-center gap-3 px-4 py-2 2xl:px-6">
        <Logo />
        <nav aria-label="Principal" className="mx-auto flex items-stretch gap-1 xl:gap-1.5">
          {NAV_ITEMS.map((item) => {
            const active = item.id === 'play';
            const body = (
              <button
                type="button"
                disabled={!item.action}
                aria-current={active ? 'page' : undefined}
                aria-label={item.action ? item.label : `${item.label} (em breve)`}
                onClick={() => item.action && onAction(item.action)}
                className={`group relative flex min-h-14 min-w-14 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] px-2 font-display text-[12px] font-semibold tracking-wide transition xl:min-w-[76px] ${
                  active
                    ? 'bg-gradient-to-b from-astral-violet-deep/70 to-indigo-deep text-astral-gold-soft shadow-[var(--shadow-glow-gold)]'
                    : 'text-slate-200 ring-1 ring-white/6 enabled:hover:bg-white/6 enabled:hover:text-astral-gold-soft enabled:hover:ring-astral-gold/40 disabled:cursor-not-allowed disabled:text-slate-500'
                }`}
              >
                <Icon
                  name={item.icon}
                  className={`size-5 ${active ? 'text-astral-gold' : item.action ? 'text-astral-gold/80' : ''}`}
                />
                <span className="hidden xl:block">{item.label}</span>
                {!item.action && (
                  <span className="absolute -top-2 left-1/2 hidden -translate-x-1/2 xl:block">
                    <SoonBadge className="bg-night-900 !text-[8px]" />
                  </span>
                )}
              </button>
            );
            return (
              <Tooltip
                key={item.id}
                content={item.action ? item.label : `${item.label} — em breve`}
              >
                {body}
              </Tooltip>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <FutureButtons />
          <AccountMenu onLogout={onLogout} onLogoutAll={onLogoutAll} />
        </div>
      </div>
    </header>
  );
}
