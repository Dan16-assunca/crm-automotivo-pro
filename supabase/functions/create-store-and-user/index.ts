// Edge Function: create-store-and-user
// Cria conta + loja de forma transacional usando service role.
// O frontend NÃO usa service role key — toda a operação privilegiada fica aqui.
// Aceita `slug` para multi-tenancy — gera automaticamente se não fornecido.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/** Gera slug a partir do nome da loja */
function generateSlug(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[áàâãä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
  return normalized || 'loja'
}

/** Garante unicidade do slug adicionando sufixo numérico se necessário */
async function ensureUniqueSlug(admin: ReturnType<typeof createClient>, base: string): Promise<string> {
  let candidate = base
  let attempt = 0
  while (attempt < 20) {
    const { data } = await admin.from('stores').select('id').eq('slug', candidate).single()
    if (!data) return candidate  // disponível
    attempt++
    candidate = `${base}${attempt}`
  }
  // Fallback com timestamp
  return `${base}-${Date.now().toString(36).slice(-4)}`
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { full_name, store_name, slug: requestedSlug, email, password } = await req.json()

    // Validação básica
    if (!full_name?.trim() || !store_name?.trim() || !email?.trim() || !password) {
      return json({ error: 'Campos obrigatórios ausentes' }, 400)
    }
    if (password.length < 6) {
      return json({ error: 'Senha deve ter ao menos 6 caracteres' }, 400)
    }

    // ── Clientes Supabase ────────────────────────────────────────────────────
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const anon = createClient(supabaseUrl, anonKey)

    // ── 1. Criar usuário no Auth (já confirmado) ─────────────────────────────
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email:         email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })

    if (authError) {
      const isDuplicate =
        authError.message.toLowerCase().includes('already registered') ||
        authError.message.toLowerCase().includes('already been registered')
      return json(
        { error: isDuplicate ? 'Este email já está cadastrado. Faça login.' : authError.message },
        400,
      )
    }

    const userId = authData.user.id
    let storeId: string | null = null
    let finalSlug: string | null = null

    try {
      // ── 2. Resolver slug único ───────────────────────────────────────────────
      const baseSlug = requestedSlug?.trim()
        ? requestedSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
        : generateSlug(store_name.trim())

      finalSlug = await ensureUniqueSlug(admin, baseSlug)

      // ── 3. Criar loja ──────────────────────────────────────────────────────
      const { data: store, error: storeErr } = await admin
        .from('stores')
        .insert({
          name:     store_name.trim(),
          slug:     finalSlug,
          plan:     'starter',
          status:   'trial',
          active:   true,
          settings: {
            whatsapp_instance: null,
            whatsapp_status:   'disconnected',
          },
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single()

      if (storeErr) throw new Error('Erro ao criar loja: ' + storeErr.message)
      storeId = store.id

      // ── 4. Criar perfil do usuário (admin da loja) ─────────────────────────
      const { error: userErr } = await admin.from('users').insert({
        id:        userId,
        store_id:  storeId,
        full_name: full_name.trim(),
        email:     email.trim().toLowerCase(),
        role:      'admin',
        active:    true,
      })
      if (userErr) throw new Error('Erro ao criar perfil: ' + userErr.message)

      // ── 5. Criar etapas padrão do pipeline ────────────────────────────────
      const { error: stagesErr } = await admin.rpc('create_default_stages', { p_store_id: storeId })
      if (stagesErr) {
        console.warn('create_default_stages warning:', stagesErr.message)
      }

      // ── 6. Sign-in e retorno da session ───────────────────────────────────
      const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      })
      if (signInErr) throw new Error('Conta criada mas erro ao entrar: ' + signInErr.message)

      return json({ session: signIn.session, user: signIn.user, slug: finalSlug })

    } catch (err) {
      // ── ROLLBACK ──────────────────────────────────────────────────────────
      console.error('[create-store-and-user] rollback:', err)
      if (storeId) {
        await admin.from('stores').delete().eq('id', storeId).catch(() => {})
      }
      await admin.auth.admin.deleteUser(userId).catch(() => {})
      throw err
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno do servidor'
    return json({ error: msg }, 500)
  }
})
