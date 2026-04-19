-- Migração 008: Multi-tenancy — slug por loja
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Stack: Vite + React SPA (sem middleware Next.js — segurança garantida pelo Supabase RLS)

-- ─── Novas colunas em stores ────────────────────────────────────────────────

ALTER TABLE stores ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('active', 'suspended', 'trial', 'cancelled'));
ALTER TABLE stores ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ
  DEFAULT (NOW() + INTERVAL '14 days');
ALTER TABLE stores ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE;

-- Garante que plano atual é compatível com check constraint
-- (o campo já existe como 'free' | 'pro' | 'enterprise' — apenas adicionamos 'starter')
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_plan_check;
ALTER TABLE stores ADD CONSTRAINT stores_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'enterprise'));

-- ─── Índices ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
CREATE INDEX IF NOT EXISTS idx_stores_custom_domain ON stores(custom_domain);

-- ─── Popula slug para lojas existentes que não têm slug ─────────────────────

UPDATE stores
SET slug = lower(
  regexp_replace(
    translate(
      name,
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
    ),
    '[^a-zA-Z0-9]+', '-', 'g'
  )
)
WHERE slug IS NULL;

-- Loja de teste padrão
UPDATE stores
SET slug = 'demo'
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND slug IS NULL;

-- ─── Função helper: verifica disponibilidade de slug (chamada pelo frontend) ─

CREATE OR REPLACE FUNCTION is_slug_available(p_slug TEXT)
RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (SELECT 1 FROM stores WHERE slug = p_slug);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Função helper: resolve tenant pelo hostname ─────────────────────────────

CREATE OR REPLACE FUNCTION get_store_by_hostname(hostname TEXT)
RETURNS TABLE(
  id UUID,
  name TEXT,
  slug TEXT,
  status TEXT,
  plan TEXT,
  settings JSONB
) AS $$
DECLARE
  extracted_slug TEXT;
BEGIN
  -- Extrai subdomínio de "autoshow.crmautomotivopro.com"
  extracted_slug := split_part(hostname, '.', 1);

  -- Ignora subdomínios reservados
  IF extracted_slug IN ('app', 'www', 'api', 'admin', 'mail', 'smtp', 'ftp', 'blog', 'docs', 'status', 'suporte') THEN
    RETURN;
  END IF;

  -- Busca por slug OU custom_domain
  RETURN QUERY
    SELECT s.id, s.name, s.slug, s.status, s.plan, s.settings
    FROM stores s
    WHERE s.slug = extracted_slug
       OR s.custom_domain = hostname
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Garante função get_user_store_id() existe e está correta ───────────────

CREATE OR REPLACE FUNCTION get_user_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── RLS: habilita em todas as tabelas relevantes ──────────────────────────

ALTER TABLE stores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;

-- ─── Policy: usuário só acessa dados da própria loja ────────────────────────
-- Aplica em todas as tabelas com store_id de forma segura

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'leads', 'vehicles', 'activities',
    'whatsapp_messages', 'pipeline_stages'
  ]
  LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "store_isolation" ON %I;
      CREATE POLICY "store_isolation" ON %I
        USING (store_id = get_user_store_id())
        WITH CHECK (store_id = get_user_store_id());
    ', tbl, tbl);
  END LOOP;
END $$;

-- whatsapp_instances também usa store_id
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_isolation" ON whatsapp_instances;
CREATE POLICY "store_isolation" ON whatsapp_instances
  USING (store_id = get_user_store_id())
  WITH CHECK (store_id = get_user_store_id());

-- Users: usuário vê apenas da própria loja
DROP POLICY IF EXISTS "store_isolation" ON users;
CREATE POLICY "store_isolation" ON users
  USING (store_id = get_user_store_id())
  WITH CHECK (store_id = get_user_store_id());

-- Stores: usuário só vê a própria loja
DROP POLICY IF EXISTS "store_isolation" ON stores;
CREATE POLICY "store_isolation" ON stores
  USING (id = get_user_store_id());
