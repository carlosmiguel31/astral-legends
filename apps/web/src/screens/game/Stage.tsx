import type { ContentResponse, GameState, RegionProgressView } from '@astral/shared';
import type { ReactNode } from 'react';
import { Icon } from '../../components/icons';
import { PixelIcon } from '../../components/pixelIcons';
import { Panel, SegmentedBar } from '../../components/ui';
import type { HuntDirector } from '../../game/director';
import { GameCanvas } from '../../game/GameCanvas';
import { RARITY_LOWER, nextStepText, noticeText } from './labels';

/** Região mostrada no palco: a da caçada atual (ou a inicial, antes da primeira caçada). */
export function stageRegionId(state: GameState): string {
  return state.hunt?.regionId ?? 'campos-do-alvorecer';
}

/**
 * Palco principal: o mapa Phaser com a placa da região/wave por cima. A instância do
 * Phaser é criada uma única vez por `GameCanvas` (lazy load) e não é recriada quando o
 * React atualiza o estado.
 */
export function Stage({
  state,
  content,
  director,
  overlay,
}: {
  state: GameState;
  content: ContentResponse | null;
  director: HuntDirector;
  overlay?: ReactNode;
}) {
  const regionId = stageRegionId(state);
  const region = content?.regions.find((r) => r.id === regionId);
  const progress = state.waves.regions.find((r) => r.regionId === regionId);
  const hunting = state.hunt?.status === 'ACTIVE';

  return (
    <Panel strong bare className="p-1.5" ariaLabel="Mapa da caçada">
      <GameCanvas director={director}>
        <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-2 rounded-[var(--radius-control)] bg-night-950/80 py-1.5 pr-4 pl-2 ring-1 ring-astral-gold/50 backdrop-blur-[1px] sm:top-3 sm:left-3">
          <Icon name="swords" className="size-5 text-astral-gold sm:size-8" />
          <div className="leading-tight">
            <p className="astral-title text-xs sm:text-lg">{region?.name ?? '…'}</p>
            {progress && (
              <p className="font-display text-[11px] text-astral-gold-soft sm:text-sm">
                Wave {progress.wave} / {progress.waveCount}
              </p>
            )}
          </div>
        </div>
        {!hunting && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <p className="rounded-full bg-night-950/85 px-4 py-1.5 text-xs text-slate-100 ring-1 ring-astral-gold/40">
              Herói descansando — escolha uma região e inicie a caçada
            </p>
          </div>
        )}
        {overlay}
      </GameCanvas>
    </Panel>
  );
}

/** Cartão "Progresso da Wave": wave atual, vitórias (0–15), especial e próximo passo. */
export function WaveProgressCard({
  state,
  content,
}: {
  state: GameState;
  content: ContentResponse | null;
}) {
  const regionId = stageRegionId(state);
  const p: RegionProgressView | undefined = state.waves.regions.find(
    (r) => r.regionId === regionId,
  );
  const region = content?.regions.find((r) => r.id === regionId);
  if (!p) return null;
  const waves = region?.waves.list ?? [];
  const current = waves[p.wave - 1];
  const nextMinLevel = waves[p.wave]?.minLevel ?? null;
  const special =
    p.waveKind === 'boss'
      ? region?.waves.boss
      : p.waveKind === 'elite'
        ? region?.waves.elite
        : null;
  const firstClear = p.wave > p.highestCleared && current ? current.firstClear : null;
  const winsPerWave = state.waves.winsPerWave;

  return (
    <Panel title="Progresso da Wave" icon="sparkles" testId="wave-progress-card">
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.9fr)] md:items-center">
        <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-gradient-to-b from-astral-violet-deep/45 to-indigo-deep px-4 py-2.5 ring-1 ring-astral-gold/60 shadow-[var(--shadow-glow-violet)]">
          <Icon name="swords" className="size-8 text-astral-gold" />
          <div>
            <p
              className="astral-gold-text font-display text-2xl font-bold whitespace-nowrap"
              data-testid="wave-current"
            >
              Wave {p.wave} / {p.waveCount}
            </p>
            {p.waveKind !== 'normal' && (
              <p
                className={`text-[11px] font-bold tracking-wider uppercase ${p.waveKind === 'boss' ? 'text-rose-300' : 'text-astral-violet'}`}
                data-testid="wave-kind"
              >
                {p.waveKind === 'boss' ? '♛ Wave de chefe' : '◆ Wave de elite'}
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <p className="flex items-baseline gap-2 text-sm text-slate-200">
            <span
              className="font-display text-lg font-semibold tabular-nums text-slate-50"
              data-testid="wave-wins"
            >
              {p.waveWins} / {winsPerWave}
            </span>
            vitórias nesta wave
          </p>
          <SegmentedBar
            count={winsPerWave}
            filled={p.waveWins}
            special={p.waveKind === 'normal' ? null : p.waveKind}
            label={`Vitórias na wave ${p.wave}`}
            testId="wave-progress"
          />
          {special && (
            <p className="text-xs text-slate-300">
              A {winsPerWave}ª vitória é contra{' '}
              <span className={p.waveKind === 'boss' ? 'text-rose-200' : 'text-astral-violet'}>
                {special.name}
              </span>{' '}
              (Nv {special.level}). Derrotas não contam: ele volta até ser vencido.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-night-950/60 p-3 ring-1 ring-astral-violet/30">
          <div className="min-w-0 flex-1 space-y-1 text-xs leading-relaxed">
            <p className="text-slate-200" data-testid="wave-next">
              {nextStepText(p, state.character.level, nextMinLevel)}
            </p>
            {firstClear && (
              <p className="text-astral-gold-soft" data-testid="wave-first-clear">
                1ª conclusão: +{firstClear.gold} ouro, +{firstClear.essence} essência
                {firstClear.itemRarity
                  ? `, item ${RARITY_LOWER[firstClear.itemRarity]} exclusivo`
                  : ''}
              </p>
            )}
          </div>
          <PixelIcon name="chest" className="size-10 shrink-0" />
        </div>
      </div>
      {p.notice && (
        <p
          className="mt-3 rounded-[var(--radius-control)] bg-amber-400/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-300/30"
          data-testid="wave-notice"
          role="status"
        >
          {noticeText(p.notice)}
        </p>
      )}
    </Panel>
  );
}
