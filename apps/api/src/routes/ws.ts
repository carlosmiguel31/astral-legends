import { WS_PROTOCOL_VERSION, wsClientMessageSchema, type WsServerMessage } from '@astral/shared';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { AppConfig } from '../config/env.js';
import { readSessionCookies } from '../modules/auth/cookies.js';
import type { AuthService } from '../modules/auth/service.js';
import type { RealtimeHub } from '../realtime/hub.js';

export interface WsOptions {
  isOriginAllowed: (origin: string | undefined) => boolean;
  auth: AuthService;
  config: AppConfig;
  hub: RealtimeHub;
  heartbeatMs?: number;
  /** Máximo de mensagens por janela antes de encerrar a conexão. */
  maxMessagesPerWindow?: number;
  windowMs?: number;
}

function send(socket: WebSocket, message: WsServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

/**
 * Canal em tempo real. Conexões autenticadas (cookie de sessão no upgrade)
 * recebem notificações da própria conta (`state.changed`, `session.revoked`);
 * as anônimas servem só para medir conectividade. Toda mensagem do cliente é
 * validada com Zod e nenhuma delas altera estado de jogo diretamente.
 */
export async function wsRoutes(app: FastifyInstance, opts: WsOptions): Promise<void> {
  const heartbeatMs = opts.heartbeatMs ?? 30_000;
  const maxMessages = opts.maxMessagesPerWindow ?? 20;
  const windowMs = opts.windowMs ?? 10_000;

  app.get(
    '/ws',
    {
      websocket: true,
      preValidation: async (request, reply) => {
        if (!opts.isOriginAllowed(request.headers.origin)) {
          await reply
            .status(403)
            .send({ error: { code: 'ORIGIN_FORBIDDEN', message: 'Origem não permitida' } });
          return;
        }
        const { access } = readSessionCookies(request, opts.config);
        request.auth = access ? await opts.auth.authenticate(access, new Date()) : null;
      },
    },
    (socket, request) => {
      let alive = true;
      let windowStart = Date.now();
      let count = 0;

      const heartbeat = setInterval(() => {
        if (!alive) {
          request.log.debug('ws sem pong, encerrando');
          socket.terminate();
          return;
        }
        alive = false;
        socket.ping();
      }, heartbeatMs);
      heartbeat.unref();

      socket.on('pong', () => {
        alive = true;
      });
      const accountId = request.auth?.accountId;
      if (accountId) opts.hub.add(accountId, socket);
      socket.on('close', () => {
        clearInterval(heartbeat);
        if (accountId) opts.hub.remove(accountId, socket);
      });

      socket.on('message', (raw, isBinary) => {
        const now = Date.now();
        if (now - windowStart > windowMs) {
          windowStart = now;
          count = 0;
        }
        count += 1;
        if (count > maxMessages) {
          socket.close(1008, 'rate limit');
          return;
        }
        if (isBinary) {
          send(socket, {
            type: 'error',
            code: 'UNSUPPORTED',
            message: 'Mensagens binárias não são aceitas',
          });
          return;
        }

        let data: unknown;
        try {
          data = JSON.parse(raw.toString());
        } catch {
          send(socket, { type: 'error', code: 'BAD_JSON', message: 'JSON inválido' });
          return;
        }
        const parsed = wsClientMessageSchema.safeParse(data);
        if (!parsed.success) {
          send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Mensagem não reconhecida' });
          return;
        }
        switch (parsed.data.type) {
          case 'ping':
            send(socket, { type: 'pong', nonce: parsed.data.nonce, serverTime: Date.now() });
            break;
        }
      });

      send(socket, {
        type: 'hello',
        protocol: WS_PROTOCOL_VERSION,
        serverTime: Date.now(),
        authenticated: accountId !== undefined,
      });
    },
  );
}
