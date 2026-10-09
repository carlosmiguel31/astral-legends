import { z } from 'zod';

const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    CORS_ORIGINS: csv.default(['http://localhost:5173', 'http://127.0.0.1:5173']),
    TRUST_PROXY: z.stringbool().default(false),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

    // Sessões
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Força o atributo Secure nos cookies. Sempre ativo em produção. */
    COOKIE_SECURE: z.stringbool().optional(),

    // Proteções de autenticação (por IP / por conta)
    REGISTER_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(10),
    LOGIN_LIMIT_PER_15MIN: z.coerce.number().int().positive().default(30),
    LOGIN_MAX_FAILURES_PER_ACCOUNT: z.coerce.number().int().positive().default(5),
    LOGIN_MAX_FAILURES_PER_IP: z.coerce.number().int().positive().default(30),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

    // Jogo
    INVENTORY_CAPACITY: z.coerce.number().int().min(10).max(500).default(100),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const origin of env.CORS_ORIGINS) {
      if (!origin.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: `em produção as origens devem usar https (recebido: ${origin})`,
        });
      }
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

/**
 * Valida as variáveis de ambiente. Falha rápido (fail-fast) com mensagem clara,
 * sem imprimir valores que podem conter segredos.
 */
export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração inválida:\n${issues}`);
  }
  return parsed.data;
}
