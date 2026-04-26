-- ══════════════════════════════════════════════════════════════
-- Facebook Lead Ads — integração por loja
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facebook_integrations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Página do Facebook
  page_id                 text NOT NULL,
  page_name               text,
  page_access_token       text NOT NULL,   -- Token de Acesso da Página (longa duração)

  -- Webhook
  verify_token            text NOT NULL DEFAULT gen_random_uuid()::text,
  -- O app_secret fica em variável de ambiente (FB_APP_SECRET) — nível plataforma

  -- Configurações padrão para leads recebidos
  default_stage_id        uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  default_salesperson_id  uuid REFERENCES users(id)           ON DELETE SET NULL,
  default_temperature     text NOT NULL DEFAULT 'hot'
                            CHECK (default_temperature IN ('hot','warm','cold')),

  active                  boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (store_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_fb_integrations_store   ON facebook_integrations (store_id);
CREATE INDEX IF NOT EXISTS idx_fb_integrations_page_id ON facebook_integrations (page_id);
CREATE INDEX IF NOT EXISTS idx_fb_integrations_verify  ON facebook_integrations (verify_token);

-- RLS
ALTER TABLE facebook_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_members_facebook_integrations" ON facebook_integrations
  USING (
    store_id IN (SELECT store_id FROM users WHERE id = auth.uid())
  );

-- updated_at automático
CREATE OR REPLACE FUNCTION update_facebook_integrations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fb_integrations_updated_at ON facebook_integrations;
CREATE TRIGGER trg_fb_integrations_updated_at
  BEFORE UPDATE ON facebook_integrations
  FOR EACH ROW EXECUTE FUNCTION update_facebook_integrations_updated_at();
