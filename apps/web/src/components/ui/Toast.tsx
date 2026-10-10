import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from '../icons';

export interface ToastInput {
  /** Toasts com o mesmo id substituem o anterior (evita pilhas repetidas). */
  id?: string;
  tone?: 'gold' | 'violet' | 'success' | 'warn' | 'error';
  icon?: IconName;
  title: ReactNode;
  body?: ReactNode;
  testId?: string;
  durationMs?: number;
}

interface ToastEntry extends ToastInput {
  key: string;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

/** Notificações empilhadas, não bloqueantes, anunciadas por `aria-live`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const notify = useCallback((t: ToastInput) => {
    const key = t.id ?? `${Date.now()}-${Math.random()}`;
    setToasts((list) => [...list.filter((x) => x.key !== key), { ...t, key }].slice(-4));
  }, []);
  const dismiss = useCallback((key: string) => {
    setToasts((list) => list.filter((x) => x.key !== key));
  }, []);
  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-20 z-40 flex flex-col items-center gap-2 lg:inset-x-auto lg:right-4 lg:bottom-4 lg:items-end"
      >
        {toasts.map((t) => (
          <ToastCard key={t.key} toast={t} onDismiss={() => dismiss(t.key)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONES = {
  gold: 'ring-astral-gold/60 text-astral-gold',
  violet: 'ring-astral-violet/60 text-astral-violet',
  success: 'ring-emerald-400/50 text-emerald-300',
  warn: 'ring-amber-300/50 text-amber-200',
  error: 'ring-rose-400/50 text-rose-300',
} as const;

function ToastCard({ toast, onDismiss }: { toast: ToastEntry; onDismiss: () => void }) {
  const { durationMs = 9_000 } = toast;
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onDismiss]);
  const tone = TONES[toast.tone ?? 'gold'];
  return (
    <div
      role="status"
      data-testid={toast.testId}
      className={`pointer-events-auto flex w-full max-w-sm animate-pop items-start gap-3 rounded-[var(--radius-panel)] bg-night-900/95 p-3 shadow-xl ring-1 backdrop-blur ${tone}`}
    >
      <Icon name={toast.icon ?? 'sparkles'} className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-semibold">{toast.title}</p>
        {toast.body && <div className="mt-0.5 text-xs text-slate-200">{toast.body}</div>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar aviso"
        className="-m-1 grid size-8 place-items-center rounded-md text-slate-400 hover:text-white"
      >
        <Icon name="close" className="size-4" />
      </button>
    </div>
  );
}

export function useToast(): (t: ToastInput) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa de <ToastProvider>');
  return ctx;
}
