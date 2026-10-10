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
pnpm db:deploy                                       # aplica as 4 migrações
pnpm dev                                             # API :3000 + web :5173
```

Abra <http://127.0.0.1:5173>, crie uma conta, um personagem e clique em **Caçar aqui**.

### Atualizar da Fase 2A para a Fase 2B (PowerShell)

Pare o `pnpm dev` (Ctrl+C), substitua a pasta pelo conteúdo do novo ZIP (mantendo o seu
`apps/api/.env`) e rode:

```powershell
pnpm install                                         # nova dependência: @fontsource/cinzel
pnpm db:up                                           # se os contêineres não estiverem rodando
pnpm db:deploy                                       # nenhuma migração nova; confirma que está tudo aplicado
pnpm check                                           # typecheck + lint + unitários
pnpm test:int                                        # integração
pnpm test:e2e                                        # E2E desktop e mobile
pnpm dev
```

A Fase 2B só muda o cliente web: banco, migrações, sessões e regras do jogo continuam iguais.

> Se um worker do Vitest encerrar inesperadamente na integração (visto no Windows), rode só o
> arquivo de autenticação com saída detalhada e envie o log:
> `pnpm --filter @astral/api test:int:auth`. O teste não é removido nem ignorado.

### Atualizar da Fase 1 para a Fase 2A (PowerShell)

Pare o `pnpm dev` (Ctrl+C) e, na pasta do projeto (substituída pelo conteúdo do novo ZIP):

```powershell
pnpm install                                         # nova devDependency do E2E (pg) e Prisma Client regenerado
pnpm db:up                                           # se os contêineres não estiverem rodando
pnpm db:deploy                                       # aplica 20261009200000_phase2a_waves
pnpm check                                           # typecheck + lint + unitários (inclui o balanceamento)
pnpm test:int                                        # integração
pnpm test:e2e                                        # E2E desktop e mobile
pnpm dev
```

A migração só acrescenta tabelas, colunas com valor padrão e restrições; contas, personagens,
itens, saldos e histórico da Fase 1 não mudam. Caçadas em andamento continuam como
**Farmar wave 1** (o mesmo comportamento da Fase 1); caçadas novas começam em **Avançar wave 1**.
Nenhuma variável nova no `.env`. Para conferir as migrações aplicadas:
`pnpm --filter @astral/api exec prisma migrate status`.

> Vindo da Fase 0? Rode também os passos acima: `pnpm install` traz `@fastify/cookie` e
> `@node-rs/argon2`, e `pnpm db:deploy` aplica as migrações das Fases 1 e 2A.

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

| Comando                                     | O que faz                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`                                  | API (tsx watch) e web (Vite) com hot reload                                           |
| `pnpm typecheck`                            | TypeScript em todos os pacotes                                                        |
| `pnpm lint`                                 | ESLint (inclui regras que proíbem `Math.random`/`Date.now` nas regras)                |
| `pnpm format`                               | Prettier                                                                              |
| `pnpm test`                                 | testes unitários (não precisam de Docker)                                             |
| `pnpm test:int`                             | integração com Postgres e Redis reais                                                 |
| `pnpm test:e2e`                             | Playwright: jornada completa no navegador, desktop e mobile                           |
| `pnpm check`                                | typecheck + lint + unitários                                                          |
| `pnpm build`                                | build de produção de todos os pacotes                                                 |
| `pnpm db:deploy`                            | aplica migrações pendentes (`prisma migrate deploy`)                                  |
| `pnpm db:migrate`                           | cria/aplica migrações em desenvolvimento (`prisma migrate dev`)                       |
| `pnpm --filter @astral/game-core sim:waves` | simulação de balanceamento das waves (`-- --md` gera as tabelas de `docs/BALANCE.md`) |

## O que dá para fazer (Fases 1, 2A e 2B)

- Criar conta (usuário, e-mail, senha), entrar, sair, sair de todos os dispositivos.
- Criar personagem: nome, Guardião Astral / Arcanista Celestial / Lâmina Estelar, afinidade
  Solar / Lunar / Tempestade / Abissal e aparência (cabelo, pele, manto).
- Caçar automaticamente em 3 regiões (desbloqueio por nível), ver os combates animados,
  ganhar XP, ouro, essência e itens Comuns, Raros e Épicos.
- Fechar o navegador e voltar depois: até 8 h de progresso são liquidadas pelo servidor.
- Equipar, desequipar e descartar itens; consultar atributos e histórico de caçadas.
- **Waves**: cada região tem waves de 15 vitórias. No modo **Avançar** o herói segue sozinho
  para a próxima; no modo **Farmar** repete uma wave já liberada. Elite na wave 5 e chefe na
  wave 10 dos Campos, recompensa exclusiva na primeira conclusão, progresso salvo por região
  e histórico de conclusões.
- **Interface premium (2B)**: mapa panorâmico em pixel art, HUD completa, painel de caça com
  regiões e etapas de wave, registro de combate com filtros, personagem e inventário em
  janelas, painel de retorno e layout próprio para celular. Módulos futuros (rankings,
  mercado, PvP, passe, chat…) aparecem como "Em breve", sem funcionalidade simulada.

## Estrutura

```
apps/api            servidor autoritativo (Fastify, Prisma, Redis, WebSocket)
apps/web            cliente (React + Phaser) — só apresentação
packages/game-core  regras puras e determinísticas (combate, progressão, idle, loot, conteúdo)
packages/shared     contratos Zod entre API e cliente
docs/               arquitetura, GDD, modelo de dados, regras, MVP, roadmap, riscos
```

## Documentação

- [Arquitetura e decisões (ADRs das Fases 1 e 2A)](docs/ARCHITECTURE.md)
- [Game Design Document](docs/GDD.md)
- [Regras de combate, progressão, caça idle e itens](docs/COMBAT_AND_PROGRESSION.md)
- [Modelo de dados](docs/DATA_MODEL.md)
- [Balanceamento das waves (simulações)](docs/BALANCE.md)
- [Design system (tokens, componentes e telas)](docs/DESIGN_SYSTEM.md)
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
