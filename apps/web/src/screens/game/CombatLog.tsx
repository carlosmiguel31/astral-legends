import type { EncounterView } from '@astral/shared';
import { useState } from 'react';
import { Icon, type IconName } from '../../components/icons';
import { PixelIcon } from '../../components/pixelIcons';
import { EmptyState, Panel, Tabs } from '../../components/ui';
import { formatClock } from '../../lib/format';
import { RARITY_LOWER } from './labels';

type Category = 'combat' | 'rewards' | 'progress';
type Filter = 'all' | Category;

interface LogLine {
  key: string;
  at: number;
  category: Category;
  icon: { vector?: IconName; pixel?: 'coin' | 'essence' | 'chest' | 'star'; badge?: string };
  tone: string;
  text: React.ReactNode;
}

/** Converte os encontros confirmados pelo servidor em linhas do registro. */
function linesOf(e: EncounterView): LogLine[] {
  const key = `${e.runId}:${e.index}`;
  const name =
    e.kind === 'boss'
      ? `♛ ${e.monsterName}`
      : e.kind === 'elite'
        ? `◆ ${e.monsterName}`
        : e.monsterName;
  const at = e.endedAt;
  const out: LogLine[] = [];
  const push = (suffix: string, line: Omit<LogLine, 'key' | 'at'>) =>
    out.push({ key: `${key}:${suffix}`, at, ...line });

  if (e.damageDealt > 0) {
    push('dmg', {
      category: 'combat',
      icon: { vector: 'swords' },
      tone: 'text-slate-200',
      text: (
        <>
          Você causou <b className="text-rose-300">{e.damageDealt}</b> de dano em {name}.
        </>
      ),
    });
  }
  if (e.outcome === 'win') {
    push('win', {
      category: 'combat',
      icon: { vector: 'skull' },
      tone: 'text-rose-200',
      text: <>Vitória: {name} foi derrotado!</>,
    });
    if (e.xp > 0)
      push('xp', {
        category: 'rewards',
        icon: { badge: 'EXP' },
        tone: 'text-emerald-300',
        text: <>Você recebeu {e.xp} de experiência.</>,
      });
    if (e.gold > 0)
      push('gold', {
        category: 'rewards',
        icon: { pixel: 'coin' },
        tone: 'text-gold-coin',
        text: <>Você recebeu {e.gold} de ouro.</>,
      });
    if (e.essence > 0)
      push('ess', {
        category: 'rewards',
        icon: { pixel: 'essence' },
        tone: 'text-essence',
        text: <>Você recebeu {e.essence} de essência astral.</>,
      });
    if (e.drop)
      push('drop', {
        category: 'rewards',
        icon: { pixel: 'chest' },
        tone: 'text-orange-200',
        text: e.drop.kept ? (
          <>
            Item obtido: {e.drop.name} ({RARITY_LOWER[e.drop.rarity] ?? e.drop.rarity}).
          </>
        ) : (
          <>{e.drop.name} descartado: inventário cheio.</>
        ),
      });
  } else {
    push('lose', {
      category: 'combat',
      icon: { vector: 'shield' },
      tone: 'text-amber-200',
      text:
        e.outcome === 'loss' ? (
          <>
            Derrota para {name} (−{e.damageTaken} de vida). A caçada continua.
          </>
        ) : (
          <>Fuga: o combate com {name} demorou demais.</>
        ),
    });
  }
  if (e.waveCleared && e.wave !== undefined) {
    push('wave', {
      category: 'progress',
      icon: { pixel: 'star' },
      tone: 'text-astral-gold',
      text: (
        <>
          Wave {e.wave} concluída{e.firstClear ? ' pela primeira vez' : ''}!
        </>
      ),
    });
  }
  if (e.levelUp) {
    push('lvl', {
      category: 'progress',
      icon: { vector: 'sparkles' },
      tone: 'text-astral-gold-soft',
      text: <>Subiu para o nível {e.levelAfter}!</>,
    });
  }
  return out.reverse();
}

function LineIcon({ icon }: { icon: LogLine['icon'] }) {
  if (icon.badge)
    return (
      <span className="grid h-4 w-6 shrink-0 place-items-center rounded-sm bg-emerald-500/20 text-[8px] font-bold text-emerald-300 ring-1 ring-emerald-400/40">
        {icon.badge}
      </span>
    );
  if (icon.pixel) return <PixelIcon name={icon.pixel} className="size-4 shrink-0" />;
  return <Icon name={icon.vector ?? 'sparkles'} className="size-4 shrink-0" />;
}

/**
 * Registro de combate com filtros. Mostra apenas encontros já animados (os mesmos
 * que o servidor liquidou), do mais recente para o mais antigo.
 */
export function CombatLog({ feed, hunting }: { feed: EncounterView[]; hunting: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const all = feed.slice(0, 12).flatMap(linesOf);
  const lines = filter === 'all' ? all : all.filter((l) => l.category === filter);
  const enough = all.length >= 4;

  return (
    <Panel
      title="Registro de Combate"
      icon="swords"
      className="flex min-h-0 flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col"
    >
      {enough && (
        <div className="mb-2">
          <Tabs<Filter>
            variant="chips"
            ariaLabel="Filtrar registro"
            active={filter}
            onChange={setFilter}
            tabs={[
              { id: 'all', label: 'Todos' },
              { id: 'combat', label: 'Combate' },
              { id: 'rewards', label: 'Recompensas' },
              { id: 'progress', label: 'Progresso' },
            ]}
          />
        </div>
      )}
      {all.length === 0 ? (
        <EmptyState
          icon="swords"
          title={hunting ? 'Procurando monstros…' : 'Nenhum combate ainda'}
          compact
        >
          {hunting
            ? 'O primeiro combate aparece aqui assim que o servidor confirmar o resultado.'
            : 'Inicie uma caçada para ver os combates.'}
        </EmptyState>
      ) : lines.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">Nada nesta categoria ainda.</p>
      ) : (
        <ul
          className="astral-scroll max-h-60 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1 font-mono text-[12px] lg:max-h-none"
          data-testid="combat-feed"
          aria-live="off"
        >
          {lines.map((l) => (
            <li key={l.key} className={`flex animate-fade-in items-start gap-2 py-0.5 ${l.tone}`}>
              <span className="shrink-0 text-slate-500 tabular-nums">[{formatClock(l.at)}]</span>
              <LineIcon icon={l.icon} />
              <span className="min-w-0 font-sans text-[13px] leading-snug">{l.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
