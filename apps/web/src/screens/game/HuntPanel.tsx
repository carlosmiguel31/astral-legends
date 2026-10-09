import type { ContentResponse, GameState } from '@astral/shared';
import { Button } from '../../components/ui';
import { formatBp } from '../../lib/format';

const AFFINITY_CLASS: Record<string, string> = {
  solar: 'text-solar',
  lunar: 'text-lunar',
  storm: 'text-storm',
  abyssal: 'text-abyssal',
};

export function HuntPanel({
  state,
  content,
  busy,
  onStart,
  onStop,
}: {
  state: GameState;
  content: ContentResponse | null;
  busy: string | null;
  onStart: (regionId: string) => void;
  onStop: () => void;
}) {
  const hunting = state.hunt?.status === 'ACTIVE';
  const level = state.character.level;

  return (
    <div className="space-y-4">
      {hunting && (
        <Button variant="danger" className="w-full" onClick={onStop} busy={busy === 'stop'}>
          Parar caçada
        </Button>
      )}
      {!content && <p className="text-sm text-slate-500">Carregando regiões…</p>}
      {content?.regions.map((region) => {
        const unlocked = level >= region.unlock.minLevel;
        const active = hunting && state.hunt?.regionId === region.id;
        return (
          <article
            key={region.id}
            className={`rounded-xl p-4 ring-1 ${active ? 'bg-emerald-500/5 ring-emerald-400/40' : 'bg-night-950/50 ring-white/10'} ${unlocked ? '' : 'opacity-70'}`}
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-base text-slate-100">{region.name}</h3>
              <span className="text-xs text-slate-400">
                Nv {region.minLevel}–{region.maxLevel} · {region.difficulty}
              </span>
            </header>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{region.description}</p>
            <ul className="mt-3 space-y-1 text-xs">
              {region.monsters.map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <span className="text-slate-300">
                    {m.name} <span className="text-slate-500">Nv {m.level}</span>{' '}
                    <span className={AFFINITY_CLASS[m.affinity]}>●</span>
                  </span>
                  <span className="tabular-nums text-slate-500">{formatBp(m.spawnChanceBp)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">
              Recompensas: {region.rewards.xp[0]}–{region.rewards.xp[1]} XP ·{' '}
              {region.rewards.gold[0]}–{region.rewards.gold[1]} ouro · itens{' '}
              {formatBp(region.rewards.itemDropChanceBp[0])}–
              {formatBp(region.rewards.itemDropChanceBp[1])}
            </p>
            <div className="mt-3">
              {active ? (
                <p className="text-sm font-semibold text-emerald-300">Caçando aqui</p>
              ) : unlocked ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => onStart(region.id)}
                  busy={busy === `start:${region.id}`}
                  disabled={busy !== null}
                  aria-label={`Caçar em ${region.name}`}
                >
                  Caçar aqui
                </Button>
              ) : (
                <p className="text-sm text-slate-400">🔒 {region.unlock.description}</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
