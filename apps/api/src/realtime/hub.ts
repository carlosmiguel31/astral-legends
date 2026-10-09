import { randomUUID } from 'node:crypto';
import type { WsServerMessage } from '@astral/shared';
import type { WebSocket } from '@fastify/websocket';
import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from '../infra/redis.js';

const CHANNEL = 'astral:realtime';

interface Envelope {
  origin: string;
  accountId: string;
  message: WsServerMessage;
}

/**
 * Entrega notificações às conexões WebSocket de uma conta (todas as abas e
 * dispositivos). Com várias instâncias da API, a mensagem passa pelo Redis
 * pub/sub; cada instância entrega aos sockets que mantém. Sem Redis, entrega
 * apenas localmente (o cliente também sincroniza periodicamente via HTTP).
 */
export class RealtimeHub {
  private readonly instanceId = randomUUID();
  private readonly sockets = new Map<string, Set<WebSocket>>();

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly pub?: Redis,
    private readonly sub?: Redis,
  ) {}

  /** Assina o canal de distribuição. Chamado no boot do servidor. */
  async start(): Promise<void> {
    if (!this.sub) return;
    this.sub.on('message', (channel: string, raw: string) => {
      if (channel !== CHANNEL) return;
      try {
        const envelope = JSON.parse(raw) as Envelope;
        if (envelope.origin === this.instanceId) return;
        this.deliver(envelope.accountId, envelope.message);
      } catch {
        this.log.warn('mensagem inválida no canal de tempo real');
      }
    });
    await this.sub.subscribe(CHANNEL);
  }

  add(accountId: string, socket: WebSocket): void {
    let set = this.sockets.get(accountId);
    if (!set) {
      set = new Set();
      this.sockets.set(accountId, set);
    }
    set.add(socket);
  }

  remove(accountId: string, socket: WebSocket): void {
    const set = this.sockets.get(accountId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.sockets.delete(accountId);
  }

  connections(accountId: string): number {
    return this.sockets.get(accountId)?.size ?? 0;
  }

  publish(accountId: string, message: WsServerMessage): void {
    this.deliver(accountId, message);
    if (this.pub?.status === 'ready') {
      const envelope: Envelope = { origin: this.instanceId, accountId, message };
      this.pub.publish(CHANNEL, JSON.stringify(envelope)).catch(() => {
        this.log.warn('falha ao publicar evento de tempo real');
      });
    }
  }

  private deliver(accountId: string, message: WsServerMessage): void {
    const set = this.sockets.get(accountId);
    if (!set) return;
    const payload = JSON.stringify(message);
    for (const socket of set) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
      if (message.type === 'session.revoked') socket.close(4001, 'session revoked');
    }
  }
}
