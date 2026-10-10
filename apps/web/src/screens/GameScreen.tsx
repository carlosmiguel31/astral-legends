import type { ContentResponse } from '@astral/shared';
import { useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '../components/icons';
import { Alert, Loading, Modal, Panel, Tabs, useToast } from '../components/ui';
import { HuntDirector } from '../game/director';
import { useGame } from '../game/useGame';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useIsDesktop } from '../lib/useMediaQuery';
import { useRealtime } from '../lib/useRealtime';
import { CharacterPanel } from './game/CharacterPanel';
import { ChatPanel } from './game/ChatPanel';
import { CombatLog } from './game/CombatLog';
import { HistoryPanel } from './game/HistoryPanel';
import { Hud } from './game/Hud';
import {
  HuntPanel,
  HuntToggle,
  RegionCard,
  RegionList,
  RegionRewards,
  WaveControls,
  WaveTotals,
} from './game/HuntPanel';
import { InventoryPanel } from './game/InventoryPanel';
import { RARITY_LOWER, clearNextText } from './game/labels';
import { OfflineSummary } from './game/OfflineSummary';
import { Stage, WaveProgressCard, stageRegionId } from './game/Stage';
import { TopNav, type NavAction } from './game/TopNav';

type Tab = 'hunt' | 'stats' | 'inventory' | 'history';
type Sheet = 'regions' | 'character' | 'inventory' | 'history' | 'map' | null;

const MOBILE_BAR: ReadonlyArray<{
  id: Exclude<Sheet, null | 'map'>;
  label: string;
  icon: IconName;
}> = [
  { id: 'regions', label: 'Regiões', icon: 'map' },
  { id: 'character', label: 'Personagem', icon: 'user' },
  { id: 'inventory', label: 'Inventário', icon: 'bag' },
  { id: 'history', label: 'Histórico', icon: 'scroll' },
];

export function GameScreen({ onLogout }: { onLogout: () => void }) {
  const director = useMemo(() => new HuntDirector(), []);
  const game = useGame(director, onLogout);
  const desktop = useIsDesktop();
  const notify = useToast();
  const [content, setContent] = useState<ContentResponse | null>(null);
  const [tab, setTab] = useState<Tab>('hunt');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  useEffect(() => {
    api.content().then(setContent, () => undefined);
  }, []);

  const realtime = useRealtime({
    // Outra aba ou dispositivo alterou o estado: busca o estado persistido.
    onStateChanged: () => void game.sync(),
    onReconnected: () => void game.sync(),
    onSessionRevoked: onLogout,
  });

  // Conclusão de wave: aviso quando a animação do encontro correspondente termina.
  const feedback = game.waveFeedback;
  useEffect(() => {
    if (!feedback) return;
    const reward = feedback.firstClearReward;
    notify({
      id: 'wave-feedback',
      testId: 'wave-feedback',
      tone: 'gold',
      icon: 'sparkles',
      title: `Wave ${feedback.wave} concluída!`,
      durationMs: 9_000,
      body: (
        <>
          <p>
            {feedback.wins} vitórias{feedback.losses > 0 ? ` e ${feedback.losses} derrotas` : ''} ·
            +{feedback.xp} XP · +{formatMoney(feedback.gold)} ouro
            {feedback.essence !== '0' ? ` · +${formatMoney(feedback.essence)} essência` : ''}
            {feedback.items > 0 ? ` · ${feedback.items} itens` : ''}
          </p>
          {reward && (
            <p className="text-astral-violet">
              Primeira conclusão: +{formatMoney(reward.gold)} ouro, +{formatMoney(reward.essence)}{' '}
              essência
              {reward.item
                ? `, ${reward.item.name} (${RARITY_LOWER[reward.item.rarity] ?? reward.item.rarity})`
                : ''}
            </p>
          )}
          <p className="text-slate-400">{clearNextText(feedback)}</p>
        </>
      ),
    });
  }, [feedback, notify]);

  // Erros de ação viram notificações (não bloqueiam a tela).
  const { actionError, clearActionError } = game;
  useEffect(() => {
    if (!actionError) return;
    notify({ tone: 'error', icon: 'close', title: 'Não foi possível concluir', body: actionError });
    clearActionError();
  }, [actionError, clearActionError, notify]);

  const { state } = game;
  if (!state) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        {game.connectionError ? (
          <Alert tone="warn" testId="connection-error">
            {game.connectionError}
          </Alert>
        ) : (
          <Loading>Carregando seu progresso…</Loading>
        )}
      </div>
    );
  }

  const hunting = state.hunt?.status === 'ACTIVE';
  const historyVersion = state.hunt
    ? `${state.hunt.runId}:${state.hunt.encountersResolved}`
    : 'none';
  const region = selectedRegion ?? stageRegionId(state);
  const regionInfo = content?.regions.find((r) => r.id === region) ?? null;
  const huntActions = {
    busy: game.busy,
    onStart: (id: string) => void game.startHunt(id),
    onStop: () => void game.stopHunt(),
    onSettings: (input: Parameters<typeof game.huntSettings>[0]) => void game.huntSettings(input),
  };
  const inventory = (
    <InventoryPanel
      version={game.inventoryVersion}
      busy={game.busy}
      onEquip={(id) => void game.equip(id)}
      onUnequip={(id) => void game.unequip(id)}
      onDiscard={(id) => void game.discard(id)}
    />
  );

  const onNav = (action: NavAction) => {
    if (action === 'play') {
      setSheet(null);
      setTab('hunt');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSheet(action === 'map' ? (desktop ? 'map' : 'regions') : action);
  };

  const banners = (
    <>
      {game.connectionError && (
        <Alert tone="warn" testId="connection-error">
          {game.connectionError}
        </Alert>
      )}
      {game.offlineSummary && (
        <OfflineSummary summary={game.offlineSummary} onClose={game.dismissOfflineSummary} />
      )}
    </>
  );

  const regionsContent = content ? (
    <div className="space-y-4">
      <RegionList
        state={state}
        content={content}
        selected={region}
        onSelect={setSelectedRegion}
        layout="grid"
      />
      {regionInfo && <RegionCard state={state} region={regionInfo} {...huntActions} />}
      {regionInfo && <RegionRewards region={regionInfo} />}
    </div>
  ) : (
    <Loading>Carregando regiões…</Loading>
  );

  return (
    <div className="min-h-dvh">
      <TopNav
        compact={!desktop}
        onAction={onNav}
        onLogout={onLogout}
        onLogoutAll={() => void api.logoutAll().finally(onLogout)}
      />
      <div className={desktop ? 'px-3 2xl:px-6' : ''}>
        <Hud
          state={state}
          content={content}
          heroHp={game.heroHp}
          realtime={realtime.status}
          compact={!desktop}
        />
      </div>

      {/*
        A estrutura até o palco é a mesma nos dois layouts: o canvas do Phaser nunca é
        recriado ao girar o tablet ou redimensionar a janela.
      */}
      <main
        className={
          desktop
            ? 'mx-auto grid max-w-[1920px] gap-3 px-3 pt-3 pb-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_540px] 2xl:px-6'
            : 'px-3 pt-3 pb-28'
        }
      >
        <section className="min-w-0 space-y-3">
          {banners}
          <Stage state={state} content={content} director={director} />
          <WaveProgressCard state={state} content={content} />
          {desktop ? (
            <div className="grid gap-3 xl:h-72 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <CombatLog feed={game.feed} hunting={hunting} />
              <ChatPanel />
            </div>
          ) : (
            <>
              <Panel title={regionInfo?.name ?? 'Caça'} icon="swords">
                <div className="space-y-4">
                  {regionInfo && <HuntToggle state={state} region={regionInfo} {...huntActions} />}
                  <WaveControls
                    state={state}
                    content={content}
                    regionId={region}
                    busy={game.busy}
                    onSettings={huntActions.onSettings}
                  />
                  {(() => {
                    const p = state.waves.regions.find((r) => r.regionId === region);
                    return p ? <WaveTotals progress={p} /> : null;
                  })()}
                </div>
              </Panel>
              <CombatLog feed={game.feed} hunting={hunting} />
              <ChatPanel />
              <nav
                aria-label="Painéis"
                className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-astral-gold/30 bg-night-950/95 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur"
              >
                {MOBILE_BAR.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSheet(item.id)}
                    aria-haspopup="dialog"
                    className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] text-[11px] font-semibold ${
                      sheet === item.id ? 'text-astral-gold' : 'text-slate-300'
                    }`}
                  >
                    <Icon name={item.icon} className="size-5" />
                    {item.label}
                  </button>
                ))}
              </nav>
            </>
          )}
        </section>
        {desktop && (
          <aside className="astral-scroll min-w-0 space-y-3 lg:sticky lg:top-[84px] lg:max-h-[calc(100dvh-96px)] lg:self-start lg:overflow-y-auto lg:pr-1">
            <Tabs<Tab>
              ariaLabel="Painéis"
              tabs={[
                { id: 'hunt', label: 'Caça' },
                { id: 'stats', label: 'Atributos' },
                { id: 'inventory', label: 'Inventário' },
                { id: 'history', label: 'Histórico' },
              ]}
              active={tab}
              onChange={setTab}
            />
            <Panel>
              {tab === 'hunt' && (
                <HuntPanel
                  state={state}
                  content={content}
                  selected={region}
                  onSelect={setSelectedRegion}
                  {...huntActions}
                />
              )}
              {tab === 'stats' && <CharacterPanel state={state} />}
              {tab === 'inventory' && inventory}
              {tab === 'history' && <HistoryPanel version={historyVersion} />}
            </Panel>
          </aside>
        )}
      </main>

      {/* Janelas: abrem sobre o jogo sem sair da tela principal. */}
      <Modal
        open={sheet === 'character'}
        onClose={() => setSheet(null)}
        title="Personagem"
        icon="user"
        size="lg"
        sheet={!desktop}
      >
        <CharacterPanel state={state} />
      </Modal>
      <Modal
        open={sheet === 'inventory'}
        onClose={() => setSheet(null)}
        title="Inventário"
        icon="bag"
        size="lg"
        sheet={!desktop}
      >
        {inventory}
      </Modal>
      <Modal
        open={sheet === 'history'}
        onClose={() => setSheet(null)}
        title="Histórico"
        icon="scroll"
        size="lg"
        sheet={!desktop}
      >
        <HistoryPanel version={historyVersion} />
      </Modal>
      <Modal
        open={sheet === 'regions' || sheet === 'map'}
        onClose={() => setSheet(null)}
        title={desktop ? 'Mapa' : 'Regiões'}
        icon="map"
        size="xl"
        sheet={!desktop}
      >
        {regionsContent}
      </Modal>
    </div>
  );
}
