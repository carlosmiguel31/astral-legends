import { defineConfig, env } from 'prisma/config';

// O Prisma 7 não carrega .env automaticamente. Carregamos aqui (se existir)
// para que os comandos da CLI funcionem igual no Windows e no Linux.
try {
  process.loadEnvFile('.env');
} catch {
  // Sem .env: usa as variáveis do ambiente (CI, Docker, VPS).
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
