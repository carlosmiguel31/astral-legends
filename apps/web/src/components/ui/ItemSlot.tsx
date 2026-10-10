import { Icon, type IconName } from '../icons';
import { RARITY_BG, RARITY_NAME, RARITY_RING, RARITY_TEXT } from './Rarity';

export const SLOT_ICONS: Record<string, IconName> = {
  weapon: 'weapon',
  head: 'head',
  chest: 'chest',
  hands: 'hands',
  legs: 'legs',
  feet: 'feet',
};

export const SLOT_NAMES: Record<string, string> = {
  weapon: 'Arma',
  head: 'Cabeça',
  chest: 'Peitoral',
  hands: 'Mãos',
  legs: 'Pernas',
  feet: 'Pés',
};

/**
 * Slot de equipamento/inventário. Sem item mostra o contorno do slot; com item,
 * a moldura e o ícone usam a cor da raridade. Nenhum item é inventado: o slot só
 * exibe o que vier do servidor.
 */
export function ItemSlot({
  slot,
  item,
  size = 'md',
  equipped = false,
  onClick,
  selected = false,
}: {
  slot: string;
  item?: { name: string; rarity: string } | null;
  size?: 'sm' | 'md' | 'lg';
  equipped?: boolean;
  onClick?: () => void;
  selected?: boolean;
}) {
  const box = { sm: 'size-11', md: 'size-14', lg: 'size-16' }[size];
  const glyph = { sm: 'size-5', md: 'size-7', lg: 'size-8' }[size];
  const label = item
    ? `${SLOT_NAMES[slot] ?? slot}: ${item.name} (${RARITY_NAME[item.rarity] ?? item.rarity})${equipped ? ', equipado' : ''}`
    : `${SLOT_NAMES[slot] ?? slot}: vazio`;
  const className = `relative grid ${box} shrink-0 place-items-center rounded-[var(--radius-control)] bg-gradient-to-br to-night-950 ring-1 transition ${
    item
      ? `${RARITY_BG[item.rarity] ?? ''} ${RARITY_RING[item.rarity] ?? ''} ${RARITY_TEXT[item.rarity] ?? ''}`
      : 'from-night-800 text-slate-600 ring-white/10 ring-dashed'
  } ${selected ? 'outline-2 outline-offset-2 outline-astral-gold' : ''} ${onClick ? 'cursor-pointer hover:brightness-125' : ''}`;
  const content = (
    <>
      <Icon name={SLOT_ICONS[slot] ?? 'bag'} className={glyph} />
      {equipped && (
        <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-astral-gold text-night-950 ring-2 ring-night-900">
          <Icon name="check" className="size-3" strokeWidth={3} />
        </span>
      )}
    </>
  );
  return onClick ? (
    <button type="button" className={className} onClick={onClick} aria-label={label} title={label}>
      {content}
    </button>
  ) : (
    <span className={className} role="img" aria-label={label} title={label}>
      {content}
    </span>
  );
}
