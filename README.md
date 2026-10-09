# Astral Legends: O Despertar

Idle MMORPG de fantasia astral para navegador — servidor autoritativo, regras determinísticas,
economia auditável. Universo, personagens e arte originais.

> **Fase atual: 1 — primeira versão jogável.** Cadastro → personagem → caça idle (online e
> offline) → XP, ouro, essência e itens → equipamento → progresso persistido.
> Veja [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Stack

TypeScript (monorepo pnpm) · React 19 + Vite 8 + Tailwind 4 · Phaser 4 · Node 22 + Fastify 5 ·
PostgreSQL + Prisma 7 · Redis · WebSocket · Zod 4 · Argon2id · Vitest 5 · Playwright · Docker Compose.

## Requisitos

|                          | Windows 11                          | Ubuntu (VPS / dev)             |
| ------------------------ | ----------------------------------- | ------------------------------ |
| Node.js 22 LTS (≥ 22.12) | instalador oficial ou `nvm-windows` | `nvm install 22`               |
| pnpm 10                  | `corepack enable`                   | `corepack enable`              |
| Docker                   | Docker Desktop (WSL 2)              | Docker Engine + Compose plugin |

## Executar no Windows 11 (PowerShell)

```powershell
pnpm install                                         # também gera o Prisma Client
Copy-Item apps/api/.env.example apps/api/.env        # só na primeira vez
pnpm db:up                                           # Postgres 17 + Redis 8 (apenas em 127.0.0.1)
pnpm db:deploy                                       # aplica as 3 migrações
pnpm dev                                             # API :3000 + web :5173
```

Abra <http://127.0.0.1:5173>, crie uma conta, um personagem e clique em **Caçar aqui**.

> Vindo da Fase 0? Rode `pnpm install` (novas dependências: `@fastify/cookie`,
> `@node-rs/argon2`) e `pnpm db:deploy` (nova migração). O `.env.example` ganhou variáveis
> opcionais de sessão e limites; os valores padrão já funcionam.

### Testes (PowerShell)

```powershell
pnpm check                                           # typecheck + lint + unitários
pnpm test:int                                        # integração (Postgres e Redis reais; recria astral_test)
pnpm --filter @astral/web exec playwright install chromium   # só na primeira vez
pnpm test:e2e                                        # E2E: sobe API :3100 e web :5174 próprios
```

Para usar o Chrome já instalado em vez do Chromium do Playwright:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'; pnpm test:e2e
```

Os testes E2E usam um banco descartável `astral_e2e` (recriado a cada execução) e o Redis db 14;
não tocam nos dados de desenvolvimento. Requerem `pnpm db:up`.

> Na primeira vez que roda `prisma generate`/`migrate`, o Prisma baixa o binário do _schema engine_
> de `binaries.prisma.sh`. Em redes restritas, configure `PRISMA_ENGINES_MIRROR`.

## Scripts

| Comando           | O que faz                                                              |
| ----------------- | ---------------------------------------------------------------------- |
| `pnpm dev`        | API (tsx watch) e web (Vite) com hot reload                            |
| `pnpm typecheck`  | TypeScript em todos os pacotes                                         |
| `pnpm lint`       | ESLint (inclui regras que proíbem `Math.random`/`Date.now` nas regras) |
| `pnpm format`     | Prettier                                                               |
| `pnpm test`       | testes unitários (não precisam de Docker)                              |
| `pnpm test:int`   | integração com Postgres e Redis reais                                  |
| `pnpm test:e2e`   | Playwright: jornada completa no navegador, desktop e mobile            |
| `pnpm check`      | typecheck + lint + unitários                                           |
| `pnpm build`      | build de produção de todos os pacotes                                  |
| `pnpm db:deploy`  | aplica migrações pendentes (`prisma migrate deploy`)                   |
| `pnpm db:migrate` | cria/aplica migrações em desenvolvimento (`prisma migrate dev`)        |

## O que dá para fazer na Fase 1

- Criar conta (usuário, e-mail, senha), entrar, sair, sair de todos os dispositivos.
- Criar personagem: nome, Guardião Astral / Arcanista Celestial / Lâmina Estelar, afinidade
  Solar / Lunar / Tempestade / Abissal e aparência (cabelo, pele, manto).
- Caçar automaticamente em 3 regiões (desbloqueio por nível), ver os combates animados,
  ganhar XP, ouro, essência e itens Comuns, Raros e Épicos.
- Fechar o navegador e voltar depois: até 8 h de progresso são liquidadas pelo servidor.
- Equipar, desequipar e descartar itens; consultar atributos e histórico de caçadas.

## Estrutura

```
apps/api            servidor autoritativo (Fastify, Prisma, Redis, WebSocket)
apps/web            cliente (React + Phaser) — só apresentação
packages/game-core  regras puras e determinísticas (combate, progressão, idle, loot, conteúdo)
packages/shared     contratos Zod entre API e cliente
docs/               arquitetura, GDD, modelo de dados, regras, MVP, roadmap, riscos
```

## Documentação

- [Arquitetura e decisões (ADRs da Fase 1)](docs/ARCHITECTURE.md)
- [Game Design Document](docs/GDD.md)
- [Regras de combate, progressão, caça idle e itens](docs/COMBAT_AND_PROGRESSION.md)
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
8. Sem pagamentos reais, saques, compra ou conversão de diamantes nesta fase.
