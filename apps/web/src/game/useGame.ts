import type {
  EncounterView,
  GameState,
  HuntSettingsRequest,
  SettlementView,
  SyncResponse,
  WaveClearView,
} from '@astral/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { HuntDirector } from './director';

/** Intervalo de sincronização enquanto a caçada está ativa e a aba visível. */
const SYNC_EVERY_MS = 4_000;
/** Liquidações maiores que isto no carregamento viram um resumo "enquanto você esteve fora". */
const OFFLINE_SUMMARY_MIN_ENCOUNTERS = 5;
/** Tempo que o aviso de wave concluída fica na tela. */
const WAVE_FEEDBACK_MS = 9_000;

export interface GameController {
  state: GameState | null;
  /** Encontros recentes já reproduzidos (ou antigos), do mais novo para o mais antigo. */
  feed: EncounterView[];
  offlineSummary: SettlementView | null;
  dismissOfflineSummary(): void;
  /** Erro de rede/servidor: a interface mostra o aviso e segue tentando. */
  connectionError: string | null;
  actionError: string | null;
  clearActionError(): void;
  busy: string | null;
  heroHp: { hp: number; max: number } | null;
  inventoryVersion: number;
  /** Wave concluída mais recente, exibida quando a animação do encontro termina. */
  waveFeedback: WaveClearView | null;
  dismissWaveFeedback(): void;
  sync(): Promise<void>;
  huntSettings(input: HuntSettingsRequest): Promise<void>;
  startHunt(regionId: string): Promise<void>;
  stopHunt(): Promise<void>;
  equip(itemId: string): Promise<void>;
  unequip(itemId: string): Promise<void>;
  discard(itemId: string): Promise<void>;
}

/**
 * Estado do jogo do lado do cliente. Fonte da verdade: o servidor.
 * O cliente só pede liquidações e reproduz o resultado na cena Phaser.
 */
export function useGame(director: HuntDirector, onSessionLost: () => void): GameController {
  const [state, setState] = useState<GameState | null>(null);
  const [recent, setRecent] = useState<EncounterView[]>([]);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [offlineSummary, setOfflineSummary] = useState<SettlementView | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [heroHp, setHeroHp] = useState<{ hp: number; max: number } | null>(null);
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [waveFeedback, setWaveFeedback] = useState<WaveClearView | null>(null);
  /** Conclusões aguardando a cena terminar o encontro correspondente (por índice). */
  const pendingClears = useRef(new Map<string, WaveClearView>());

  const lastQueued = useRef<{ runId: string; index: number } | null>(null);
  const firstSync = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);
  const sessionLostRef = useRef(onSessionLost);
  useEffect(() => {
    sessionLostRef.current = onSessionLost;
  });

  useEffect(() => {
    director.setHooks({
      onHeroHp: (hp, max) => setHeroHp({ hp, max }),
      onEncounterShown: (e) => {
        setPending((p) => {
          const next = new Set(p);
          next.delete(`${e.runId}:${e.index}`);
          return next;
        });
        const key = `${e.runId}:${e.index}`;
        const clear = pendingClears.current.get(key);
        if (clear) {
          pendingClears.current.delete(key);
          setWaveFeedback(clear);
        }
      },
    });
    return () => director.setHooks({});
  }, [director]);

  const handleError = useCallback((error: unknown, kind: 'sync' | 'action') => {
    if (error instanceof ApiError && error.status === 401) {
      sessionLostRef.current();
      return;
    }
    const network = error instanceof ApiError && (error.status === 0 || error.status >= 500);
    if (network || kind === 'sync') {
      setConnectionError('Conexão com o servidor perdida. Tentando reconectar…');
    } else {
      setActionError(error instanceof Error ? error.message : 'Algo deu errado');
    }
  }, []);

  const apply = useCallback(
    (res: SyncResponse) => {
      setState(res.state);
      setRecent(res.recentEncounters);
      setConnectionError(null);

      const runId = res.state.hunt?.runId;
      const last = lastQueued.current;
      const fresh = runId
        ? res.recentEncounters.filter(
            (e) => e.runId === runId && (last?.runId !== runId || e.index > last.index),
          )
        : [];
      // No primeiro carregamento só animamos o último encontro; o resto vai para o resumo.
      const toPlay = firstSync.current ? fresh.slice(-1) : fresh;
      if (
        firstSync.current &&
        res.settlement &&
        res.settlement.encounters >= OFFLINE_SUMMARY_MIN_ENCOUNTERS
      ) {
        setOfflineSummary(res.settlement);
      }
      const wasFirst = firstSync.current;
      firstSync.current = false;
      // Conclusões de wave: no primeiro carregamento entram no resumo offline; depois,
      // aparecem quando a cena termina o encontro que concluiu a wave.
      if (!wasFirst && runId) {
        const playing = new Set(toPlay.map((e) => e.index));
        let immediate: WaveClearView | null = null;
        for (const c of res.waveClears) {
          if (playing.has(c.encounterIndex))
            pendingClears.current.set(`${runId}:${c.encounterIndex}`, c);
          else immediate = c;
        }
        if (immediate) setWaveFeedback(immediate);
      }
      if (runId && fresh.length > 0) lastQueued.current = { runId, index: fresh.at(-1)!.index };
      if (toPlay.length > 0) {
        setPending((p) => {
          const next = new Set(p);
          for (const e of toPlay) next.add(`${e.runId}:${e.index}`);
          return next;
        });
        director.enqueue(toPlay);
      }
      if (res.settlement && res.settlement.itemsDropped > 0) setInventoryVersion((v) => v + 1);
    },
    [director],
  );

  const sync = useCallback((): Promise<void> => {
    // Evita sincronizações sobrepostas (polling + WebSocket + foco da aba).
    inFlight.current ??= api
      .sync()
      .then(apply, (e: unknown) => handleError(e, 'sync'))
      .finally(() => {
        inFlight.current = null;
      });
    return inFlight.current;
  }, [apply, handleError]);

  // Carrega (e liquida o progresso offline) ao entrar.
  useEffect(() => {
    void sync();
  }, [sync]);

  // Sincronização periódica enquanto caça, e imediata ao voltar para a aba ou à rede.
  const hunting = state?.hunt?.status === 'ACTIVE';
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const onOnline = () => void sync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    let timer: number | undefined;
    if (hunting || connectionError) {
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void sync();
      }, SYNC_EVERY_MS);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [hunting, connectionError, sync]);

  // Mantém a cena alinhada ao personagem e à região.
  const look = state
    ? `${state.character.classId}:${state.character.appearance.hair}:${state.character.appearance.skin}:${state.character.appearance.cloak}:${state.stats.maxHp}`
    : null;
  useEffect(() => {
    if (!state) return;
    director.setHero(
      { classId: state.character.classId, appearance: state.character.appearance },
      state.stats.maxHp,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `look` resume as dependências relevantes
  }, [look, director]);
  useEffect(() => {
    director.setHunting(hunting);
  }, [hunting, director]);
  useEffect(() => {
    if (!waveFeedback) return;
    const timer = window.setTimeout(() => setWaveFeedback(null), WAVE_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [waveFeedback]);
  const regionId = state?.hunt?.regionId ?? (state ? 'campos-do-alvorecer' : null);
  useEffect(() => {
    if (regionId) director.setRegion(regionId);
  }, [regionId, director]);

  const action = useCallback(
    async (label: string, run: () => Promise<SyncResponse | void>) => {
      setBusy(label);
      setActionError(null);
      try {
        const res = await run();
        if (res) apply(res);
        else await sync();
      } catch (e) {
        handleError(e, 'action');
      } finally {
        setBusy(null);
      }
    },
    [apply, handleError, sync],
  );

  const feed = recent.filter((e) => !pending.has(`${e.runId}:${e.index}`)).reverse();

  return {
    state,
    feed,
    offlineSummary,
    dismissOfflineSummary: () => setOfflineSummary(null),
    connectionError,
    actionError,
    clearActionError: () => setActionError(null),
    busy,
    heroHp,
    inventoryVersion,
    waveFeedback,
    dismissWaveFeedback: () => setWaveFeedback(null),
    sync,
    huntSettings: (input) => action('settings', () => api.huntSettings(input)),
    startHunt: (regionId) => action(`start:${regionId}`, () => api.startHunt(regionId)),
    stopHunt: () => action('stop', () => api.stopHunt()),
    equip: (id) =>
      action(`equip:${id}`, async () => {
        const res = await api.equip(id);
        setInventoryVersion((v) => v + 1);
        return res;
      }),
    unequip: (id) =>
      action(`unequip:${id}`, async () => {
        const res = await api.unequip(id);
        setInventoryVersion((v) => v + 1);
        return res;
      }),
    discard: (id) =>
      action(`discard:${id}`, async () => {
        await api.discard(id);
        setInventoryVersion((v) => v + 1);
      }),
  };
}
