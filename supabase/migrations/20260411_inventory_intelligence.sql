-- ============================================================
-- MIGRATION: Inteligência de Estoque
-- Run once in Supabase Dashboard > SQL Editor
-- Safe: uses IF NOT EXISTS / IF NOT EXISTS on all operations
-- ============================================================

-- 1. New columns on vehicles table
--    (purchase_price, sale_price, fipe_price, video_url,
--     purchase_date, days_in_stock, photos already exist)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS has_accident_history  BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_seller_id    UUID          REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS target_margin_pct     DECIMAL(5,2)  DEFAULT 15.0,
  ADD COLUMN IF NOT EXISTS fipe_code             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS mileage_monthly_avg   INTEGER;

-- 2. Price snapshots (daily history per vehicle)
CREATE TABLE IF NOT EXISTS vehicle_price_snapshots (
  id                              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id                      UUID         NOT NULL REFERENCES vehicles(id)  ON DELETE CASCADE,
  store_id                        UUID         NOT NULL REFERENCES stores(id)    ON DELETE CASCADE,
  snapshot_date                   DATE         NOT NULL DEFAULT CURRENT_DATE,
  listed_price                    DECIMAL(10,2),
  fipe_price                      DECIMAL(10,2),
  estimated_market_price          DECIMAL(10,2),
  depreciation_loss_accumulated   DECIMAL(10,2),
  health_score                    SMALLINT,
  alert_level                     VARCHAR(20),
  created_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 3. Stock alerts
CREATE TABLE IF NOT EXISTS stock_alerts (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            UUID         NOT NULL REFERENCES vehicles(id)  ON DELETE CASCADE,
  store_id              UUID         NOT NULL REFERENCES stores(id)    ON DELETE CASCADE,
  alert_level           VARCHAR(20)  NOT NULL,
  days_in_stock         INTEGER,
  depreciation_loss     DECIMAL(10,2),
  suggested_action      TEXT,
  price_adjustment_pct  DECIMAL(5,2),
  is_resolved           BOOLEAN      NOT NULL DEFAULT false,
  resolved_at           TIMESTAMPTZ,
  resolved_by           UUID         REFERENCES users(id),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 4. Vehicle action history
CREATE TABLE IF NOT EXISTS vehicle_actions (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    UUID         NOT NULL REFERENCES vehicles(id)  ON DELETE CASCADE,
  store_id      UUID         NOT NULL REFERENCES stores(id)    ON DELETE CASCADE,
  action_type   VARCHAR(50)  NOT NULL,
  action_data   JSONB        NOT NULL DEFAULT '{}',
  performed_by  UUID         REFERENCES users(id),
  performed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 5. RLS
ALTER TABLE vehicle_price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_alerts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_actions         ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vehicle_price_snapshots' AND policyname = 'store_members'
  ) THEN
    CREATE POLICY store_members ON vehicle_price_snapshots FOR ALL
      USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stock_alerts' AND policyname = 'store_members'
  ) THEN
    CREATE POLICY store_members ON stock_alerts FOR ALL
      USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vehicle_actions' AND policyname = 'store_members'
  ) THEN
    CREATE POLICY store_members ON vehicle_actions FOR ALL
      USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_vps_vehicle   ON vehicle_price_snapshots(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vps_store_dt  ON vehicle_price_snapshots(store_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_sa_vehicle    ON stock_alerts(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sa_store_open ON stock_alerts(store_id, is_resolved) WHERE NOT is_resolved;
CREATE INDEX IF NOT EXISTS idx_va_vehicle    ON vehicle_actions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_va_store      ON vehicle_actions(store_id, performed_at DESC);
