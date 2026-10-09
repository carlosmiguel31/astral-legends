# Modelo de dados (preliminar)

> Fonte: `apps/api/prisma/schema.prisma` + migrações em `apps/api/prisma/migrations/`.

## Princípios

- **Conteúdo estático** (classes, monstros, regiões, definições de itens) vive em `game-core`,
  versionado com o código. O banco guarda só **estado de jogadores**, referenciando conteúdo por id
  (`def_id`, `region_id`).
- Valores de moeda em `BIGINT`. Nada de `float`/`numeric` para economia.
- Ids `UUIDv7` (ordenáveis por tempo → índices mais compactos); `BIGSERIAL` para tabelas de log.
- Datas em `timestamptz(3)`.
- Garantias críticas também no banco (CHECKs e triggers) como defesa em profundidade.

## Entidades

```
accounts 1─* auth_sessions
accounts 1─* characters 1─* item_instances
                       1─1 hunt_sessions
accounts 1─* wallet_balances   (PK: account_id + currency)
accounts 1─* ledger_entries    (append-only)
idempotency_records            (operações compostas)
audit_logs                     (append-only)
```

| Tabela                | Finalidade                                    | Destaques                                                                                               |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `accounts`            | conta do jogador                              | e-mail normalizado (CHECK minúsculas), papel, status                                                    |
| `auth_sessions`       | sessões / refresh tokens                      | só o **hash** do token; revogação; expiração                                                            |
| `characters`          | personagem                                    | `name_key` único em minúsculas; `level ≥ 1`, `xp ≥ 0`; `version` p/ lock otimista                       |
| `wallet_balances`     | saldo atual por moeda                         | `CHECK amount >= 0`; alterado só pelo serviço de ledger                                                 |
| `ledger_entries`      | livro-razão                                   | `idempotency_key` única; `delta ≠ 0`; `balance_after ≥ 0`; trigger impede UPDATE/DELETE/TRUNCATE        |
| `idempotency_records` | idempotência de operações com várias mutações | hash da requisição; resposta armazenada; expiração                                                      |
| `item_instances`      | itens únicos                                  | `bonuses` JSON imutável; `ruleset_version`; único por (personagem, slot equipado); `upgrade_level` 0–15 |
| `hunt_sessions`       | caça idle                                     | `seed` uint32 (CHECK), `encounters_resolved`, `last_settled_at ≥ started_at`                            |
| `audit_logs`          | auditoria de ações sensíveis                  | append-only por trigger                                                                                 |

## Migrações

1. `20261009130000_init` — gerada pelo motor de schema do Prisma 7.10 a partir do `schema.prisma`.
2. `20261009130100_integrity_guards` — CHECKs e triggers que o Prisma não modela.

Fluxo: `pnpm db:migrate` (desenvolvimento, cria novas migrações) e
`pnpm --filter @astral/api db:deploy` (VPS/CI, apenas aplica). Os testes de integração recriam o
banco `*_test` aplicando os mesmos arquivos SQL em ordem.

## Próximas tabelas previstas

| Fase | Tabela                             | Uso                                                                                 |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| 1    | `hunt_settlements`                 | resumo de cada liquidação (intervalo de encontros, totais) para suporte e auditoria |
| 2    | `boss_attempts`                    | tentativas de chefe com semente e resultado                                         |
| 3    | `market_listings`, `market_trades` | anúncios com custódia (escrow) do item e do ouro                                    |
| 3    | `item_transfers`                   | histórico de propriedade de cada item (rastreio anti-fraude)                        |
