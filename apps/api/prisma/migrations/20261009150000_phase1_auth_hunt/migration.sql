-- Fase 1: autenticação, personagem, caça idle e inventário.
-- As colunas NOT NULL sem valor padrão exigem tabelas vazias: na Fase 0 não havia
-- nenhuma rota que criasse contas, sessões, personagens ou caçadas.

-- DropIndex
DROP INDEX "characters_account_id_idx";

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "username" VARCHAR(16) NOT NULL,
ADD COLUMN     "username_key" VARCHAR(16) NOT NULL;

-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN     "access_expires_at" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "access_token_hash" VARCHAR(64) NOT NULL,
ADD COLUMN     "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "previous_refresh_token_hash" VARCHAR(64),
ADD COLUMN     "refreshed_at" TIMESTAMPTZ(3),
ADD COLUMN     "revoked_reason" VARCHAR(32),
ALTER COLUMN "refresh_token_hash" SET DATA TYPE VARCHAR(64);

-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "appearance" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "hunt_sessions" ADD COLUMN     "run_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "hunt_settlements" (
    "id" BIGSERIAL NOT NULL,
    "character_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "region_id" VARCHAR(64) NOT NULL,
    "from_encounter" INTEGER NOT NULL,
    "to_encounter" INTEGER NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "window_end" TIMESTAMPTZ(3) NOT NULL,
    "forfeited_ms" BIGINT NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "timeouts" INTEGER NOT NULL,
    "xp_gained" INTEGER NOT NULL,
    "gold" BIGINT NOT NULL,
    "essence" BIGINT NOT NULL,
    "items_dropped" INTEGER NOT NULL,
    "items_discarded" INTEGER NOT NULL,
    "level_before" INTEGER NOT NULL,
    "level_after" INTEGER NOT NULL,
    "recent" JSONB NOT NULL,
    "ruleset_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hunt_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hunt_settlements_character_id_created_at_idx" ON "hunt_settlements"("character_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "hunt_settlements_run_id_from_encounter_key" ON "hunt_settlements"("run_id", "from_encounter");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_username_key_key" ON "accounts"("username_key");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_access_token_hash_key" ON "auth_sessions"("access_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_previous_refresh_token_hash_idx" ON "auth_sessions"("previous_refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "characters_account_id_key" ON "characters"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_instances_source_ref_key" ON "item_instances"("source_ref");

-- AddForeignKey
ALTER TABLE "hunt_settlements" ADD CONSTRAINT "hunt_settlements_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────── Garantias adicionais (não modeladas pelo Prisma) ─────────────────

ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_username_format" CHECK ("username" ~ '^[A-Za-z0-9_]{3,16}$'),
  ADD CONSTRAINT "accounts_username_key_lowercase" CHECK ("username_key" = lower("username"));

ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_access_before_expiry" CHECK ("access_expires_at" <= "expires_at");

ALTER TABLE "hunt_settlements"
  ADD CONSTRAINT "hunt_settlements_range" CHECK ("to_encounter" > "from_encounter" AND "from_encounter" >= 0),
  ADD CONSTRAINT "hunt_settlements_window" CHECK ("window_end" >= "window_start"),
  ADD CONSTRAINT "hunt_settlements_non_negative" CHECK (
    "wins" >= 0 AND "losses" >= 0 AND "timeouts" >= 0 AND "xp_gained" >= 0
    AND "gold" >= 0 AND "essence" >= 0 AND "items_dropped" >= 0 AND "items_discarded" >= 0
    AND "forfeited_ms" >= 0
  ),
  ADD CONSTRAINT "hunt_settlements_level" CHECK ("level_after" >= "level_before");

-- Resumos de liquidação são imutáveis (podem ser apagados apenas em cascata,
-- para permitir a exclusão de contas exigida pela LGPD).
CREATE TRIGGER "hunt_settlements_no_update"
  BEFORE UPDATE ON "hunt_settlements"
  FOR EACH ROW EXECUTE FUNCTION astral_reject_mutation();

CREATE TRIGGER "hunt_settlements_no_truncate"
  BEFORE TRUNCATE ON "hunt_settlements"
  FOR EACH STATEMENT EXECUTE FUNCTION astral_reject_mutation();
