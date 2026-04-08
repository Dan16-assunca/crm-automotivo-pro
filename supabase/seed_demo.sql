-- =============================================
-- SEED DE DEMONSTRAÇÃO — CRM Automotivo Pro
-- Execute no Supabase SQL Editor (aba separada)
-- =============================================

-- Primeiro: descubra o ID da sua loja e dos estágios
-- (rode este SELECT para pegar os IDs)

SELECT id, name FROM stores LIMIT 5;
SELECT id, name, position FROM pipeline_stages ORDER BY position LIMIT 10;

-- =============================================
-- DEPOIS: substitua os UUIDs abaixo pelos reais
-- Cole a query abaixo em uma nova aba do SQL Editor
-- =============================================

-- INSERE LEADS DE DEMONSTRAÇÃO
-- (substitua 'SEU_STORE_ID' pelo ID da sua loja)
-- (substitua 'SEU_USER_ID' pelo ID do seu usuário)
-- (substitua os stage_ids pelos IDs reais dos estágios)

DO $$
DECLARE
  v_store_id uuid;
  v_user_id uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid;
BEGIN
  -- Pega o primeiro store e user automaticamente
  SELECT id INTO v_store_id FROM stores LIMIT 1;
  SELECT id INTO v_user_id FROM users LIMIT 1;

  -- Pega os estágios
  SELECT id INTO s1 FROM pipeline_stages WHERE store_id = v_store_id AND position = 1;
  SELECT id INTO s2 FROM pipeline_stages WHERE store_id = v_store_id AND position = 2;
  SELECT id INTO s3 FROM pipeline_stages WHERE store_id = v_store_id AND position = 3;
  SELECT id INTO s4 FROM pipeline_stages WHERE store_id = v_store_id AND position = 4;
  SELECT id INTO s5 FROM pipeline_stages WHERE store_id = v_store_id AND position = 5;

  -- Insere leads de demo
  INSERT INTO leads (store_id, salesperson_id, stage_id, client_name, client_phone, client_email, client_city,
    vehicle_interest, vehicle_year_min, vehicle_year_max, budget_min, budget_max,
    payment_type, trade_in, trade_in_vehicle, source, temperature, priority, status,
    custom_fields, notes, score)
  VALUES
    (v_store_id, v_user_id, s1, 'Carlos Andrade',   '(11) 98721-4438', 'carlos@gmail.com',    'São Paulo',
     'BMW X5 2023',    2022, 2024, 280000, 350000, 'financiamento', true, 'Fiat Uno 2015', 'meta_ads',    'hot',  'high',   'active',
     '{"profissao":"Empresário","renda":"25000","cnh":true}', 'Cliente muito interessado, quer fechar essa semana.', 87),

    (v_store_id, v_user_id, s1, 'Ana Martins',       '(11) 97654-2210', 'ana@email.com',       'São Paulo',
     'BMW 320i 2023',  2022, 2023, 180000, 220000, 'avista',       false, null,             'google_ads',  'warm', 'medium', 'active',
     '{"profissao":"Médica","renda":"18000","cnh":true}',    'Quer test drive. Ligar quinta-feira.', 62),

    (v_store_id, v_user_id, s1, 'Pedro Souza',       '(21) 99218-5543', null,                  'Rio de Janeiro',
     'BMW M3 2024',    2023, 2024, 450000, 550000, 'financiamento', false, null,            'instagram',   'cold', 'low',    'active',
     '{"profissao":"Advogado","renda":"30000","cnh":true}',  'Viu no Instagram. Ainda pesquisando.', 35),

    (v_store_id, v_user_id, s2, 'Marcos Lima',       '(11) 94433-8821', 'marcos@empresa.com',  'Campinas',
     'Porsche Cayenne 2022', 2021, 2023, 400000, 500000, 'avista', true, 'BMW X1 2019',   'indicacao',   'hot',  'high',   'active',
     '{"profissao":"CEO","renda":"50000","cnh":true}',       'Indicação do João. Quer negociar desconto.', 91),

    (v_store_id, v_user_id, s2, 'Julia Ferreira',    '(11) 98800-1122', 'julia@gmail.com',     'São Paulo',
     'Mercedes GLA 2023', 2022, 2024, 200000, 260000, 'financiamento', false, null,        'webmotors',   'warm', 'medium', 'active',
     '{"profissao":"Arquiteta","renda":"12000","cnh":true}', 'Comparando com Audi Q3.', 58),

    (v_store_id, v_user_id, s3, 'Roberto Castro',    '(11) 97788-3344', 'roberto@gmail.com',   'Santos',
     'Jeep Compass 2024', 2023, 2024, 140000, 175000, 'financiamento', true, 'HB20 2020',  'meta_ads',    'hot',  'high',   'active',
     '{"profissao":"Engenheiro","renda":"9500","cnh":true}', 'Visitou a loja. Gostou muito. Aguardando proposta.', 78),

    (v_store_id, v_user_id, s3, 'Fernanda Neves',    '(11) 96655-4433', 'fernanda@email.com',  'São Paulo',
     'Toyota Corolla 2023', 2022, 2024, 115000, 145000, 'consorcio', false, null,          'olx',         'warm', 'medium', 'active',
     '{"profissao":"Professora","renda":"6000","cnh":true}', 'Quer parcela baixa. Consórcio é prioridade.', 51),

    (v_store_id, v_user_id, s4, 'Thiago Rocha',      '(11) 95544-7788', 'thiago@empresa.com',  'São Paulo',
     'Toyota Corolla XEI 2023', 2022, 2024, 130000, 160000, 'avista', false, null,         'google_ads',  'hot',  'high',   'active',
     '{"profissao":"Dentista","renda":"22000","cnh":true}', 'Proposta enviada. Aguardando retorno.', 83),

    (v_store_id, v_user_id, s5, 'Lucia Pereira',     '(11) 97898-1234', 'lucia@email.com',     'Guarulhos',
     'Honda HR-V EXL 2023', 2022, 2024, 110000, 140000, 'financiamento', true, 'Civic 2018', 'indicacao', 'hot',  'medium', 'active',
     '{"profissao":"Gerente","renda":"8500","cnh":true}',   'Negociação em andamento. Quer incluir o carro na troca.', 76);

  RAISE NOTICE 'Leads de demo inseridos com sucesso! Store: %, User: %', v_store_id, v_user_id;
END;
$$;

-- Verifica o resultado
SELECT client_name, temperature, budget_max, source, stage_id FROM leads ORDER BY created_at DESC LIMIT 20;
