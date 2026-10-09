-- Garantias de integridade que o schema do Prisma não consegue expressar.
-- Defesa em profundidade: o serviço já valida tudo isto; o banco é a última barreira.

-- Saldos e valores nunca negativos ------------------------------------------
ALTER TABLE "wallet_balances"
  ADD CONSTRAINT "wallet_balances_amount_non_negative" CHECK ("amount" >= 0);

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_delta_non_zero" CHECK ("delta" <> 0),
  ADD CONSTRAINT "ledger_entries_balance_after_non_negative" CHECK ("balance_after" >= 0),
  ADD CONSTRAINT "ledger_entries_idempotency_key_not_blank" CHECK (length(btrim("idempotency_key")) > 0);

-- Progressão -----------------------------------------------------------------
ALTER TABLE "characters"
  ADD CONSTRAINT "characters_level_positive" CHECK ("level" >= 1),
  ADD CONSTRAINT "characters_xp_non_negative" CHECK ("xp" >= 0),
  ADD CONSTRAINT "characters_name_key_lowercase" CHECK ("name_key" = lower("name_key"));

ALTER TABLE "item_instances"
  ADD CONSTRAINT "item_instances_upgrade_level_range" CHECK ("upgrade_level" BETWEEN 0 AND 15);

ALTER TABLE "hunt_sessions"
  ADD CONSTRAINT "hunt_sessions_seed_uint32" CHECK ("seed" BETWEEN 0 AND 4294967295),
  ADD CONSTRAINT "hunt_sessions_encounters_non_negative" CHECK ("encounters_resolved" >= 0),
  ADD CONSTRAINT "hunt_sessions_settled_after_start" CHECK ("last_settled_at" >= "started_at");

ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_email_lowercase" CHECK ("email" = lower("email"));

-- Tabelas append-only: livro-razão e auditoria --------------------------------
CREATE OR REPLACE FUNCTION astral_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tabela % é append-only: % não permitido', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "ledger_entries_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION astral_reject_mutation();

CREATE TRIGGER "ledger_entries_no_truncate"
  BEFORE TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION astral_reject_mutation();

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION astral_reject_mutation();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION astral_reject_mutation();
