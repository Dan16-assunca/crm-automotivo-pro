-- =============================================
-- SETUP COMPLETO DA CONTA — CRM Automotivo Pro
-- Execute no Supabase SQL Editor
-- Cria: loja, usuário, estágios e leads de demo
-- =============================================

DO $$
DECLARE
  v_auth_id   uuid;
  v_email     text;
  v_name      text;
  v_store_id  uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid;
BEGIN

  -- 1. Pega o primeiro usuário do Supabase Auth
  SELECT id, email,
    COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1))
  INTO v_auth_id, v_email, v_name
  FROM auth.users
  ORDER BY created_at
  LIMIT 1;

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário encontrado em auth.users. Faça o cadastro no app primeiro.';
  END IF;

  RAISE NOTICE '→ Auth user: % (%)', v_name, v_auth_id;

  -- 2. Cria a loja (se não existir)
  IF NOT EXISTS (SELECT 1 FROM stores LIMIT 1) THEN
    INSERT INTO stores (name, brand, plan, city, state)
    VALUES ('CRM Automotivo Pro', 'Multimarcas', 'pro', 'São Paulo', 'SP')
    RETURNING id INTO v_store_id;
    RAISE NOTICE '→ Loja criada: %', v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM stores LIMIT 1;
    RAISE NOTICE '→ Loja existente: %', v_store_id;
  END IF;

  -- 3. Cria o registro na tabela users (se não existir)
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_auth_id) THEN
    INSERT INTO users (id, store_id, full_name, email, role)
    VALUES (v_auth_id, v_store_id, v_name, v_email, 'admin');
    RAISE NOTICE '→ Usuário criado na tabela users';
  ELSE
    -- Garante que o store_id está correto
    UPDATE users SET store_id = v_store_id WHERE id = v_auth_id;
    RAISE NOTICE '→ Usuário atualizado (store_id vinculado)';
  END IF;

  -- 4. Cria os estágios do pipeline (se não existirem)
  IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE store_id = v_store_id LIMIT 1) THEN
    PERFORM create_default_stages(v_store_id);
    RAISE NOTICE '→ Estágios do pipeline criados';
  ELSE
    RAISE NOTICE '→ Estágios já existem';
  END IF;

  -- 5. Pega os IDs dos estágios
  SELECT id INTO s1 FROM pipeline_stages WHERE store_id = v_store_id ORDER BY position LIMIT 1 OFFSET 0;
  SELECT id INTO s2 FROM pipeline_stages WHERE store_id = v_store_id ORDER BY position LIMIT 1 OFFSET 1;
  SELECT id INTO s3 FROM pipeline_stages WHERE store_id = v_store_id ORDER BY position LIMIT 1 OFFSET 2;
  SELECT id INTO s4 FROM pipeline_stages WHERE store_id = v_store_id ORDER BY position LIMIT 1 OFFSET 3;
  SELECT id INTO s5 FROM pipeline_stages WHERE store_id = v_store_id ORDER BY position LIMIT 1 OFFSET 4;

  -- 6. Insere leads de demo (se não existirem)
  IF NOT EXISTS (SELECT 1 FROM leads WHERE store_id = v_store_id LIMIT 1) THEN
    INSERT INTO leads (
      store_id, salesperson_id, stage_id, client_name, client_phone, client_email, client_city,
      vehicle_interest, vehicle_year_min, vehicle_year_max, budget_min, budget_max,
      payment_type, trade_in, trade_in_vehicle, source, temperature, priority, status,
      custom_fields, notes, score
    ) VALUES
      (v_store_id, v_auth_id, s1, 'Carlos Andrade',   '(11) 98721-4438', 'carlos@gmail.com',    'São Paulo',
       'BMW X5 2023',             2022, 2024, 280000, 350000, 'financiamento', true,  'Fiat Uno 2015',  'meta_ads',    'hot',  'high',   'active',
       '{"profissao":"Empresário","renda":"25000","cnh":true}', 'Cliente muito interessado, quer fechar essa semana.', 87),

      (v_store_id, v_auth_id, s1, 'Ana Martins',       '(11) 97654-2210', 'ana@email.com',       'São Paulo',
       'BMW 320i 2023',           2022, 2023, 180000, 220000, 'avista',        false, null,             'google_ads',  'warm', 'medium', 'active',
       '{"profissao":"Médica","renda":"18000","cnh":true}',    'Quer test drive. Ligar quinta-feira.', 62),

      (v_store_id, v_auth_id, s1, 'Pedro Souza',       '(21) 99218-5543', null,                  'Rio de Janeiro',
       'BMW M3 2024',             2023, 2024, 450000, 550000, 'financiamento', false, null,            'instagram',   'cold', 'low',    'active',
       '{"profissao":"Advogado","renda":"30000","cnh":true}',  'Viu no Instagram. Ainda pesquisando.', 35),

      (v_store_id, v_auth_id, s2, 'Marcos Lima',       '(11) 94433-8821', 'marcos@empresa.com',  'Campinas',
       'Porsche Cayenne 2022',    2021, 2023, 400000, 500000, 'avista',        true,  'BMW X1 2019',   'indicacao',   'hot',  'high',   'active',
       '{"profissao":"CEO","renda":"50000","cnh":true}',       'Indicação do João. Quer negociar desconto.', 91),

      (v_store_id, v_auth_id, s2, 'Julia Ferreira',    '(11) 98800-1122', 'julia@gmail.com',     'São Paulo',
       'Mercedes GLA 2023',       2022, 2024, 200000, 260000, 'financiamento', false, null,            'webmotors',   'warm', 'medium', 'active',
       '{"profissao":"Arquiteta","renda":"12000","cnh":true}', 'Comparando com Audi Q3.', 58),

      (v_store_id, v_auth_id, s3, 'Roberto Castro',    '(11) 97788-3344', 'roberto@gmail.com',   'Santos',
       'Jeep Compass 2024',       2023, 2024, 140000, 175000, 'financiamento', true,  'HB20 2020',     'meta_ads',    'hot',  'high',   'active',
       '{"profissao":"Engenheiro","renda":"9500","cnh":true}', 'Visitou a loja. Aguardando proposta.', 78),

      (v_store_id, v_auth_id, s3, 'Fernanda Neves',    '(11) 96655-4433', 'fernanda@email.com',  'São Paulo',
       'Toyota Corolla 2023',     2022, 2024, 115000, 145000, 'consorcio',     false, null,            'olx',         'warm', 'medium', 'active',
       '{"profissao":"Professora","renda":"6000","cnh":true}', 'Quer parcela baixa. Consórcio é prioridade.', 51),

      (v_store_id, v_auth_id, s4, 'Thiago Rocha',      '(11) 95544-7788', 'thiago@empresa.com',  'São Paulo',
       'Toyota Corolla XEI 2023', 2022, 2024, 130000, 160000, 'avista',        false, null,            'google_ads',  'hot',  'high',   'active',
       '{"profissao":"Dentista","renda":"22000","cnh":true}',  'Proposta enviada. Aguardando retorno.', 83),

      (v_store_id, v_auth_id, s5, 'Lucia Pereira',     '(11) 97898-1234', 'lucia@email.com',     'Guarulhos',
       'Honda HR-V EXL 2023',     2022, 2024, 110000, 140000, 'financiamento', true,  'Civic 2018',    'indicacao',   'hot',  'medium', 'active',
       '{"profissao":"Gerente","renda":"8500","cnh":true}',    'Negociação em andamento. Quer incluir o carro na troca.', 76);

    RAISE NOTICE '→ 9 leads de demonstração inseridos!';
  ELSE
    RAISE NOTICE '→ Leads já existem, pulando inserção';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '✓ SETUP COMPLETO!';
  RAISE NOTICE '  Loja:    %', v_store_id;
  RAISE NOTICE '  Usuário: % (%)', v_name, v_auth_id;

END;
$$;

-- Confirma o resultado
SELECT 'stores' as tabela, COUNT(*) as registros FROM stores
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'pipeline_stages', COUNT(*) FROM pipeline_stages
UNION ALL SELECT 'leads', COUNT(*) FROM leads;
