import type { EncounterView, HuntHistoryResponse } from '@astral/shared';
import { useEffect, useState } from 'react';
import { RARITY_TEXT } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDuration, formatMoney } from '../../lib/format';

const OUTCOME: Record<EncounterView['outcome'], [string, string]> = {
  win: ['Vitória', 'text-emerald-300'],
  loss: ['Derrota', 'text-rose-300'],
  timeout: ['Fuga', 'text-amber-300'],
};

/** Linha do registro de combate (dados confirmados pelo servidor). */
export function EncounterLine({ e }: { e: EncounterView }) {
  const [label, color] = OUTCOME[e.outcome];
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-white/5 py-1.5 text-xs last:border-0">
      <span className={`font-semibold ${color}`}>{label}</span>
      <span className="text-slate-300">
        {e.monsterName} <span className="text-slate-500">Nv {e.monsterLevel}</span>
      </span>
      <span className="text-slate-500">
        −{e.damageTaken} vida · {e.damageDealt} de dano
      </span>
      {e.outcome === 'win' && (
        <span className="ml-auto tabular-nums text-slate-300">
          {[
            e.xp > 0 ? `+${e.xp} XP` : null,
            `+${e.gold} ouro`,
            e.essence > 0 ? `+${e.essence} essência` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
      {e.drop && (
        <span className={`w-full ${RARITY_TEXT[e.drop.rarity]}`}>
          ★ {e.drop.name}
          {e.drop.kept ? '' : ' (inventário cheio — descartado)'}
        </span>
      )}
      {e.levelUp && (
        <span className="w-full font-semibold text-astral-gold">
          Subiu para o nível {e.levelAfter}!
        </span>
      )}
    </li>
  );
}

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

  if (error) return <p className="text-sm text-rose-300">Não foi possível carregar o histórico.</p>;
  if (!data) return <p className="text-sm text-slate-500">Carregando histórico…</p>;
  if (data.settlements.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma caçada registrada ainda.</p>;
  }

  return (
    <div className="space-y-4" data-testid="history-panel">
      <ul className="space-y-2">
        {data.settlements.map((s) => {
          const span = new Date(s.windowEnd).getTime() - new Date(s.windowStart).getTime();
          return (
            <li
              key={`${s.createdAt}-${s.fromEncounter}`}
              className="rounded-xl bg-night-950/60 p-3 text-xs ring-1 ring-white/5"
            >
              <div className="flex justify-between text-slate-400">
                <span>{new Date(s.createdAt).toLocaleString('pt-BR')}</span>
                <span>{formatDuration(span)}</span>
              </div>
              <p className="mt-1 text-slate-200">
                {s.encounters} encontros · {s.wins} vitórias
                {s.losses > 0 ? ` · ${s.losses} derrotas` : ''}
              </p>
              <p className="text-slate-400">
                +{s.xpGained} XP · +{formatMoney(s.gold)} ouro · +{formatMoney(s.essence)} essência
                {s.itemsDropped > 0 ? ` · ${s.itemsDropped} itens` : ''}
              </p>
              {s.levelAfter > s.levelBefore && (
                <p className="text-astral-gold">
                  Nível {s.levelBefore} → {s.levelAfter}
                </p>
              )}
              {s.forfeitedMs > 0 && (
                <p className="text-amber-300">
                  {formatDuration(s.forfeitedMs)} além do limite offline de 8 h
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
