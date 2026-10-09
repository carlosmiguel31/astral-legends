import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config/env.js';

export interface CookieNames {
  access: string;
  refresh: string;
}

export function isSecureCookies(config: AppConfig): boolean {
  return config.NODE_ENV === 'production' || config.COOKIE_SECURE === true;
}

/**
 * Com Secure ativo usamos o prefixo `__Host-`: o navegador só aceita o cookie
 * via HTTPS, sem Domain e com Path=/, o que impede injeção por subdomínios.
 */
export function cookieNames(config: AppConfig): CookieNames {
  const prefix = isSecureCookies(config) ? '__Host-' : '';
  return { access: `${prefix}al_at`, refresh: `${prefix}al_rt` };
}

function baseOptions(config: AppConfig): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: isSecureCookies(config),
    // Strict: o navegador nunca envia os cookies em requisições iniciadas por outro site.
    sameSite: 'strict',
    path: '/',
  };
}

export function setSessionCookies(
  reply: FastifyReply,
  config: AppConfig,
  tokens: { access: string; refresh: string; accessExpiresAt: Date; expiresAt: Date },
): void {
  const names = cookieNames(config);
  void reply.setCookie(names.access, tokens.access, {
    ...baseOptions(config),
    expires: tokens.accessExpiresAt,
  });
  void reply.setCookie(names.refresh, tokens.refresh, {
    ...baseOptions(config),
    expires: tokens.expiresAt,
  });
}

export function clearSessionCookies(reply: FastifyReply, config: AppConfig): void {
  const names = cookieNames(config);
  void reply.clearCookie(names.access, baseOptions(config));
  void reply.clearCookie(names.refresh, baseOptions(config));
}

export function readSessionCookies(
  request: FastifyRequest,
  config: AppConfig,
): { access?: string; refresh?: string } {
  const names = cookieNames(config);
  const access = request.cookies[names.access];
  const refresh = request.cookies[names.refresh];
  return {
    ...(access ? { access } : {}),
    ...(refresh ? { refresh } : {}),
  };
}
