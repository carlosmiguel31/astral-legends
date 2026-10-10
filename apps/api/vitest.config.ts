import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Resolve os pacotes do workspace a partir do código-fonte (sem build prévio).
const conditions = ['@astral/source', ...defaultServerConditions];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    environment: 'node',
    // No Windows, encerrar conexões (Postgres, Redis, WebSocket) pode levar mais tempo;
    // evita que o processo seja finalizado à força com trabalho nativo pendente.
    teardownTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/integration/global-setup.ts'],
          // Os testes compartilham um único banco de teste.
          fileParallelism: false,
          // Processos filhos (padrão do Vitest), declarado explicitamente: o Argon2 (@node-rs)
          // é nativo e roda no pool de threads do libuv; em processos separados uma falha
          // nativa derruba só aquele arquivo e o Vitest a reporta com o nome do arquivo.
          pool: 'forks',
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
