import { loginRequestSchema, registerRequestSchema, type AuthResponse } from '@astral/shared';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { authOf } from '../../http/guards.js';
import { parseInput, unauthorized } from '../../http/errors.js';
import type { RealtimeHub } from '../../realtime/hub.js';
import { clearSessionCookies, readSessionCookies, setSessionCookies } from './cookies.js';
import type { AuthService, SessionMeta } from './service.js';

export interface AuthRoutesOptions {
  config: AppConfig;
  auth: AuthService;
  requireAuth: preHandlerAsyncHookHandler;
  hub: RealtimeHub;
}

function meta(request: FastifyRequest): SessionMeta {
  const userAgent = request.headers['user-agent'];
  return { ip: request.ip, ...(userAgent ? { userAgent } : {}) };
}

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions): Promise<void> {
  const { config, auth, requireAuth, hub } = opts;

  app.post(
    '/v1/auth/register',
    { config: { rateLimit: { max: config.REGISTER_LIMIT_PER_HOUR, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const input = parseInput(registerRequestSchema, request.body);
      const result = await auth.register(input, meta(request), new Date());
      setSessionCookies(reply, config, result.tokens);
      const body: AuthResponse = { account: result.account };
      return reply.status(201).send(body);
    },
  );

  app.post(
    '/v1/auth/login',
    { config: { rateLimit: { max: config.LOGIN_LIMIT_PER_15MIN, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const input = parseInput(loginRequestSchema, request.body);
      const result = await auth.login(input, meta(request), new Date());
      setSessionCookies(reply, config, result.tokens);
      const body: AuthResponse = { account: result.account };
      return body;
    },
  );

  app.post(
    '/v1/auth/refresh',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { refresh } = readSessionCookies(request, config);
      if (!refresh) throw unauthorized('SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
      try {
        const tokens = await auth.refresh(refresh, new Date());
        setSessionCookies(reply, config, tokens);
        return { ok: true };
      } catch (error) {
        // Em corrida entre abas, os cookies novos já chegaram pela outra resposta.
        if ((error as { code?: string }).code !== 'REFRESH_RACE') clearSessionCookies(reply, config);
        throw error;
      }
    },
  );

  app.post('/v1/auth/logout', async (request, reply) => {
    await auth.logout(readSessionCookies(request, config), new Date());
    clearSessionCookies(reply, config);
    return reply.status(204).send();
  });

  app.post('/v1/auth/logout-all', { preHandler: requireAuth }, async (request, reply) => {
    const { accountId } = authOf(request);
    await auth.revokeAll(accountId, new Date());
    hub.publish(accountId, { type: 'session.revoked' });
    clearSessionCookies(reply, config);
    return reply.status(204).send();
  });

  app.get('/v1/auth/me', { preHandler: requireAuth }, async (request) => {
    const body: AuthResponse = { account: await auth.getAccount(authOf(request).accountId) };
    return body;
  });
}
