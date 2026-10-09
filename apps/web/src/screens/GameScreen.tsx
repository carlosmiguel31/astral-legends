import type { ContentResponse } from '@astral/shared';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Tabs } from '../components/ui';
import { HuntDirector } from '../game/director';
import { GameCanvas } from '../game/GameCanvas';
import { useGame } from '../game/useGame';
import { api } from '../lib/api';
import { formatDuration, formatMoney } from '../lib/format';
import { useRealtime } from '../lib/useRealtime';
import { EncounterLine, HistoryPanel } from './game/HistoryPanel';
import { Hud } from './game/Hud';
import { HuntPanel } from './game/HuntPanel';
import { InventoryPanel } from './game/InventoryPanel';
import { StatsPanel } from './game/StatsPanel';

type Tab = 'hunt' | 'stats' | 'inventory' | 'history';

export function GameScreen({ onLogout }: { onLogout: () => void }) {
  const director = useMemo(() => new HuntDirector(), []);
  const game = useGame(director, onLogout);
  const [content, setContent] = useState<ContentResponse | null>(null);
  const [tab, setTab] = useState<Tab>('hunt');

  useEffect(() => {
    api.content().then(setContent, () => undefined);
  }, []);

  const realtime = useRealtime({
    // Outra aba ou dispositivo alterou o estado: busca o estado persistido.
    onStateChanged: () => void game.sync(),
    onReconnected: () => void game.sync(),
    onSessionRevoked: onLogout,
  });

  const { state } = game;
  const historyVersion = state?.hunt
    ? `${state.hunt.runId}:${state.hunt.encountersResolved}`
    : 'none';

  if (!state) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        {game.connectionError ? (
          <Alert tone="warn" testId="connection-error">
            {game.connectionError}
          </Alert>
        ) : (
          <p className="text-slate-400">Carregando seu progresso…</p>
        )}
      </div>
    );
  }

  const hunting = state.hunt?.status === 'ACTIVE';
  const summary = game.offlineSummary;

  return (
    <div className="min-h-dvh">
      <Hud
        state={state}
        content={content}
        heroHp={game.heroHp}
        realtime={realtime.status}
        onLogout={onLogout}
        onLogoutAll={() => {
          void api.logoutAll().finally(onLogout);
        }}
      />

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-4">
          {game.connectionError && (
            <Alert tone="warn" testId="connection-error">
              {game.connectionError}
            </Alert>
          )}
          {summary && (
            <div
              className="rounded-xl border border-astral-gold/30 bg-astral-gold/10 p-4 text-sm"
              data-testid="offline-summary"
              role="status"
            >
              <p className="font-display text-base text-astral-gold">Enquanto você esteve fora</p>
              <p className="mt-1 text-slate-200">
                {summary.encounters} encontros em{' '}
                {formatDuration(
                  new Date(summary.windowEnd).getTime() - new Date(summary.windowStart).getTime(),
                )}
                : {summary.wins} vitórias, +{summary.xpGained} XP, +{formatMoney(summary.gold)}{' '}
                ouro, +{formatMoney(summary.essence)} essência
                {summary.itemsDropped > 0 ? `, ${summary.itemsDropped} itens` : ''}.
                {summary.levelAfter > summary.levelBefore
                  ? ` Nível ${summary.levelBefore} → ${summary.levelAfter}!`
                  : ''}
              </p>
              {summary.forfeitedMs > 0 && (
                <p className="mt-1 text-xs text-amber-200">
                  {formatDuration(summary.forfeitedMs)} ficaram além do limite de 8 horas de
                  progresso offline.
                </p>
              )}
              <Button variant="ghost" className="mt-2 -ml-2" onClick={game.dismissOfflineSummary}>
                Fechar
              </Button>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-night-800/70 p-3 shadow-xl shadow-black/30 sm:p-4">
            <GameCanvas director={director}>
              {!hunting && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                  <p className="rounded-full bg-night-950/80 px-4 py-1.5 text-xs text-slate-200 ring-1 ring-white/10">
                    Escolha uma região e inicie a caçada
                  </p>
                </div>
              )}
            </GameCanvas>
          </div>

          <section className="rounded-2xl border border-white/10 bg-night-800/70 p-4">
            <h2 className="mb-2 font-display text-base text-astral-gold-soft">Combate recente</h2>
            {game.feed.length === 0 ? (
              <p className="text-sm text-slate-500">
                {hunting
                  ? 'Procurando monstros… o primeiro combate aparece em instantes.'
                  : 'Nenhum combate nesta caçada.'}
              </p>
            ) : (
              <ul data-testid="combat-feed">
                {game.feed.slice(0, 8).map((e) => (
                  <EncounterLine key={`${e.runId}:${e.index}`} e={e} />
                ))}
              </ul>
            )}
          </section>
        </section>

        <aside className="min-w-0 space-y-4">
          <Tabs
            tabs={[
              { id: 'hunt', label: 'Caça' },
              { id: 'stats', label: 'Atributos' },
              { id: 'inventory', label: 'Inventário' },
              { id: 'history', label: 'Histórico' },
            ]}
            active={tab}
            onChange={setTab}
          />
          {game.actionError && (
            <Alert>
              {game.actionError}{' '}
              <button type="button" className="underline" onClick={game.clearActionError}>
                ok
              </button>
            </Alert>
          )}
          <div className="rounded-2xl border border-white/10 bg-night-800/70 p-4">
            {tab === 'hunt' && (
              <HuntPanel
                state={state}
                content={content}
                busy={game.busy}
                onStart={(id) => void game.startHunt(id)}
                onStop={() => void game.stopHunt()}
              />
            )}
            {tab === 'stats' && <StatsPanel state={state} />}
            {tab === 'inventory' && (
              <InventoryPanel
                version={game.inventoryVersion}
                busy={game.busy}
                onEquip={(id) => void game.equip(id)}
                onUnequip={(id) => void game.unequip(id)}
                onDiscard={(id) => void game.discard(id)}
              />
            )}
            {tab === 'history' && <HistoryPanel version={historyVersion} />}
          </div>
        </aside>
      </main>
    </div>
  );
}
