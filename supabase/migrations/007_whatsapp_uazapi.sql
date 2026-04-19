-- Migração 007: Uazapi — campos adicionais em whatsapp_messages
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Compatível com a estrutura existente: adiciona apenas o que falta.

-- ─── Novas colunas ─────────────────────────────────────────────────────────────

-- URL da mídia retornada diretamente pelo webhook Uazapi (evita chamada extra à API)
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_url TEXT;

-- Telefone limpo do contato (sem @s.whatsapp.net), facilita JOIN com tabela leads
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- ─── Constraint de unicidade em message_id (evita duplicatas no upsert) ────────
-- Verifica antes de adicionar para não quebrar se já existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_messages_message_id_store_key'
  ) THEN
    -- Unique por (store_id, message_id) — um mesmo message_id pode existir em lojas diferentes
    ALTER TABLE whatsapp_messages
      ADD CONSTRAINT whatsapp_messages_message_id_store_key UNIQUE (store_id, message_id);
  END IF;
END $$;

-- ─── Índices de performance ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_wm_store_jid
  ON whatsapp_messages(store_id, remote_jid);

CREATE INDEX IF NOT EXISTS idx_wm_store_ts
  ON whatsapp_messages(store_id, message_ts DESC);

CREATE INDEX IF NOT EXISTS idx_wm_contact_phone
  ON whatsapp_messages(store_id, contact_phone);

-- ─── Supabase Realtime (garante que a tabela está na publication) ───────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Supabase Storage: bucket "media" para upload de arquivos ──────────────────
-- Execute apenas se o bucket ainda não existir.
-- Se preferir, crie via Dashboard → Storage → New bucket (nome: media, Public: sim)

INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Política: qualquer usuário autenticado pode fazer upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Upload autenticado media'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Upload autenticado media"
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'media' AND auth.role() = 'authenticated');
    $pol$;
  END IF;
END $$;

-- Política: leitura pública de objetos do bucket media
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Leitura publica media'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Leitura publica media"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'media');
    $pol$;
  END IF;
END $$;
