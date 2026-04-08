-- =============================================
-- CRM AUTOMOTIVO PRO — SCHEMA COMPLETO
-- Execute no Supabase SQL Editor
-- =============================================

-- EXTENSÕES
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- =============================================
-- LOJAS (multi-store)
-- =============================================
create table if not exists stores (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  cnpj text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  logo_url text,
  brand text,
  plan text default 'pro',
  active boolean default true,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================
-- USUÁRIOS / EQUIPE
-- =============================================
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid references stores(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text default 'salesperson',
  phone text,
  avatar_url text,
  whatsapp_number text,
  active boolean default true,
  meta jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================
-- PIPELINE / ESTÁGIOS DO FUNIL
-- =============================================
create table if not exists pipeline_stages (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references stores(id) on delete cascade,
  name text not null,
  color text default '#39FF14',
  icon text,
  position integer not null,
  is_final boolean default false,
  is_won boolean default false,
  created_at timestamptz default now()
);

create or replace function create_default_stages(p_store_id uuid)
returns void as $$
begin
  insert into pipeline_stages (store_id, name, color, icon, position, is_final, is_won) values
    (p_store_id, 'Novo Lead',           '#39FF14', 'zap',         1, false, false),
    (p_store_id, 'Contato Feito',       '#0A84FF', 'phone',       2, false, false),
    (p_store_id, 'Interesse Confirmado','#FFD60A', 'star',        3, false, false),
    (p_store_id, 'Proposta Enviada',    '#FF9F0A', 'file-text',   4, false, false),
    (p_store_id, 'Negociação',          '#BF5AF2', 'handshake',   5, false, false),
    (p_store_id, 'Documentação',        '#32ADE6', 'clipboard',   6, false, false),
    (p_store_id, 'Ganho',              '#30D158', 'check-circle', 7, true,  true),
    (p_store_id, 'Perdido',            '#FF3B30', 'x-circle',     8, true,  false);
end;
$$ language plpgsql;

-- =============================================
-- LEADS
-- =============================================
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references stores(id) on delete cascade,
  salesperson_id uuid references users(id) on delete set null,
  stage_id uuid references pipeline_stages(id) on delete set null,

  client_name text not null,
  client_phone text,
  client_email text,
  client_cpf text,
  client_city text,
  client_state text,

  vehicle_interest text,
  vehicle_year_min integer,
  vehicle_year_max integer,
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  payment_type text,
  trade_in boolean default false,
  trade_in_vehicle text,

  source text,
  source_campaign text,

  temperature text default 'cold',
  priority text default 'medium',
  score integer default 0,

  status text default 'active',
  lost_reason text,
  won_value numeric(12,2),
  won_vehicle_id uuid,

  last_contact_at timestamptz,
  next_followup_at timestamptz,
  notes text,
  tags text[] default '{}',
  custom_fields jsonb default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists leads_store_id_idx on leads(store_id);
create index if not exists leads_stage_id_idx on leads(stage_id);
create index if not exists leads_salesperson_id_idx on leads(salesperson_id);
create index if not exists leads_status_idx on leads(status);
create index if not exists leads_next_followup_idx on leads(next_followup_at);
create index if not exists leads_client_phone_idx on leads(client_phone);

-- =============================================
-- ATIVIDADES
-- =============================================
create table if not exists activities (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  store_id uuid references stores(id) on delete cascade,
  user_id uuid references users(id) on delete set null,

  type text not null,
  title text,
  description text,
  direction text,
  duration_seconds integer,

  whatsapp_message_id text,
  whatsapp_status text,

  scheduled_at timestamptz,
  completed_at timestamptz,

  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists activities_lead_id_idx on activities(lead_id);
create index if not exists activities_user_id_idx on activities(user_id);
create index if not exists activities_scheduled_at_idx on activities(scheduled_at);

-- =============================================
-- VEÍCULOS
-- =============================================
create table if not exists vehicles (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references stores(id) on delete cascade,

  brand text not null,
  model text not null,
  version text,
  year_fabrication integer,
  year_model integer,
  color text,
  plate text,
  chassis text,
  renavam text,
  km integer,
  fuel text,
  transmission text,

  purchase_price numeric(12,2),
  sale_price numeric(12,2),
  promotional_price numeric(12,2),
  fipe_price numeric(12,2),

  status text default 'available',
  condition text default 'used',

  photos text[] default '{}',
  video_url text,
  description text,
  optionals text[] default '{}',

  source text,
  purchase_date date,

  olx_ad_id text,
  webmotors_ad_id text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists vehicles_store_id_idx on vehicles(store_id);
create index if not exists vehicles_status_idx on vehicles(status);
create index if not exists vehicles_brand_model_idx on vehicles(brand, model);

-- =============================================
-- METAS DE VENDAS
-- =============================================
create table if not exists sales_goals (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references stores(id) on delete cascade,
  salesperson_id uuid references users(id) on delete cascade,

  period_type text not null default 'monthly',
  period_month integer,
  period_year integer not null,

  goal_units integer,
  goal_revenue numeric(12,2),

  achieved_units integer default 0,
  achieved_revenue numeric(12,2) default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================
-- AUTOMAÇÕES
-- =============================================
create table if not exists automations (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references stores(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text,
  trigger_config jsonb default '{}',
  actions jsonb default '[]',
  active boolean default true,
  created_at timestamptz default now()
);

-- =============================================
-- MENSAGENS WHATSAPP
-- =============================================
create table if not exists whatsapp_messages (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references stores(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,

  instance_name text,
  remote_jid text,
  message_id text,

  direction text not null,
  type text default 'text',
  content text,
  media_url text,

  status text default 'pending',
  read_at timestamptz,

  created_at timestamptz default now()
);

create index if not exists whatsapp_messages_lead_id_idx on whatsapp_messages(lead_id);
create index if not exists whatsapp_messages_remote_jid_idx on whatsapp_messages(remote_jid);
create index if not exists whatsapp_messages_store_id_idx on whatsapp_messages(store_id);

-- =============================================
-- NOTIFICAÇÕES
-- =============================================
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  store_id uuid references stores(id) on delete cascade,

  type text,
  title text,
  body text,
  action_url text,
  read boolean default false,

  created_at timestamptz default now()
);

create index if not exists notifications_user_id_idx on notifications(user_id);
create index if not exists notifications_read_idx on notifications(read);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
alter table stores enable row level security;
alter table users enable row level security;
alter table leads enable row level security;
alter table activities enable row level security;
alter table vehicles enable row level security;
alter table pipeline_stages enable row level security;
alter table sales_goals enable row level security;
alter table whatsapp_messages enable row level security;
alter table notifications enable row level security;
alter table automations enable row level security;

-- Helper function: get current user's store_id
create or replace function get_user_store_id()
returns uuid as $$
  select store_id from users where id = auth.uid()
$$ language sql security definer stable;

-- RLS Policies
create policy "store_isolation_stores" on stores
  for all using (id = get_user_store_id());

create policy "store_isolation_users" on users
  for all using (store_id = get_user_store_id());

create policy "store_isolation_leads" on leads
  for all using (store_id = get_user_store_id());

create policy "store_isolation_activities" on activities
  for all using (store_id = get_user_store_id());

create policy "store_isolation_vehicles" on vehicles
  for all using (store_id = get_user_store_id());

create policy "store_isolation_pipeline_stages" on pipeline_stages
  for all using (store_id = get_user_store_id());

create policy "store_isolation_sales_goals" on sales_goals
  for all using (store_id = get_user_store_id());

create policy "store_isolation_whatsapp_messages" on whatsapp_messages
  for all using (store_id = get_user_store_id());

create policy "store_isolation_notifications" on notifications
  for all using (store_id = get_user_store_id());

create policy "store_isolation_automations" on automations
  for all using (store_id = get_user_store_id());

-- =============================================
-- REALTIME
-- =============================================
alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table whatsapp_messages;
alter publication supabase_realtime add table activities;
alter publication supabase_realtime add table notifications;

-- =============================================
-- TRIGGERS — updated_at
-- =============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at before update on leads
  for each row execute function update_updated_at();

create trigger vehicles_updated_at before update on vehicles
  for each row execute function update_updated_at();

create trigger users_updated_at before update on users
  for each row execute function update_updated_at();

create trigger stores_updated_at before update on stores
  for each row execute function update_updated_at();

-- =============================================
-- SEED: Demo store + user + stages
-- (Execute separately after creating auth user)
-- =============================================
-- insert into stores (id, name, brand, plan) values
--   ('00000000-0000-0000-0000-000000000001', 'BMW Premium SP', 'BMW', 'pro');
-- select create_default_stages('00000000-0000-0000-0000-000000000001');
