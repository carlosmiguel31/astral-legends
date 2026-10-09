import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/api/src/generated/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Regras de gameplay devem ser determinísticas e independentes de plataforma.
    files: ['packages/game-core/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use o RNG determinístico (createRng).' },
        { object: 'Date', property: 'now', message: 'Receba o tempo como parâmetro.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'game-core não faz I/O.' },
        { name: 'window', message: 'game-core não depende de navegador.' },
        { name: 'document', message: 'game-core não depende de navegador.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-*', 'phaser', 'fastify', '@prisma/*', 'node:*'] },
      ],
    },
  },
);
