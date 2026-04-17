-- Migration 006: whatsapp_instances — arquitetura multi-tenant SaaS
-- Cada loja pode ter múltiplas instâncias (números) do WhatsApp.
-- O nome da instância é gerado automaticamente pelo sistema — cliente
-- nunca precisa digitar configurações técnicas.

CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id       uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  instance_name  text        NOT NULL,         -- nome técnico no Evolution API (auto-gerado)
  label          text,                         -- rótulo amigável: "Vendas", "Suporte", nome do vendedor
  phone_number   text,                         -- +55 11 99999-9999 (preenchido após conexão)
  owner_jid      text,                         -- JID completo do WhatsApp (5511999999@s.whatsapp.net)
  status         text        NOT NULL DEFAULT 'disconnected', -- connected | disconnected | connecting
  profile_pic_url text,
  connected_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_instances_name_unique UNIQUE (instance_name)
);

CREATE INDEX IF NOT EXISTS whatsapp_instances_store_idx
  ON whatsapp_instances (store_id);

CREATE INDEX IF NOT EXISTS whatsapp_instances_status_idx
  ON whatsapp_instances (store_id, status);

-- RLS
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_isolation_whatsapp_instances" ON whatsapp_instances
  FOR ALL USING (store_id = get_user_store_id());

-- Realtime: atualiza UI quando status muda (ex: conectado pelo QR)
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_instances;

-- Trigger updated_at
CREATE TRIGGER whatsapp_instances_updated_at
  BEFORE UPDATE ON whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
