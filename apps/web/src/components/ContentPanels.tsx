import type { ContentResponse } from '@astral/shared';
import { useEffect, useState } from 'react';
import { fetchContent } from '../lib/api';
import { formatBp, formatSeconds } from '../lib/format';
import { Panel } from './Panel';

const affinityColor: Record<string, string> = {
  solar: 'text-solar',
  lunar: 'text-lunar',
  storm: 'text-storm',
  abyssal: 'text-abyssal',
};

const classGlyph: Record<string, string> = {
  guardian: '⛨',
  arcanist: '✶',
  blade: '➶',
};

export function useContent() {
  const [content, setContent] = useState<ContentResponse | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    fetchContent()
      .then((c) => active && setContent(c))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);
  return { content, error };
}

export function ClassesPanel({ content }: { content: ContentResponse | null }) {
  return (
    <Panel
      title="Classes iniciais"
      aside={<span className="text-xs text-slate-500">valores do nível 1</span>}
    >
      {!content ? (
        <p className="text-sm text-slate-500">Carregando do servidor…</p>
      ) : (
        <ul className="space-y-4" data-testid="classes">
          {content.classes.map((c) => (
            <li key={c.id} className="rounded-xl border border-white/5 bg-night-900/60 p-3">
              <div className="flex items-center gap-2">
                <span className="text-astral-gold" aria-hidden>
                  {classGlyph[c.id]}
                </span>
                <h3 className="font-display text-base text-slate-100">{c.name}</h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">{c.role}</p>
              <dl className="mt-2 grid grid-cols-5 gap-1 text-center text-[11px]">
                {[
                  ['Vida', String(c.level1Stats.maxHp)],
                  ['Ataque', String(c.level1Stats.attack)],
                  ['Defesa', String(c.level1Stats.defense)],
                  ['Crítico', formatBp(c.level1Stats.critChanceBp)],
                  ['Golpe', formatSeconds(c.level1Stats.attackIntervalMs)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-white/5 px-1 py-1">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-semibold text-slate-200 tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function AffinityPanel({ content }: { content: ContentResponse | null }) {
  if (!content) return null;
  const byId = new Map(content.affinities.map((a) => [a.id, a]));
  return (
    <Panel title="Ciclo das afinidades">
      <ul className="space-y-2 text-sm">
        {content.affinities.map((a) => (
          <li key={a.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className={`font-semibold ${affinityColor[a.id]}`}>{a.name}</span>
            <span className="text-slate-500">vence</span>
            <span className={affinityColor[a.strongAgainst]}>
              {byId.get(a.strongAgainst)?.name}
            </span>
            <span className="w-full text-xs text-slate-400">{a.description}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
