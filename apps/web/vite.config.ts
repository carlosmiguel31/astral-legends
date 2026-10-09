/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defaultServerConditions, defineConfig } from 'vite';

// 127.0.0.1 em vez de localhost: no Windows, "localhost" pode resolver para ::1.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Consome os pacotes do workspace direto do código-fonte.
    conditions: ['@astral/source', ...defaultClientConditions],
  },
  // O Vitest roda no modo SSR: precisa da mesma condição para usar o código-fonte.
  ssr: { resolve: { conditions: ['@astral/source', ...defaultServerConditions] } },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // O Phaser é grande; fica em um chunk próprio carregado sob demanda.
    chunkSizeWarningLimit: 2_000,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
