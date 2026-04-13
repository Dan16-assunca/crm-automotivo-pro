-- Migration 003: role helper + auto-accept invite trigger

-- ── get_user_role() ──────────────────────────────────────────────────────────
-- Função auxiliar para uso em políticas RLS sem subquery inline.
-- SECURITY DEFINER + STABLE garante execução eficiente.

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

-- ── mark_invite_accepted() ───────────────────────────────────────────────────
-- Trigger de segurança: marca accepted_at no team_invites quando o usuário
-- convidado faz login pela primeira vez (last_sign_in_at é preenchido).
-- Isso garante que o convite seja marcado mesmo se o frontend falhar.

CREATE OR REPLACE FUNCTION mark_invite_accepted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_sign_in_at IS NOT NULL AND
     (OLD.last_sign_in_at IS NULL OR OLD.last_sign_in_at <> NEW.last_sign_in_at) THEN
    UPDATE public.team_invites
    SET accepted_at = now()
    WHERE email = NEW.email
      AND accepted_at IS NULL
      AND expires_at > now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_invite_user_first_login ON auth.users;
CREATE TRIGGER on_invite_user_first_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION mark_invite_accepted();
