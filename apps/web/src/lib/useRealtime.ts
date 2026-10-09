import { WS_PROTOCOL_VERSION, wsServerMessageSchema } from '@astral/shared';
import { useEffect, useState } from 'react';
import { API_BASE } from './api';

export type RealtimeStatus = 'connecting' | 'online' | 'offline' | 'incompatible';

export interface RealtimeState {
  status: RealtimeStatus;
  latencyMs: number | null;
}

const PING_EVERY_MS = 5_000;
const MAX_BACKOFF_MS = 15_000;

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${API_BASE}/ws`;
}

/** Conexão em tempo real com reconexão exponencial e medição de latência. */
export function useRealtime(): RealtimeState {
  const [state, setState] = useState<RealtimeState>({ status: 'connecting', latencyMs: null });

  useEffect(() => {
    let socket: WebSocket | null = null;
    let pingTimer: number | undefined;
    let retryTimer: number | undefined;
    let attempt = 0;
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
        if (msg.type === 'hello') {
          if (msg.protocol !== WS_PROTOCOL_VERSION) {
            setState({ status: 'incompatible', latencyMs: null });
            disposed = true;
            socket?.close();
            return;
          }
          attempt = 0;
          setState((s) => ({ ...s, status: 'online' }));
          const ping = () => {
            const nonce = crypto.randomUUID();
            sentAt.set(nonce, performance.now());
            socket?.send(JSON.stringify({ type: 'ping', nonce }));
          };
          ping();
          pingTimer = window.setInterval(ping, PING_EVERY_MS);
        } else if (msg.type === 'pong') {
          const start = sentAt.get(msg.nonce);
          sentAt.delete(msg.nonce);
          if (start !== undefined) {
            setState({ status: 'online', latencyMs: Math.round(performance.now() - start) });
          }
        }
      };

      socket.onclose = () => {
        window.clearInterval(pingTimer);
        sentAt.clear();
        if (disposed) return;
        setState({ status: 'offline', latencyMs: null });
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
  }, []);

  return state;
}
