-- Migração 010: adiciona instance_token e uazapi_id em whatsapp_instances
-- O instance_token é gerado pela UazapiGO na criação da instância e
-- usado para autenticar todas as chamadas per-instância (?token=<token>).
-- O uazapi_id é o ID interno da instância na UazapiGO.

ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS instance_token TEXT,
  ADD COLUMN IF NOT EXISTS uazapi_id      TEXT;
