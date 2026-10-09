import { WS_PROTOCOL_VERSION, wsServerMessageSchema, type StateChangeReason } from '@astral/shared';
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from './api';

export type RealtimeStatus = 'connecting' | 'online' | 'offline' | 'incompatible';

export interface RealtimeState {
  status: RealtimeStatus;
  latencyMs: number | null;
  authenticated: boolean;
}

export interface RealtimeHandlers {
  onStateChanged?: (reason: StateChangeReason) => void;
  onSessionRevoked?: () => void;
  /** Chamado a cada reconexão bem-sucedida (para ressincronizar o estado). */
  onReconnected?: () => void;
}

const PING_EVERY_MS = 5_000;
const MAX_BACKOFF_MS = 15_000;

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${API_BASE}/ws`;
}

/**
 * Conexão em tempo real com reconexão exponencial e medição de latência.
 * O socket usa os mesmos cookies HttpOnly da sessão; nenhuma credencial passa pelo JS.
 * `connectionKey` força uma nova conexão (ex.: após login).
 */
export function useRealtime(handlers: RealtimeHandlers = {}, connectionKey = ''): RealtimeState {
  const [state, setState] = useState<RealtimeState>({
    status: 'connecting',
    latencyMs: null,
    authenticated: false,
  });
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    let socket: WebSocket | null = null;
    let pingTimer: number | undefined;
    let retryTimer: number | undefined;
    let attempt = 0;
    let everConnected = false;
    let disposed = false;
    const sentAt = new Map<string, number>();

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(wsUrl());

      socket.onmessage = (event) => {
        if (disposed) return;
        let data: unknown;
        try {
          data = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const parsed = wsServerMessageSchema.safeParse(data);
        if (!parsed.success) return;
        const msg = parsed.data;
        switch (msg.type) {
          case 'hello': {
            if (msg.protocol !== WS_PROTOCOL_VERSION) {
              setState({ status: 'incompatible', latencyMs: null, authenticated: false });
              disposed = true;
              socket?.close();
              return;
            }
            attempt = 0;
            setState((s) => ({ ...s, status: 'online', authenticated: msg.authenticated }));
            if (everConnected) handlersRef.current.onReconnected?.();
            everConnected = true;
            const ping = () => {
              const nonce = crypto.randomUUID();
              sentAt.set(nonce, performance.now());
              socket?.send(JSON.stringify({ type: 'ping', nonce }));
            };
            ping();
            pingTimer = window.setInterval(ping, PING_EVERY_MS);
            break;
          }
          case 'pong': {
            const start = sentAt.get(msg.nonce);
            sentAt.delete(msg.nonce);
            if (start !== undefined) {
              setState((s) => ({
                ...s,
                status: 'online',
                latencyMs: Math.round(performance.now() - start),
              }));
            }
            break;
          }
          case 'state.changed':
            handlersRef.current.onStateChanged?.(msg.reason);
            break;
          case 'session.revoked':
            handlersRef.current.onSessionRevoked?.();
            break;
          case 'error':
            break;
        }
      };

      socket.onclose = () => {
        window.clearInterval(pingTimer);
        sentAt.clear();
        if (disposed) return;
        setState((s) => ({ ...s, status: 'offline', latencyMs: null }));
        const delay = Math.min(1_000 * 2 ** attempt, MAX_BACKOFF_MS);
        attempt += 1;
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearInterval(pingTimer);
      window.clearTimeout(retryTimer);
      // Fechar durante o handshake aborta a conexão de forma ruidosa (comum no StrictMode);
      // nesse caso fecha assim que abrir.
      const current = socket;
      if (current?.readyState === WebSocket.CONNECTING) current.onopen = () => current.close();
      else current?.close();
    };
  }, [connectionKey]);

  return state;
}
