import type { InventoryResponse, ItemView } from '@astral/shared';
import { useEffect, useState } from 'react';
import {
  Button,
  EmptyState,
  ItemSlot,
  Loading,
  ProgressBar,
  RARITY_RING,
  RARITY_TEXT,
  RarityBadge,
  SLOT_NAMES,
  SectionTitle,
} from '../../components/ui';
import { api } from '../../lib/api';
import { formatBp } from '../../lib/format';

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

export function bonusLines(item: ItemView): string[] {
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

/** Inventário e equipamento. Itens e bônus vêm do servidor; ações passam por ele. */
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
    return (
      <EmptyState icon="bag" title="Não foi possível carregar o inventário" compact>
        Verifique a conexão; tentaremos de novo na próxima atualização.
      </EmptyState>
    );
  if (!data) return <Loading>Carregando inventário…</Loading>;

  const equipped = data.items.filter((i) => i.equipped);
  const bag = data.items.filter((i) => !i.equipped);

  const card = (item: ItemView) => (
    <li
      key={item.id}
      data-testid={`item-${item.defId}`}
      className={`flex animate-rise-in gap-3 rounded-[var(--radius-control)] bg-night-950/60 p-3 ring-1 ${RARITY_RING[item.rarity]}`}
    >
      <ItemSlot slot={item.slot} item={item} equipped={item.equipped} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={`font-semibold ${RARITY_TEXT[item.rarity]}`}>{item.name}</p>
          <RarityBadge rarity={item.rarity} label={item.rarityName} />
          <span className="text-[11px] text-slate-400">{SLOT_NAMES[item.slot]}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">{item.description}</p>
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {bonusLines(item).map((line) => (
            <li
              key={line}
              className="rounded-[var(--radius-chip)] bg-emerald-500/10 px-1.5 py-px text-[11px] text-emerald-200 ring-1 ring-emerald-400/25"
            >
              {line}
            </li>
          ))}
        </ul>
        {!item.usable && (
          <p className="mt-1 text-xs text-amber-200">
            {item.unusableReason === 'level' ? `Requer nível ${item.minLevel}` : 'Outra classe'}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {item.equipped ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onUnequip(item.id)}
              busy={busy === `unequip:${item.id}`}
              disabled={busy !== null}
            >
              Desequipar
            </Button>
          ) : (
            <>
              <Button
                variant="gold-outline"
                size="sm"
                onClick={() => onEquip(item.id)}
                busy={busy === `equip:${item.id}`}
                disabled={busy !== null || !item.usable}
              >
                Equipar
              </Button>
              {confirming === item.id ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onDiscard(item.id)}
                  busy={busy === `discard:${item.id}`}
                >
                  Confirmar descarte
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(item.id)}
                  disabled={busy !== null}
                >
                  Descartar
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );

  return (
    <div className="space-y-5" data-testid="inventory-panel">
      <section>
        <SectionTitle>Equipado ({equipped.length}/6)</SectionTitle>
        {equipped.length === 0 ? (
          <EmptyState icon="shield" title="Nenhum item equipado" compact>
            Equipe itens da bolsa para fortalecer o herói.
          </EmptyState>
        ) : (
          <ul className="space-y-2">{equipped.map(card)}</ul>
        )}
      </section>
      <section>
        <div className="mb-2">
          <ProgressBar
            label={`Bolsa (${bag.length}/${data.capacity})`}
            value={bag.length}
            max={data.capacity}
            tone="gold"
            size="sm"
            text={bag.length >= data.capacity ? 'Cheia' : `${data.capacity - bag.length} livres`}
          />
        </div>
        {bag.length === 0 ? (
          <EmptyState icon="bag" title="Bolsa vazia" compact>
            Cace para encontrar equipamentos.
          </EmptyState>
        ) : (
          <ul className="space-y-2">{bag.map(card)}</ul>
        )}
      </section>
    </div>
  );
}
