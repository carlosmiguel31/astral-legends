-- Fase 2A: waves (Avançar/Farmar), elite, chefe e recompensas de primeira conclusão.
-- Incremental: não recria nem apaga dados. Contas, personagens, itens, livro-razão e
-- histórico da Fase 1 permanecem intactos.

-- CreateEnum
CREATE TYPE "HuntMode" AS ENUM ('ADVANCE', 'FARM');

-- AlterEnum
ALTER TYPE "LedgerReason" ADD VALUE 'WAVE_FIRST_CLEAR';

-- AlterEnum
ALTER TYPE "ItemSource" ADD VALUE 'WAVE_REWARD';

-- AlterTable
ALTER TABLE "hunt_settlements" ADD COLUMN     "first_clear_essence" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "first_clear_gold" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "first_clears" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mode_after" "HuntMode",
ADD COLUMN     "wave_after" INTEGER,
ADD COLUMN     "wave_before" INTEGER,
ADD COLUMN     "wave_events" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "waves_cleared" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "region_progress" (
    "character_id" UUID NOT NULL,
    "region_id" VARCHAR(64) NOT NULL,
    "mode" "HuntMode" NOT NULL DEFAULT 'ADVANCE',
    "wave" INTEGER NOT NULL DEFAULT 1,
    "wave_wins" INTEGER NOT NULL DEFAULT 0,
    "wave_losses" INTEGER NOT NULL DEFAULT 0,
    "fail_streak" INTEGER NOT NULL DEFAULT 0,
    "wave_xp" INTEGER NOT NULL DEFAULT 0,
    "wave_gold" BIGINT NOT NULL DEFAULT 0,
    "wave_essence" BIGINT NOT NULL DEFAULT 0,
    "wave_items" INTEGER NOT NULL DEFAULT 0,
    "highest_cleared" INTEGER NOT NULL DEFAULT 0,
    "total_clears" INTEGER NOT NULL DEFAULT 0,
    "notice" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "region_progress_pkey" PRIMARY KEY ("character_id","region_id")
);

-- CreateTable
CREATE TABLE "wave_clears" (
    "id" BIGSERIAL NOT NULL,
    "character_id" UUID NOT NULL,
    "region_id" VARCHAR(64) NOT NULL,
    "run_id" UUID NOT NULL,
    "wave" INTEGER NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "mode" "HuntMode" NOT NULL,
    "encounter_index" INTEGER NOT NULL,
    "first_clear" BOOLEAN NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "xp" INTEGER NOT NULL,
    "gold" BIGINT NOT NULL,
    "essence" BIGINT NOT NULL,
    "items" INTEGER NOT NULL,
    "first_clear_gold" BIGINT NOT NULL DEFAULT 0,
    "first_clear_essence" BIGINT NOT NULL DEFAULT 0,
    "first_clear_item_def" VARCHAR(64),
    "first_clear_rarity" "Rarity",
    "next_mode" "HuntMode" NOT NULL,
    "next_wave" INTEGER NOT NULL,
    "next_reason" VARCHAR(16) NOT NULL,
    "cleared_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wave_clears_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hunt_commands" (
    "id" BIGSERIAL NOT NULL,
    "character_id" UUID NOT NULL,
    "region_id" VARCHAR(64) NOT NULL,
    "run_id" UUID,
    "command" VARCHAR(16) NOT NULL,
    "at_encounter" INTEGER,
    "from_state" JSONB,
    "to_state" JSONB NOT NULL,
    "applied_at" TIMESTAMPTZ(3) NOT NULL,
    "request_id" VARCHAR(64),

    CONSTRAINT "hunt_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wave_clears_character_id_region_id_cleared_at_idx" ON "wave_clears"("character_id", "region_id", "cleared_at");

-- CreateIndex
CREATE UNIQUE INDEX "wave_clears_run_id_encounter_index_key" ON "wave_clears"("run_id", "encounter_index");

-- CreateIndex
CREATE INDEX "hunt_commands_character_id_applied_at_idx" ON "hunt_commands"("character_id", "applied_at");

-- AddForeignKey
ALTER TABLE "region_progress" ADD CONSTRAINT "region_progress_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wave_clears" ADD CONSTRAINT "wave_clears_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hunt_commands" ADD CONSTRAINT "hunt_commands_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────── Garantias adicionais (não modeladas pelo Prisma) ─────────────────

ALTER TABLE "region_progress"
  ADD CONSTRAINT "region_progress_wave_positive" CHECK ("wave" >= 1),
  ADD CONSTRAINT "region_progress_counters_non_negative" CHECK (
    "wave_wins" >= 0 AND "wave_losses" >= 0 AND "fail_streak" >= 0 AND "wave_xp" >= 0
    AND "wave_gold" >= 0 AND "wave_essence" >= 0 AND "wave_items" >= 0
    AND "highest_cleared" >= 0 AND "total_clears" >= 0 AND "version" >= 1
  );

ALTER TABLE "wave_clears"
  ADD CONSTRAINT "wave_clears_wave_positive" CHECK ("wave" >= 1 AND "next_wave" >= 1),
  ADD CONSTRAINT "wave_clears_kind" CHECK ("kind" IN ('normal', 'elite', 'boss')),
  ADD CONSTRAINT "wave_clears_next_reason" CHECK (
    "next_reason" IN ('advance', 'repeat', 'level_gate', 'content_limit')
  ),
  ADD CONSTRAINT "wave_clears_non_negative" CHECK (
    "encounter_index" >= 0 AND "wins" >= 0 AND "losses" >= 0 AND "xp" >= 0
    AND "gold" >= 0 AND "essence" >= 0 AND "items" >= 0
    AND "first_clear_gold" >= 0 AND "first_clear_essence" >= 0
  ),
  -- Recompensas exclusivas só existem na primeira conclusão.
  ADD CONSTRAINT "wave_clears_first_clear_rewards" CHECK (
    "first_clear" OR (
      "first_clear_gold" = 0 AND "first_clear_essence" = 0
      AND "first_clear_item_def" IS NULL AND "first_clear_rarity" IS NULL
    )
  );

-- Uma única primeira conclusão por personagem, região e wave — mesmo entre caçadas
-- diferentes. É a última barreira contra recompensas de primeira conclusão duplicadas.
CREATE UNIQUE INDEX "wave_clears_first_clear_once"
  ON "wave_clears" ("character_id", "region_id", "wave") WHERE "first_clear";

ALTER TABLE "hunt_commands"
  ADD CONSTRAINT "hunt_commands_command" CHECK ("command" IN ('start', 'stop', 'settings', 'equipment')),
  ADD CONSTRAINT "hunt_commands_at_encounter" CHECK ("at_encounter" IS NULL OR "at_encounter" >= 0);

ALTER TABLE "hunt_settlements"
  ADD CONSTRAINT "hunt_settlements_wave_counters" CHECK (
    "waves_cleared" >= 0 AND "first_clears" >= 0 AND "first_clears" <= "waves_cleared"
    AND "first_clear_gold" >= 0 AND "first_clear_essence" >= 0
  );

-- Conclusões e comandos são imutáveis (apagados apenas em cascata com o personagem).
CREATE TRIGGER "wave_clears_no_update"
  BEFORE UPDATE ON "wave_clears"
  FOR EACH ROW EXECUTE FUNCTION astral_reject_mutation();
CREATE TRIGGER "wave_clears_no_truncate"
  BEFORE TRUNCATE ON "wave_clears"
  FOR EACH STATEMENT EXECUTE FUNCTION astral_reject_mutation();
CREATE TRIGGER "hunt_commands_no_update"
  BEFORE UPDATE ON "hunt_commands"
  FOR EACH ROW EXECUTE FUNCTION astral_reject_mutation();
CREATE TRIGGER "hunt_commands_no_truncate"
  BEFORE TRUNCATE ON "hunt_commands"
  FOR EACH STATEMENT EXECUTE FUNCTION astral_reject_mutation();

-- ───────────────── Migração de dados ─────────────────
-- Caçadas ATIVAS da Fase 1 passam a "Farmar wave 1": exatamente os mesmos monstros e
-- recompensas de antes, então o tempo ainda não liquidado é calculado como era. O jogador
-- escolhe quando ativar o modo Avançar. Caçadas paradas não recebem linha: o progresso da
-- região é criado no próximo início, já no modo Avançar.
INSERT INTO "region_progress" ("character_id", "region_id", "mode", "wave", "updated_at")
SELECT "character_id", "region_id", 'FARM', 1, CURRENT_TIMESTAMP
FROM "hunt_sessions"
WHERE "status" = 'ACTIVE'
ON CONFLICT DO NOTHING;
