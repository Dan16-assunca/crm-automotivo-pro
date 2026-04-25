-- ============================================================
-- MIGRATION: Lead Alerts (Fase 2.2)
-- Tabela para alertas inteligentes gerados pela IA e por regras.
-- Run once in Supabase Dashboard > SQL Editor
-- Safe: uses IF NOT EXISTS on all operations
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_alerts (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID         NOT NULL REFERENCES stores(id)   ON DELETE CASCADE,
  lead_id     UUID         NOT NULL REFERENCES leads(id)    ON DELETE CASCADE,
  type        VARCHAR(50)  NOT NULL,
  title       VARCHAR(200) NOT NULL,
  message     TEXT         NOT NULL,
  severity    VARCHAR(20)  NOT NULL DEFAULT 'info',
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_lead_alert UNIQUE (store_id, lead_id, type)
);

ALTER TABLE lead_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_alerts' AND policyname = 'store_members'
  ) THEN
    CREATE POLICY store_members ON lead_alerts FOR ALL
      USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_la_store_active
  ON lead_alerts(store_id, expires_at)
  WHERE expires_at > NOW();

CREATE INDEX IF NOT EXISTS idx_la_lead
  ON lead_alerts(lead_id);
