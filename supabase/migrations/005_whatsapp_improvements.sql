-- Migration 005: Melhorias na tabela whatsapp_messages
-- Adiciona colunas para suporte a tempo real, deduplicação e dados ricos

-- Novas colunas para armazenar dados mais ricos das mensagens
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS push_name       text,         -- nome de exibição do remetente
  ADD COLUMN IF NOT EXISTS message_ts      bigint,       -- timestamp Unix da mensagem no WhatsApp
  ADD COLUMN IF NOT EXISTS media_mime_type text,         -- MIME type da mídia
  ADD COLUMN IF NOT EXISTS key_id          text,         -- key.id do WhatsApp (para buscar mídia)
  ADD COLUMN IF NOT EXISTS from_me         boolean DEFAULT false; -- true = enviada por nós

-- Índice único parcial para evitar duplicatas de mensagens recebidas via webhook
-- NULL message_id é permitido (mensagens sem ID, ex: inseridas localmente como otimista)
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_store_msg_uniq
  ON whatsapp_messages (store_id, message_id)
  WHERE message_id IS NOT NULL;

-- Índice para ordenação por timestamp e busca por conversa
CREATE INDEX IF NOT EXISTS whatsapp_messages_jid_ts_idx
  ON whatsapp_messages (store_id, remote_jid, message_ts DESC);

-- Índice para buscar mensagens por key_id (recuperação de mídia)
CREATE INDEX IF NOT EXISTS whatsapp_messages_key_id_idx
  ON whatsapp_messages (store_id, key_id)
  WHERE key_id IS NOT NULL;

-- Política explícita para o service_role inserir via webhook (bypassa RLS de qualquer forma,
-- mas torna intenção explícita)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_messages'
      AND policyname = 'whatsapp_messages_service_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "whatsapp_messages_service_insert" ON whatsapp_messages
        FOR INSERT TO service_role WITH CHECK (true);
    $policy$;
  END IF;
END $$;
