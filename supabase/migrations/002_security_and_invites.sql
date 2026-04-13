-- =============================================
-- CRM AUTOMOTIVO PRO — MIGRATION 002
-- Segurança, Multi-usuário, Convites de Equipe
-- Execute no Supabase SQL Editor
-- =============================================

-- =============================================
-- TABELA DE CONVITES DA EQUIPE
-- =============================================
CREATE TABLE IF NOT EXISTS team_invites (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  full_name   text,
  role        text        NOT NULL DEFAULT 'salesperson',
  invited_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  token       uuid        NOT NULL DEFAULT uuid_generate_v4(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_invites_token_idx    ON team_invites(token);
CREATE        INDEX IF NOT EXISTS team_invites_store_idx    ON team_invites(store_id);
CREATE        INDEX IF NOT EXISTS team_invites_email_idx    ON team_invites(email);

ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode ler convites (o token UUID é o controle de acesso)
DROP POLICY IF EXISTS "team_invites_select" ON team_invites;
CREATE POLICY "team_invites_select" ON team_invites
  FOR SELECT USING (true);

-- Apenas membros da loja podem criar convites
DROP POLICY IF EXISTS "team_invites_insert" ON team_invites;
CREATE POLICY "team_invites_insert" ON team_invites
  FOR INSERT WITH CHECK (store_id = get_user_store_id());

-- Membros da loja (ou quem aceitou o convite já com store_id) podem atualizar
DROP POLICY IF EXISTS "team_invites_update" ON team_invites;
CREATE POLICY "team_invites_update" ON team_invites
  FOR UPDATE USING (store_id = get_user_store_id());

-- Apenas membros da loja podem deletar
DROP POLICY IF EXISTS "team_invites_delete" ON team_invites;
CREATE POLICY "team_invites_delete" ON team_invites
  FOR DELETE USING (store_id = get_user_store_id());

-- =============================================
-- RLS: PERMITIR REGISTRO DE NOVA LOJA
-- Um usuário autenticado sem loja pode criar uma store (cadastro)
-- =============================================
DROP POLICY IF EXISTS "stores_insert_registration" ON stores;
CREATE POLICY "stores_insert_registration" ON stores
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- RLS: PERMITIR AUTO-CADASTRO NA TABELA users
-- Usuário pode inserir seu próprio registro (cadastro + aceite de convite)
-- =============================================
DROP POLICY IF EXISTS "users_insert_self" ON users;
CREATE POLICY "users_insert_self" ON users
  FOR INSERT WITH CHECK (id = auth.uid());

-- =============================================
-- RLS: LEADS — CONTROLE POR ROLE
-- admin/manager: veem todos os leads da loja
-- salesperson:   vê seus próprios leads + leads sem responsável
-- =============================================
DROP POLICY IF EXISTS "store_isolation_leads" ON leads;
CREATE POLICY "leads_role_access" ON leads
  FOR ALL USING (
    store_id = get_user_store_id()
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'manager')
      OR salesperson_id = auth.uid()
      OR salesperson_id IS NULL
    )
  );

-- =============================================
-- RLS: PIPELINE_STAGES — INSERT para novos stores (via RPC SECURITY DEFINER)
-- A função create_default_stages já tem SECURITY DEFINER,
-- mas adicionamos INSERT explícito para segurança extra.
-- =============================================
DROP POLICY IF EXISTS "pipeline_stages_insert_store" ON pipeline_stages;
CREATE POLICY "pipeline_stages_insert_store" ON pipeline_stages
  FOR INSERT WITH CHECK (store_id = get_user_store_id());
