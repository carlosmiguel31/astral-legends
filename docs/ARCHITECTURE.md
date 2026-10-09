# Arquitetura — Astral Legends: O Despertar

> Status: **Fase 1 (jogável: auth, personagem, caça idle, inventário)** · Regras `RULESET_VERSION = 2` · Atualizado em 2026-10-09

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
                                                    │ Liquidação sob demanda (sync/ações) + pub/sub │
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
│  │  │  ├─ modules/          # auth, characters, hunt, inventory, game, economy
│  │  │  ├─ realtime/         # hub de notificações (WebSocket + Redis pub/sub)
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

Módulos em `apps/api/src/modules/`: `auth`, `characters`, `hunt`, `inventory`, `game`
(estado e rotas), `economy` (livro-razão). Previstos: `market` (Fase 3), `admin` (Fase 2).

## 10. Fase 1 — decisões de arquitetura

### ADR-01 · Sessões opacas em cookies HttpOnly (não JWT)

- Dois tokens aleatórios de 256 bits: **acesso** (15 min) e **refresh** (30 dias, absoluto).
  O banco guarda apenas o SHA-256 de cada um (`auth_sessions`).
- Cookies `HttpOnly; SameSite=Strict; Path=/` (+ `Secure` e prefixo `__Host-` em produção).
  Nenhum token passa pelo JavaScript nem vai para `localStorage`.
- **Refresh rotativo**: cada uso troca os dois tokens e guarda o hash do refresh anterior.
  Reapresentar o anterior depois de 30 s ⇒ roubo presumido ⇒ a sessão inteira é revogada.
  Dentro de 30 s ⇒ `409 REFRESH_RACE` (duas abas renovando juntas), sem revogar.
- Por que não JWT: revogação imediata (logout, “sair de todos”, reuso de refresh) exige
  consulta ao servidor de qualquer forma; tokens opacos são mais simples e não vazam claims.
- Senhas: Argon2id (`@node-rs/argon2`, binários pré-compilados para Windows e Linux),
  parâmetros mínimos da OWASP (19 MiB, t=2, p=1).

### ADR-02 · CSRF em camadas

`SameSite=Strict` + corpo somente JSON (o parser `text/plain` foi removido, então formulários de
outro site não passam sem preflight CORS) + checagem de `Origin`/`Referer` em métodos que
alteram estado (allowlist; em produção a ausência também é recusada) + `Sec-Fetch-Site:
cross-site` recusado. Não usamos token CSRF sincronizado: com essas camadas ele não acrescenta
proteção relevante para uma SPA de mesma origem.

### ADR-03 · Enumeração de contas

- Login: mesma resposta (`401`, mesma mensagem) para e-mail inexistente e senha errada, com
  verificação Argon2 fictícia para igualar o tempo.
- Cadastro: nome de usuário repetido é informado (é público); e-mail repetido recebe resposta
  genérica. **Limitação conhecida**: sem verificação de e-mail assíncrona, o sucesso/fracasso do
  cadastro ainda indica se o e-mail existe; mitigado por limite de cadastros por IP. A proteção
  completa entra com o fluxo de verificação por e-mail (Fase 2).
- Força bruta: contadores no Redis por conta (hash do e-mail) e por IP; falha fechado (503) se
  o Redis cair.

### ADR-04 · Liquidação idle sob demanda, serializada por personagem

Fluxo de `POST /v1/hunt/sync` (e de iniciar/parar/equipar, que liquidam antes de mudar):

```
BEGIN
  SELECT … FROM characters WHERE account_id = $1 FOR UPDATE      -- trava por conta
  settleHunt(seed, próximo encontro, lastSettledAt, agora, personagem)   -- game-core, puro
  INSERT item_instances (source_ref = hunt:<run>:enc:<n>  UNIQUE)
  ledger GOLD/ESSENCE  (idempotency_key = hunt:<run>:<de>-<até>:<moeda>  UNIQUE)
  UPDATE characters    … WHERE version = $v
  UPDATE hunt_sessions … WHERE version = $v
  INSERT hunt_settlements (run_id, from_encounter) UNIQUE   -- resumo imutável
COMMIT
```

Quatro proteções independentes contra recompensa duplicada; os testes de integração
mostram que, removendo a trava, as demais ainda impedem duplicação (as requisições
excedentes falham com 409). O cliente nunca envia resultados — só pede a liquidação.

- **Frequência**: o cliente sincroniza a cada 4 s com a aba visível; outras abas recebem
  `state.changed` via WebSocket e sincronizam. Sem nada novo, a sincronização não escreve.
- **Teto offline** de 8 h aplicado no servidor (o excedente é registrado em `forfeited_ms`).
- **Golpes individuais** não são persistidos (são reproduzíveis pela semente); vão apenas na
  resposta da liquidação que os gerou, para a animação. O histórico guarda resumos.
- `run_id` muda a cada caçada iniciada, então chaves de idempotência nunca colidem entre caçadas.

### ADR-05 · Tempo real como notificação, não como dado

O WebSocket autentica pelo mesmo cookie de sessão no upgrade e só transporta notificações
(`state.changed`, `session.revoked`). O cliente busca o estado por HTTP. Assim não há dois
caminhos de dados para manter consistentes, e a perda de mensagens nunca causa divergência —
no máximo atraso até o próximo polling. Entre instâncias, `RealtimeHub` usa Redis pub/sub.

### ADR-06 · A cena Phaser só reproduz

`HuntScene` recebe encontros já liquidados e os anima em ordem (caminhada, golpes com os
danos reais, recompensas confirmadas). O HUD mostra sempre o estado persistido; a animação
pode ficar alguns segundos atrás. Backlog acima de 6 encontros é resumido (os excedentes vão
direto ao registro de combate). O canvas renderiza em 960×540 com zoom 3 na câmera: arte com
pixels nítidos e textos legíveis.

### ADR-07 · Um personagem por conta, garantido no banco

`characters.account_id` é único: criações simultâneas resultam em exatamente um personagem
(testado). Nomes são únicos sem diferenciar maiúsculas/acentos (`name_key`), restritos a letras
latinas (evita homógrafos cirílicos/largura total) e com lista de nomes reservados.

### Novas versões de dependências (verificadas em 2026-10-09)

| Componente        | Versão | Uso                                     |
| ----------------- | ------ | --------------------------------------- |
| `@fastify/cookie` | 11.1   | cookies de sessão                       |
| `@node-rs/argon2` | 2.2    | Argon2id (pré-compilado win32/linux)    |
| `pg` (dev)        | 8.23   | preparação dos bancos de teste e de E2E |
