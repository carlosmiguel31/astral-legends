import type { GameState, ItemView } from '@astral/shared';
import { HeroPortrait } from '../../components/HeroPortrait';
import { ItemSlot, SLOT_NAMES, SectionTitle, Tooltip } from '../../components/ui';
import { formatBp, formatSeconds } from '../../lib/format';
import { bonusLines } from './InventoryPanel';
import { AFFINITY, CLASS_NAMES } from './labels';

const ATTRIBUTE_LABELS: Array<[keyof GameState['attributes'], string, string]> = [
  ['str', 'Força', 'Ataque marcial e defesa'],
  ['int', 'Intelecto', 'Ataque arcano'],
  ['agi', 'Agilidade', 'Crítico e velocidade'],
  ['vit', 'Vitalidade', 'Vida e defesa'],
];

const LEFT_SLOTS = ['weapon', 'head', 'chest'] as const;
const RIGHT_SLOTS = ['hands', 'legs', 'feet'] as const;

function SlotWithTip({ slot, item }: { slot: string; item: ItemView | undefined }) {
  const tip = item ? (
    <span className="block space-y-0.5">
      <span className="block font-semibold">{item.name}</span>
      <span className="block text-slate-300">{bonusLines(item).join(' · ') || 'Sem bônus'}</span>
    </span>
  ) : (
    `${SLOT_NAMES[slot]}: vazio`
  );
  return (
    <Tooltip content={tip}>
      <span tabIndex={0} className="rounded-[var(--radius-control)]">
        <ItemSlot slot={slot} item={item ?? null} equipped={Boolean(item)} size="lg" />
      </span>
    </Tooltip>
  );
}

/**
 * Ficha do personagem: equipamento em slots ao redor do retrato, atributos e
 * estatísticas de combate — tudo calculado pelo servidor.
 */
export function CharacterPanel({ state }: { state: GameState }) {
  const s = state.stats;
  const c = state.character;
  const bySlot = new Map(state.equipment.map((i) => [i.slot, i]));
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
  const affinity = AFFINITY[c.affinity];

  return (
    <div className="space-y-5" data-testid="stats-panel">
      <section aria-label="Equipamento">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <div className="grid gap-2">
            {LEFT_SLOTS.map((slot) => (
              <SlotWithTip key={slot} slot={slot} item={bySlot.get(slot)} />
            ))}
          </div>
          <div className="grid h-full place-items-center rounded-[var(--radius-panel)] bg-[radial-gradient(circle_at_50%_45%,rgb(109_75_216/0.35),transparent_65%)] py-3 ring-1 ring-astral-gold/25">
            <HeroPortrait
              look={{ classId: c.classId, appearance: c.appearance }}
              scale={6}
              label={`Retrato de ${c.name}`}
            />
            <p className="mt-2 font-display text-base font-semibold text-slate-50">{c.name}</p>
            <p className="text-xs text-slate-300">
              Nv {c.level} · {CLASS_NAMES[c.classId]} ·{' '}
              <span className={affinity?.text}>{affinity?.name}</span>
            </p>
          </div>
          <div className="grid gap-2">
            {RIGHT_SLOTS.map((slot) => (
              <SlotWithTip key={slot} slot={slot} item={bySlot.get(slot)} />
            ))}
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          {state.equipment.length}/6 slots equipados · equipe itens na aba Inventário
        </p>
      </section>

      <section>
        <SectionTitle>Atributos</SectionTitle>
        <dl className="grid grid-cols-2 gap-2">
          {ATTRIBUTE_LABELS.map(([key, label, hint]) => (
            <div
              key={key}
              className="rounded-[var(--radius-control)] bg-night-950/60 p-3 ring-1 ring-white/8"
            >
              <dt className="text-xs text-slate-300">{label}</dt>
              <dd
                className="font-display text-2xl font-semibold tabular-nums text-slate-50"
                data-testid={`attr-${key}`}
              >
                {state.attributes[key]}
              </dd>
              <p className="text-[11px] text-slate-400">{hint}</p>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <SectionTitle>Combate</SectionTitle>
        <dl className="divide-y divide-white/6 rounded-[var(--radius-control)] bg-night-950/60 ring-1 ring-white/8">
          {stats.map(([label, value]) => (
            <div key={label} className="flex justify-between px-3 py-2 text-sm">
              <dt className="text-slate-300">{label}</dt>
              <dd
                className="font-semibold tabular-nums text-slate-50"
                data-testid={`stat-${label}`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] text-slate-400">
          Valores calculados pelo servidor com base em classe, nível, afinidade e equipamento.
        </p>
      </section>
    </div>
  );
}
