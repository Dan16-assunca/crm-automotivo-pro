-- Migration 011: automation_executions
-- Registra cada execução de ação de automação por lead,
-- garantindo que cada ação seja executada apenas uma vez.

CREATE TABLE IF NOT EXISTS automation_executions (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id  uuid        NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  lead_id        uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  action_index   int         NOT NULL,
  status         text        NOT NULL DEFAULT 'success', -- success | failed
  error_message  text,
  executed_at    timestamptz NOT NULL DEFAULT now(),

  -- Garante que cada ação seja executada apenas uma vez por lead
  CONSTRAINT automation_executions_unique UNIQUE (automation_id, lead_id, action_index)
);

CREATE INDEX IF NOT EXISTS automation_executions_automation_idx
  ON automation_executions (automation_id);

CREATE INDEX IF NOT EXISTS automation_executions_lead_idx
  ON automation_executions (lead_id);

-- RLS
ALTER TABLE automation_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_isolation_automation_executions" ON automation_executions
  FOR ALL USING (
    automation_id IN (
      SELECT id FROM automations WHERE store_id = get_user_store_id()
    )
  );
