import type { HuntHistoryResponse } from '@astral/shared';
import { useEffect, useState } from 'react';
import { EmptyState, Loading, SectionTitle } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDuration, formatMoney } from '../../lib/format';
import { MODE_LABEL } from './labels';

/** Histórico persistido: conclusões de wave e resumos de liquidação. */
export function HistoryPanel({ version }: { version: string }) {
  const [data, setData] = useState<HuntHistoryResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    api.history().then(
      (d) => active && setData(d),
      () => active && setError(true),
    );
    return () => {
      active = false;
    };
  }, [version]);

  if (error)
    return (
      <EmptyState icon="scroll" title="Não foi possível carregar o histórico" compact>
        Tente novamente em instantes.
      </EmptyState>
    );
  if (!data) return <Loading>Carregando histórico…</Loading>;
  if (data.settlements.length === 0) {
    return (
      <EmptyState icon="scroll" title="Nenhuma caçada registrada ainda" compact>
        Inicie uma caçada: cada período liquidado pelo servidor aparece aqui.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5" data-testid="history-panel">
      {data.waveClears.length > 0 && (
        <section>
          <SectionTitle>Waves concluídas</SectionTitle>
          <ul className="space-y-1.5" data-testid="history-wave-clears">
            {data.waveClears.map((c) => (
              <li
                key={`${c.regionId}:${c.clearedAt}:${c.encounterIndex}`}
                className="flex flex-wrap items-baseline gap-x-2 rounded-[var(--radius-control)] bg-night-950/60 px-3 py-2 text-xs ring-1 ring-white/8"
              >
                <span className="font-display font-semibold text-slate-50">
                  Wave {c.wave}
                  {c.kind === 'elite' ? ' ◆' : c.kind === 'boss' ? ' ♛' : ''}
                </span>
                <span className="rounded-[var(--radius-chip)] bg-white/6 px-1.5 text-slate-300">
                  {MODE_LABEL[c.mode]}
                </span>
                <span className="text-slate-300">
                  {c.wins}V{c.losses > 0 ? `/${c.losses}D` : ''} · +{c.xp} XP · +
                  {formatMoney(c.gold)} ouro
                </span>
                {c.firstClearReward && (
                  <span className="text-astral-violet">
                    1ª conclusão: +{formatMoney(c.firstClearReward.gold)} ouro
                    {c.firstClearReward.item ? ` · ${c.firstClearReward.item.name}` : ''}
                  </span>
                )}
                <span className="ml-auto text-slate-500">
                  {new Date(c.clearedAt).toLocaleTimeString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <SectionTitle>Liquidações recentes</SectionTitle>
        <ul className="space-y-2">
          {data.settlements.map((s) => {
            const span = new Date(s.windowEnd).getTime() - new Date(s.windowStart).getTime();
            return (
              <li
                key={`${s.createdAt}-${s.fromEncounter}`}
                className="rounded-[var(--radius-control)] bg-night-950/60 p-3 text-xs ring-1 ring-white/8"
              >
                <div className="flex justify-between text-slate-400">
                  <span>{new Date(s.createdAt).toLocaleString('pt-BR')}</span>
                  <span>{formatDuration(span)}</span>
                </div>
                <p className="mt-1 text-slate-100">
                  {s.encounters} encontros · {s.wins} vitórias
                  {s.losses > 0 ? ` · ${s.losses} derrotas` : ''}
                  {s.wavesCleared > 0 ? ` · ${s.wavesCleared} waves` : ''}
                </p>
                <p className="text-slate-300">
                  +{s.xpGained} XP · +{formatMoney(s.gold)} ouro · +{formatMoney(s.essence)}{' '}
                  essência
                  {s.itemsDropped > 0 ? ` · ${s.itemsDropped} itens` : ''}
                </p>
                {s.levelAfter > s.levelBefore && (
                  <p className="text-astral-gold">
                    Nível {s.levelBefore} → {s.levelAfter}
                  </p>
                )}
                {s.forfeitedMs > 0 && (
                  <p className="text-amber-200">
                    {formatDuration(s.forfeitedMs)} além do limite offline de 8 h
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
