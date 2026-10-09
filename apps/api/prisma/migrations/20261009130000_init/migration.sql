-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('PLAYER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "CharacterClass" AS ENUM ('guardian', 'arcanist', 'blade');

-- CreateEnum
CREATE TYPE "Affinity" AS ENUM ('solar', 'lunar', 'storm', 'abyssal');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('GOLD', 'ESSENCE', 'DIAMOND');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('HUNT_REWARD', 'BOSS_REWARD', 'ITEM_UPGRADE', 'NPC_SALE', 'MARKET_ESCROW_LOCK', 'MARKET_ESCROW_RELEASE', 'MARKET_FEE', 'ADMIN_GRANT', 'ADMIN_REVOKE', 'DEV_SEED');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EquipSlot" AS ENUM ('weapon', 'head', 'chest', 'hands', 'legs', 'feet');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('common', 'uncommon', 'rare', 'epic', 'legendary', 'astral');

-- CreateEnum
CREATE TYPE "ItemSource" AS ENUM ('DROP', 'CRAFT', 'QUEST', 'ADMIN');

-- CreateEnum
CREATE TYPE "HuntStatus" AS ENUM ('ACTIVE', 'STOPPED');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "AccountRole" NOT NULL DEFAULT 'PLAYER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(128) NOT NULL,
    "user_agent" VARCHAR(512),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(24) NOT NULL,
    "name_key" VARCHAR(24) NOT NULL,
    "class_id" "CharacterClass" NOT NULL,
    "affinity" "Affinity" NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_balances" (
    "account_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallet_balances_pkey" PRIMARY KEY ("account_id","currency")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "account_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "delta" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "reason" "LedgerReason" NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "ref_type" VARCHAR(64),
    "ref_id" VARCHAR(128),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "key" VARCHAR(128) NOT NULL,
    "account_id" UUID NOT NULL,
    "operation" VARCHAR(64) NOT NULL,
    "request_hash" VARCHAR(128) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "item_instances" (
    "id" UUID NOT NULL,
    "owner_character_id" UUID NOT NULL,
    "def_id" VARCHAR(64) NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "upgrade_level" INTEGER NOT NULL DEFAULT 0,
    "bonuses" JSONB NOT NULL,
    "ruleset_version" INTEGER NOT NULL,
    "equipped_slot" "EquipSlot",
    "tradable" BOOLEAN NOT NULL DEFAULT true,
    "source" "ItemSource" NOT NULL,
    "source_ref" VARCHAR(128),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "item_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hunt_sessions" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "region_id" VARCHAR(64) NOT NULL,
    "seed" BIGINT NOT NULL,
    "ruleset_version" INTEGER NOT NULL,
    "status" "HuntStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "last_settled_at" TIMESTAMPTZ(3) NOT NULL,
    "encounters_resolved" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "hunt_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_type" VARCHAR(32) NOT NULL,
    "actor_id" VARCHAR(64),
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(64),
    "target_id" VARCHAR(128),
    "payload" JSONB,
    "ip" VARCHAR(64),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_account_id_idx" ON "auth_sessions"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "characters_name_key_key" ON "characters"("name_key");

-- CreateIndex
CREATE INDEX "characters_account_id_idx" ON "characters"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_idempotency_key_key" ON "ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_currency_created_at_idx" ON "ledger_entries"("account_id", "currency", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_ref_type_ref_id_idx" ON "ledger_entries"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE INDEX "item_instances_owner_character_id_idx" ON "item_instances"("owner_character_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_instances_owner_character_id_equipped_slot_key" ON "item_instances"("owner_character_id", "equipped_slot");

-- CreateIndex
CREATE UNIQUE INDEX "hunt_sessions_character_id_key" ON "hunt_sessions"("character_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_balances" ADD CONSTRAINT "wallet_balances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_owner_character_id_fkey" FOREIGN KEY ("owner_character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hunt_sessions" ADD CONSTRAINT "hunt_sessions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
