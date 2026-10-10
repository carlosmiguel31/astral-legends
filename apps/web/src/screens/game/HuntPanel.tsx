import type {
  ContentResponse,
  GameState,
  HuntSettingsRequest,
  RegionInfo,
  RegionProgressView,
} from '@astral/shared';
import { Icon } from '../../components/icons';
import { RegionArt } from '../../components/RegionArt';
import { Button, EmptyState, Loading, RewardTile, SectionTitle } from '../../components/ui';
import { formatBp, formatMoney } from '../../lib/format';
import { MODE_LABEL } from './labels';

const AFFINITY_DOT: Record<string, string> = {
  solar: 'text-solar',
  lunar: 'text-lunar',
  storm: 'text-storm',
  abyssal: 'text-abyssal',
};

interface Actions {
  busy: string | null;
  onStart: (regionId: string) => void;
  onStop: () => void;
  onSettings: (input: HuntSettingsRequest) => void;
}

const progressOf = (state: GameState, regionId: string) =>
  state.waves.regions.find((r) => r.regionId === regionId);

/** Botão de iniciar/parar a caçada para a região (um único lugar por tela). */
export function HuntToggle({
  state,
  region,
  busy,
  onStart,
  onStop,
  size = 'lg',
}: Pick<Actions, 'busy' | 'onStart' | 'onStop'> & {
  state: GameState;
  region: RegionInfo;
  size?: 'md' | 'lg';
}) {
  const hunting = state.hunt?.status === 'ACTIVE';
  const here = hunting && state.hunt?.regionId === region.id;
  const unlocked = state.character.level >= region.unlock.minLevel;
  if (here) {
    return (
      <Button
        variant="danger"
        size={size}
        icon="stop"
        className="w-full"
        onClick={onStop}
        busy={busy === 'stop'}
        disabled={busy !== null}
      >
        Parar caçada
      </Button>
    );
  }
  if (!unlocked) {
    return (
      <p className="flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-night-950/60 text-sm text-slate-300 ring-1 ring-white/10">
        🔒 {region.unlock.description}
      </p>
    );
  }
  return (
    <Button
      size={size}
      icon="play"
      className="w-full"
      onClick={() => onStart(region.id)}
      busy={busy === `start:${region.id}`}
      disabled={busy !== null}
      aria-label={`Caçar em ${region.name}`}
    >
      {hunting ? 'Caçar aqui' : 'Iniciar caçada'}
    </Button>
  );
}

/** Cartão da região selecionada: ilustração, descrição e controle da caçada. */
export function RegionCard({
  state,
  region,
  onOpenRegions,
  ...actions
}: Actions & { state: GameState; region: RegionInfo; onOpenRegions?: () => void }) {
  const p = progressOf(state, region.id);
  const here = state.hunt?.status === 'ACTIVE' && state.hunt.regionId === region.id;
  return (
    <article className="space-y-3" data-testid={`region-card-${region.id}`}>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="astral-title flex items-center gap-1.5 text-base">
          <span className="text-astral-gold" aria-hidden>
            ✦
          </span>
          {region.name}
        </h3>
        <span className="shrink-0 text-xs text-slate-300">
          Nv {region.minLevel}–{region.maxLevel}
        </span>
      </header>
      <div className="relative overflow-hidden rounded-[var(--radius-control)] ring-1 ring-astral-gold/40">
        <RegionArt
          regionId={region.id}
          label={`Ilustração de ${region.name}`}
          className="aspect-[20/9] w-full"
        />
        {here && (
          <span className="absolute top-2 right-2 rounded-full bg-emerald-500/85 px-2 py-0.5 text-[11px] font-semibold text-night-950">
            ● Caçando aqui
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-slate-300">{region.description}</p>
      <p className="text-xs text-slate-400">
        Dificuldade {region.difficulty}
        {p && (
          <span className="text-astral-gold-soft" data-testid={`region-waves-${region.id}`}>
            {' '}
            · Wave {p.wave}/{p.waveCount} · {MODE_LABEL[p.mode]} · concluídas {p.highestCleared}/
            {p.waveCount}
          </span>
        )}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {region.monsters.map((m) => (
          <li key={m.id} className="text-slate-300">
            <span className={AFFINITY_DOT[m.affinity]} aria-hidden>
              ●
            </span>{' '}
            {m.name} <span className="text-slate-500">Nv {m.level}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <div className="flex-1">
          <HuntToggle state={state} region={region} {...actions} size="md" />
        </div>
        {onOpenRegions && (
          <Button variant="gold-outline" icon="map" onClick={onOpenRegions}>
            Regiões
          </Button>
        )}
      </div>
    </article>
  );
}

/** Lista de regiões (seleção). Bloqueadas mostram o requisito de nível. */
export function RegionList({
  state,
  content,
  selected,
  onSelect,
  layout = 'column',
}: {
  state: GameState;
  content: ContentResponse;
  selected: string;
  onSelect: (id: string) => void;
  layout?: 'column' | 'grid';
}) {
  return (
    <ul
      className={layout === 'grid' ? 'grid gap-2 sm:grid-cols-3' : 'space-y-2'}
      aria-label="Regiões"
    >
      {content.regions.map((region) => {
        const unlocked = state.character.level >= region.unlock.minLevel;
        const p = progressOf(state, region.id);
        const active = selected === region.id;
        const hunting = state.hunt?.status === 'ACTIVE' && state.hunt.regionId === region.id;
        return (
          <li key={region.id}>
            <button
              type="button"
              onClick={() => onSelect(region.id)}
              aria-pressed={active}
              aria-label={`Ver ${region.name}`}
              className={`flex w-full items-center gap-2.5 rounded-[var(--radius-control)] p-1.5 pr-2 text-left ring-1 transition ${
                active
                  ? 'bg-astral-gold/10 ring-astral-gold/80 shadow-[var(--shadow-glow-gold)]'
                  : 'bg-night-950/55 ring-white/10 hover:ring-astral-gold/40'
              }`}
            >
              <span className="relative shrink-0 overflow-hidden rounded-md ring-1 ring-black/40">
                <RegionArt
                  regionId={region.id}
                  label=""
                  className={`h-9 w-14 ${unlocked ? '' : 'opacity-40 grayscale'}`}
                />
                {!unlocked && (
                  <span className="absolute inset-0 grid place-items-center text-slate-200">
                    <Icon name="lock" className="size-5" />
                  </span>
                )}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[13px] font-semibold text-slate-100">
                  {region.name}
                </span>
                <span className="block text-[11px] text-slate-400">
                  {unlocked
                    ? `${hunting ? '● ' : ''}Wave ${p?.wave ?? 1}/${p?.waveCount ?? region.waves.count} · Nv ${region.minLevel}–${region.maxLevel}`
                    : `🔒 ${region.unlock.description}`}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Progressão da região em etapas (seleção de wave) e os modos Avançar/Farmar.
 * Toda mudança é validada e aplicada pelo servidor; aqui só se faz o pedido.
 */
export function WaveControls({
  state,
  content,
  regionId,
  busy,
  onSettings,
}: {
  state: GameState;
  content: ContentResponse | null;
  regionId: string;
  busy: string | null;
  onSettings: (input: HuntSettingsRequest) => void;
}) {
  const p: RegionProgressView | undefined = progressOf(state, regionId);
  const region = content?.regions.find((r) => r.id === regionId);
  if (!p) return null;
  const level = state.character.level;
  const unlockedRegion = !region || level >= region.unlock.minLevel;
  const waves = region?.waves.list ?? [];
  const disabled = busy !== null;

  if (!unlockedRegion) {
    return (
      <EmptyState icon="lock" title="Região bloqueada" compact>
        {region?.unlock.description}. O progresso de waves aparece aqui quando a região for
        liberada.
      </EmptyState>
    );
  }

  return (
    <section className="space-y-4" data-testid="wave-panel" aria-label="Progresso de waves">
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <SectionTitle>Progresso da região</SectionTitle>
          <span
            className="text-xs text-slate-300"
            data-testid="wave-cleared"
            data-value={p.highestCleared}
          >
            concluídas {p.highestCleared}/{p.waveCount}
          </span>
        </div>
        <ol className="flex flex-wrap items-center gap-y-3" data-testid="wave-selector">
          {Array.from({ length: p.waveCount }, (_, i) => {
            const wave = i + 1;
            const info = waves[i];
            const locked = wave > p.unlockedWave;
            const levelLocked = !locked && info !== undefined && level < info.minLevel;
            const current = wave === p.wave;
            const cleared = wave <= p.highestCleared;
            const kind = info?.kind ?? 'normal';
            const kindLabel = kind === 'boss' ? ' (Chefe)' : kind === 'elite' ? ' (Elite)' : '';
            const title = locked
              ? `Wave ${wave}: conclua a wave ${wave - 1} para liberar`
              : levelLocked
                ? `Wave ${wave}: exige nível ${info!.minLevel}`
                : `Wave ${wave}${kindLabel}${cleared ? ' · concluída' : ''}`;
            return (
              <li key={wave} className="flex items-center">
                <button
                  type="button"
                  title={title}
                  aria-label={title}
                  aria-current={current ? 'true' : undefined}
                  disabled={disabled || locked || levelLocked || current}
                  onClick={() => onSettings({ regionId, wave })}
                  data-testid={`wave-option-${wave}`}
                  className={`relative grid size-9 place-items-center rounded-full font-display text-sm font-bold tabular-nums ring-2 transition ${
                    current
                      ? 'bg-gradient-to-b from-emerald-500/40 to-night-950 text-white ring-astral-gold shadow-[var(--shadow-glow-gold)]'
                      : locked || levelLocked
                        ? 'cursor-not-allowed bg-night-950/70 text-slate-500 ring-white/10'
                        : cleared
                          ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/60 hover:ring-astral-gold'
                          : 'bg-night-950 text-slate-100 ring-astral-violet/50 hover:ring-astral-gold'
                  }`}
                >
                  {locked ? <Icon name="lock" className="size-4" /> : wave}
                  {levelLocked && (
                    <span className="absolute -bottom-3 text-[9px] font-normal whitespace-nowrap text-slate-400">
                      Nv {info!.minLevel}
                    </span>
                  )}
                  {kind !== 'normal' && !locked && (
                    <span
                      className={`absolute -top-1.5 -right-1.5 text-[11px] ${kind === 'boss' ? 'text-rose-300' : 'text-astral-violet'}`}
                      aria-hidden
                    >
                      {kind === 'boss' ? '♛' : '◆'}
                    </span>
                  )}
                </button>
                {wave < p.waveCount && (
                  <span
                    className={`h-0.5 w-2 ${wave <= p.highestCleared ? 'bg-emerald-400/60' : 'bg-white/12'}`}
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-[11px] text-slate-400">
          Escolher outra wave recomeça a contagem dela; trocar só o modo mantém as vitórias.
        </p>
      </div>

      <div role="group" aria-label="Modo de caça" className="grid grid-cols-2 gap-2">
        {(['advance', 'farm'] as const).map((mode) => {
          const active = p.mode === mode;
          return (
            <Button
              key={mode}
              size="lg"
              variant={active ? 'primary' : 'secondary'}
              icon={mode === 'advance' ? 'swords' : 'infinity'}
              aria-pressed={active}
              disabled={disabled && !active}
              onClick={() => {
                if (!active) onSettings({ regionId, mode });
              }}
              data-testid={`mode-${mode}`}
              className={active ? 'cursor-default' : ''}
            >
              {MODE_LABEL[mode]}
            </Button>
          );
        })}
      </div>
      <p className="-mt-2 text-[11px] text-slate-400">
        {p.mode === 'advance'
          ? 'Avançar: ao completar 15 vitórias o herói segue sozinho para a próxima wave.'
          : 'Farmar: o herói repete a wave escolhida, sem perder o progresso já liberado.'}
      </p>
    </section>
  );
}

/** Recompensas possíveis da região (faixas vindas do conteúdo do servidor). */
export function RegionRewards({ region }: { region: RegionInfo }) {
  const r = region.rewards;
  return (
    <section>
      <SectionTitle>Recompensas da região</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <RewardTile layout="row" kind="xp" value={`${r.xp[0]}–${r.xp[1]}`} label="XP por vitória" />
        <RewardTile
          layout="row"
          kind="gold"
          value={`${r.gold[0]}–${r.gold[1]}`}
          label="Ouro por vitória"
        />
        <RewardTile
          layout="row"
          kind="essence"
          value={`${formatBp(r.essenceChanceBp[0])}–${formatBp(r.essenceChanceBp[1])}`}
          label="Chance de essência"
        />
        <RewardTile
          layout="row"
          kind="items"
          value={`${formatBp(r.itemDropChanceBp[0])}–${formatBp(r.itemDropChanceBp[1])}`}
          label="Chance de item"
        />
      </div>
    </section>
  );
}

/** Totais acumulados na wave atual (persistidos no servidor). */
export function WaveTotals({ progress }: { progress: RegionProgressView }) {
  const t = progress.totals;
  return (
    <section>
      <SectionTitle>Recompensas desta wave</SectionTitle>
      <div className="grid grid-cols-4 gap-2" data-testid="wave-totals">
        <RewardTile kind="xp" value={`+${t.xp}`} label="EXP" />
        <RewardTile kind="gold" value={`+${formatMoney(t.gold)}`} label="Ouro" />
        <RewardTile kind="essence" value={`+${formatMoney(t.essence)}`} label="Essência" />
        <RewardTile kind="items" value={t.items} label="Itens" />
      </div>
    </section>
  );
}

/** Aba "Caça" do painel lateral (desktop): região, regiões, waves, modos e recompensas. */
export function HuntPanel({
  state,
  content,
  selected,
  onSelect,
  ...actions
}: Actions & {
  state: GameState;
  content: ContentResponse | null;
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (!content) return <Loading>Carregando regiões…</Loading>;
  const region = content.regions.find((r) => r.id === selected) ?? content.regions[0]!;
  const p = progressOf(state, region.id);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_210px]">
        <RegionCard state={state} region={region} {...actions} />
        <div>
          <SectionTitle icon="map">Regiões</SectionTitle>
          <RegionList state={state} content={content} selected={region.id} onSelect={onSelect} />
        </div>
      </div>
      <div className="astral-divider" />
      <WaveControls
        state={state}
        content={content}
        regionId={region.id}
        busy={actions.busy}
        onSettings={actions.onSettings}
      />
      <div className="astral-divider" />
      <RegionRewards region={region} />
      {p && <WaveTotals progress={p} />}
    </div>
  );
}
