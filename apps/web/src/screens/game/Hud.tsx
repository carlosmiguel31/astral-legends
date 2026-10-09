import type { ContentResponse, GameState } from '@astral/shared';
import { HeroPortrait } from '../../components/HeroPortrait';
import { ProgressBar } from '../../components/ui';
import { formatMoney } from '../../lib/format';
import type { RealtimeStatus } from '../../lib/useRealtime';

const CLASS_NAMES: Record<string, string> = {
  guardian: 'Guardião Astral',
  arcanist: 'Arcanista Celestial',
  blade: 'Lâmina Estelar',
};
const AFFINITY: Record<string, [string, string]> = {
  solar: ['Solar', 'text-solar'],
  lunar: ['Lunar', 'text-lunar'],
  storm: ['Tempestade', 'text-storm'],
  abyssal: ['Abissal', 'text-abyssal'],
};

export function Hud({
  state,
  content,
  heroHp,
  realtime,
  onLogout,
  onLogoutAll,
}: {
  state: GameState;
  content: ContentResponse | null;
  heroHp: { hp: number; max: number } | null;
  realtime: RealtimeStatus;
  onLogout: () => void;
  onLogoutAll: () => void;
}) {
  const c = state.character;
  const [affName, affClass] = AFFINITY[c.affinity] ?? [c.affinity, ''];
  const region = content?.regions.find((r) => r.id === state.hunt?.regionId);
  const hunting = state.hunt?.status === 'ACTIVE';
  const hp = heroHp && heroHp.max === state.stats.maxHp ? heroHp.hp : state.stats.maxHp;
  const maxLevel = c.level >= c.maxLevel;

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-night-900/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-night-950 ring-1 ring-white/10">
            <HeroPortrait
              look={{ classId: c.classId, appearance: c.appearance }}
              scale={2}
              label={c.name}
            />
          </div>
          <div className="min-w-0">
            <p className="flex items-baseline gap-2">
              <span className="truncate font-display text-lg text-slate-100" data-testid="hud-name">
                {c.name}
              </span>
              <span
                className="rounded-md bg-astral-gold/15 px-1.5 py-0.5 text-xs font-bold text-astral-gold"
                data-testid="hud-level"
              >
                Nv {c.level}
              </span>
            </p>
            <p className="truncate text-xs text-slate-400">
              {CLASS_NAMES[c.classId]} · <span className={affClass}>{affName}</span>
            </p>
          </div>
        </div>

        <div className="grid min-w-[220px] flex-1 grid-cols-2 gap-3">
          <ProgressBar
            label={maxLevel ? 'Experiência (nível máximo)' : 'Experiência'}
            value={c.xp}
            max={maxLevel ? 1 : c.xpToNext}
            color="bg-gradient-to-r from-indigo-400 to-astral-violet"
            testId="hud-xp"
            showText={!maxLevel}
          />
          <ProgressBar
            label="Vida"
            value={hp}
            max={state.stats.maxHp}
            color="bg-gradient-to-r from-rose-500 to-rose-400"
            testId="hud-hp"
          />
        </div>

        <dl className="flex items-center gap-4 text-sm">
          <div>
            <dt className="text-[11px] text-slate-500">Ouro</dt>
            <dd className="font-semibold tabular-nums text-amber-300" data-testid="hud-gold">
              {formatMoney(state.wallet.gold)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">Essência</dt>
            <dd className="font-semibold tabular-nums text-violet-300" data-testid="hud-essence">
              {formatMoney(state.wallet.essence)}
            </dd>
          </div>
        </dl>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] text-slate-500" data-testid="hud-region">
              {region?.name ?? 'Nenhuma região'}
            </p>
            <p
              className={`text-xs font-semibold ${hunting ? 'text-emerald-300' : 'text-slate-400'}`}
              data-testid="hud-status"
            >
              {hunting ? '● Caçando' : '○ Descansando'}
            </p>
          </div>
          <span
            title={realtime === 'online' ? 'Tempo real conectado' : 'Tempo real reconectando'}
            className={`size-2.5 rounded-full ${realtime === 'online' ? 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60' : 'bg-amber-300'}`}
            data-testid="hud-realtime"
            data-status={realtime}
          />
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/8">
              Conta ▾
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-56 space-y-1 rounded-xl border border-white/10 bg-night-800 p-2 shadow-xl">
              <button
                type="button"
                onClick={onLogout}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/8"
              >
                Sair
              </button>
              <button
                type="button"
                onClick={onLogoutAll}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-200 hover:bg-rose-500/15"
              >
                Sair de todos os dispositivos
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
