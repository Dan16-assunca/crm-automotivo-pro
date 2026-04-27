// Edge Function: create-team-member
// Cria um usuário com email + senha diretamente (sem envio de e-mail de convite).
// Apenas admin ou gerente pode criar membros desta forma.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // ── Autenticação do chamador ──────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Não autenticado' }, 401)
    }

    const { email, full_name, role, password } = await req.json()

    if (!email?.trim() || !role || !password?.trim()) {
      return json({ error: 'email, role e password são obrigatórios' }, 400)
    }
    if (!['admin', 'manager', 'salesperson'].includes(role)) {
      return json({ error: 'Role inválido' }, 400)
    }
    if ((password as string).length < 6) {
      return json({ error: 'A senha deve ter pelo menos 6 caracteres' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // Admin client (service role)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Client com JWT do usuário chamador — valida quem está chamando
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // ── Verificar quem está chamando ─────────────────────────────────────────
    const { data: { user: callerUser }, error: callerErr } = await caller.auth.getUser()
    if (callerErr || !callerUser) {
      return json({ error: 'Token inválido ou expirado' }, 401)
    }

    const { data: callerProfile, error: profileErr } = await admin
      .from('users')
      .select('role, store_id')
      .eq('id', callerUser.id)
      .single()

    if (profileErr || !callerProfile) {
      return json({ error: 'Perfil não encontrado' }, 403)
    }

    if (!['admin', 'manager'].includes(callerProfile.role)) {
      return json({ error: 'Sem permissão: apenas admin ou gerente pode criar membros' }, 403)
    }

    if (callerProfile.role === 'manager' && role === 'admin') {
      return json({ error: 'Gerentes não podem criar administradores' }, 403)
    }

    const storeId = callerProfile.store_id

    // ── Criar usuário com email + senha (email já confirmado) ────────────────
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email:         email.trim().toLowerCase(),
      password:      password.trim(),
      email_confirm: true,
      user_metadata: {
        full_name: full_name?.trim() ?? '',
        store_id:  storeId,
        role,
      },
    })

    if (createErr) {
      const msg = createErr.message
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        return json({ error: 'Este email já possui uma conta na plataforma.' }, 400)
      }
      return json({ error: msg }, 400)
    }

    const newUserId = newUser.user.id

    // ── Criar perfil do usuário no banco ─────────────────────────────────────
    const { error: userErr } = await admin.from('users').upsert({
      id:        newUserId,
      store_id:  storeId,
      full_name: full_name?.trim() ?? email.split('@')[0],
      email:     email.trim().toLowerCase(),
      role,
      active:    true,
    })

    if (userErr) {
      console.error('[create-team-member] user profile upsert error:', userErr.message)
    }

    return json({ success: true, email: email.trim().toLowerCase() })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno do servidor'
    return json({ error: msg }, 500)
  }
})
