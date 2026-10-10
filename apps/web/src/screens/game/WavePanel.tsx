import type {
  ContentResponse,
  GameState,
  HuntSettingsRequest,
  RegionProgressView,
  WaveClearView,
  WaveNoticeView,
} from '@astral/shared';
import { formatMoney } from '../../lib/format';

const RARITY_NAME: Record<string, string> = {
  common: 'comum',
  uncommon: 'incomum',
  rare: 'raro',
  epic: 'épico',
  legendary: 'lendário',
  astral: 'astral',
};

const KIND_BADGE = {
  elite: {
    label: 'Elite',
    icon: '◆',
    className: 'bg-violet-500/20 text-violet-200 ring-violet-400/40',
  },
  boss: { label: 'Chefe', icon: '♛', className: 'bg-rose-500/20 text-rose-200 ring-rose-400/40' },
} as const;

export function noticeText(n: WaveNoticeView): string {
  switch (n.type) {
    case 'retreat':
      return `Derrotas seguidas: o herói recuou da wave ${n.fromWave} para a ${n.toWave} e passou a farmar. Fortaleça-se e volte a avançar quando quiser.`;
    case 'content_limit':
      return `Você concluiu todo o conteúdo disponível nesta região (wave ${n.wave}). O herói segue farmando a última wave; novas waves chegam em atualizações futuras.`;
    case 'level_gate':
      return `A wave ${n.nextWave} exige nível ${n.minLevel}. O herói repete a wave ${n.wave} até alcançá-lo.`;
  }
}

function nextStepText(p: RegionProgressView, level: number, nextMinLevel: number | null): string {
  if (p.mode === 'farm') return `Ao concluir, repete a wave ${p.wave}.`;
  if (p.wave >= p.waveCount)
    return 'Ao concluir, passa a farmar esta wave (fim do conteúdo atual).';
  if (nextMinLevel !== null && level < nextMinLevel)
    return `Ao concluir, repete esta wave até o nível ${nextMinLevel}.`;
  return `Ao concluir, avança para a wave ${p.wave + 1}.`;
}

function clearNextText(c: WaveClearView): string {
  switch (c.next.reason) {
    case 'advance':
      return `Avançando para a wave ${c.next.wave}.`;
    case 'repeat':
      return `Repetindo a wave ${c.next.wave}.`;
    case 'level_gate':
      return `Repetindo a wave ${c.next.wave} até liberar a próxima pelo nível.`;
    case 'content_limit':
      return `Fim do conteúdo atual: farmando a wave ${c.next.wave}.`;
  }
}

/** Faixa de 15 segmentos: vitórias da wave atual; o último marca o encontro especial. */
function WaveProgress({ p, wins }: { p: RegionProgressView; wins: number }) {
  const special = p.waveKind === 'normal' ? null : KIND_BADGE[p.waveKind];
  return (
    <div
      role="progressbar"
      aria-label={`Vitórias na wave ${p.wave}`}
      aria-valuemin={0}
      aria-valuemax={wins}
      aria-valuenow={p.waveWins}
      data-testid="wave-progress"
      data-value={p.waveWins}
      className="flex gap-0.5"
    >
      {Array.from({ length: wins }, (_, i) => {
        const filled = i < p.waveWins;
        const last = i === wins - 1;
        const color = filled
          ? last && special
            ? p.waveKind === 'boss'
              ? 'bg-rose-400'
              : 'bg-violet-400'
            : 'bg-gradient-to-b from-astral-gold-soft to-astral-gold'
          : last && special
            ? 'bg-night-950 ring-1 ring-inset ring-current'
            : 'bg-night-950';
        return (
          <span
            key={i}
            className={`grid h-3 flex-1 place-items-center rounded-[3px] text-[9px] leading-none ${color} ${last && special ? (p.waveKind === 'boss' ? 'text-rose-300' : 'text-violet-300') : ''}`}
          >
            {last && special && !filled ? special.icon : ''}
          </span>
        );
      })}
    </div>
  );
}

export function WavePanel({
  state,
  content,
  busy,
  feedback,
  onDismissFeedback,
  onSettings,
}: {
  state: GameState;
  content: ContentResponse | null;
  busy: string | null;
  feedback: WaveClearView | null;
  onDismissFeedback: () => void;
  onSettings: (input: HuntSettingsRequest) => void;
}) {
  const regionId = state.hunt?.regionId ?? 'campos-do-alvorecer';
  const p = state.waves.regions.find((r) => r.regionId === regionId);
  const region = content?.regions.find((r) => r.id === regionId);
  if (!p) return null;

  const hunting = state.hunt?.status === 'ACTIVE';
  const level = state.character.level;
  const winsPerWave = state.waves.winsPerWave;
  const waves = region?.waves.list ?? [];
  const current = waves[p.wave - 1];
  const nextMinLevel = waves[p.wave]?.minLevel ?? null;
  const badge = p.waveKind === 'normal' ? null : KIND_BADGE[p.waveKind];
  const special =
    p.waveKind === 'boss'
      ? region?.waves.boss
      : p.waveKind === 'elite'
        ? region?.waves.elite
        : null;
  const pendingFirstClear = p.wave > p.highestCleared && current ? current.firstClear : null;
  const disabled = busy !== null;
  const shownFeedback = feedback && feedback.regionId === regionId ? feedback : null;

  return (
    <section
      className="space-y-3 rounded-2xl border border-white/10 bg-night-800/70 p-4"
      data-testid="wave-panel"
      aria-label="Progresso de waves"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            {region?.name ?? regionId}
          </p>
          <h2 className="flex items-center gap-2 font-display text-lg text-slate-100">
            <span data-testid="wave-current">
              Wave {p.wave}
              <span className="text-sm text-slate-500">/{p.waveCount}</span>
            </span>
            {badge && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ring-1 ${badge.className}`}
                data-testid="wave-kind"
              >
                {badge.icon} {badge.label}
              </span>
            )}
          </h2>
        </div>
        <div
          role="group"
          aria-label="Modo de caça"
          className="inline-flex rounded-lg bg-night-950 p-0.5 ring-1 ring-white/10"
        >
          {(['advance', 'farm'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={p.mode === mode}
              disabled={disabled || p.mode === mode}
              onClick={() => onSettings({ regionId, mode })}
              data-testid={`mode-${mode}`}
              className={`min-h-9 rounded-md px-3 text-sm font-semibold transition disabled:cursor-default ${
                p.mode === mode
                  ? 'bg-astral-gold text-night-950 shadow'
                  : 'text-slate-300 hover:bg-white/8 disabled:opacity-60'
              }`}
            >
              {mode === 'advance' ? 'Avançar' : 'Farmar'}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-slate-400">
            {hunting ? 'Vitórias nesta wave' : 'Vitórias salvas nesta wave'}
          </span>
          <span className="font-semibold tabular-nums text-slate-200" data-testid="wave-wins">
            {p.waveWins}/{winsPerWave}
          </span>
        </div>
        <WaveProgress p={p} wins={winsPerWave} />
        {special && (
          <p className="text-xs text-slate-400">
            A {winsPerWave}ª vitória é contra{' '}
            <span className={p.waveKind === 'boss' ? 'text-rose-200' : 'text-violet-200'}>
              {special.name}
            </span>{' '}
            (Nv {special.level}). Derrotas não contam: ele volta até ser vencido.
          </p>
        )}
        <p className="text-xs text-slate-400" data-testid="wave-next">
          {nextStepText(p, level, nextMinLevel)}
        </p>
      </div>

      {p.notice && (
        <p
          className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-300/30"
          data-testid="wave-notice"
          role="status"
        >
          {noticeText(p.notice)}
        </p>
      )}

      <dl className="grid grid-cols-4 gap-2 rounded-lg bg-night-950/60 p-2 text-center text-[11px]">
        <div>
          <dt className="text-slate-500">XP</dt>
          <dd className="font-semibold tabular-nums text-indigo-200">{p.totals.xp}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Ouro</dt>
          <dd className="font-semibold tabular-nums text-amber-300">
            {formatMoney(p.totals.gold)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Essência</dt>
          <dd className="font-semibold tabular-nums text-violet-300">
            {formatMoney(p.totals.essence)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Itens</dt>
          <dd className="font-semibold tabular-nums text-slate-200">{p.totals.items}</dd>
        </div>
      </dl>
      {pendingFirstClear && (
        <p className="text-xs text-astral-gold-soft" data-testid="wave-first-clear">
          1ª conclusão: +{pendingFirstClear.gold} ouro, +{pendingFirstClear.essence} essência
          {pendingFirstClear.itemRarity
            ? `, item ${RARITY_NAME[pendingFirstClear.itemRarity]} exclusivo`
            : ''}
        </p>
      )}

      <div>
        <p className="mb-1.5 text-xs text-slate-400">
          Escolher wave{' '}
          <span className="text-slate-500">
            (concluídas: {p.highestCleared}/{p.waveCount})
          </span>
        </p>
        <div className="grid grid-cols-5 gap-1.5" data-testid="wave-selector">
          {Array.from({ length: p.waveCount }, (_, i) => {
            const wave = i + 1;
            const info = waves[i];
            const locked = wave > p.unlockedWave;
            const levelLocked = !locked && info !== undefined && level < info.minLevel;
            const isCurrent = wave === p.wave;
            const kind = info?.kind ?? 'normal';
            const cleared = wave <= p.highestCleared;
            const title = locked
              ? `Wave ${wave}: conclua a wave ${wave - 1} para liberar`
              : levelLocked
                ? `Wave ${wave}: exige nível ${info!.minLevel}`
                : `Wave ${wave}${kind === 'normal' ? '' : ` (${KIND_BADGE[kind].label})`}${cleared ? ' · concluída' : ''}`;
            return (
              <button
                key={wave}
                type="button"
                title={title}
                aria-label={title}
                aria-current={isCurrent ? 'true' : undefined}
                disabled={disabled || locked || levelLocked || isCurrent}
                onClick={() => onSettings({ regionId, wave })}
                data-testid={`wave-option-${wave}`}
                className={`relative min-h-10 rounded-lg text-sm font-semibold tabular-nums ring-1 transition ${
                  isCurrent
                    ? 'bg-astral-gold/20 text-astral-gold ring-astral-gold/60'
                    : locked || levelLocked
                      ? 'cursor-not-allowed bg-night-950/60 text-slate-600 ring-white/5'
                      : 'bg-night-950 text-slate-200 ring-white/10 hover:ring-astral-violet/60'
                }`}
              >
                {locked ? '🔒' : wave}
                {levelLocked && (
                  <span className="absolute inset-x-0 -bottom-0.5 text-[9px] font-normal text-slate-500">
                    Nv {info!.minLevel}
                  </span>
                )}
                {kind !== 'normal' && !locked && (
                  <span
                    className={`absolute -top-1 -right-1 text-[10px] ${kind === 'boss' ? 'text-rose-300' : 'text-violet-300'}`}
                    aria-hidden
                  >
                    {KIND_BADGE[kind].icon}
                  </span>
                )}
                {cleared && !isCurrent && (
                  <span
                    className="absolute -top-1 -left-0.5 text-[10px] text-emerald-300"
                    aria-hidden
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Trocar a wave recomeça a contagem dela; trocar só o modo mantém as vitórias.
        </p>
      </div>

      {shownFeedback && (
        <div
          className="rounded-xl border border-astral-gold/40 bg-astral-gold/10 p-3 text-sm"
          role="status"
          data-testid="wave-feedback"
        >
          <p className="font-display text-base text-astral-gold">
            Wave {shownFeedback.wave} concluída!
          </p>
          <p className="mt-0.5 text-xs text-slate-200">
            {shownFeedback.wins} vitórias
            {shownFeedback.losses > 0 ? ` e ${shownFeedback.losses} derrotas` : ''} · +
            {shownFeedback.xp} XP · +{formatMoney(shownFeedback.gold)} ouro
            {shownFeedback.essence !== '0'
              ? ` · +${formatMoney(shownFeedback.essence)} essência`
              : ''}
            {shownFeedback.items > 0 ? ` · ${shownFeedback.items} itens` : ''}
          </p>
          {shownFeedback.firstClearReward && (
            <p className="mt-0.5 text-xs text-violet-200">
              Primeira conclusão: +{formatMoney(shownFeedback.firstClearReward.gold)} ouro, +
              {formatMoney(shownFeedback.firstClearReward.essence)} essência
              {shownFeedback.firstClearReward.item
                ? `, ${shownFeedback.firstClearReward.item.name} (${RARITY_NAME[shownFeedback.firstClearReward.item.rarity]})`
                : ''}
            </p>
          )}
          <p className="mt-0.5 text-xs text-slate-400">{clearNextText(shownFeedback)}</p>
          <button
            type="button"
            className="mt-1 text-xs text-slate-400 underline"
            onClick={onDismissFeedback}
          >
            fechar
          </button>
        </div>
      )}
    </section>
  );
}
