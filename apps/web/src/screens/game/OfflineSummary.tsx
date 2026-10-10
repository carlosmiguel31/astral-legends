import type { SettlementView } from '@astral/shared';
import { Button, RewardTile } from '../../components/ui';
import { formatDuration, formatMoney, sumMoney } from '../../lib/format';

/**
 * Painel de retorno ("Enquanto você esteve fora"). Não é modal: aparece sobre o
 * conteúdo sem bloquear o jogo. Todos os números são os da liquidação do servidor.
 */
export function OfflineSummary({
  summary,
  onClose,
}: {
  summary: SettlementView;
  onClose: () => void;
}) {
  const window = new Date(summary.windowEnd).getTime() - new Date(summary.windowStart).getTime();
  const away = window + summary.forfeitedMs;
  const items = summary.itemsDropped - summary.itemsDiscarded;
  return (
    <section
      className="astral-frame astral-frame-strong animate-pop p-4"
      data-testid="offline-summary"
      role="status"
      aria-label="Resumo do progresso offline"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="astral-gold-text font-display text-xl font-bold">Bem-vindo de volta!</p>
          <p className="text-sm text-slate-300">
            Enquanto você esteve fora, seu herói continuou caçando.
          </p>
        </div>
        <Button variant="gold-outline" size="sm" onClick={onClose}>
          Continuar
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <RewardTile kind="time" value={formatDuration(away)} label="Tempo fora" />
        <RewardTile
          kind="fights"
          value={summary.encounters}
          label={`Encontros (${summary.wins} vitórias)`}
        />
        <RewardTile kind="waves" value={summary.wavesCleared} label="Waves concluídas" />
        <RewardTile kind="xp" value={`+${summary.xpGained}`} label="Experiência" />
        <RewardTile
          kind="gold"
          value={`+${formatMoney(sumMoney(summary.gold, summary.firstClearGold))}`}
          label="Ouro"
        />
        <RewardTile
          kind="essence"
          value={`+${formatMoney(sumMoney(summary.essence, summary.firstClearEssence))}`}
          label="Essência"
        />
        <RewardTile kind="items" value={items} label="Itens obtidos" />
        <RewardTile
          kind="level"
          value={
            summary.levelAfter > summary.levelBefore
              ? `${summary.levelBefore} → ${summary.levelAfter}`
              : summary.levelAfter
          }
          label="Nível"
        />
      </div>

      {summary.wavesCleared > 0 && (
        <p className="mt-3 text-sm text-slate-200" data-testid="offline-waves">
          {summary.wavesCleared === 1
            ? '1 wave concluída'
            : `${summary.wavesCleared} waves concluídas`}
          {summary.waveBefore !== null && summary.waveAfter !== null
            ? ` (wave ${summary.waveBefore} → ${summary.waveAfter})`
            : ''}
          {summary.firstClears > 0
            ? `; ${summary.firstClears} pela primeira vez: +${formatMoney(summary.firstClearGold)} ouro e +${formatMoney(summary.firstClearEssence)} essência de bônus`
            : ''}
          .
        </p>
      )}
      {summary.itemsDiscarded > 0 && (
        <p className="mt-1 text-xs text-amber-200">
          {summary.itemsDiscarded} itens não couberam no inventário e foram descartados.
        </p>
      )}
      {summary.forfeitedMs > 0 && (
        <p className="mt-1 text-xs text-amber-200">
          {formatDuration(summary.forfeitedMs)} ficaram além do limite de 8 horas de progresso
          offline.
        </p>
      )}
    </section>
  );
}
