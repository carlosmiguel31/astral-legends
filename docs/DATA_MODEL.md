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
accounts 1─1 characters 1─* item_instances
                       1─1 hunt_sessions
                       1─* hunt_settlements (resumos imutáveis)
                       1─* region_progress  (waves: 1 linha por região)
                       1─* wave_clears      (conclusões de wave, append-only)
                       1─* hunt_commands    (trocas de modo/wave/região/equipamento, append-only)
accounts 1─* wallet_balances   (PK: account_id + currency)
accounts 1─* ledger_entries    (append-only)
idempotency_records            (operações compostas)
audit_logs                     (append-only)
```

| Tabela                | Finalidade                                    | Destaques                                                                                                                                                                       |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`            | conta do jogador                              | `username` público (`username_key` único, CHECK de formato), e-mail normalizado, papel, status                                                                                  |
| `auth_sessions`       | sessões                                       | hashes SHA-256 do token de acesso e do refresh atual/anterior; expiração curta e absoluta; revogação com motivo                                                                 |
| `characters`          | personagem                                    | `account_id` **único** (1 por conta); `name_key` sem acentos/maiúsculas; `appearance` JSON; `version`                                                                           |
| `wallet_balances`     | saldo atual por moeda                         | `CHECK amount >= 0`; alterado só pelo serviço de ledger                                                                                                                         |
| `ledger_entries`      | livro-razão                                   | `idempotency_key` única; `delta ≠ 0`; `balance_after ≥ 0`; trigger impede UPDATE/DELETE/TRUNCATE                                                                                |
| `idempotency_records` | idempotência de operações com várias mutações | hash da requisição; resposta armazenada; expiração                                                                                                                              |
| `item_instances`      | itens únicos                                  | `bonuses` JSON imutável; `source_ref` **único** (`hunt:<run>:enc:<n>`, `starter:<personagem>`, `waveclear:<personagem>:<região>:<wave>`); único por (personagem, slot equipado) |
| `hunt_sessions`       | caça idle (uma linha por personagem)          | `run_id` novo a cada caçada; `seed` uint32; `encounters_resolved`; `last_settled_at`; `version`                                                                                 |
| `hunt_settlements`    | resumo de cada liquidação                     | único por (`run_id`, `from_encounter`); totais; últimos encontros (JSON, sem golpes); imutável (trigger)                                                                        |
| `audit_logs`          | auditoria de ações sensíveis                  | append-only por trigger                                                                                                                                                         |
| `region_progress`     | progresso de waves por região                 | PK (personagem, região); modo `ADVANCE`/`FARM`; wave; vitórias/derrotas da wave; sequência de falhas; totais; `highest_cleared`; aviso; `version`; CHECKs de intervalo          |
| `wave_clears`         | cada conclusão de wave                        | único por (`run_id`, `encounter_index`); **índice único parcial** (personagem, região, wave) `WHERE first_clear`; recompensas da 1ª conclusão; próxima wave e motivo; imutável  |
| `hunt_commands`       | auditoria de comandos da caça                 | `start`/`stop`/`settings`/`equipment`; encontro de aplicação; estado antes/depois (JSON); instante; `request_id`; imutável                                                      |

## Migrações

1. `20261009130000_init` — gerada pelo motor de schema do Prisma 7.10 a partir do `schema.prisma`.
2. `20261009130100_integrity_guards` — CHECKs e triggers que o Prisma não modela.
3. `20261009150000_phase1_auth_hunt` — Fase 1: `username`, sessões com access/refresh,
   `appearance`, um personagem por conta, `run_id`, `hunt_settlements`, `source_ref` único,
   mais CHECKs (formato de usuário, intervalos de liquidação) e trigger de imutabilidade.
   Gerada pelo motor do Prisma (diff do schema anterior) + seção manual de garantias.
   Verificado: o banco montado pelas três migrações é idêntico ao montado direto do
   `schema.prisma` (comparação via `pg_dump`).
4. `20261009200000_phase2a_waves` — Fase 2A: enum `HuntMode`; `WAVE_FIRST_CLEAR` em
   `LedgerReason`; `WAVE_REWARD` em `ItemSource`; tabelas `region_progress`, `wave_clears` e
   `hunt_commands`; colunas de wave em `hunt_settlements` (todas com padrão, então linhas antigas
   continuam válidas). Seção manual: CHECKs (wave ≥ 1, vitórias 0–14, totais ≥ 0…), índice único
   parcial da primeira conclusão, triggers de imutabilidade e **migração de dados**: toda caçada
   ativa ganha `region_progress` em Farmar wave 1, que reproduz exatamente a Fase 1.
   Somente acrescenta: nenhuma coluna existente é alterada ou removida. Verificado sobre uma
   cópia do banco de desenvolvimento (5 contas, 2 caçadas ativas): dados da Fase 1 idênticos
   antes e depois, e banco migrado idêntico ao gerado direto do `schema.prisma`.

Fluxo: `pnpm db:migrate` (desenvolvimento, cria novas migrações) e
`pnpm --filter @astral/api db:deploy` (VPS/CI, apenas aplica). Os testes de integração recriam o
banco `*_test` aplicando os mesmos arquivos SQL em ordem.

## Próximas tabelas previstas

| Fase | Tabela                             | Uso                                                          |
| ---- | ---------------------------------- | ------------------------------------------------------------ |
| 2    | `boss_attempts`                    | tentativas de chefe com semente e resultado                  |
| 3    | `market_listings`, `market_trades` | anúncios com custódia (escrow) do item e do ouro             |
| 3    | `item_transfers`                   | histórico de propriedade de cada item (rastreio anti-fraude) |

## Atenção ao gerar novas migrações

O Prisma não modela CHECKs, triggers nem o índice único **parcial**
`wave_clears_first_clear_once`. Ao rodar `pnpm db:migrate` (que usa `prisma migrate dev`),
revise o SQL gerado antes de aplicar: se aparecer um `DROP INDEX` desse índice (ou de
qualquer garantia manual), remova a linha. Os testes de integração falham se o índice sumir
(`o banco rejeita uma segunda primeira conclusão da mesma wave`).

## Retenção (a implementar)

`hunt_settlements` cresce ~150 KB por hora de caça ativa por jogador (uma linha por
sincronização com encontros novos). Um job de retenção (ex.: manter 14 dias) entra junto com a
observabilidade da Fase 2; o trigger permite `DELETE`, só bloqueia `UPDATE`/`TRUNCATE`.
