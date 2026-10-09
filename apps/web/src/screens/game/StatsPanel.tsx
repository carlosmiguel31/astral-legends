import type { GameState } from '@astral/shared';
import { formatBp, formatSeconds } from '../../lib/format';

const ATTRIBUTE_LABELS: Array<[keyof GameState['attributes'], string, string]> = [
  ['str', 'Força', 'Ataque marcial e defesa'],
  ['int', 'Intelecto', 'Ataque arcano'],
  ['agi', 'Agilidade', 'Crítico e velocidade'],
  ['vit', 'Vitalidade', 'Vida e defesa'],
];

export function StatsPanel({ state }: { state: GameState }) {
  const s = state.stats;
  const stats: Array<[string, string]> = [
    ['Vida máxima', String(s.maxHp)],
    ['Ataque', String(s.attack)],
    ['Defesa', String(s.defense)],
    ['Chance de crítico', formatBp(s.critChanceBp)],
    ['Dano crítico', formatBp(s.critPowerBp)],
    ['Golpe a cada', formatSeconds(s.attackIntervalMs)],
    ['Ignora defesa', formatBp(s.armorPenBp)],
    ['Redução de dano', formatBp(s.damageReductionBp)],
  ];
  return (
    <div className="space-y-5" data-testid="stats-panel">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Atributos
        </h3>
        <dl className="grid grid-cols-2 gap-2">
          {ATTRIBUTE_LABELS.map(([key, label, hint]) => (
            <div key={key} className="rounded-lg bg-night-950/60 p-3 ring-1 ring-white/5">
              <dt className="text-xs text-slate-400">{label}</dt>
              <dd
                className="text-xl font-semibold tabular-nums text-slate-100"
                data-testid={`attr-${key}`}
              >
                {state.attributes[key]}
              </dd>
              <p className="text-[11px] text-slate-500">{hint}</p>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Combate
        </h3>
        <dl className="divide-y divide-white/5 rounded-lg bg-night-950/60 ring-1 ring-white/5">
          {stats.map(([label, value]) => (
            <div key={label} className="flex justify-between px-3 py-2 text-sm">
              <dt className="text-slate-400">{label}</dt>
              <dd
                className="font-semibold tabular-nums text-slate-100"
                data-testid={`stat-${label}`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] text-slate-500">
          Valores calculados pelo servidor com base em classe, nível, afinidade e equipamento.
        </p>
      </section>
    </div>
  );
}
