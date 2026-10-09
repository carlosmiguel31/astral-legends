import type { AccountView, LoginRequest, RegisterRequest } from '@astral/shared';
import type { AppConfig } from '../../config/env.js';
import { AppError, unauthorized } from '../../http/errors.js';
import type { PrismaClient } from '../../infra/prisma.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';
import { uniqueViolation } from '../../lib/prisma-errors.js';
import { hashPassword, verifyPassword } from './password.js';
import type { LoginThrottle } from './throttle.js';

/** Janela em que reapresentar o refresh token anterior é tratado como corrida entre abas. */
export const REFRESH_GRACE_MS = 30_000;
const LAST_SEEN_RESOLUTION_MS = 60_000;

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface SessionTokens {
  access: string;
  refresh: string;
  accessExpiresAt: Date;
  expiresAt: Date;
}

export interface AuthContext {
  accountId: string;
  sessionId: string;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
    private readonly throttle: LoginThrottle,
  ) {}

  private accessExpiry(now: Date, sessionExpiresAt: Date): Date {
    const access = new Date(now.getTime() + this.config.ACCESS_TOKEN_TTL_MINUTES * 60_000);
    return access < sessionExpiresAt ? access : sessionExpiresAt;
  }

  private async createSession(accountId: string, meta: SessionMeta, now: Date): Promise<SessionTokens> {
    const access = randomToken();
    const refresh = randomToken();
    const expiresAt = new Date(now.getTime() + this.config.SESSION_TTL_DAYS * 86_400_000);
    const accessExpiresAt = this.accessExpiry(now, expiresAt);
    await this.prisma.authSession.create({
      data: {
        accountId,
        accessTokenHash: sha256Hex(access),
        accessExpiresAt,
        refreshTokenHash: sha256Hex(refresh),
        expiresAt,
        createdAt: now,
        lastSeenAt: now,
        ip: meta.ip?.slice(0, 64) ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
      },
    });
    return { access, refresh, accessExpiresAt, expiresAt };
  }

  async register(
    input: RegisterRequest,
    meta: SessionMeta,
    now: Date,
  ): Promise<{ account: AccountView; tokens: SessionTokens }> {
    const usernameKey = input.username.toLowerCase();
    // Nomes de usuário são públicos: informar que já existe não revela dado sensível.
    const taken = await this.prisma.account.findUnique({ where: { usernameKey }, select: { id: true } });
    if (taken) throw usernameTaken();

    // O hash é calculado antes de tocar no e-mail para que o tempo de resposta seja o mesmo
    // quer o e-mail exista ou não.
    const passwordHash = await hashPassword(input.password);
    let accountId: string;
    try {
      const account = await this.prisma.account.create({
        data: { username: input.username, usernameKey, email: input.email, passwordHash },
        select: { id: true },
      });
      accountId = account.id;
    } catch (error) {
      const target = uniqueViolation(error);
      if (target?.includes('username')) throw usernameTaken();
      if (target?.includes('email')) {
        // Mensagem genérica: não confirma que o e-mail pertence a uma conta existente.
        throw new AppError(
          409,
          'REGISTRATION_FAILED',
          'Não foi possível concluir o cadastro com esses dados. Se você já tem conta, faça login.',
        );
      }
      throw error;
    }
    const tokens = await this.createSession(accountId, meta, now);
    return {
      account: { id: accountId, username: input.username, email: input.email, hasCharacter: false },
      tokens,
    };
  }

  async login(
    input: LoginRequest,
    meta: SessionMeta,
    now: Date,
  ): Promise<{ account: AccountView; tokens: SessionTokens }> {
    const ip = meta.ip ?? 'unknown';
    await this.throttle.assertAllowed(input.email, ip);

    const account = await this.prisma.account.findUnique({
      where: { email: input.email },
      select: { id: true, username: true, email: true, passwordHash: true, status: true, character: { select: { id: true } } },
    });
    const ok = await verifyPassword(account?.passwordHash ?? null, input.password);
    if (!account || !ok) {
      await this.throttle.recordFailure(input.email, ip);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos');
    }
    // Só revelamos a suspensão depois de a senha estar correta.
    if (account.status !== 'ACTIVE') {
      throw new AppError(403, 'ACCOUNT_DISABLED', 'Esta conta está suspensa');
    }
    await this.throttle.reset(input.email);
    const tokens = await this.createSession(account.id, meta, now);
    return {
      account: {
        id: account.id,
        username: account.username,
        email: account.email,
        hasCharacter: account.character !== null,
      },
      tokens,
    };
  }

  /** Valida o token de acesso. Devolve `null` se ausente, expirado ou revogado. */
  async authenticate(accessToken: string, now: Date): Promise<AuthContext | null> {
    const session = await this.prisma.authSession.findUnique({
      where: { accessTokenHash: sha256Hex(accessToken) },
      select: {
        id: true,
        accountId: true,
        accessExpiresAt: true,
        expiresAt: true,
        revokedAt: true,
        lastSeenAt: true,
        account: { select: { status: true } },
      },
    });
    if (
      !session ||
      session.revokedAt !== null ||
      session.accessExpiresAt <= now ||
      session.expiresAt <= now ||
      session.account.status !== 'ACTIVE'
    ) {
      return null;
    }
    if (now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
      await this.prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    return { accountId: session.accountId, sessionId: session.id };
  }

  /**
   * Rotaciona os tokens. Reapresentar um refresh token já trocado indica roubo:
   * a sessão inteira é revogada — exceto numa janela curta, que cobre duas abas
   * renovando ao mesmo tempo.
   */
  async refresh(refreshToken: string, now: Date): Promise<SessionTokens> {
    const hash = sha256Hex(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: hash },
      select: { id: true, expiresAt: true, revokedAt: true, account: { select: { status: true } } },
    });

    if (!session) {
      const previous = await this.prisma.authSession.findFirst({
        where: { previousRefreshTokenHash: hash, revokedAt: null },
        select: { id: true, refreshedAt: true },
      });
      if (previous) {
        const recent =
          previous.refreshedAt !== null && now.getTime() - previous.refreshedAt.getTime() < REFRESH_GRACE_MS;
        if (recent) throw new AppError(409, 'REFRESH_RACE', 'Sessão renovada em outra aba');
        await this.prisma.authSession.update({
          where: { id: previous.id },
          data: { revokedAt: now, revokedReason: 'refresh_reuse' },
        });
      }
      throw unauthorized('SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
    }
    if (session.revokedAt !== null || session.expiresAt <= now || session.account.status !== 'ACTIVE') {
      throw unauthorized('SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
    }

    const access = randomToken();
    const refresh = randomToken();
    const accessExpiresAt = this.accessExpiry(now, session.expiresAt);
    // Atualização condicional: se outra requisição rotacionou primeiro, nada é alterado.
    const updated = await this.prisma.authSession.updateMany({
      where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
      data: {
        accessTokenHash: sha256Hex(access),
        accessExpiresAt,
        refreshTokenHash: sha256Hex(refresh),
        previousRefreshTokenHash: hash,
        refreshedAt: now,
        lastSeenAt: now,
      },
    });
    if (updated.count !== 1) throw new AppError(409, 'REFRESH_RACE', 'Sessão renovada em outra aba');
    return { access, refresh, accessExpiresAt, expiresAt: session.expiresAt };
  }

  /** Revoga a sessão identificada por qualquer um dos tokens. Idempotente. */
  async logout(tokens: { access?: string; refresh?: string }, now: Date): Promise<void> {
    const or = [
      ...(tokens.access ? [{ accessTokenHash: sha256Hex(tokens.access) }] : []),
      ...(tokens.refresh ? [{ refreshTokenHash: sha256Hex(tokens.refresh) }] : []),
    ];
    if (or.length === 0) return;
    await this.prisma.authSession.updateMany({
      where: { OR: or, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'logout' },
    });
  }

  async revokeAll(accountId: string, now: Date): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'logout_all' },
    });
    return result.count;
  }

  async getAccount(accountId: string): Promise<AccountView> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { id: true, username: true, email: true, character: { select: { id: true } } },
    });
    return {
      id: account.id,
      username: account.username,
      email: account.email,
      hasCharacter: account.character !== null,
    };
  }
}

function usernameTaken(): AppError {
  return new AppError(409, 'USERNAME_TAKEN', 'Este nome de usuário já está em uso', {
    username: 'Este nome de usuário já está em uso',
  });
}
