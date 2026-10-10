import type { ContentResponse, GameState } from '@astral/shared';
import { HeroPortrait } from '../../components/HeroPortrait';
import { AstralEmblem } from '../../components/Logo';
import { PixelIcon } from '../../components/pixelIcons';
import { ProgressBar } from '../../components/ui';
import { formatInt, formatMoney, formatPercent } from '../../lib/format';
import type { RealtimeStatus } from '../../lib/useRealtime';
import { AFFINITY, CLASS_NAMES, MODE_LABEL } from './labels';

const CONNECTION: Record<RealtimeStatus, { label: string; dot: string }> = {
  online: { label: 'Online', dot: 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60' },
  connecting: { label: 'Conectando…', dot: 'bg-amber-300' },
  offline: { label: 'Reconectando…', dot: 'bg-amber-300' },
  incompatible: { label: 'Atualize a página', dot: 'bg-rose-400' },
};

/**
 * HUD do personagem. Todos os números vêm do estado do servidor; a vida acompanha a
 * animação do combate (dano real de cada golpe) e volta ao máximo entre encontros.
 */
export function Hud({
  state,
  content,
  heroHp,
  realtime,
  compact,
}: {
  state: GameState;
  content: ContentResponse | null;
  heroHp: { hp: number; max: number } | null;
  realtime: RealtimeStatus;
  compact: boolean;
}) {
  const c = state.character;
  const affinity = AFFINITY[c.affinity] ?? { name: c.affinity, text: '' };
  const regionId = state.hunt?.regionId;
  const region = content?.regions.find((r) => r.id === regionId);
  const progress = state.waves.regions.find((r) => r.regionId === regionId);
  const hunting = state.hunt?.status === 'ACTIVE';
  const hp = heroHp && heroHp.max === state.stats.maxHp ? heroHp.hp : state.stats.maxHp;
  const maxLevel = c.level >= c.maxLevel;
  const connection = CONNECTION[realtime];

  const xpBar = (
    <ProgressBar
      label={maxLevel ? 'Experiência (nível máximo)' : 'Experiência'}
      value={maxLevel ? 1 : c.xp}
      max={maxLevel ? 1 : c.xpToNext}
      tone="xp"
      size={compact ? 'md' : 'lg'}
      testId="hud-xp"
      text={
        maxLevel
          ? 'Máximo'
          : `${formatInt(c.xp)} / ${formatInt(c.xpToNext)}${compact ? '' : ` (${formatPercent(c.xp, c.xpToNext)})`}`
      }
    />
  );
  const hpBar = (
    <ProgressBar
      label="Vida"
      value={hp}
      max={state.stats.maxHp}
      tone="hp"
      size={compact ? 'md' : 'lg'}
      testId="hud-hp"
      text={`${formatInt(hp)} / ${formatInt(state.stats.maxHp)}`}
    />
  );
  const status = (
    <p
      className={`text-xs font-semibold ${hunting ? 'text-emerald-300' : 'text-slate-400'}`}
      data-testid="hud-status"
    >
      {hunting ? `● Caçando · ${MODE_LABEL[progress?.mode ?? 'advance']}` : '○ Descansando'}
    </p>
  );
  const online = (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-slate-300"
      data-testid="hud-realtime"
      data-status={realtime}
    >
      <span className={`size-2 rounded-full ${connection.dot}`} aria-hidden />
      {connection.label}
    </span>
  );
  const currencies = (
    <dl className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <PixelIcon name="coin" className={compact ? 'size-6' : 'size-9'} />
        <div className="leading-tight">
          <dd
            className={`font-semibold tabular-nums text-gold-coin ${compact ? 'text-sm' : 'text-lg'}`}
            data-testid="hud-gold"
          >
            {formatMoney(state.wallet.gold)}
          </dd>
          <dt className="text-micro text-slate-400">Ouro</dt>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <PixelIcon name="essence" className={compact ? 'size-6' : 'size-9'} />
        <div className="leading-tight">
          <dd
            className={`font-semibold tabular-nums text-essence ${compact ? 'text-sm' : 'text-lg'}`}
            data-testid="hud-essence"
          >
            {formatMoney(state.wallet.essence)}
          </dd>
          <dt className="text-micro text-slate-400">{compact ? 'Essência' : 'Essência Astral'}</dt>
        </div>
      </div>
    </dl>
  );
  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={`grid shrink-0 place-items-center rounded-[var(--radius-control)] bg-gradient-to-b from-indigo-deep to-night-950 ring-1 ring-astral-gold/50 ${compact ? 'size-12' : 'size-16'}`}
      >
        <HeroPortrait
          look={{ classId: c.classId, appearance: c.appearance }}
          scale={compact ? 2 : 3}
          label={c.name}
        />
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          <span
            className={`truncate font-display font-semibold text-slate-50 ${compact ? 'text-base' : 'text-xl'}`}
            data-testid="hud-name"
          >
            {c.name}
          </span>
          <span
            className="shrink-0 rounded-md bg-astral-gold/15 px-1.5 py-0.5 font-display text-xs font-bold text-astral-gold ring-1 ring-astral-gold/50"
            data-testid="hud-level"
          >
            Nv {c.level}
          </span>
        </p>
        <p className="truncate text-xs text-slate-300">
          {CLASS_NAMES[c.classId]} · <span className={affinity.text}>{affinity.name}</span>
        </p>
      </div>
    </div>
  );
  const regionLine = (
    <>
      <span data-testid="hud-region">{region?.name ?? 'Nenhuma região'}</span>
      {progress && (
        <span className="text-astral-gold-soft" data-testid="hud-wave">
          {' '}
          · Wave {progress.wave} / {progress.waveCount}
        </span>
      )}
    </>
  );

  if (compact) {
    return (
      <section
        aria-label="Personagem"
        className="astral-frame mx-3 mt-3 space-y-2.5 p-3"
        data-testid="hud"
      >
        <div className="flex items-center justify-between gap-2">
          {identity}
          {currencies}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {xpBar}
          {hpBar}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-300">
          <p className="min-w-0 truncate">{regionLine}</p>
          <div className="flex items-center gap-3">
            {status}
            {online}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Personagem"
      className="astral-frame mx-auto mt-3 grid max-w-[1896px] grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-5 px-4 py-3"
      data-testid="hud"
    >
      {identity}
      <div className="grid min-w-0 grid-cols-2 gap-4">
        {xpBar}
        {hpBar}
      </div>
      {currencies}
      <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-night-950/60 py-1.5 pr-4 pl-2 ring-1 ring-astral-gold/40">
        <AstralEmblem className="size-11" />
        <div className="min-w-0 leading-tight">
          <p className="astral-title truncate text-[15px]">{regionLine}</p>
          <div className="mt-0.5 flex items-center gap-3">
            {status}
            {online}
          </div>
        </div>
      </div>
    </section>
  );
}
