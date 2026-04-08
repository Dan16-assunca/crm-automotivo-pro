# CRM Automotivo Pro

O CRM mais completo para concessionárias e revendas de veículos premium do Brasil.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage)
- **WhatsApp**: Evolution API
- **Automações**: n8n
- **Deploy**: Vercel + Supabase Cloud + VPS Hostinger

## Setup Local

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Preencha o `.env` com suas credenciais:
- `VITE_SUPABASE_URL` — URL do projeto Supabase
- `VITE_SUPABASE_ANON_KEY` — Chave anon do Supabase
- `VITE_EVOLUTION_API_URL` — URL do Evolution API no VPS
- `VITE_EVOLUTION_API_KEY` — API Key do Evolution API

### 3. Configurar Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Região: South America (São Paulo)
3. Vá em **SQL Editor** → cole o conteúdo de `supabase/migrations/001_initial_schema.sql` → Execute
4. Vá em **Authentication** → Settings → habilite Email Auth
5. Vá em **Storage** → New Bucket: `vehicles-photos` (público)

### 4. Criar usuário de teste

```sql
-- No SQL Editor do Supabase, após criar um usuário via Auth:
INSERT INTO stores (id, name, brand, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'BMW Premium SP', 'BMW', 'pro');

INSERT INTO users (id, store_id, full_name, email, role)
VALUES (
  'SEU_USER_ID_DO_AUTH',
  '00000000-0000-0000-0000-000000000001',
  'Administrador',
  'admin@bmwpremium.com.br',
  'admin'
);

SELECT create_default_stages('00000000-0000-0000-0000-000000000001');
```

### 5. Rodar localmente

```bash
npm run dev
```

Acesse: http://localhost:5173

## Deploy Evolution API + n8n no VPS

### Pré-requisitos no VPS Hostinger (Ubuntu 22.04)

```bash
# Instalar Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo apt install docker-compose-plugin -y
```

### Subir os serviços

```bash
cd docker/
# Edite docker-compose.yml: troque SERVER_URL, API_KEY e senhas
docker compose up -d
```

### Verificar status

```bash
docker compose ps
docker compose logs evolution-api
```

## Deploy Frontend (Vercel)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Configure as variáveis de ambiente no painel da Vercel.

## Módulos

| Módulo | Rota | Status |
|--------|------|--------|
| Dashboard | `/dashboard` | ✅ |
| Pipeline Kanban | `/pipeline` | ✅ |
| Leads | `/leads` | ✅ |
| Clientes | `/clientes` | ✅ |
| Estoque | `/estoque` | ✅ |
| WhatsApp | `/whatsapp` | ✅ |
| Relatórios | `/relatorios` | ✅ |
| Metas | `/metas` | ✅ |
| Automações | `/automacoes` | ✅ |
| Equipe | `/equipe` | ✅ |
| Configurações | `/configuracoes` | ✅ |

## Design System

- **Cor primária**: `#39FF14` (Verde Neon)
- **Background**: `#0A0A0A` (Preto profundo)
- **Tipografia**: Bebas Neue (display) + Space Grotesk (corpo) + JetBrains Mono (código)
- **Modo**: Dark (padrão) + Light

---

CRM Automotivo Pro — Desenvolvido para dominar o mercado automotivo brasileiro.
