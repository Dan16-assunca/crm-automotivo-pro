-- ══════════════════════════════════════════════════════════════
-- UTM Tracking & Ad Attribution
-- ══════════════════════════════════════════════════════════════

-- ─── 1. Adiciona colunas UTM na tabela leads ──────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS utm_source      text,
  ADD COLUMN IF NOT EXISTS utm_medium      text,
  ADD COLUMN IF NOT EXISTS utm_campaign    text,
  ADD COLUMN IF NOT EXISTS utm_term        text,
  ADD COLUMN IF NOT EXISTS utm_content     text,
  ADD COLUMN IF NOT EXISTS utm_ad_id       text,   -- ad.id do Facebook / Google
  ADD COLUMN IF NOT EXISTS utm_adset_id    text,   -- adset.id Facebook / grupo de anúncios Google
  ADD COLUMN IF NOT EXISTS utm_campaign_id text,   -- campaign.id Facebook / Google
  ADD COLUMN IF NOT EXISTS fbclid          text,   -- Facebook Click ID
  ADD COLUMN IF NOT EXISTS gclid           text,   -- Google Click ID
  ADD COLUMN IF NOT EXISTS landing_page    text,   -- URL da página que o lead acessou
  ADD COLUMN IF NOT EXISTS referrer        text;   -- document.referrer

-- Índices para relatórios rápidos por campanha/fonte
CREATE INDEX IF NOT EXISTS idx_leads_utm_source   ON leads (store_id, utm_source)   WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON leads (store_id, utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_fbclid       ON leads (fbclid)                 WHERE fbclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_gclid        ON leads (gclid)                  WHERE gclid IS NOT NULL;

-- ─── 2. Tabela ad_campaigns ───────────────────────────────────
-- Armazena campanhas cadastradas manualmente ou via webhook

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  platform      text NOT NULL CHECK (platform IN ('facebook','google','instagram','tiktok','email','organic','other')),
  name          text NOT NULL,
  campaign_id   text,                         -- ID externo na plataforma de anúncios
  adset_name    text,
  adset_id      text,
  ad_name       text,
  ad_id         text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  start_date    date,
  end_date      date,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_store ON ad_campaigns (store_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_campaign_id ON ad_campaigns (campaign_id) WHERE campaign_id IS NOT NULL;

-- ─── 3. Tabela campaign_spend ─────────────────────────────────
-- Investimento diário por campanha (entrada manual ou API)

CREATE TABLE IF NOT EXISTS campaign_spend (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  campaign_id   uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  spend_date    date NOT NULL,
  amount        numeric(10,2) NOT NULL DEFAULT 0,
  impressions   integer,
  clicks        integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, spend_date)
);

CREATE INDEX IF NOT EXISTS idx_campaign_spend_store_date ON campaign_spend (store_id, spend_date);

-- ─── 4. View v_campaign_attribution ──────────────────────────
-- Agrega leads + conversões + CPL por campanha UTM

CREATE OR REPLACE VIEW v_campaign_attribution AS
SELECT
  l.store_id,
  COALESCE(l.utm_source, 'direto')                         AS utm_source,
  COALESCE(l.utm_medium, '(none)')                         AS utm_medium,
  COALESCE(l.utm_campaign, '(sem campanha)')               AS utm_campaign,
  l.utm_content,
  l.utm_term,
  COUNT(*)                                                  AS total_leads,
  COUNT(*) FILTER (WHERE l.status = 'won')                  AS total_won,
  SUM(l.won_value) FILTER (WHERE l.status = 'won')          AS total_revenue,
  ROUND(
    COUNT(*) FILTER (WHERE l.status = 'won')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  )                                                         AS conversion_rate_pct,
  MIN(l.created_at)                                         AS first_lead_at,
  MAX(l.created_at)                                         AS last_lead_at
FROM leads l
GROUP BY l.store_id, utm_source, utm_medium, utm_campaign, l.utm_content, l.utm_term;

-- ─── 5. RLS para as novas tabelas ────────────────────────────

ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_spend ENABLE ROW LEVEL SECURITY;

-- Política: membros da loja podem ver e editar suas próprias campanhas
CREATE POLICY "store_members_ad_campaigns" ON ad_campaigns
  USING (
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "store_members_campaign_spend" ON campaign_spend
  USING (
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  );

-- ─── 6. updated_at automático para ad_campaigns ──────────────

CREATE OR REPLACE FUNCTION update_ad_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_campaigns_updated_at ON ad_campaigns;
CREATE TRIGGER trg_ad_campaigns_updated_at
  BEFORE UPDATE ON ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_ad_campaigns_updated_at();
