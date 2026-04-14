-- Migration 004: Fix RLS UPDATE policy on stores
-- PROBLEMA: a política "store_isolation_stores" usa FOR ALL com USING genérico.
-- Isso funciona para SELECT mas pode falhar para UPDATE quando auth.uid() retorna
-- NULL transitoriamente (token refresh, sessão expirando).
-- SOLUÇÃO: política UPDATE explícita + fallback que permite ao dono da store atualizar.

-- Remove política genérica existente e cria políticas granulares por operação

DROP POLICY IF EXISTS "store_isolation_stores" ON stores;

-- SELECT: usuário vê apenas sua loja
CREATE POLICY "stores_select" ON stores
  FOR SELECT USING (id = get_user_store_id());

-- INSERT: qualquer usuário autenticado pode criar uma store (cadastro)
-- (já existia em 002, mantida aqui por completude)
DROP POLICY IF EXISTS "stores_insert_registration" ON stores;
CREATE POLICY "stores_insert" ON stores
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: usuário pode atualizar sua própria store
-- Usa auth.uid() direto via subquery para evitar dependência de get_user_store_id()
-- retornar NULL em momentos de token refresh
CREATE POLICY "stores_update" ON stores
  FOR UPDATE
  USING (
    id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  );

-- DELETE: apenas via políticas internas (ninguém deleta store pelo frontend)
CREATE POLICY "stores_delete" ON stores
  FOR DELETE USING (false);
