import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { AppConfig } from '../config/env.js';
import type { AuthContext, AuthService } from '../modules/auth/service.js';
import { readSessionCookies } from '../modules/auth/cookies.js';
import { AppError, unauthorized } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requestOrigin(request: FastifyRequest): string | undefined {
  const origin = request.headers.origin;
  if (origin) return origin;
  const referer = request.headers.referer;
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return 'invalid';
  }
}

/**
 * Proteção CSRF em camadas:
 * 1. Cookies `SameSite=Strict` (o navegador não os envia em requisições de outros sites).
 * 2. Só JSON é aceito no corpo: formulários HTML de outro site não conseguem enviar
 *    `application/json` sem preflight CORS, que é negado para origens desconhecidas.
 * 3. Em métodos que alteram estado, `Origin`/`Referer` precisam estar na allowlist;
 *    em produção a ausência de ambos também é recusada.
 */
export function registerCsrfProtection(app: FastifyInstance, config: AppConfig): void {
  const allowed = new Set(config.CORS_ORIGINS);
  app.removeContentTypeParser('text/plain');

  app.addHook('onRequest', async (request) => {
    if (!UNSAFE_METHODS.has(request.method)) return;
    if (request.headers['sec-fetch-site'] === 'cross-site') {
      throw new AppError(403, 'CSRF_REJECTED', 'Origem da requisição não permitida');
    }
    const origin = requestOrigin(request);
    if (origin === undefined) {
      if (config.NODE_ENV === 'production') {
        throw new AppError(403, 'CSRF_REJECTED', 'Origem da requisição não informada');
      }
      return;
    }
    if (!allowed.has(origin)) {
      throw new AppError(403, 'CSRF_REJECTED', 'Origem da requisição não permitida');
    }
  });
}

/** Decora `request.auth` e devolve o preHandler que exige sessão válida. */
export function createAuthGuard(
  app: FastifyInstance,
  config: AppConfig,
  auth: AuthService,
): preHandlerAsyncHookHandler {
  app.decorateRequest('auth', null);
  return async function requireAuth(request) {
    const { access } = readSessionCookies(request, config);
    if (!access) throw unauthorized();
    const context = await auth.authenticate(access, new Date());
    if (!context) throw unauthorized('SESSION_EXPIRED', 'Sua sessão expirou');
    request.auth = context;
  };
}

/** Acesso tipado ao contexto já validado pelo guard. */
export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}
