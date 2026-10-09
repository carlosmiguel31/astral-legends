import type { InventoryResponse, ItemView } from '@astral/shared';
import { useEffect, useState } from 'react';
import { Button, RARITY_RING, RARITY_TEXT } from '../../components/ui';
import { api } from '../../lib/api';
import { formatBp } from '../../lib/format';

const SLOT_NAMES: Record<string, string> = {
  weapon: 'Arma',
  head: 'Cabeça',
  chest: 'Peito',
  hands: 'Mãos',
  legs: 'Pernas',
  feet: 'Pés',
};
const BONUS_NAMES: Record<string, string> = {
  str: 'Força',
  int: 'Intelecto',
  agi: 'Agilidade',
  vit: 'Vitalidade',
  maxHp: 'Vida',
  attack: 'Ataque',
  defense: 'Defesa',
  critChanceBp: 'Crítico',
};

function bonusLines(item: ItemView): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries({
    ...item.bonuses.attributes,
    ...item.bonuses.stats,
  })) {
    if (value === undefined) continue;
    lines.push(`+${key === 'critChanceBp' ? formatBp(value) : value} ${BONUS_NAMES[key] ?? key}`);
  }
  return lines;
}

export function InventoryPanel({
  version,
  busy,
  onEquip,
  onUnequip,
  onDiscard,
}: {
  version: number;
  busy: string | null;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.inventory().then(
      (d) => {
        if (!active) return;
        setData(d);
        setError(false);
      },
      () => active && setError(true),
    );
    return () => {
      active = false;
    };
  }, [version]);

  if (error)
    return <p className="text-sm text-rose-300">Não foi possível carregar o inventário.</p>;
  if (!data) return <p className="text-sm text-slate-500">Carregando inventário…</p>;

  const equipped = data.items.filter((i) => i.equipped);
  const bag = data.items.filter((i) => !i.equipped);

  const card = (item: ItemView) => (
    <li
      key={item.id}
      data-testid={`item-${item.defId}`}
      className={`rounded-xl bg-night-950/60 p-3 ring-1 ${RARITY_RING[item.rarity]}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className={`font-semibold ${RARITY_TEXT[item.rarity]}`}>{item.name}</p>
        <span className="shrink-0 text-[11px] text-slate-500">
          {SLOT_NAMES[item.slot]} · {item.rarityName}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-400">{item.description}</p>
      <p className="mt-1 text-xs text-emerald-300">{bonusLines(item).join(' · ')}</p>
      {!item.usable && (
        <p className="mt-1 text-xs text-amber-300">
          {item.unusableReason === 'level' ? `Requer nível ${item.minLevel}` : 'Outra classe'}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {item.equipped ? (
          <Button
            variant="secondary"
            onClick={() => onUnequip(item.id)}
            busy={busy === `unequip:${item.id}`}
            disabled={busy !== null}
          >
            Desequipar
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => onEquip(item.id)}
              busy={busy === `equip:${item.id}`}
              disabled={busy !== null || !item.usable}
            >
              Equipar
            </Button>
            {confirming === item.id ? (
              <Button
                variant="danger"
                onClick={() => onDiscard(item.id)}
                busy={busy === `discard:${item.id}`}
              >
                Confirmar descarte
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setConfirming(item.id)}
                disabled={busy !== null}
              >
                Descartar
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-5" data-testid="inventory-panel">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Equipado ({equipped.length}/6)
        </h3>
        {equipped.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum item equipado.</p>
        ) : (
          <ul className="space-y-2">{equipped.map(card)}</ul>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Inventário ({bag.length}/{data.capacity})
        </h3>
        {bag.length === 0 ? (
          <p className="text-sm text-slate-500">Vazio. Cace para encontrar equipamentos.</p>
        ) : (
          <ul className="space-y-2">{bag.map(card)}</ul>
        )}
      </section>
    </div>
  );
}
