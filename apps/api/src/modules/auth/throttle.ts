import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../http/errors.js';
import type { Redis } from '../../infra/redis.js';
import { sha256Hex } from '../../lib/crypto.js';

/**
 * Bloqueio progressivo de login por conta (e-mail) e por IP, com contadores no Redis
 * (compartilhados entre instâncias). Falha fechado: sem Redis, o login fica indisponível
 * em vez de permitir força bruta sem limite.
 */
export class LoginThrottle {
  constructor(
    private readonly redis: Redis,
    private readonly config: AppConfig,
  ) {}

  private keys(email: string, ip: string): { email: string; ip: string } {
    // O e-mail entra como hash: nada de dados pessoais em chaves do Redis.
    return { email: `astral:auth:fail:email:${sha256Hex(email)}`, ip: `astral:auth:fail:ip:${ip}` };
  }

  private windowMs(): number {
    return this.config.LOGIN_LOCKOUT_MINUTES * 60_000;
  }

  async assertAllowed(email: string, ip: string): Promise<void> {
    const k = this.keys(email, ip);
    let counts: Array<string | null>;
    try {
      counts = await this.redis.mget(k.email, k.ip);
    } catch {
      throw new AppError(503, 'AUTH_UNAVAILABLE', 'Login temporariamente indisponível');
    }
    const byEmail = Number(counts[0] ?? 0);
    const byIp = Number(counts[1] ?? 0);
    if (
      byEmail >= this.config.LOGIN_MAX_FAILURES_PER_ACCOUNT ||
      byIp >= this.config.LOGIN_MAX_FAILURES_PER_IP
    ) {
      throw new AppError(
        429,
        'TOO_MANY_ATTEMPTS',
        `Muitas tentativas de login. Aguarde ${this.config.LOGIN_LOCKOUT_MINUTES} minutos e tente novamente.`,
      );
    }
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    const k = this.keys(email, ip);
    const ms = this.windowMs();
    try {
      // NX: a janela começa na primeira falha e não é estendida a cada nova tentativa.
      await this.redis
        .multi()
        .incr(k.email)
        .pexpire(k.email, ms, 'NX')
        .incr(k.ip)
        .pexpire(k.ip, ms, 'NX')
        .exec();
    } catch {
      throw new AppError(503, 'AUTH_UNAVAILABLE', 'Login temporariamente indisponível');
    }
  }

  async reset(email: string): Promise<void> {
    await this.redis.del(this.keys(email, '').email).catch(() => undefined);
  }
}
