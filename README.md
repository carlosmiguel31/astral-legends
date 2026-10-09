# Astral Legends: O Despertar

Idle MMORPG de fantasia astral para navegador — servidor autoritativo, regras determinísticas,
economia auditável. Universo e arte originais.

> **Fase atual: 0 — fundação técnica.** Veja [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Stack

TypeScript (monorepo pnpm) · React 19 + Vite 8 + Tailwind 4 · Phaser 4 · Node 22 + Fastify 5 ·
PostgreSQL + Prisma 7 · Redis · WebSocket · Zod 4 · Vitest 5 · Playwright · Docker Compose.

## Requisitos

|                          | Windows 11                          | Ubuntu (VPS / dev)             |
| ------------------------ | ----------------------------------- | ------------------------------ |
| Node.js 22 LTS (≥ 22.12) | instalador oficial ou `nvm-windows` | `nvm install 22`               |
| pnpm 10                  | `corepack enable`                   | `corepack enable`              |
| Docker                   | Docker Desktop (WSL 2)              | Docker Engine + Compose plugin |

## Primeira execução

```bash
pnpm install                                   # também gera o Prisma Client
cp apps/api/.env.example apps/api/.env         # PowerShell: Copy-Item apps/api/.env.example apps/api/.env
pnpm db:up                                     # Postgres 17 + Redis 8 (apenas em 127.0.0.1)
pnpm db:deploy                                 # aplica as migrações
pnpm dev                                       # API :3000 + web :5173
```

Abra <http://127.0.0.1:5173>. O painel “Estado do servidor” mostra API, banco, Redis e a conexão
em tempo real.

> Na primeira vez que roda `prisma generate`/`migrate`, o Prisma baixa o binário do _schema engine_
> de `binaries.prisma.sh`. Em redes restritas, configure `PRISMA_ENGINES_MIRROR`.

## Scripts

| Comando                     | O que faz                                                            |
| --------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                  | API (tsx watch) e web (Vite) com hot reload                          |
| `pnpm typecheck`            | TypeScript em todos os pacotes                                       |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                                    |
| `pnpm test`                 | testes unitários (não precisam de Docker)                            |
| `pnpm test:int`             | integração com Postgres e Redis reais (recria o banco `astral_test`) |
| `pnpm test:e2e`             | Playwright: sobe API + web e testa no navegador                      |
| `pnpm check`                | typecheck + lint + unitários                                         |
| `pnpm build`                | build de produção de todos os pacotes                                |
| `pnpm db:migrate`           | cria/aplica migrações em desenvolvimento (`prisma migrate dev`)      |

Antes do primeiro E2E: `pnpm --filter @astral/web exec playwright install chromium`
(ou use o Chrome instalado: `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`).

## Estrutura

```
apps/api            servidor autoritativo (Fastify, Prisma, Redis, WebSocket)
apps/web            cliente (React + Phaser) — só apresentação
packages/game-core  regras puras e determinísticas (combate, progressão, RNG, conteúdo)
packages/shared     contratos Zod entre API e cliente
docs/               arquitetura, GDD, modelo de dados, regras, MVP, roadmap, riscos
```

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Game Design Document](docs/GDD.md)
- [Regras de combate e progressão](docs/COMBAT_AND_PROGRESSION.md)
- [Modelo de dados](docs/DATA_MODEL.md)
- [Escopo do MVP](docs/MVP_SCOPE.md)
- [Roadmap](docs/ROADMAP.md)
- [Riscos](docs/RISKS.md)

## Princípios inegociáveis

1. O servidor decide combate, XP, drops, recursos, inventário e economia.
2. Nenhum cálculo do cliente é aceito como verdade.
3. Regras em `game-core`, desacopladas de React, Phaser e HTTP.
4. Combate determinístico e testável (RNG com semente, matemática inteira).
5. Inventário e recursos alterados só em transações atômicas.
6. Operações econômicas idempotentes e auditadas (livro-razão imutável).
7. Nunca ponto flutuante para valores financeiros.
8. Sem pagamentos reais, saques ou conversão de diamantes em dinheiro nesta fase.
