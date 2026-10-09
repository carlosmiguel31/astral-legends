# Arquitetura — Astral Legends: O Despertar

> Status: **Fase 0 (fundação)** · Regras `RULESET_VERSION = 1` · Atualizado em 2026-10-09

## 1. Visão geral

Idle MMORPG para navegador com **servidor autoritativo**. O cliente envia apenas _intenções_
(“caçar na região X”, “equipar o item Y”, “aprimorar o item Z”); o servidor decide resultados,
persiste e publica eventos. O cliente renderiza e anima o que o servidor decidiu.

```
┌────────────── Navegador ───────────────┐          ┌──────────────── VPS (Ubuntu) ─────────────────┐
│ React (UI, menus, inventário)          │  HTTPS   │ Reverse proxy (Caddy/Nginx, TLS)              │
│ Phaser (mapa 2D, animações)            │ ───────▶ │   ├─ /api/*  → API Fastify (N instâncias)     │
│ @astral/shared (validação das respostas)│  WSS     │   └─ /*      → arquivos estáticos do web      │
└────────────────────────────────────────┘ ◀─────── │                                               │
                                                    │ API Fastify ──▶ @astral/game-core (regras)    │
                                                    │     │   │                                     │
                                                    │     │   └──▶ Redis (rate limit, pub/sub, filas)│
                                                    │     └──────▶ PostgreSQL (fonte da verdade)    │
                                                    │ Worker(s) de liquidação idle (fase 1+)        │
                                                    └───────────────────────────────────────────────┘
```

## 2. Camadas e dependências

| Pacote               | Responsabilidade                                                                         | Pode depender de                              | **Não** pode depender de                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/game-core` | Regras puras: RNG, matemática inteira, atributos, combate, progressão, conteúdo estático | nada                                          | React, Phaser, HTTP, banco, `Date.now`, `Math.random` (bloqueado por ESLint) |
| `packages/shared`    | Contratos Zod da API HTTP e do WebSocket                                                 | `game-core`, `zod`                            | servidor, navegador                                                          |
| `apps/api`           | Autoridade: HTTP, WebSocket, persistência, economia, auditoria                           | `game-core`, `shared`, Fastify, Prisma, Redis | React, Phaser                                                                |
| `apps/web`           | Apresentação: UI React e cena Phaser                                                     | `shared`                                      | Prisma, segredos, regras autoritativas                                       |

Regra de ouro: **qualquer cálculo que produza valor (XP, ouro, itens, dano) vive em `game-core` e é
executado no servidor.** O cliente pode, no futuro, importar `game-core` para _pré-visualizações_
(ex.: “dano estimado”), mas o resultado oficial é sempre o do servidor.

### Pacotes internos sem build em desenvolvimento

Os pacotes exportam uma condição customizada `@astral/source` que aponta para `src/*.ts`.
Vite, Vitest, `tsx` e o TypeScript (`customConditions`) usam essa condição, então mudanças em
`game-core` refletem na hora. Em produção, `pnpm build` gera `dist/` e o Node resolve a condição
padrão `import`.

## 3. Modelo idle autoritativo: liquidação sob demanda

Simular todos os jogadores a cada tick não escala e desperdiça CPU. Em vez disso:

1. Ao iniciar a caça, o servidor grava uma `HuntSession` com `seed` (uint32), `regionId`,
   `startedAt`, `lastSettledAt` e `encountersResolved = 0`.
2. Quando necessário (jogador abre o jogo, troca equipamento, para a caça, ou o worker periódico
   para jogadores online), o servidor **liquida** o tempo decorrido:
   - `tempo = min(agora − lastSettledAt, TETO_OFFLINE)`.
   - Para cada encontro `n = encountersResolved, n+1, …`: `seedₙ = deriveSeed(seed, n)` →
     sorteia o monstro pelos pesos da região → `simulateCombat` → soma o custo de tempo
     (procura + combate + recuperação).
   - Para quando o próximo encontro não cabe no tempo disponível; a sobra fica para a próxima liquidação.
3. Tudo é gravado em **uma transação**: lançamentos no livro-razão, itens criados, XP/nível,
   e a atualização da `HuntSession` condicionada a `version` (concorrência otimista).

Consequências:

- **Determinismo**: o encontro _n_ sempre produz o mesmo resultado para a mesma sessão e regras.
  Liquidar em 1 chamada ou em 100 dá o mesmo total.
- **Idempotência**: chaves como `hunt:<id>:enc:<de>-<até>:GOLD` impedem crédito duplo; duas
  liquidações simultâneas → uma perde no `version` e não credita nada.
- **Custo limitado**: no máximo `MAX_ENCONTROS_POR_LIQUIDAÇÃO` por chamada (continua em lotes).
- **Auditabilidade**: com `seed`, `encountersResolved` e `rulesetVersion` qualquer resultado
  pode ser reproduzido para investigar suspeitas.

## 4. Tempo real

- WebSocket em `/ws` (`@fastify/websocket`), mensagens validadas por Zod (`@astral/shared`),
  limite de 4 KB por mensagem, limite de taxa por conexão, heartbeat ping/pong, verificação de
  `Origin` no upgrade e versão de protocolo no `hello`.
- Nenhuma mensagem do cliente altera estado diretamente; ações com efeito passam pelos mesmos
  serviços das rotas HTTP.
- Escala horizontal (fase 2+): eventos publicados no Redis (pub/sub) e entregues pela instância
  que segura o socket do jogador; não exige sticky sessions para correção.

## 5. Economia e consistência

- Valores monetários em `BigInt`/`bigint` do Postgres. Percentuais em _basis points_ inteiros.
- **Livro-razão** (`ledger_entries`) append-only (trigger bloqueia UPDATE/DELETE/TRUNCATE) e
  **saldo** (`wallet_balances`) como projeção, com `CHECK amount >= 0`.
- Débito = `UPDATE … SET amount = amount + Δ WHERE amount >= −Δ`: atômico sob concorrência
  (testado com 10 débitos simultâneos).
- Toda operação econômica exige **chave de idempotência**. Operações compostas (ex.: aprimorar
  item) usam `idempotency_records` + `applyLedgerEntryInTx` na mesma transação.
- Reconciliação periódica (fase 1): `Σ delta` por conta/moeda deve igualar o saldo.

## 6. Segurança (desde a fundação)

| Já implementado                                         | Próximas fases                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Validação estrita de env (fail-fast, sem vazar valores) | Auth: argon2id, refresh token rotativo com hash, cookies `HttpOnly; Secure; SameSite` |
| Helmet (CSP, nosniff, etc.), CORS por allowlist         | Autorização por recurso (o personagem pertence à conta?)                              |
| Rate limit global com store no Redis                    | Rate limits por rota/ação e por conta                                                 |
| Limite de corpo (64 KB) e de mensagem WS (4 KB)         | Detecção de automação/abuso (economia e chat)                                         |
| Erros padronizados sem stack trace; `x-request-id`      | Painel administrativo com 2FA e trilha de auditoria                                   |
| Restrições e triggers no banco como última barreira     | Backups criptografados e testados (restore drill)                                     |

## 7. Observabilidade

- Agora: logs estruturados (pino) com `reqId`, redação de `authorization`/`cookie`,
  `/health/live` e `/health/ready` (Postgres + Redis com timeout).
- Fase 1–2: métricas Prometheus (latência, erros, conexões WS, duração de liquidação) e
  **métricas de economia** (ouro criado vs. destruído por hora, por região) para detectar
  inflação e exploits; tracing OpenTelemetry nas rotas e nos workers.

## 8. Decisões de versão (verificadas em 2026-10-09)

| Componente                 | Versão           | Observação                                                                             |
| -------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| Node.js                    | ≥ 22.12 (LTS 22) | exigência de Vite 8 / Vitest 5                                                         |
| TypeScript                 | 6.0.x            | 7.0 (compilador nativo) já existe, mas o `typescript-eslint` atual suporta até `< 6.1` |
| Prisma                     | 7.10.0           | `latest` no npm aponta para 8.0.0-rc (pré-lançamento); usamos a estável                |
| Fastify                    | 5.12             | plugins: cors 11, helmet 13, rate-limit 11, websocket 11                               |
| React / Vite / Tailwind    | 19.3 / 8.3 / 4.3 | Tailwind via `@tailwindcss/vite`                                                       |
| Phaser                     | 4.2              | carregado sob demanda (chunk separado)                                                 |
| Zod / Vitest / Playwright  | 4.6 / 5.0 / 1.64 |                                                                                        |
| ioredis                    | 6.0              |                                                                                        |
| Postgres / Redis (Compose) | 17 / 8           | testes locais validados contra Postgres 16 e Redis 7                                   |

## 9. Estrutura de diretórios

```
astral-legends/
├─ apps/
│  ├─ api/                    # servidor autoritativo
│  │  ├─ prisma/              # schema.prisma + migrações SQL versionadas
│  │  ├─ src/
│  │  │  ├─ config/           # validação de ambiente
│  │  │  ├─ http/             # erros padronizados
│  │  │  ├─ infra/            # Prisma, Redis
│  │  │  ├─ modules/economy/  # livro-razão (base da economia)
│  │  │  ├─ routes/           # health, content, ws
│  │  │  ├─ app.ts            # composição (injeção de dependências, testável)
│  │  │  └─ server.ts         # bootstrap + desligamento gracioso
│  │  └─ test/{unit,integration}
│  └─ web/                    # cliente
│     ├─ e2e/                 # Playwright
│     └─ src/{components,game,lib}
├─ packages/
│  ├─ game-core/              # regras puras e determinísticas
│  └─ shared/                 # contratos Zod
├─ docs/                      # este diretório
└─ docker-compose.yml         # Postgres + Redis de desenvolvimento
```

Módulos previstos em `apps/api/src/modules/`: `auth`, `characters`, `inventory`, `hunt`,
`economy`, `market` (fase 3), `admin`.
