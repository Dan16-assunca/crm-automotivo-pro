// Edge Function: create-store-and-user
// Cria conta + loja de forma transacional usando service role.
// O frontend NÃO usa service role key — toda a operação privilegiada fica aqui.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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
    const { full_name, store_name, email, password } = await req.json()

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

    // Admin client: operações privilegiadas (cria usuário confirmado, cria registros)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Anon client: faz o sign-in final para devolver a session ao frontend
    const anon = createClient(supabaseUrl, anonKey)

    // ── 1. Criar usuário no Auth (já confirmado) ─────────────────────────────
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email:         email.trim().toLowerCase(),
      password,
      email_confirm: true,               // confirma sem precisar de email
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

    try {
      // ── 2. Criar loja ───────────────────────────────────────────────────────
      const { data: store, error: storeErr } = await admin
        .from('stores')
        .insert({ name: store_name.trim(), plan: 'pro', active: true, settings: {} })
        .select('id')
        .single()

      if (storeErr) throw new Error('Erro ao criar loja: ' + storeErr.message)
      storeId = store.id

      // ── 3. Criar perfil do usuário (admin da loja) ──────────────────────────
      const { error: userErr } = await admin.from('users').insert({
        id:        userId,
        store_id:  storeId,
        full_name: full_name.trim(),
        email:     email.trim().toLowerCase(),
        role:      'admin',
        active:    true,
      })

      if (userErr) throw new Error('Erro ao criar perfil: ' + userErr.message)

      // ── 4. Criar etapas padrão do pipeline ──────────────────────────────────
      // SECURITY DEFINER → bypassa RLS, não há problema
      const { error: stagesErr } = await admin.rpc('create_default_stages', { p_store_id: storeId })
      if (stagesErr) {
        // Não é fatal — estágios podem ser criados manualmente depois
        console.warn('create_default_stages warning:', stagesErr.message)
      }

      // ── 5. Fazer sign-in e retornar session para login automático ────────────
      const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      })

      if (signInErr) throw new Error('Conta criada mas erro ao entrar: ' + signInErr.message)

      return json({ session: signIn.session, user: signIn.user })

    } catch (err) {
      // ── ROLLBACK: remover o que foi criado para não deixar dados órfãos ─────
      console.error('[create-store-and-user] rollback:', err)
      if (storeId) {
        await admin.from('stores').delete().eq('id', storeId).catch(() => {})
      }
      // Deleta o auth user para que o email fique disponível para nova tentativa
      await admin.auth.admin.deleteUser(userId).catch(() => {})

      throw err
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno do servidor'
    return json({ error: msg }, 500)
  }
})
